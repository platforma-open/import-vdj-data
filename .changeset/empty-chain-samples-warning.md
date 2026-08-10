---
'@platforma-open/milaboratories.import-vdj.model': minor
'@platforma-open/milaboratories.import-vdj.ui': minor
'@platforma-open/milaboratories.import-vdj': minor
---

Warn when receptor chain filtering leaves a sample with no clonotypes.

A dataset whose rows all fail the chain filter imported successfully and silently produced an empty result. This is the same failure mode the case-insensitive chain matching fix addresses, but visible to the user rather than only to whoever reads the counts. The block now sums `pl7.app/vdj/stat/clonotypeCount` across every imported chain per sample and shows a warning naming the samples that came out at zero, capped at five names plus an overflow count.

Also fixes the stats table hanging on "Loading data..." for such a dataset. Column discovery now passes `dontWaitAllData`, so stats columns without data are skipped instead of collapsing the whole request to `undefined` — an undefined table model leaves `PlAgDataTableV2` on its previous loading overlay indefinitely, so the samples that did import were never rendered.
