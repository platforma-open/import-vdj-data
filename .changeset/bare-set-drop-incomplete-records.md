---
'@platforma-open/milaboratories.import-vdj.region-annotation': minor
'@platforma-open/milaboratories.import-vdj.workflow': minor
'@platforma-open/milaboratories.import-vdj.model': minor
'@platforma-open/milaboratories.import-vdj.ui': minor
'@platforma-open/milaboratories.import-vdj': minor
---

Directly imported sequence sets keep only records annotated on every mapped chain; records with a chain not supplied or not numbered are left out of the dataset and counted in the import statistics. The block now says before the run how many rows have no sequence for a chain and are ignored, and which identical rows are collapsed into one record
