# @platforma-open/milaboratories.import-vdj.xlsx-to-csv

## 1.1.1

### Patch Changes

- 48c194e: Build software through block-tools so dev builds produce docker images

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

## 1.1.0

### Minor Changes

- 704a96e: Import bare paired sequence sets

  A file of receptor sequences with no gene calls, no region boundaries and no count can now be
  imported as a custom format. Each row becomes one record holding both chains, keyed on the
  hash of an identity column the scientist selects and labelled with that column's value.
  Regions are located by ANARCI during the import, under a numbering scheme the scientist
  chooses, and every record carries a per-chain annotation status.

  The custom-format validity rule no longer demands a V gene, a J gene and an abundance for
  such a set; it requires a sequence mapped to a chain and an identity column instead. The
  other formats are untouched.

  The identity column is checked for uniqueness before the run starts, and the values that
  clash are shown. Rows that repeat an identity while differing elsewhere would merge into one
  record, so the import refuses them; rows identical in every mapped cell state the same record
  twice and collapse to one.

  The direct door accepts csv, tsv and xlsx. A workbook's first worksheet is converted to csv
  before anything reads it, so the header list, the identity check and the import all see the same
  converted file and the pipeline never handles a workbook.

  Non-sequence columns are offered for import rather than dropped. Each one the scientist accepts
  becomes a record property, named from the header with special characters replaced and labelled
  with the header exactly as the file wrote it. Two headers that would become the same column are
  refused rather than silently merged.

  The block also reports the columns it emitted, so a successful import shows what it produced
  rather than an empty table.
