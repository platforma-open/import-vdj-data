---
'@platforma-open/milaboratories.import-vdj.model': patch
'@platforma-open/milaboratories.import-vdj.ui': patch
'@platforma-open/milaboratories.import-vdj.workflow': patch
'@platforma-open/milaboratories.import-vdj': patch
---

Upgrade the SDK toolchain and refresh the block structure (`block-tools structure refresh`).

Catalog moves to model/ui-vue/test 1.80.17, workflow-tengo 6.8.2, block-tools 2.12.12, tengo-builder 4.0.21, package-builder 3.14.2, ts-builder 1.6.2, ts-configs 1.4.0. Layout `.structure` v1 to v2: `block/` becomes the slim published facade and the root `build`/`build:dev` scripts are replaced by the `PL_BUILD_*` variant matrix.

Author-code fixes required by the upgrade:

- `PColumnCollection.getColumns()` widened its return to `PColumn<PColumnDataUniversal | undefined>[]`, which `createPlDataTableV2` does not accept. Not-ready columns are now filtered out explicitly.
- `@milaboratories/helpers` aligned to 1.14.5 to match what `@platforma-sdk/model` 1.80.17 depends on; two copies in the tree broke the model's dts build with TS2742.
- The model export is renamed `model` to `platforma`, which the structurer-generated block facade imports.
