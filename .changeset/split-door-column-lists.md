---
'@platforma-open/milaboratories.import-vdj.model': patch
'@platforma-open/milaboratories.import-vdj.ui': patch
'@platforma-open/milaboratories.import-vdj': patch
---

Give each import door its own column list

The mapping dropdowns read one output that answered for both doors — the columns of a loaded
file and the columns the pool infers for a selected dataset. The two are discovered by different
means and belong to different panels, so a single output let one door offer columns that had
been discovered for the other.

`fileColumns` and `datasetColumns` are now separate, and each panel reads its own.
