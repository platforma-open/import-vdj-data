---
"@platforma-open/milaboratories.import-vdj.model": patch
"@platforma-open/milaboratories.import-vdj.ui": patch
---

Compute the block subtitle without opening the block

The subtitle is now built by the model from the chosen chains, or from the loaded file
and its numbering scheme, so a block that was never opened shows it too. The name of a
picked dataset is stored when the dataset is picked instead of being re-derived each time
the block is opened. Existing blocks show the chains until their dataset is picked again.
The block's arguments and trace labels are unchanged, so nothing turns stale.
