---
'@platforma-open/milaboratories.import-vdj.ui': patch
'@platforma-open/milaboratories.import-vdj': patch
---

Let the id column be cleared

Clearing the id column left the field reading "Value not available" in red, as though the choice
had broken rather than been cleared. `identity` is a required string, so "nothing chosen" is stored
as an empty string, and a dropdown treats any value that is not `undefined` as chosen — an empty
string is simply a chosen value absent from the options. The field now reports nothing chosen,
which is what happened.

One thing nearby: clearing every mapped column only reset the mapping when the mapped chains were
the IG pair, so a TCR mapping could never clear itself. It now checks every slot.
