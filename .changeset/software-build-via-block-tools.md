---
'@platforma-open/milaboratories.import-vdj.column-profile': patch
'@platforma-open/milaboratories.import-vdj.region-annotation': patch
'@platforma-open/milaboratories.import-vdj.xlsx-to-csv': patch
'@platforma-open/milaboratories.import-vdj': patch
---

Build software through block-tools so dev builds produce docker images

The three software packages called `pl-pkg build` directly, which ignores
`PL_BUILD_CHANNEL` / `PL_BUILD_VARIANT` / `PL_BUILD_LOCATION` and defaults docker
image builds to CI-only. A local `build:dev-remote` therefore emitted binary-only
descriptors, and a block built that way cannot run on a k8s deployment at all —
that runner launches containers exclusively and rejects a command with no image
as "docker is not set".

They now use `block-tools software build`, which honours those variables: variant
`all` builds the images and location `remote` pushes them, the same way
tcr-disco and the other 23 already-migrated software packages work. `PL_PKG_DEV`
drops out of the root scripts and `turbo.json`, since `PL_BUILD_LOCATION` carries
what it used to say.

No change to what the software does — only to how it is built.
