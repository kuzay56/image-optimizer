/* eslint-disable no-console */
import { loadCache, saveCache } from './cache.mjs';
import { createCandidatesResolver } from './candidates.mjs';
import {
  CACHE_FILE,
  createStats,
  GENERATE_FROM_EXTENSIONS,
  GIT_STATUS_MAX_BUFFER,
  getHelpText,
  IMAGE_PROCESSING_OPTIONS,
  OPTIONS_SIGNATURE,
  OUTPUT_FORMATS,
  parseCliArgs,
  PROJECT_ROOT,
  PUBLIC_DIR,
  REENCODE_MODERN,
  SUPPORTED_INPUT_EXTENSIONS,
} from './config.mjs';
import {
  copyFileSafe,
  exists,
  getEncoderByExtension,
  getFileHash,
  getSourcePipeline,
  hashBuffer,
  isSupportedImagePath,
  moveOrCopyFile,
  removeFileIfExists,
  statSafe,
  walk,
  writeFileAtomic,
} from './fs-utils.mjs';
import { logOptimizeSummary } from './logging.mjs';
import { createImageProcessor } from './processing.mjs';
import { createCacheState } from './state.mjs';
import { isPathInsidePublic, normalizeRepoPath, runWithLimit } from './utils.mjs';

export async function runOptimizeImages(argv = process.argv.slice(2)) {
  const { isChangedOnly, isVerbose, isDryRun, isHelp, concurrency } = parseCliArgs(argv);
  const stats = createStats();

  if (isHelp) {
    console.log(getHelpText());
    return stats;
  }

  if (!(await exists(PUBLIC_DIR))) {
    console.error(`[public-image-optimizer] directory not found: ${PUBLIC_DIR}`);
    process.exit(1);
  }

  const cacheData = await loadCache(CACHE_FILE, OPTIONS_SIGNATURE);

  const cacheState = createCacheState({
    projectRoot: PROJECT_ROOT,
    optionsSignature: OPTIONS_SIGNATURE,
  });
  cacheState.initFromCache(cacheData);

  const imageProcessor = createImageProcessor({
    projectRoot: PROJECT_ROOT,
    supportedInputExtensions: SUPPORTED_INPUT_EXTENSIONS,
    generateFromExtensions: GENERATE_FROM_EXTENSIONS,
    outputFormats: OUTPUT_FORMATS,
    imageProcessingOptions: IMAGE_PROCESSING_OPTIONS,
    reencodeModern: REENCODE_MODERN,
    isDryRun,
    stats,
    cacheState,
    fs: {
      exists,
      statSafe,
      getFileHash,
      getSourcePipeline,
      getEncoderByExtension,
      writeFileAtomic,
      hashBuffer,
      copyFileSafe,
    },
  });

  const candidatesResolver = createCandidatesResolver({
    projectRoot: PROJECT_ROOT,
    publicDir: PUBLIC_DIR,
    isChangedOnly,
    isDryRun,
    stats,
    outputFormats: OUTPUT_FORMATS,
    generateFromExtensions: GENERATE_FROM_EXTENSIONS,
    supportedInputExtensions: SUPPORTED_INPUT_EXTENSIONS,
    cacheState,
    utils: {
      isPathInsidePublic,
      normalizeRepoPath,
    },
    fs: {
      exists,
      isSupportedImagePath,
      moveOrCopyFile,
      removeFileIfExists,
      walk,
    },
    git: {
      gitStatusMaxBuffer: GIT_STATUS_MAX_BUFFER,
    },
  });

  const files = await candidatesResolver.getCandidateFiles();

  await runWithLimit(files, concurrency, async (filePath) => {
    try {
      await imageProcessor.processImage(filePath, cacheData);
    } catch {
      imageProcessor.warnBroken(filePath);
    }
  });

  if (!isDryRun) {
    await candidatesResolver.pruneCacheEntries();
  }

  cacheState.applyToCache(cacheData);
  await saveCache(CACHE_FILE, cacheData, { isDryRun });

  logOptimizeSummary({
    stats,
    isChangedOnly,
    isDryRun,
    isVerbose,
    concurrency,
  });

  return stats;
}
