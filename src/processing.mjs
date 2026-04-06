/* eslint-disable no-console */
import path from 'path';

import { getCacheKey, replaceExtension } from './utils.mjs';

export function createImageProcessor({
  projectRoot,
  supportedInputExtensions,
  generateFromExtensions,
  outputFormats,
  imageProcessingOptions,
  reencodeModern,
  isDryRun,
  stats,
  cacheState,
  fs,
}) {
  const {
    exists,
    statSafe,
    getFileHash,
    getSourcePipeline,
    getEncoderByExtension,
    writeFileAtomic,
    hashBuffer,
    copyFileSafe,
  } = fs;

  function warnBroken(filePath) {
    stats.skippedByBroken += 1;
    console.warn(
      `[public-image-optimizer] skipped unreadable file: ${getCacheKey(projectRoot, filePath)}`
    );
  }

  function shouldOptimizeOriginal(ext) {
    if (ext === '.webp' || ext === '.avif') return reencodeModern;
    return true;
  }

  async function optimizeOriginal(sourcePath, ext, cacheData) {
    if (!supportedInputExtensions.has(ext)) return;
    if (!shouldOptimizeOriginal(ext)) return;

    const sourceStat = await statSafe(sourcePath);
    if (!sourceStat) {
      warnBroken(sourcePath);
      return;
    }

    const sourceHash = await getFileHash(sourcePath).catch(() => '');
    if (!sourceHash) {
      warnBroken(sourcePath);
      return;
    }

    if (cacheState.isUnchangedByCache(sourcePath, sourceHash, cacheData)) {
      stats.skippedByCache += 1;
      cacheState.updateCacheEntry(sourcePath, sourceHash, sourceStat.size);
      cacheState.markSourceHashProcessed(sourceHash);
      return;
    }

    if (cacheState.isSourceHashProcessed(sourceHash)) {
      stats.skippedByContentCache += 1;
      cacheState.updateCacheEntry(sourcePath, sourceHash, sourceStat.size);
      return;
    }

    const encoder = getEncoderByExtension(ext, imageProcessingOptions);
    if (!encoder) return;

    let pipeline;
    try {
      pipeline = await getSourcePipeline(sourcePath);
    } catch {
      warnBroken(sourcePath);
      return;
    }

    let transformed;
    try {
      transformed = await encoder(pipeline).toBuffer();
    } catch {
      warnBroken(sourcePath);
      return;
    }

    // Keep the original file when optimization does not reduce its size.
    if (transformed.byteLength >= sourceStat.size) {
      cacheState.updateCacheEntry(sourcePath, sourceHash, sourceStat.size);
      cacheState.markSourceHashProcessed(sourceHash);
      return;
    }

    if (isDryRun) {
      stats.bytesOriginalWouldSave += sourceStat.size - transformed.byteLength;
      const optimizedHash = hashBuffer(transformed);
      cacheState.updateCacheEntry(sourcePath, optimizedHash, transformed.byteLength);
      cacheState.markSourceHashProcessed(optimizedHash);
    } else {
      await writeFileAtomic(sourcePath, transformed, { isDryRun });

      stats.bytesOriginalSaved += sourceStat.size - transformed.byteLength;

      const optimizedHash = hashBuffer(transformed);
      cacheState.updateCacheEntry(sourcePath, optimizedHash, transformed.byteLength);
      cacheState.markSourceHashProcessed(optimizedHash);
    }

    if (ext === '.png') stats.optimizedPng += 1;
    if (ext === '.jpg' || ext === '.jpeg') stats.optimizedJpeg += 1;
    if (ext === '.webp') stats.optimizedWebp += 1;
    if (ext === '.avif') stats.optimizedAvif += 1;
  }

  async function generateFormat(sourcePath, targetExt, cacheData) {
    const targetPath = replaceExtension(sourcePath, targetExt);
    const encoder = getEncoderByExtension(targetExt, imageProcessingOptions);
    if (!encoder) return;

    const sourceKey = getCacheKey(projectRoot, sourcePath);
    const targetKey = getCacheKey(projectRoot, targetPath);

    const sourceStat = await statSafe(sourcePath);
    if (!sourceStat) {
      warnBroken(sourcePath);
      return;
    }

    const sourceHash = await getFileHash(sourcePath).catch(() => '');
    if (!sourceHash) {
      warnBroken(sourcePath);
      return;
    }

    const knownTargetHash = cacheState.getKnownDerivedHash(sourceHash, targetExt);
    const targetExists = await exists(targetPath);

    if (targetExists && knownTargetHash) {
      const targetStat = await statSafe(targetPath);
      if (!targetStat) {
        warnBroken(targetPath);
        return;
      }

      const targetHash = await getFileHash(targetPath).catch(() => '');
      if (!targetHash) {
        warnBroken(targetPath);
        return;
      }

      if (targetHash === knownTargetHash) {
        cacheState.updateCacheEntry(sourcePath, sourceHash, sourceStat.size);
        cacheState.updateCacheEntry(targetPath, targetHash, targetStat.size);
        cacheState.markSourceHashProcessed(sourceHash);
        cacheState.markDerivedHash(sourceHash, targetExt, targetHash);
        return;
      }
    }

    if (!targetExists && knownTargetHash) {
      const reusablePath = cacheState.findCachedPathByHash(knownTargetHash, targetExt, targetPath);
      if (reusablePath && (await exists(reusablePath))) {
        if (!isDryRun) await copyFileSafe(reusablePath, targetPath, { isDryRun });

        const targetStat = await statSafe(reusablePath);
        const sizeGuess = targetStat?.size ?? 0;

        cacheState.updateCacheEntry(sourcePath, sourceHash, sourceStat.size);
        cacheState.updateCacheEntry(targetPath, knownTargetHash, sizeGuess);
        cacheState.markSourceHashProcessed(sourceHash);
        cacheState.markDerivedHash(sourceHash, targetExt, knownTargetHash);
        stats.reusedDerived += 1;
        return;
      }
    }

    const cachedSourceHash = cacheData.files?.[sourceKey]?.hash;
    const cachedTargetHash = cacheData.files?.[targetKey]?.hash;
    // Any change in settings or Sharp version forces derived file regeneration.
    const optionsChanged = cacheData.signature !== cacheState.optionsSignature;
    const sourceChanged = cachedSourceHash !== sourceHash;

    let targetHash = '';
    let targetStat = null;
    let targetChanged = false;

    if (targetExists) {
      targetStat = await statSafe(targetPath);
      if (!targetStat) {
        targetChanged = true;
      } else {
        targetHash = await getFileHash(targetPath).catch(() => '');
        if (!targetHash) {
          targetChanged = true;
        } else if (cachedTargetHash && cachedTargetHash !== targetHash) {
          targetChanged = true;
        }
      }
    }

    const shouldUpdate =
      !targetExists || optionsChanged || sourceChanged || targetChanged || !knownTargetHash;

    if (!shouldUpdate) {
      if (targetStat && targetHash) {
        cacheState.updateCacheEntry(sourcePath, sourceHash, sourceStat.size);
        cacheState.updateCacheEntry(targetPath, targetHash, targetStat.size);
        cacheState.markDerivedHash(sourceHash, targetExt, targetHash);
      }
      return;
    }

    let pipeline;
    try {
      pipeline = await getSourcePipeline(sourcePath);
    } catch {
      warnBroken(sourcePath);
      return;
    }

    let transformed;
    try {
      transformed = await encoder(pipeline).toBuffer();
    } catch {
      warnBroken(sourcePath);
      return;
    }

    if (isDryRun) {
      stats.bytesDerivedWouldWrite += transformed.byteLength;
    } else {
      await writeFileAtomic(targetPath, transformed, { isDryRun });
      stats.bytesDerivedWritten += transformed.byteLength;
    }

    const finalTargetHash = hashBuffer(transformed);

    cacheState.updateCacheEntry(sourcePath, sourceHash, sourceStat.size);
    cacheState.updateCacheEntry(targetPath, finalTargetHash, transformed.byteLength);
    cacheState.markSourceHashProcessed(sourceHash);
    cacheState.markDerivedHash(sourceHash, targetExt, finalTargetHash);

    if (targetExt === '.webp') stats.generatedWebp += 1;
    if (targetExt === '.avif') stats.generatedAvif += 1;
  }

  async function processImage(sourcePath, cacheData) {
    const ext = path.extname(sourcePath).toLowerCase();
    if (!supportedInputExtensions.has(ext)) return;

    stats.scanned += 1;

    await optimizeOriginal(sourcePath, ext, cacheData);

    if (!generateFromExtensions.has(ext)) return;

    for (const formatExt of outputFormats) {
      await generateFormat(sourcePath, formatExt, cacheData);
    }
  }

  return {
    processImage,
    warnBroken,
  };
}
