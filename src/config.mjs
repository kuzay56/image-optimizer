import path from 'path';
import sharp from 'sharp';

export const PROJECT_ROOT = process.cwd();
export const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
export const CACHE_FILE = path.join(PROJECT_ROOT, '.cache', 'public-image-optimizer-cache.json');

export const SUPPORTED_INPUT_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif']);
export const GENERATE_FROM_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);
export const OUTPUT_FORMATS = ['.webp', '.avif'];

export const IMAGE_PROCESSING_OPTIONS = {
  png: { compressionLevel: 9, effort: 10 },
  jpeg: { quality: 75, mozjpeg: true, progressive: true },
  webp: { quality: 75, effort: 6 },
  avif: { quality: 50, effort: 9 },
};

export const REENCODE_MODERN = false;

// Large buffer for git status output so big working trees do not overflow the child process.
export const GIT_STATUS_MAX_BUFFER = 20 * 1024 * 1024;

const sharpVersion = sharp.versions?.sharp || 'unknown';

// Changing optimization settings invalidates the previous cache signature.
export const OPTIONS_SIGNATURE = JSON.stringify({
  outputs: OUTPUT_FORMATS,
  processing: IMAGE_PROCESSING_OPTIONS,
  reencodeModern: REENCODE_MODERN,
  sharpVersion,
});

export function parseCliArgs(rawArgs = process.argv.slice(2)) {
  const args = new Set(rawArgs);

  const isChangedOnly = args.has('--changed');
  const isVerbose = args.has('--verbose');
  const isDryRun = args.has('--dry-run');
  const isHelp = args.has('--help') || args.has('-h');

  const concurrencyArg = rawArgs.find((arg) => arg.startsWith('--concurrency='));
  const concurrency = Math.max(1, Math.min(8, Number(concurrencyArg?.split('=')[1]) || 3));

  return {
    isChangedOnly,
    isVerbose,
    isDryRun,
    isHelp,
    concurrency,
  };
}

export function getHelpText() {
  return `
Usage:
  public-image-optimizer [options]

Options:
  --changed          Only process changed files in public/ using git status
  --dry-run          Show what would change without writing files
  --verbose          Print detailed statistics
  --concurrency=<n>  Parallel worker count from 1 to 8 (default: 3)
  --help, -h         Show this help message
`.trim();
}

export function createStats() {
  return {
    scanned: 0,
    optimizedPng: 0,
    optimizedJpeg: 0,
    optimizedWebp: 0,
    optimizedAvif: 0,
    generatedWebp: 0,
    generatedAvif: 0,
    skippedByCache: 0,
    skippedByContentCache: 0,
    skippedByBroken: 0,

    changedCandidates: 0,
    detectedRenames: 0,
    changedDeletions: 0,
    relocatedDerived: 0,
    reusedDerived: 0,
    deletedDerivedFiles: 0,

    prunedCacheFiles: 0,
    prunedCacheContent: 0,
    prunedCacheDerived: 0,

    bytesOriginalSaved: 0,
    bytesOriginalWouldSave: 0,
    bytesDerivedWritten: 0,
    bytesDerivedWouldWrite: 0,
  };
}
