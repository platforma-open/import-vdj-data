---
'@platforma-open/milaboratories.import-vdj.workflow': patch
---

Make chain matching case-insensitive across the Custom, ImmunoSeq and QIAseq import formats, and position-independent for Custom and ImmunoSeq.

All three compared the chain-defining value with an exact, case-sensitive equality, so a lowercase gene call such as `ighv23` matched no chain at all. Every row was then dropped and the import completed without error, reporting 0 clones.

- **Custom** and **ImmunoSeq** matched the V gene name with a position-anchored slice (`strSlice(0, N).eq("IGH")`). They now uppercase the value and look for the locus anywhere in the name, matching what `import-common` already did for the MiXCR, Cell Ranger and AIRR formats. Species-prefixed calls such as `musIGHV1-1` now match as well.
- **QIAseq** matches on its own `chain` column, which is uppercased before comparison. The existing suffix-stripping behaviour is unchanged, so a chain value that does not end in `C` is still not matched.

Gene names continue to be stored exactly as they appear in the input — only the comparison is normalized, consistent with existing `import-common` behaviour.
