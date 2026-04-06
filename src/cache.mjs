import { promises as fs } from 'fs';
import path from 'path';

import { safeJsonParse, sortObjectByKeys } from './utils.mjs';

export async function loadCache(cacheFile, optionsSignature) {
  const candidates = [cacheFile];

  for (const filePath of candidates) {
    const raw = await fs.readFile(filePath, 'utf8').catch(() => null);
    if (!raw) continue;

    const parsed = safeJsonParse(raw);
    if (!parsed || typeof parsed !== 'object') continue;

    const filesRaw = parsed.files;
    if (!filesRaw || typeof filesRaw !== 'object') continue;

    const normalizedFiles = {};
    for (const [key, value] of Object.entries(filesRaw)) {
      if (!value || typeof value !== 'object') continue;
      if (typeof value.hash !== 'string' || !value.hash) continue;

      const size = Number(value.size);
      if (!Number.isFinite(size) || size < 0) continue;

      normalizedFiles[key] = { hash: value.hash, size };
    }

    const normalizedContent = {};
    if (parsed.content && typeof parsed.content === 'object') {
      for (const [key, value] of Object.entries(parsed.content)) {
        if (!key || typeof value !== 'string') continue;
        normalizedContent[key] = value;
      }
    }

    const normalizedDerived = {};
    if (parsed.derived && typeof parsed.derived === 'object') {
      for (const [key, value] of Object.entries(parsed.derived)) {
        if (!key || !value || typeof value !== 'object') continue;
        if (typeof value.hash !== 'string' || !value.hash) continue;
        if (typeof value.signature !== 'string' || !value.signature) continue;

        normalizedDerived[key] = {
          hash: value.hash,
          signature: value.signature,
        };
      }
    }

    return {
      signature: typeof parsed.signature === 'string' ? parsed.signature : '',
      files: normalizedFiles,
      content: normalizedContent,
      derived: normalizedDerived,
    };
  }

  return { signature: optionsSignature, files: {}, content: {}, derived: {} };
}

export async function saveCache(cacheFile, cacheData, { isDryRun }) {
  if (isDryRun) return;

  await fs.mkdir(path.dirname(cacheFile), { recursive: true }).catch(() => null);

  const payload = {
    signature: cacheData.signature,
    files: sortObjectByKeys(cacheData.files || {}),
    content: sortObjectByKeys(cacheData.content || {}),
    derived: sortObjectByKeys(cacheData.derived || {}),
  };

  await fs.writeFile(cacheFile, JSON.stringify(payload, null, 2) + '\n');
}
