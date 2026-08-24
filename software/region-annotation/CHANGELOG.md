# @platforma-open/milaboratories.import-vdj.region-annotation

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

- f653c1c: Add ANARCI region annotation to the import block

  A new `region-annotation` software package and an `annotate-regions` template locate FR1–FR4
  and CDR1–CDR3 in amino-acid antibody variable domains, with the numbering scheme (`imgt`,
  `kabat`, `chothia`) as the scientist's choice. ANARCI is the shared published artifact
  already used elsewhere in the workspace, reused rather than introduced.

  Each chain of each record also gets a region-annotation status — `Annotated`,
  `Not applicable` or `Failed`, never empty — so a record whose boundaries could not be located
  says so instead of silently receiving empty region strings.

  The template also reports per-chain outcome counts, including how many annotated records
  ANARCI numbered as the _other_ chain. Chain is declared by the mapping slot and inferred by
  ANARCI, and those can disagree; the count makes a wrong slot assignment visible instead of
  letting it import cleanly with every chain label wrong. Nothing acts on the number.

  Not yet wired into the import pipeline; the template is callable but no path invokes it.

- 692939e: Import TCR sequences, not only antibodies

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
