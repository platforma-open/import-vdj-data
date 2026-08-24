# @platforma-open/milaboratories.import-vdj.column-profile

## 1.1.1

### Patch Changes

- 27edd37: Pass the column-profile separator by name, not as a tab character

  Loading a TSV failed on server deployments with `TypeError: "delimiter" must be a 1-character
string`, while the same file loaded on a desktop backend. The block was passing a real tab as an
  argv element. Desktop runners exec argv directly, so the tab arrived intact; the k8s and
  google-batch runners serialise the command with Go's `%q` and re-run it through `sh -c`, where
  the tab has already become the two characters `\` and `t` and stays that way. `csv.reader`
  rejects a two-character delimiter.

  Prerun now sends `tab` or `comma` and `main.py` maps the name back to the character, so only
  plain words cross the runner boundary. A separator that still arrives malformed now fails with a
  message naming the accepted values rather than a `TypeError`.

  The underlying quoting is a backend issue and is unfixed: `toShellCmd` in `util/k8s/template.go`
  uses Go quoting where POSIX shell quoting is needed.

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

- 3275424: Detect column types by reading the whole file

  Record properties were imported as text because nothing could safely say otherwise. Prerun now
  profiles a directly-loaded file over every row and the panel records the answer when a column is
  accepted, so a numeric column is emitted `Long` or `Double` and stays sortable downstream.

  The type widens monotonically as rows are read — the rule `samples-and-data` uses for imported
  metadata — so a single non-numeric value anywhere settles the column as `String`. A column that
  reads numeric for the first rows and holds `N/A` further down cannot be typed numeric, which is
  the failure a sampled answer would have.

  The same pass answers which columns hold amino-acid variable domains, replacing the 20-row
  sample the chain dropdowns used.

  Also: the record axis and its label column now read "Variant Id" rather than "Record ID", and the
  identity dropdown reads "Select id column".
