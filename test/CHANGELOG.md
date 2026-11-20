# @platforma-open/milaboratories.import-vdj.test

## 1.5.0

### Minor Changes

- e1e065a: Imports peptide count tables, and the block is renamed to Import V(D)J & Peptide Data.

  - Under Data type, choose Peptides to import peptide count tables, for example from phage display panning. Map the amino-acid column, an optional nucleotide column, and read and/or UMI counts; Suggest columns fills in the fields it recognises. The result works directly in Enrichment, Sequence Clustering, Lead Selection and the other peptide blocks.
  - Peptides with a stop codon, with trailing nucleotides, or shorter than 5 amino acids are left out. The block's table shows, per sample, the rows in the file, the unique peptides, the total reads, the average peptide length, and how many rows were merged or left out, and why.
  - Samples & Data "Multisample CSV/TSV" datasets, where one table holds several samples and a column names the sample, can now be imported, for every V(D)J format and for peptides.
  - Gzipped CSV/TSV datasets now import with every format.

## 1.4.0

### Minor Changes

- 2b91d14: Supporting cells column added, dependencies updates

## 1.3.0

### Minor Changes

- cef5de2: refactoring, airr format and dependencies updates

## 1.2.0

### Minor Changes

- cb63c0c: Abundance columns type fix & updating dependencies

## 1.1.0

### Minor Changes

- c054836: updating SDK and keep one abundance column (read count)

## 1.0.1

### Patch Changes

- 0ff776c: technical release
- e0fd2e4: technical release
- a178a23: technical release
- 595e430: technical release
