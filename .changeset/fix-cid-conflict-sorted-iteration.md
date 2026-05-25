---
'@platforma-open/milaboratories.import-vdj.workflow': patch
'@platforma-open/milaboratories.import-vdj.model': patch
'@platforma-open/milaboratories.import-vdj.ui': patch
'@platforma-open/milaboratories.import-vdj': patch
---

Fix unstable CIDs from non-canonical Tengo map iteration in pure-template-called code.
Also migrates `model/` and `ui/` from the legacy `vue-tsc + vite` pipeline to `@milaboratories/ts-builder` (matching `clonotype-browser`, `immune-assay-data`, and other newer blocks). This unblocks fresh installs whose `vue-tsc -b` was failing on two pre-existing SDK-API type mismatches (`SdkPluginV2` plugin shape vs `Plugin<[],[]>`, and `ComputedRef<PlDataTableSettingsV2Base>` vs `Readonly<...>` on `PlAgDataTableV2`). No runtime behavior change.
