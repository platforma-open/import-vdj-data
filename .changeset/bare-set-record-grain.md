---
'@platforma-open/milaboratories.import-vdj.workflow': minor
'@platforma-open/milaboratories.import-vdj': minor
---

Emit bare-set properties on the record axis, keeping only abundance per sample

A bare set now has MiXCR's shape: `pl7.app/vdj/uniqueMoleculeCount` sits on
`[pl7.app/sampleId, pl7.app/variantKey]`, and every other column — the amino-acid variable
domain per chain, the located regions and their statuses, the imported properties and the
record label — sits on `[pl7.app/variantKey]` alone.

Previously every column kept the sample axis. Consumers match axes positionally: a selector
naming one axis is compared against the candidate column's axis 0, so a property column
carrying the sample axis first was invisible to them, and `sequence-properties` reported
"antibody/TCR mode detected but no amino-acid VDJ sequence columns found" — a missing column
rather than the mismatch that caused it. Collapsing the sample axis here is what lets every
downstream consumer read a bare set unchanged.

The import and annotation passes still run per sample; two aggregate passes collapse their
output onto the record key. Collapsing is lossless — every collapsed column is a function of
the record key and identical in every sample the record appears in.

The sample label column on the direct file door now reads "Sample" rather than "Sample Name",
matching samples-and-data.
