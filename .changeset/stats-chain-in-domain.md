---
'@platforma-open/milaboratories.import-vdj.workflow': minor
'@platforma-open/milaboratories.import-vdj': minor
---

Report bare-set statistics the way the bulk path does

The annotation statistics table keyed its rows on a `pl7.app/vdj/scClonotypeChain` axis, so it
showed a Chain column reading the raw `A` / `B`. The block's own bulk path models the same
information differently: chain in each stat column's domain, no chain axis, chain named in the
label.

The bare path now follows it. Four statistics become four columns per chain — "Heavy Annotated",
"Light Annotated" and so on — on `[pl7.app/sampleId]` alone. With one mapped chain the domain and
the label prefix are both omitted, so a single-chain import's statistics are shaped exactly like a
bulk import's.

This also removes the raw `A` from the interface at its source, rather than labelling an axis
whose values the scientist had no reason to read.
