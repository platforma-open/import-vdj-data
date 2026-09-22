---
'@platforma-open/milaboratories.import-vdj.workflow': minor
'@platforma-open/milaboratories.import-vdj.column-profile': minor
'@platforma-open/milaboratories.import-vdj.model': minor
'@platforma-open/milaboratories.import-vdj.kind': minor
'@platforma-open/milaboratories.import-vdj.ui': minor
'@platforma-open/milaboratories.import-vdj': minor
---

AIRR import rework (bulk and single cell).

The AIRR import required column `duplicate_count`, which is optional according to the official AIRR schema https://docs.airr-community.org/en/stable/datarep/rearrangements.html , was not able to import features larger than the CDR3, and incorrectly used columns `clone_id` and `cell_id`. This and more issues were fixed to allow more flexible, robust, and complete imports of bulk and sc AIRR datasets using the import-vdj-data block. 


One new AIRR setting:
- "Assemble clonotypes by": An AIRR file does not declare which part of the receptor its protocol covered, so the block asks instead of guessing. The twelve options and their values are MiXCR's own gene-feature vocabulary, copied from the mixcr-clonotyping panel so the two read alike. **CDR3 by default**, matching that panel; widening it is the scientist's call. It travels in the init-params contract, so a project template carries the choice.

Fixes/changes:
- Count columns are optional: without `duplicate_count`, `consensus_count` or `umi_count` every row counts once.
- Only `junction` (or `cdr3`), `v_call` and `j_call` are required.
- `junction` / `junction_aa` take precedence over `cdr3` / `cdr3_aa`; an empty junction is rebuilt from `cdr3` plus the conserved FR3/FR4 flanking codons (or `cdr3` alone when the frameworks are absent).
- An empty or absent `productive` column is NA rather than `false`; single-cell import no longer fails without it.
- A missing region no longer drops the row (AIRR formats only), but a row without a V call, a J call or a CDR3 is dropped: it cannot be keyed, and previously every such row collapsed into a single clonotype per V/J pair.
- The chosen feature is assembled from the region columns, marked as the main sequence, named in `pl7.app/vdj/feature` and used as the clonotype key, so full-length sequences that share a CDR3 stay distinct clonotypes. A row that does not cover the feature is dropped rather than keyed on its CDR3 — one clone no longer splits into a full-length clonotype and a CDR3-only one.
- A feature the file cannot carry falls back to CDR3 rather than deleting every row that misses a region. MiXCR's `exportAirr` emits an `fwr1` column it never fills on an FR1-primer amplicon; asking for VDJRegion there yields CDR3 clonotypes, not an empty import.
- A column counts as present only when it is filled in at least **half** the usable rows (those carrying `v_call`, `j_call` and a CDR3), measured by the column profiler over the whole file. `v_call`, `j_call` and `junction`/`cdr3` are hard-required and exempt. This is what stops a header the file never fills from steering the import — an empty `c_call` no longer joins the clonotype key, and an empty `cell_id` no longer makes a bulk file import as single-cell.
- **New stat columns, per sample and across every chain:** `pl7.app/vdj/stat/recordCount` (rearrangements read) plus `Discarded: No V Gene`, `No J Gene`, `No CDR3` and `Not Covering {feature}` (the last only when a feature is assembled, and labelled with it). Each counts its own filter's cost among the rows everything before it kept, so the discards and what survives partition the file rather than overlapping. Not per chain: the standards do not differ by chain, and a row with no V call belongs to none of them.
- Covering the feature means every one of its regions carries sequence, not merely that they concatenate to something. Change-O emits regions that are nothing but IMGT gaps, which degap to an empty string and would otherwise assemble a shorter sequence under the feature's name and split a clone in two.
- Widening the feature changes `pl7.app/vdj/clonotypeKey/structure`, so downstream blocks in existing projects re-anchor on re-import. Two datasets assembled by different features do not join, which is correct, but it is visible.
- Numbering spacers (`.`) and indel gaps (`-`) are stripped from every sequence column except `sequence_alignment` and `germline_alignment`, which stay positionally aligned. Blanket-applied rather than per-format: Change-O gaps `fwr1`/`cdr1`/`cdr2`/`fwr3` on every row, and `mixcr exportAirr -g -a` gaps `cdr3` too.
- Not AIRR-only: MiXCR and Cell Ranger share the same import template, so they too now discard a rearrangement with no CDR3 rather than merging every such row into one clonotype per V/J pair, which means a contig table carrying any will report one fewer clonotype and slightly different abundances.
- `clone_id` becomes a cluster rather than being discarded: a `pl7.app/clusterId` axis, a `pl7.app/link` linker column over (cluster, clonotype) and `pl7.app/clustering/clusterSize`. The id is namespaced by sample, since `clone_id` numbering restarts in every file. Bulk AIRR only; the single-cell path keys on paired chains, where a per-contig `clone_id` has no unambiguous target.
- FR3/FR4 boundaries are normalised to MiXCR's: when a dataset's `fwr3`/`fwr4` include the conserved Cys and Trp/Phe (IgBLAST, Change-O), the codons move to CDR3; MiXCR's own `exportAirr` already stops at CDR3 and is left as is.
- `clone_id` is no longer treated as a cell identifier, and `cell_id` is the cell key whenever present; `barcode` is only a fallback. Before, an empty `barcode` column listed ahead of `cell_id` left every cell without a key and the paired dataset empty.

New mappings:

| AIRR column | P-column |
|---|---|
| `sequence_alignment` | `pl7.app/vdj/sequenceAlignment`, alphabet nucleotide |
| `germline_alignment` | `pl7.app/vdj/germlineAlignment`, alphabet nucleotide |
| `sequence_alignment_aa` | `pl7.app/vdj/sequenceAlignment`, alphabet aminoacid |
| `germline_alignment_aa` | `pl7.app/vdj/germlineAlignment`, alphabet aminoacid |
| `fwr1` | `pl7.app/vdj/sequence`, feature FR1, alphabet nucleotide |
| `cdr1` | `pl7.app/vdj/sequence`, feature CDR1, alphabet nucleotide |
| `fwr2` | `pl7.app/vdj/sequence`, feature FR2, alphabet nucleotide |
| `cdr2` | `pl7.app/vdj/sequence`, feature CDR2, alphabet nucleotide |
| `fwr3` | `pl7.app/vdj/sequence`, feature FR3, alphabet nucleotide |
| `fwr4` | `pl7.app/vdj/sequence`, feature FR4, alphabet nucleotide |
| `fwr1_aa` | `pl7.app/vdj/sequence`, feature FR1, alphabet aminoacid |
| `cdr1_aa` | `pl7.app/vdj/sequence`, feature CDR1, alphabet aminoacid |
| `fwr2_aa` | `pl7.app/vdj/sequence`, feature FR2, alphabet aminoacid |
| `cdr2_aa` | `pl7.app/vdj/sequence`, feature CDR2, alphabet aminoacid |
| `fwr3_aa` | `pl7.app/vdj/sequence`, feature FR3, alphabet aminoacid |
| `fwr4_aa` | `pl7.app/vdj/sequence`, feature FR4, alphabet aminoacid |
| `clone_id` | `pl7.app/clusterId` axis + `pl7.app/link` linker + `pl7.app/clustering/clusterSize` (bulk only) |
