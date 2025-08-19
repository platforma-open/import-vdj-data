---
"@platforma-open/milaboratories.import-vdj.workflow": minor
"@platforma-open/milaboratories.import-vdj": minor
---

- migration to txt.head() for header parsing, fixes window compatibility issues
- schema handling fixes (schema not used in reading operations anymore)
  - fixes concatenation crashes
  - fixes incorrect calculation of mean fractions
- result reproducibility improvements, with maps.forEach
