---
'@platforma-open/milaboratories.import-vdj.workflow': minor
'@platforma-open/milaboratories.import-vdj': minor
---

Key the annotation statistics on the chain, and name it as the panel does

The statistics table showed a Chain column reading the raw `A` / `B` — the positional
paired-chain vocabulary, which is not what the scientist chose in the mapping panel.

It is now keyed on `pl7.app/vdj/chain`, holding the locus that was mapped, with a label column
carrying the panel's own words. A paired set reads as two rows, `TCR-β` and `TCR-α`, so the two
chains can be compared; a single-chain set is one row that still says which chain it is.
