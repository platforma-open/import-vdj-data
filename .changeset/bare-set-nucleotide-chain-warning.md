---
'@platforma-open/milaboratories.import-vdj.column-profile': minor
'@platforma-open/milaboratories.import-vdj.workflow': minor
'@platforma-open/milaboratories.import-vdj.model': minor
'@platforma-open/milaboratories.import-vdj.ui': minor
'@platforma-open/milaboratories.import-vdj': minor
---

Directly imported sequence sets warn when a chain is mapped to a column that holds only nucleotide letters (A, C, G, T, U, N). Such columns pass the amino-acid alphabet check, since those letters are amino acids too, so they were offered as chains silently and every record then failed region annotation. The column profile now reports these columns as `nucleotide`.
