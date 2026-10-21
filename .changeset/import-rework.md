---
'@platforma-open/milaboratories.import-vdj.workflow': minor
'@platforma-open/milaboratories.import-vdj.model': minor
'@platforma-open/milaboratories.import-vdj': minor
---

Import rework across input types.

AIRR:
- `Discarded: Not Covering` names the assembling feature the way the settings panel does (`FR1 - CDR3`), not as `{FR1Begin:CDR3End}`.
- Non-productive rearrangements are discarded, as in every other format; AIRR alone imported them. The `productive` column decides; where it is empty or absent, a missing `junction_aa` or one with a stop codon or frameshift does.

Cell Ranger VDJ:
- Files from Cell Ranger before 6.0 import. They write `productive` as `True`/`False`, which was read as not productive, so every row was dropped.
- `None`, which Cell Ranger before 6.0 writes for a missing value, is read as empty, matched case-insensitively. D and C genes named "None" are gone, and a missing C gene no longer enters the clonotype key as "None".
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

Every format:
- New stat column `Discarded: Not Productive`, so the discards and the imported rows add up to `Rows Read`.
- The statistics table shows `Rows Read`, every `Discarded:` column and `Number of Clonotypes` by default. Read and UMI totals are hidden and can be turned on under Columns.
- Per-chain statistics name their chain (`TCR-β Clonotypes`, `IG Heavy Reads`) and sit in chain order. With several chains selected, the columns all read `Number of Clonotypes` and could not be told apart.

ImmunoSeq:
- A V, D or J gene immunoSEQ could not pick among equally good matches (`unresolved`) keeps its family, e.g. `TCRBV06`. Such rearrangements, 19 to 25 percent of the productive ones in the test sets, matched no chain and were dropped.
- v2 exports fill `templates` or `reads` and write `null` in the other. The count is taken from whichever is filled; files with templates imported every count as 0. The column is labelled `Number of Templates/Reads`.
- `null`, `NA`, `no data` and `unresolved` are matched case-insensitively. Gene names are matched case-insensitively and stored in upper case, so lowercase files import the same as uppercase ones.
- The chain comes from `locus` when the file has it, and from the genes otherwise.
- Reduced exports (`v_resolved`, `j_resolved`, `templates`) import. A D gene is no longer required, so files without one pass validation, and validation names the columns as the file would.
- The statistics table reports `Rows Read` and the rows discarded for no V gene, no J gene and not productive.

QIAseq:
- QIAseq clonotype tables without `UMIs with analytical threshold` import, counted at the least strict `UMIs with >= N reads` threshold. The length, rank and frequency columns are no longer required. Every such table on GEO was rejected.
- CLC Genomics Workbench `Clonotypes` exports (`Chain`, `V`, `J`, `C`, `Count`) import when comma-separated.
- A CSV whose header names are quoted (as CLC writes them) is matched by its names, in every format; the quotes were read as part of each name, so no column was found.
- A chain written as the locus (`TRA`) matches. Only the constant-region form (`TRAC`) did; the locus form was cut to `TR` and matched nothing.
- Genes named by segment alone (`V5-1`, `J27`, `V-14N-3*01`) get their locus (`TRAV5-1`, `TRAJ27`, `TRAV14N-3`), the allele is split into the allele column, and of several calls the first is kept.
- Rows with no CDR3 nt are discarded and counted rather than keyed together.
- `Read Set` and `Rank` are no longer imported: once rows are merged into clonotypes they describe one arbitrary row.
- The statistics table reports `Rows Read` and the discards.

Custom:
- Mapping the framework regions with a CDR3 aa and no CDR3 nt no longer fails the run.
- `region_not_covered` marks a region not reached and an empty value one of zero length. With CDR3 nt mapped, rows not reaching the keyed region are discarded and counted under `Discarded: Not Covering`; they used to share one blank key per V and J gene. A marker outside the key no longer drops the row.
- The statistics table reports `Rows Read` and the discards.
- `Auto-map columns` fills unmapped columns from common header names written by MiXCR, AIRR, Cell Ranger, immunoSEQ and QIAseq.
- CDR3 aa and CDR3 nt are no longer both marked required; either one is enough.
