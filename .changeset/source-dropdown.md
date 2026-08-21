---
'@platforma-open/milaboratories.import-vdj.ui': minor
'@platforma-open/milaboratories.import-vdj.model': minor
'@platforma-open/milaboratories.import-vdj': minor
---

Choose the source in one dropdown, with "Load from file" in the list

The panel asked two questions where there is one: a "Load from file" checkbox decided which door
was showing, and a dropdown then chose within it. The checkbox is gone. The dataset dropdown now
carries a "Load from file…" entry that opens the platform's file browser — the same dialog
`PlFileInput` opens, so remote storages are reachable, not just the local disk — and a loaded
file appears in the list as the selected entry, so the control always shows what the block is
reading.

Re-selecting a loaded file reopens the dialog, which is how a file is swapped. Cancelling leaves
the previous selection untouched — nothing is cleared on the way in.

`loadFromFile` is dropped from the block's data: which door is showing is derived from whether a
file is loaded, so a stored flag could only disagree with it.
