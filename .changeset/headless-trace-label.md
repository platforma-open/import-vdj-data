---
"@platforma-open/milaboratories.import-vdj.model": patch
"@platforma-open/milaboratories.import-vdj.ui": patch
---

Compute the block subtitle without opening the block

The subtitle is now built by the model from the chosen chains, or from the loaded file
and its numbering scheme, so a block that was never opened shows it too. The name of a
picked dataset is kept in sync with the result pool and is written only when it changes.
Existing blocks show the chains until the block is opened.
The block's arguments and trace labels are unchanged, so nothing turns stale.
