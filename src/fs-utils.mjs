import { createHash } from 'crypto';
import { createReadStream, promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';

export function hashBuffer(buffer) {
  return createHash('sha1').update(buffer).digest('hex');
}

export async function getFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha1');
    const stream = createReadStream(filePath);

    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export async function exists(filePath) {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

export async function statSafe(filePath) {
  return fs.stat(filePath).catch(() => null);
}

export async function walk(dir) {
  const dirEntries = await fs.readdir(dir, { withFileTypes: true }).catch(() => null);
  if (!dirEntries) return [];

  const files = await Promise.all(
    dirEntries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) return walk(fullPath);
      if (entry.isSymbolicLink()) return [];

      return fullPath;
    })
  );

  return files.flat();
}

export function isSupportedImagePath(filePath, supportedInputExtensions) {
  return supportedInputExtensions.has(path.extname(filePath).toLowerCase());
}

export function getEncoderByExtension(ext, imageProcessingOptions) {
  if (ext === '.png') return (image) => image.png(imageProcessingOptions.png);
  if (ext === '.jpg' || ext === '.jpeg') return (image) => image.jpeg(imageProcessingOptions.jpeg);
  if (ext === '.webp') return (image) => image.webp(imageProcessingOptions.webp);
  if (ext === '.avif') return (image) => image.avif(imageProcessingOptions.avif);
  return null;
}

export async function getSourcePipeline(sourcePath) {
  return sharp(sourcePath, { failOn: 'none' }).rotate();
}

function createTempPath(targetPath) {
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const unique = `${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
  return path.join(dir, `.${base}.${unique}.tmp`);
}

export async function writeFileAtomic(targetPath, buffer, { isDryRun }) {
  if (isDryRun) return;

  const dir = path.dirname(targetPath);
  const tmpPath = createTempPath(targetPath);

  await fs.mkdir(dir, { recursive: true }).catch(() => null);

  try {
    await fs.writeFile(tmpPath, buffer);
    // Write to a temporary file first so the destination is never left half-written.
    await fs.rename(tmpPath, targetPath);
  } finally {
    await fs.unlink(tmpPath).catch(() => null);
  }
}

export async function moveOrCopyFile(sourcePath, targetPath, { isDryRun }) {
  if (isDryRun) return;

  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  try {
    await fs.rename(sourcePath, targetPath);
    return;
  } catch (error) {
    if (error && error.code !== 'EXDEV') throw error;
  }

  await fs.copyFile(sourcePath, targetPath);
  await fs.unlink(sourcePath).catch(() => null);
}

export async function copyFileSafe(sourcePath, targetPath, { isDryRun }) {
  if (isDryRun) return;

  const dir = path.dirname(targetPath);
  const tmpPath = createTempPath(targetPath);

  await fs.mkdir(dir, { recursive: true });

  try {
    await fs.copyFile(sourcePath, tmpPath);
    await fs.rename(tmpPath, targetPath);
  } finally {
    await fs.unlink(tmpPath).catch(() => null);
  }
}

export async function removeFileIfExists(filePath, { isDryRun }) {
  if (!(await exists(filePath))) return false;
  if (isDryRun) return true;

  await fs.unlink(filePath).catch(() => null);
  return true;
}
