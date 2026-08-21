---
'@platforma-open/milaboratories.import-vdj.workflow': minor
'@platforma-open/milaboratories.import-vdj.model': minor
'@platforma-open/milaboratories.import-vdj.ui': minor
'@platforma-open/milaboratories.import-vdj': minor
---

Upgrade the SDK and refresh the block structure

Catalog moves to `@platforma-sdk/model`/`ui-vue` 1.81.1, `workflow-tengo` 6.8.2,
`block-tools` 2.13.0, `tengo-builder` 4.0.22, `package-builder` 3.15.0, `test` 1.81.3.
`block/` becomes the slim facade (bundled `dist/` + `block-pack/`, `ImportVdjBlockPointer`
export), and the root build scripts move from `PL_PKG_DEV` to
`PL_BUILD_CHANNEL`/`PL_BUILD_VARIANT`/`PL_BUILD_LOCATION` — `build:dev` is now
`build:dev-local`.

Author-visible change: the model is exported as `platforma` instead of `model`, matching
the generated facade and every V3 block. No behaviour change to import, column emission or
the block's outputs.
