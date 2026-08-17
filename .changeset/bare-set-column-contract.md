---
'@platforma-open/milaboratories.import-vdj.workflow': minor
'@platforma-open/milaboratories.import-vdj': minor
---

Add the bare-set column contract, with tengo unit tests

`bare-set-specs.lib.tengo` holds the axis and column specs a bare imported set emits: one
`pl7.app/variantKey` axis carrying the VDJ run id, the amino-acid variable domain per chain,
seven region columns per chain, a per-chain region-annotation status, the synthetic
abundance, and the record label. Chains are separated by the
`pl7.app/vdj/scClonotypeChain` column domain, so the set is one frame rather than one per
chain.

Nothing emits these yet — the library is consumed by the import path that lands next.

Also enables `pl-tengo test` for the workflow package, so these specs are covered in CI.
