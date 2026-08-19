---
'@platforma-open/milaboratories.import-vdj.workflow': patch
'@platforma-open/milaboratories.import-vdj': patch
---

Name the chain in the annotation statistics table

The table's Chain axis showed the raw `A` / `B` value. A `pl7.app/label` column on that axis now
carries "Heavy" / "Light", the same split the record axis uses for its opaque hash.

The axis values stay `A` / `B`: that is the `pl7.app/vdj/scClonotypeChain` vocabulary every other
producer uses, and an axis disagreeing with the same-named column domain would give one name two
meanings.
