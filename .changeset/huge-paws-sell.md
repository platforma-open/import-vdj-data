---
"@platforma-open/milaboratories.import-vdj.column-profile": patch
"@platforma-open/milaboratories.import-vdj.region-annotation": patch
"@platforma-open/milaboratories.import-vdj.workflow": minor
"@platforma-open/milaboratories.import-vdj": minor
"@platforma-open/milaboratories.import-vdj.model": minor
"@platforma-open/milaboratories.import-vdj.kind": minor
"@platforma-open/milaboratories.import-vdj.test": minor
"@platforma-open/milaboratories.import-vdj.ui": minor
---

Imports peptide count tables, and the block is renamed to Import V(D)J & Peptide Data.

- Under Data type, choose Peptides to import peptide count tables, for example from phage display panning. Map the amino-acid column, an optional nucleotide column, and read and/or UMI counts; Suggest columns fills in the fields it recognises. The result works directly in Enrichment, Sequence Clustering, Lead Selection and the other peptide blocks.
- Peptides with a stop codon, with trailing nucleotides, or shorter than 5 amino acids are left out. The block's table shows, per sample, the rows in the file, the unique peptides, the total reads, the average peptide length, and how many rows were merged or left out, and why.
- Samples & Data "Multisample CSV/TSV" datasets, where one table holds several samples and a column names the sample, can now be imported, for every V(D)J format and for peptides.
- Gzipped CSV/TSV datasets now import with every format.
