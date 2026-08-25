---
'@platforma-open/milaboratories.import-vdj.workflow': patch
'@platforma-open/milaboratories.import-vdj.model': patch
'@platforma-open/milaboratories.import-vdj.ui': patch
'@platforma-open/milaboratories.import-vdj': patch
---

Tie the id-collision warning to the column it is about, and shorten it

Changing an offending id column flashed the old verdict under the new column's name: the panel
quoted `bareSet.identity`, which updates on the pick, against collisions the previous column's
prerun had produced. Prerun now states which column it checked, the model reports the two as one
value so they cannot come from different runs, and the panel shows the warning only while it is
about the column now selected — so picking a clean column clears it instead of re-accusing it.

The message also listed up to ten repeated values, which buried the sentence saying what to do.
It now shows three and a count.
