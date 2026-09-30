---
'@platforma-open/milaboratories.import-vdj.workflow': minor
'@platforma-open/milaboratories.import-vdj.model': minor
'@platforma-open/milaboratories.import-vdj': minor
---

Non-AIRR import rework.

Cell Ranger VDJ:
- Files from Cell Ranger before 6.0 import. They write `productive` as `True`/`False`, which was read as not productive, so every row was dropped.
- `None`, which Cell Ranger before 6.0 writes for a missing value, is read as empty. D and C genes named "None" are gone, and a missing C gene no longer enters the clonotype key as "None".
- Only contigs with `is_cell` and `high_confidence` true are imported. `all_contig_annotations.csv` also lists background barcodes, which previously came in as extra cells and clonotypes.
- New stat column `Discarded: Not a Cell` counts the contigs dropped for either flag.
- The chain is taken from the `chain` column when it names a locus, and from the V gene otherwise (`Multi`, `None` or no `chain` column).
- The `-N` barcode suffix is dropped only when the whole file has one suffix. In `cellranger aggr` output the same barcode in different libraries is a different cell, and those cells were merged.
- `productive` and `umis` are required columns. A file without them passed validation and then failed during the run.
