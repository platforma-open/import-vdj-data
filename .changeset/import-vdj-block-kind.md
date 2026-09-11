---
"@platforma-open/milaboratories.import-vdj.model": minor
"@platforma-open/milaboratories.import-vdj": minor
"@platforma-open/milaboratories.import-vdj.column-profile": patch
"@platforma-open/milaboratories.import-vdj.region-annotation": patch
"@platforma-open/milaboratories.import-vdj.xlsx-to-csv": patch
---

Add the block kind.

The block gains an init-params contract, so a project template can create it
with the import already mapped. The import vocabularies, the file source and
the bare-set mapping now live in the kind and are re-exported by the model.
