---
"@platforma-open/milaboratories.import-vdj": minor
"@platforma-open/milaboratories.import-vdj.model": minor
"@platforma-open/milaboratories.import-vdj.ui": minor
---

Warns when blocks that use data of this block no longer find it — an output it does not export or values it no longer has — and suggests adding the data or reconfiguring those blocks. The warning shows in desktop versions that compute links between blocks.
A dataset picked from the project is linked to the block that provides it while the import is still being set up, not only once it has run: what keeps the import from running is reported as an issue of the block, with the same messages as before, instead of leaving the block without settings.
