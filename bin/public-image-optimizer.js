#!/usr/bin/env node

import { runOptimizeImages } from '../src/index.mjs';

runOptimizeImages(process.argv.slice(2)).catch((error) => {
  console.error('[public-image-optimizer] error', error);
  process.exit(1);
});
