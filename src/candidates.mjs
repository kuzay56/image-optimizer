/* eslint-disable no-console */
import path from 'path';

import { collectChangedEntries } from './changed-files.mjs';
import { replaceExtension } from './utils.mjs';

export function createCandidatesResolver({
  projectRoot,
  publicDir,
  isChangedOnly,
  isDryRun,
  stats,
  outputFormats,
  generateFromExtensions,
  supportedInputExtensions,
  cacheState,
  utils,
  fs,
  git,
}) {
  const { isPathInsidePublic, normalizeRepoPath } = utils;
  const { exists, isSupportedImagePath, moveOrCopyFile, removeFileIfExists, walk } = fs;
  const { gitStatusMaxBuffer } = git;

  async function cleanupDerivedForSource(sourcePath, sourceExt) {
    if (!generateFromExtensions.has(sourceExt)) return;

    // PNG/JPEG sources can have two derived files: WebP and AVIF.
    for (const outputExt of outputFormats) {
      const derivedPath = replaceExtension(sourcePath, outputExt);
      const removed = await removeFileIfExists(derivedPath, { isDryRun });
      if (removed) {
        stats.deletedDerivedFiles += 1;
      }

      if (cacheState.deleteCacheEntry(derivedPath)) {
        stats.prunedCacheFiles += 1;
      }
    }
  }

  async function applyRenameHints(renames) {
    if (!renames.length) return;

    stats.detectedRenames += renames.length;

    for (const rename of renames) {
      const oldPath = normalizeRepoPath(rename.oldPath);
      const newPath = normalizeRepoPath(rename.newPath);
      if (!oldPath || !newPath) continue;

      if (!isPathInsidePublic(oldPath) && !isPathInsidePublic(newPath)) continue;

      const oldAbs = path.join(projectRoot, oldPath);
      const newAbs = path.join(projectRoot, newPath);

      const oldExt = path.extname(oldPath).toLowerCase();
      const newExt = path.extname(newPath).toLowerCase();
      const oldIsSupported = supportedInputExtensions.has(oldExt);
      const newIsSupported = supportedInputExtensions.has(newExt);

      if (oldIsSupported && newIsSupported) {
        cacheState.moveCacheEntry(oldAbs, newAbs);
      } else if (oldIsSupported && !newIsSupported) {
        // If a source file leaves the supported set, clean cache entries and derived files.
        if (cacheState.deleteCacheEntry(oldAbs)) {
          stats.prunedCacheFiles += 1;
        }
        await cleanupDerivedForSource(oldAbs, oldExt);
        continue;
      } else if (!oldIsSupported && newIsSupported) {
        continue;
      } else {
        continue;
      }

      if (!generateFromExtensions.has(oldExt) || !generateFromExtensions.has(newExt)) {
        continue;
      }

      for (const outputExt of outputFormats) {
        const oldDerived = replaceExtension(oldAbs, outputExt);
        const newDerived = replaceExtension(newAbs, outputExt);

        const oldExists = await exists(oldDerived);
        if (!oldExists) {
          if (cacheState.deleteCacheEntry(oldDerived)) {
            stats.prunedCacheFiles += 1;
          }
          continue;
        }

        const newExists = await exists(newDerived);
        if (newExists) {
          const removed = await removeFileIfExists(oldDerived, { isDryRun });
          if (removed) {
            stats.deletedDerivedFiles += 1;
          }
          if (cacheState.deleteCacheEntry(oldDerived)) {
            stats.prunedCacheFiles += 1;
          }
          continue;
        }

        await moveOrCopyFile(oldDerived, newDerived, { isDryRun });
        cacheState.moveCacheEntry(oldDerived, newDerived);
        stats.relocatedDerived += 1;
      }
    }
  }

  async function applyDeletionHints(deletions) {
    if (!deletions.size) return;

    stats.changedDeletions += deletions.size;

    for (const relPath of deletions) {
      const absPath = path.join(projectRoot, relPath);

      if (cacheState.deleteCacheEntry(absPath)) {
        stats.prunedCacheFiles += 1;
      }

      const ext = path.extname(relPath).toLowerCase();
      await cleanupDerivedForSource(absPath, ext);
    }
  }

  async function getCandidateFiles() {
    if (!isChangedOnly) {
      const files = await walk(publicDir);
      return files
        .filter((filePath) => isSupportedImagePath(filePath, supportedInputExtensions))
        .sort((a, b) => a.localeCompare(b));
    }

    const changed = await collectChangedEntries({
      projectRoot,
      gitStatusMaxBuffer,
      normalizeRepoPath,
      isPathInsidePublic,
    });

    if (!changed) {
      console.warn(
        '[public-image-optimizer] could not read changed files from git, falling back to a full scan.'
      );
      const files = await walk(publicDir);
      return files
        .filter((filePath) => isSupportedImagePath(filePath, supportedInputExtensions))
        .sort((a, b) => a.localeCompare(b));
    }

    stats.changedCandidates = changed.paths.size;

    await applyRenameHints(changed.renames);
    await applyDeletionHints(changed.deletions);

    const files = [];
    for (const relPath of changed.paths) {
      const absPath = path.join(projectRoot, relPath);

      if (!isSupportedImagePath(absPath, supportedInputExtensions)) continue;
      if (!(await exists(absPath))) continue;

      files.push(absPath);
    }

    return files.sort((a, b) => a.localeCompare(b));
  }

  async function pruneCacheEntries() {
    // Keep the cache compact after deletions and renames.
    const filesToRemove = [];
    const existingHashes = new Set();
    const sourceHashes = new Set();

    for (const [key, value] of Object.entries(cacheState.nextCacheFiles)) {
      if (!value || typeof value !== 'object' || typeof value.hash !== 'string' || !value.hash) {
        filesToRemove.push(key);
        continue;
      }

      if (!isPathInsidePublic(key)) {
        filesToRemove.push(key);
        continue;
      }

      if (!isSupportedImagePath(key, supportedInputExtensions)) {
        filesToRemove.push(key);
        continue;
      }

      const absPath = path.join(projectRoot, key);
      if (!(await exists(absPath))) {
        filesToRemove.push(key);
        continue;
      }

      existingHashes.add(value.hash);

      const ext = path.extname(key).toLowerCase();
      if (generateFromExtensions.has(ext)) {
        sourceHashes.add(value.hash);
      }
    }

    for (const key of filesToRemove) delete cacheState.nextCacheFiles[key];
    stats.prunedCacheFiles += filesToRemove.length;

    let removedContent = 0;
    for (const key of Object.keys(cacheState.nextCacheContent)) {
      if (sourceHashes.has(key)) continue;
      delete cacheState.nextCacheContent[key];
      removedContent += 1;
    }
    stats.prunedCacheContent += removedContent;

    let removedDerived = 0;
    for (const [key, value] of Object.entries(cacheState.nextCacheDerived)) {
      const [sourceHash] = key.split('|');

      if (!sourceHash || !sourceHashes.has(sourceHash)) {
        delete cacheState.nextCacheDerived[key];
        removedDerived += 1;
        continue;
      }

      if (!value || typeof value !== 'object') {
        delete cacheState.nextCacheDerived[key];
        removedDerived += 1;
        continue;
      }

      // Keep older derived signatures after changed-only runs so untouched files stay reusable.
      if (!isChangedOnly && value.signature !== cacheState.optionsSignature) {
        delete cacheState.nextCacheDerived[key];
        removedDerived += 1;
        continue;
      }

      if (typeof value.hash !== 'string' || !value.hash || !existingHashes.has(value.hash)) {
        delete cacheState.nextCacheDerived[key];
        removedDerived += 1;
        continue;
      }
    }
    stats.prunedCacheDerived += removedDerived;
  }

  return {
    getCandidateFiles,
    pruneCacheEntries,
  };
}
