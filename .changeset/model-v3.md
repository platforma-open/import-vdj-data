---
'@platforma-open/milaboratories.import-vdj.model': minor
'@platforma-open/milaboratories.import-vdj.ui': minor
'@platforma-open/milaboratories.import-vdj': minor
---

Migrate the block to BlockModelV3

Persisted state moves from V1's two buckets (`args` + `uiState`) into one `BlockData`, upgraded
in place the first time a project saved under V1 is opened. No setting is lost; a project saved
between the direct file door landing and the `loadFromFile` flag existing reopens on the file
door rather than on the dataset door with a hidden file behind it.

What changes for the scientist:

- **Renaming a block no longer stales it.** Both labels lived in `args` under V1, so editing the
  block's name asked for a re-import. Neither is read by the workflow; they now stay in the UI.
  The same applies to the secondary count type, which shapes which columns the panel offers and
  reaches the workflow only through the mapping it produces.
- **Prerun is declared separately from args.** Header inference, column suggestions and the
  identity-collision check are discovery, and re-run on their own; they no longer share a
  projection with the analysis decisions that gate Run.
- **The door that is not in use is stripped from args**, along with the dataset-door mapping
  fields when a bare set is configured. A mapping abandoned mid-edit no longer travels to the
  workflow.

Because two fields leave `args`, every existing block is stale once after the upgrade and wants
a Run. The workflow's own caching makes that re-run cheap — the inputs it keys on are unchanged.
