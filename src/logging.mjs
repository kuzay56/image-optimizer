/* eslint-disable no-console */
export function logOptimizeSummary({ stats, isChangedOnly, isDryRun, isVerbose, concurrency }) {
  const modeLabel = isChangedOnly ? 'changed-only' : 'full-scan';
  const optimizedTotal =
    stats.optimizedPng + stats.optimizedJpeg + stats.optimizedWebp + stats.optimizedAvif;
  const generatedTotal = stats.generatedWebp + stats.generatedAvif;
  const skippedTotal = stats.skippedByCache + stats.skippedByContentCache;
  const actionLabel = isDryRun ? 'dry-run' : 'apply';

  console.log(
    `[public-image-optimizer] done | mode=${modeLabel} | action=${actionLabel} | concurrency=${concurrency} | scanned=${stats.scanned} | optimized=${optimizedTotal} | generated=${generatedTotal} | reused=${stats.reusedDerived} | deleted=${stats.deletedDerivedFiles} | skipped=${skippedTotal}`
  );

  if (isVerbose) {
    if (isChangedOnly) {
      console.log(
        `[public-image-optimizer] changed | candidates=${stats.changedCandidates} | renames=${stats.detectedRenames} | deletions=${stats.changedDeletions} | relocated_derived=${stats.relocatedDerived}`
      );
    }

    console.log(
      `[public-image-optimizer] details | optimized_png=${stats.optimizedPng} | optimized_jpeg=${stats.optimizedJpeg} | optimized_webp=${stats.optimizedWebp} | optimized_avif=${stats.optimizedAvif}`
    );
    console.log(
      `[public-image-optimizer] details | generated_webp=${stats.generatedWebp} | generated_avif=${stats.generatedAvif} | skipped_by_path_cache=${stats.skippedByCache} | skipped_by_content_cache=${stats.skippedByContentCache}`
    );
    console.log(
      `[public-image-optimizer] details | pruned_cache_files=${stats.prunedCacheFiles} | pruned_cache_content=${stats.prunedCacheContent} | pruned_cache_derived=${stats.prunedCacheDerived}`
    );

    if (isDryRun) {
      console.log(
        `[public-image-optimizer] dry-run | original_bytes_would_save=${stats.bytesOriginalWouldSave} | derived_bytes_would_write=${stats.bytesDerivedWouldWrite}`
      );
    } else {
      console.log(
        `[public-image-optimizer] apply | original_bytes_saved=${stats.bytesOriginalSaved} | derived_bytes_written=${stats.bytesDerivedWritten}`
      );
    }
  }

  if (stats.skippedByBroken) {
    console.warn(`[public-image-optimizer] skipped_broken=${stats.skippedByBroken}`);
  }
}
