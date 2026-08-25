---
'@platforma-open/milaboratories.import-vdj.model': patch
'@platforma-open/milaboratories.import-vdj.ui': patch
'@platforma-open/milaboratories.import-vdj': patch
---

Refuse to run a bare set whose id column repeats

The record key is the identity column's hash, so a value that repeats on rows that are not
identical merges two different records into one — silently, and the block would import it anyway.
Prerun has always found these and the panel has always warned about them, but the warning was only
a warning: Run stayed live, and a run driven through the API imported the merged set without
complaint.

Run is now refused both while the verdict for the selected column is still outstanding and when it
says the column repeats, and the panel says which of the two it is waiting on — worded for the
checks in general, since more of them are coming. The platform enforces it as well as the
interface: invalid args leave nothing to render a production from.

Getting there needs prerun's verdict inside the args projection, which sees only the block's own
data, so the UI mirrors it in. That is a hairpin, and deliberately so: unlike a column mapping
there is no gesture at which the fact could be captured, because the scientist picks a column and
only then does the check discover whether it is sound. The two rules that keep it safe — a verdict
carries what it is about, and is dropped when the source changes — are stated on
`BlockData.prerunChecks`, and further prerun checks should follow them. It can all go once
`argsValid` can read prerun directly.
