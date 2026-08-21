---
'@platforma-open/milaboratories.import-vdj.workflow': minor
'@platforma-open/milaboratories.import-vdj.model': minor
'@platforma-open/milaboratories.import-vdj.ui': minor
'@platforma-open/milaboratories.import-vdj': minor
---

Name the mapping slots after loci, not A/B

The two sequence slots were called `A` and `B` throughout — the `pl7.app/vdj/scClonotypeChain`
vocabulary, which exists to tell apart chains sharing one frame. A single-chain import is a bulk
shape with nothing to tell apart, so that vocabulary was the wrong one to think in.

Slots are now `IGHeavy` / `IGLight`, the `pl7.app/vdj/chain` vocabulary the block's bulk path
already uses, and the one that extends to TCR loci if bare sets ever accept them.

Emitted specs are unchanged: `pl7.app/vdj/scClonotypeChain` still carries `A` / `B` on a paired
set, translated at the point of emission. Two vocabularies for two questions — which locus the
scientist mapped, and which position a chain occupies in a paired record.

A bare-set mapping saved before this keeps its columns under the old slot keys and will need
re-selecting. The bare path is unreleased.
