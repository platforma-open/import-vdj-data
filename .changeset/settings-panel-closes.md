---
'@platforma-open/milaboratories.import-vdj.ui': patch
'@platforma-open/milaboratories.import-vdj': patch
---

Let the settings panel close before the mapping is finished

The panel refused to close while a custom mapping was incomplete, so there was no way to look at
the table, re-read the file or check an upstream block without finishing first. Nothing needed
the refusal: the args projection already keeps Run disabled until the mapping is valid, and
Settings reopens the panel.

Applied to both doors. The refusal predates the file door but had been extended to it.
