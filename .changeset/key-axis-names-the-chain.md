---
'@platforma-open/milaboratories.import-vdj.workflow': minor
'@platforma-open/milaboratories.import-vdj': minor
---

Name the chain on the key axis of a single-chain import

With one mapped chain the record *is* that chain, so the `pl7.app/variantKey` axis now carries
`pl7.app/vdj/chain` — `IGHeavy` or `IGLight` — the same key and vocabulary the block's bulk path
puts on its `clonotypeKey` axis. It is the only machine-readable statement of the chain on such a
set, since the columns no longer carry one.

A paired record holds both chains, so no single value applies and the key is absent. There, chain
is a property of the column rather than of the record.
