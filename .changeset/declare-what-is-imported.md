---
'@platforma-open/milaboratories.import-vdj.model': minor
'@platforma-open/milaboratories.import-vdj.ui': minor
'@platforma-open/milaboratories.import-vdj.workflow': minor
'@platforma-open/milaboratories.import-vdj': minor
---

Declare what is being imported, rather than inferring it from filled slots

The panel offered a fixed pair of chain dropdowns and worked out whether the set was paired from
how many were filled. A paired panel whose light column was not yet mapped was indistinguishable
from a deliberately heavy-only one — and the two emit different shapes.

A "Receptor / chain" selector now says which: **IG (heavy + light)**, **IG Heavy only**, or **IG
Light only**. The sequence slots follow the choice, labelled from it, and every slot it asks for
must be filled before the block will run. Declaring IG and mapping one column is an unfinished
mapping, not a heavy-only set.

Switching the selection drops columns mapped to slots the new choice does not ask for, so the
block never emits a chain the scientist has just said they are not importing.

The key axis derives its receptor from the declared chains instead of assuming IG, and refuses
chains from two receptors in one set.

TCR is not offered yet. ANARCI numbers TCR — its HMM library ships human and mouse A/B/G/D
models — but this block reads only ANARCI's `H` and `KL` output and has no region-boundary table
for TCR chains, so a TCR import would annotate nothing.
