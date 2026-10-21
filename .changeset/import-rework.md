---
'@platforma-open/milaboratories.import-vdj.workflow': minor
'@platforma-open/milaboratories.import-vdj.model': minor
'@platforma-open/milaboratories.import-vdj': minor
---

Import rework across input types.

AIRR:
- `Discarded: Not Covering` names the assembling feature the way the settings panel does (`FR1 - CDR3`), not as `{FR1Begin:CDR3End}`.

Cell Ranger VDJ:
- Files from Cell Ranger before 6.0 import. They write `productive` as `True`/`False`, which was read as not productive, so every row was dropped.
- `None`, which Cell Ranger before 6.0 writes for a missing value, is read as empty. D and C genes named "None" are gone, and a missing C gene no longer enters the clonotype key as "None".
- Only contigs with `is_cell` and `high_confidence` true are imported. `all_contig_annotations.csv` also lists background barcodes, which previously came in as extra cells and clonotypes.
- New stat column `Discarded: Not a Cell` counts the contigs dropped for either flag.
- The chain is taken from the `chain` column when it names a locus, and from the V gene otherwise (`Multi`, `None` or no `chain` column).
- The `-N` barcode suffix is dropped only when the whole file has one suffix. In `cellranger aggr` output the same barcode in different libraries is a different cell, and those cells were merged.
- `productive` and `umis` are required columns. A file without them passed validation and then failed during the run.

MiXCR:
- A region MiXCR did not reach (`region_not_covered`) is no longer read as sequence. Clones missing CDR3 were imported as productive clonotypes with the CDR3 `region_not_covered`; they are now discarded and counted under `Discarded: No CDR3`.
- A region of zero length (MiXCR writes it empty) no longer blanks the whole VDJRegion. Every clone with one used to share one empty key per V and J gene, so distinct clones were merged.
- `Assemble clonotypes by` is offered for MiXCR. Left empty, clones are keyed on the widest of VDJRegion and FR1 - CDR3 the file exports, as before; clones not covering it are discarded and counted under `Discarded: Not Covering`.
- CDR2 nt is imported; it was left out of the column list.
- MiXCR 3 (`cloneCount`, `nSeqImputedCDR3`) and MiXCR 1/2 (`Clone count`, `N. Seq. CDR3`) exports import, keyed on CDR3. Files with UMI counts and no read counts pass validation.
- Single-cell MiXCR imports report `Number of UMIs` in the statistics table, as bulk ones do.

All formats read by the shared template (MiXCR, Cell Ranger, AIRR):
- New stat column `Discarded: Not Productive`, so the discards and the imported rows add up to `Rows Read`.
