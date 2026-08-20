---
'@platforma-open/milaboratories.import-vdj.model': patch
'@platforma-open/milaboratories.import-vdj': patch
---

Stop a saved sort from failing the statistics table

Sorting the statistics table and then importing a different receptor set left the whole output
failed: the saved sort names a column, and changing the receptor set changes which columns the
run emits. There was no way to clear it from the interface.

A sort or filter that names a column the current run does not emit is now ignored and the table
is shown unsorted.
