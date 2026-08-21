---
'@platforma-open/milaboratories.import-vdj.workflow': patch
'@platforma-open/milaboratories.import-vdj': patch
---

Describe what the region-annotation statuses mean

The status column's three values are terse, and "Not applicable" reads as a diagnosis when it
only means no sequence was supplied for that chain — which is the expected value on any panel
where one chain is partly filled in. The column now carries a `pl7.app/description` explaining
all three, and each of the four statistics explains what it counts, including that a non-zero
Failed count usually points at a mis-mapped column rather than bad data.
