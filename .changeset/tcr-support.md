---
'@platforma-open/milaboratories.import-vdj.workflow': minor
'@platforma-open/milaboratories.import-vdj.model': minor
'@platforma-open/milaboratories.import-vdj.ui': minor
'@platforma-open/milaboratories.import-vdj.region-annotation': minor
'@platforma-open/milaboratories.import-vdj': minor
---

Import TCR sequences, not only antibodies

The receptor selector now offers **TCR-αβ** and **TCR-γδ**, and each of their chains on its own.
Numbering, region location, statuses and the emitted columns work as they do for IG.

ANARCI could always number TCR — its HMM library ships human and mouse models for all four chain
types. What was missing was ours: the annotation step read only ANARCI's `H` and `KL` output files
and had region boundaries for those two buckets. It now handles all six buckets ANARCI can write,
and the TCR boundaries are the IG ones — IMGT numbering does not vary by chain, which is why the
`H` and `KL` tables were already identical under IMGT.

TCR is numbered under IMGT only. Kabat and Chothia were defined on antibody structures and ANARCI
raises for a TCR chain, so the scheme dropdown narrows to IMGT when a TCR receptor is chosen.

The more diverse chain — the one recombining a D segment — takes slot `A`: IGHeavy, TCRBeta,
TCRDelta. That is MiXCR's rule and the order its own receptor table uses, and this block's
single-cell path already followed it.
