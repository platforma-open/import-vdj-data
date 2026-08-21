---
'@platforma-open/milaboratories.import-vdj.workflow': minor
'@platforma-open/milaboratories.import-vdj': minor
---

Stop stamping the chain domain on single-chain imports

`pl7.app/vdj/scClonotypeChain` is how a consumer recognises a dataset holding paired chains in
one frame — clonotype-clustering probes for it, antibody-sequence-liabilities scans for it. A set
with one mapped chain is bulk-shaped, so stamping it there made both blocks treat a one-chain
import as paired.

With one chain the sequence, region and status columns now carry no `scClonotypeChain` or
`/index` key. With two they are unchanged. The chain is still named in each column's label.

Nothing machine-readable states the chain on a one-chain set, which matches how bulk already
behaves: sequence-properties defaults an absent chain to `A` and names its properties VH
accordingly — as it already does for every bulk MiXCR light-chain dataset. A light-only import
therefore produces VH-named properties downstream. That is inherited from the bulk convention,
not introduced here.
