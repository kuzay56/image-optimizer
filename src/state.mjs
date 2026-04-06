import path from 'path';

import { getCacheKey, getDerivedKey } from './utils.mjs';

export function createCacheState({ projectRoot, optionsSignature }) {
  const cacheState = {
    optionsSignature,
    nextCacheFiles: {},
    nextCacheContent: {},
    nextCacheDerived: {},

    initFromCache(cacheData) {
      cacheState.nextCacheFiles = { ...(cacheData.files || {}) };
      // Keep content and derived caches even after changed-only runs.
      cacheState.nextCacheContent = { ...(cacheData.content || {}) };
      cacheState.nextCacheDerived = { ...(cacheData.derived || {}) };
    },

    applyToCache(cacheData) {
      cacheData.signature = optionsSignature;
      cacheData.files = cacheState.nextCacheFiles;
      cacheData.content = cacheState.nextCacheContent;
      cacheData.derived = cacheState.nextCacheDerived;
    },

    updateCacheEntry(filePath, hash, size) {
      if (!hash) return;
      cacheState.nextCacheFiles[getCacheKey(projectRoot, filePath)] = {
        hash,
        size: Number.isFinite(size) ? size : 0,
      };
    },

    moveCacheEntry(oldPath, newPath) {
      const oldKey = getCacheKey(projectRoot, oldPath);
      const newKey = getCacheKey(projectRoot, newPath);

      if (!cacheState.nextCacheFiles[oldKey]) return;

      cacheState.nextCacheFiles[newKey] = cacheState.nextCacheFiles[oldKey];
      delete cacheState.nextCacheFiles[oldKey];
    },

    deleteCacheEntry(filePath) {
      const key = getCacheKey(projectRoot, filePath);
      if (!Object.prototype.hasOwnProperty.call(cacheState.nextCacheFiles, key)) return false;
      delete cacheState.nextCacheFiles[key];
      return true;
    },

    markSourceHashProcessed(sourceHash) {
      if (!sourceHash) return;
      // Content cache prevents reprocessing identical files in different locations.
      cacheState.nextCacheContent[sourceHash] = optionsSignature;
    },

    markDerivedHash(sourceHash, targetExt, targetHash) {
      if (!sourceHash || !targetHash) return;
      cacheState.nextCacheDerived[getDerivedKey(sourceHash, targetExt)] = {
        hash: targetHash,
        signature: optionsSignature,
      };
    },

    isSourceHashProcessed(sourceHash) {
      if (!sourceHash) return false;
      return cacheState.nextCacheContent[sourceHash] === optionsSignature;
    },

    getKnownDerivedHash(sourceHash, targetExt) {
      const entry = cacheState.nextCacheDerived[getDerivedKey(sourceHash, targetExt)];
      if (!entry || typeof entry !== 'object') return '';
      if (entry.signature !== optionsSignature) return '';
      return typeof entry.hash === 'string' ? entry.hash : '';
    },

    findCachedPathByHash(targetHash, targetExt, excludePath) {
      const excludeKey = excludePath ? getCacheKey(projectRoot, excludePath) : '';

      // Reuse an existing generated WebP/AVIF file for identical source content.
      for (const [key, value] of Object.entries(cacheState.nextCacheFiles)) {
        if (!value || typeof value !== 'object') continue;
        if (value.hash !== targetHash) continue;
        if (!key.toLowerCase().endsWith(targetExt)) continue;
        if (excludeKey && key === excludeKey) continue;

        return path.join(projectRoot, key);
      }

      return '';
    },

    isUnchangedByCache(filePath, fileHash, cacheData) {
      if (cacheData.signature !== optionsSignature) return false;

      const key = getCacheKey(projectRoot, filePath);
      const cached = cacheData.files[key];
      if (!cached) return false;

      return cached.hash === fileHash;
    },
  };

  return cacheState;
}
