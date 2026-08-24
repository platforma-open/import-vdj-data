# @platforma-open/milaboratories.import-vdj.workflow

## 1.16.2

### Patch Changes

- c546f52: Move to software-anarci 1.0.1, which records its docker entrypoint

  Region annotation failed on k8s deployments with `sh: 1: ANARCI: not found`
  (exit 127). The conda image puts its environment on PATH solely through
  `ENTRYPOINT ["micromamba", "run", "--prefix", "/conda-env"]`, and a k8s pod spec
  overrides the image entrypoint — so the runner has to re-apply it from the
  software descriptor. Every software-anarci up to 1.0.0 records
  `docker.entrypoint: []`, because the package-builder that published them did not
  read the built image's entrypoint back. Nothing re-applied the wrapper, ANARCI
  was never on PATH, and the step died before it started.

  1.0.1 was rebuilt with a package-builder that reads `.Config.Entrypoint` from the
  image, so its descriptor carries the micromamba wrapper and the k8s runner
  reconstructs the right command. `^0.0.3` is exact for a 0.0.x range, so the pin
  could never pick the fix up on its own.

  No ANARCI behaviour changes between these versions — 1.0.0 was a plain release
  and 1.0.1 was "update build deps".

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

- Updated dependencies [27edd37]
- Updated dependencies [48c194e]
  - @platforma-open/milaboratories.import-vdj.column-profile@1.1.1
  - @platforma-open/milaboratories.import-vdj.region-annotation@1.1.1
  - @platforma-open/milaboratories.import-vdj.xlsx-to-csv@1.1.1

## 1.16.1

### Patch Changes

- 093dfc2: Make chain matching case-insensitive across the Custom, ImmunoSeq and QIAseq import formats, and position-independent for Custom and ImmunoSeq.

  All three compared the chain-defining value with an exact, case-sensitive equality, so a lowercase gene call such as `ighv23` matched no chain at all. Every row was then dropped and the import completed without error, reporting 0 clones.

  - **Custom** and **ImmunoSeq** matched the V gene name with a position-anchored slice (`strSlice(0, N).eq("IGH")`). They now uppercase the value and look for the locus anywhere in the name, matching what `import-common` already did for the MiXCR, Cell Ranger and AIRR formats. Species-prefixed calls such as `musIGHV1-1` now match as well.
  - **QIAseq** matches on its own `chain` column, which is uppercased before comparison. The existing suffix-stripping behaviour is unchanged, so a chain value that does not end in `C` is still not matched.

  Gene names continue to be stored exactly as they appear in the input — only the comparison is normalized, consistent with existing `import-common` behaviour.

## 1.16.0

### Minor Changes

- d0a024b: Add the bare-set column contract, with tengo unit tests

  `bare-set-specs.lib.tengo` holds the axis and column specs a bare imported set emits: one
  `pl7.app/variantKey` axis carrying the VDJ run id, the amino-acid variable domain per chain,
  seven region columns per chain, a per-chain region-annotation status, the synthetic
  abundance, and the record label. Chains are separated by the
  `pl7.app/vdj/scClonotypeChain` column domain, so the set is one frame rather than one per
  chain.

  Nothing emits these yet — the library is consumed by the import path that lands next.

  Also enables `pl-tengo test` for the workflow package, so these specs are covered in CI.

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

- cb971b2: Emit bare-set properties on the record axis, keeping only abundance per sample

  A bare set now has MiXCR's shape: `pl7.app/vdj/uniqueMoleculeCount` sits on
  `[pl7.app/sampleId, pl7.app/variantKey]`, and every other column — the amino-acid variable
  domain per chain, the located regions and their statuses, the imported properties and the
  record label — sits on `[pl7.app/variantKey]` alone.

  Previously every column kept the sample axis. Consumers match axes positionally: a selector
  naming one axis is compared against the candidate column's axis 0, so a property column
  carrying the sample axis first was invisible to them, and `sequence-properties` reported
  "antibody/TCR mode detected but no amino-acid VDJ sequence columns found" — a missing column
  rather than the mismatch that caused it. Collapsing the sample axis here is what lets every
  downstream consumer read a bare set unchanged.

  The import and annotation passes still run per sample; two aggregate passes collapse their
  output onto the record key. Collapsing is lossless — every collapsed column is a function of
  the record key and identical in every sample the record appears in.

  The sample label column on the direct file door now reads "Sample" rather than "Sample Name",
  matching samples-and-data.

- 9261773: Name the mapping slots after loci, not A/B

  The two sequence slots were called `A` and `B` throughout — the `pl7.app/vdj/scClonotypeChain`
  vocabulary, which exists to tell apart chains sharing one frame. A single-chain import is a bulk
  shape with nothing to tell apart, so that vocabulary was the wrong one to think in.

  Slots are now `IGHeavy` / `IGLight`, the `pl7.app/vdj/chain` vocabulary the block's bulk path
  already uses, and the one that extends to TCR loci if bare sets ever accept them.

  Emitted specs are unchanged: `pl7.app/vdj/scClonotypeChain` still carries `A` / `B` on a paired
  set, translated at the point of emission. Two vocabularies for two questions — which locus the
  scientist mapped, and which position a chain occupies in a paired record.

  A bare-set mapping saved before this keeps its columns under the old slot keys and will need
  re-selecting. The bare path is unreleased.

- 49f58bb: Declare what is being imported, rather than inferring it from filled slots

  The panel offered a fixed pair of chain dropdowns and worked out whether the set was paired from
  how many were filled. A paired panel whose light column was not yet mapped was indistinguishable
  from a deliberately heavy-only one — and the two emit different shapes.

  A "Receptor / chain" selector now says which: **IG (heavy + light)**, **IG Heavy only**, or **IG
  Light only**. The sequence slots follow the choice, labelled from it, and every slot it asks for
  must be filled before the block will run. Declaring IG and mapping one column is an unfinished
  mapping, not a heavy-only set.

  Switching the selection drops columns mapped to slots the new choice does not ask for, so the
  block never emits a chain the scientist has just said they are not importing.

  The key axis derives its receptor from the declared chains instead of assuming IG, and refuses
  chains from two receptors in one set.

  TCR is not offered yet. ANARCI numbers TCR — its HMM library ships human and mouse A/B/G/D
  models — but this block reads only ANARCI's `H` and `KL` output and has no region-boundary table
  for TCR chains, so a TCR import would annotate nothing.

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

- 6588581: Name the chain on the key axis of a single-chain import

  With one mapped chain the record _is_ that chain, so the `pl7.app/variantKey` axis now carries
  `pl7.app/vdj/chain` — `IGHeavy` or `IGLight` — the same key and vocabulary the block's bulk path
  puts on its `clonotypeKey` axis. It is the only machine-readable statement of the chain on such a
  set, since the columns no longer carry one.

  A paired record holds both chains, so no single value applies and the key is absent. There, chain
  is a property of the column rather than of the record.

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

- 88c20b9: Upgrade the SDK and refresh the block structure

  Catalog moves to `@platforma-sdk/model`/`ui-vue` 1.81.1, `workflow-tengo` 6.8.2,
  `block-tools` 2.13.0, `tengo-builder` 4.0.22, `package-builder` 3.15.0, `test` 1.81.3.
  `block/` becomes the slim facade (bundled `dist/` + `block-pack/`, `ImportVdjBlockPointer`
  export), and the root build scripts move from `PL_PKG_DEV` to
  `PL_BUILD_CHANNEL`/`PL_BUILD_VARIANT`/`PL_BUILD_LOCATION` — `build:dev` is now
  `build:dev-local`.

  Author-visible change: the model is exported as `platforma` instead of `model`, matching
  the generated facade and every V3 block. No behaviour change to import, column emission or
  the block's outputs.

- da19d08: Stop stamping the chain domain on single-chain imports

  `pl7.app/vdj/scClonotypeChain` is how a consumer recognises a dataset holding paired chains in
  one frame — clonotype-clustering probes for it, antibody-sequence-liabilities scans for it. A set
  with one mapped chain is bulk-shaped, so stamping it there made both blocks treat a one-chain
  import as paired.

  With one chain the sequence, region and status columns now carry no `scClonotypeChain` or
  `/index` key. With two they are unchanged. The chain is still named in each column's label.

  Nothing machine-readable states the chain on a one-chain set, which matches how bulk already
  behaves: sequence-properties defaults an absent chain to `A` and names its properties VH
  accordingly — as it already does for every bulk MiXCR light-chain dataset. A light-only import
  therefore produces VH-named properties downstream. That is inherited from the bulk convention,
  not introduced here.

- 49dd5dd: Key the annotation statistics on the chain, and name it as the panel does

  The statistics table showed a Chain column reading the raw `A` / `B` — the positional
  paired-chain vocabulary, which is not what the scientist chose in the mapping panel.

  It is now keyed on `pl7.app/vdj/chain`, holding the locus that was mapped, with a label column
  carrying the panel's own words. A paired set reads as two rows, `TCR-β` and `TCR-α`, so the two
  chains can be compared; a single-chain set is one row that still says which chain it is.

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

### Patch Changes

- 3aa8010: Name a file import after its file, and stop offering identifiers as sequences

  - The block's title on the file door is the file's name, plus the numbering scheme when it is
    not IMGT. It previously showed the six default chain names, which the scientist never chose
    and which say nothing about what was imported.
  - The dataset's trace label is the file's name too, so a downstream dataset dropdown
    distinguishes two imports instead of showing "Import V(D)J Data" twice.
  - The chain dropdowns offer only columns whose values actually read as amino-acid variable
    domains. Prerun samples up to 20 rows and reads the alphabet, because a header cannot say
    it: an antibody's name could previously be mapped into a sequence slot, which imports
    cleanly and leaves every record Failed after ANARCI declines to number it. Falls back to
    every header when nothing could be sampled.
  - "Other columns" is gone; record properties are mapped in the same section as the sequences.
  - The numbering scheme moved out of the column mapping into a "Region annotation" section of
    its own — it assigns nothing, it chooses how the mapped sequences are numbered.

- a9a2345: Import record properties as text, without asking for a type

  The panel offered Text / Whole number / Decimal per accepted property column. It asked the
  scientist to declare something nothing verifies: no stage re-reads the values, so a column typed
  Decimal that turns out to hold `N/A` further down fails at import or nulls out, and the mistake
  surfaces far from where it was made. The choice is gone and every property column is emitted as
  String.

  Guessing the type by sampling the file was the alternative and has the same tail — the guess
  comes from the first rows and is applied to all of them. A downstream block that needs a number
  can convert a column it can see in full.

- be5a3ec: Describe what the region-annotation statuses mean

  The status column's three values are terse, and "Not applicable" reads as a diagnosis when it
  only means no sequence was supplied for that chain — which is the expected value on any panel
  where one chain is partly filled in. The column now carries a `pl7.app/description` explaining
  all three, and each of the four statistics explains what it counts, including that a non-zero
  Failed count usually points at a mis-mapped column rather than bad data.

- Updated dependencies [704a96e]
- Updated dependencies [3275424]
- Updated dependencies [f653c1c]
- Updated dependencies [692939e]
  - @platforma-open/milaboratories.import-vdj.xlsx-to-csv@1.1.0
  - @platforma-open/milaboratories.import-vdj.column-profile@1.1.0
  - @platforma-open/milaboratories.import-vdj.region-annotation@1.1.0

## 1.15.4

### Patch Changes

- 572605a: Migrate the block onto the block-tools structurer (full SDK upgrade): model/ui-vue 1.79.14, workflow-tengo 6.6.3, tengo-builder 4.0.8, test 1.79.14. No behavior change.

## 1.15.3

### Patch Changes

- e5bbeca: Fix unstable CIDs from non-canonical Tengo map iteration in pure-template-called code.
  Also migrates `model/` and `ui/` from the legacy `vue-tsc + vite` pipeline to `@milaboratories/ts-builder` (matching `clonotype-browser`, `immune-assay-data`, and other newer blocks). This unblocks fresh installs whose `vue-tsc -b` was failing on two pre-existing SDK-API type mismatches (`SdkPluginV2` plugin shape vs `Plugin<[],[]>`, and `ComputedRef<PlDataTableSettingsV2Base>` vs `Readonly<...>` on `PlAgDataTableV2`). No runtime behavior change.

## 1.15.2

### Patch Changes

- 497d5e5: Make axis label visible by default

## 1.15.1

### Patch Changes

- ee7ef70: Rename clonotype label to id

## 1.15.0

### Minor Changes

- 643eaa1: Add supporting cells column
- 2b91d14: Supporting cells column added, dependencies updates

## 1.14.0

### Minor Changes

- cef5de2: refactoring, airr format and dependencies updates

## 1.13.2

### Patch Changes

- 8a99e00: Fix single-cel to VDJ linker
- ce8598e: Fix linker specs

## 1.13.1

### Patch Changes

- 1ee9f03: Update column visibility

## 1.13.0

### Minor Changes

- cb63c0c: Abundance columns type fix & updating dependencies

## 1.12.1

### Patch Changes

- c273321: Fix issue with species indicator prefix in gene labels

## 1.12.0

### Minor Changes

- 010574a: Support older linux distributions

## 1.11.0

### Minor Changes

- c054836: updating SDK and keep one abundance column (read count)

## 1.10.0

### Minor Changes

- 4dc3e58: isProductive columns values changed to true or false

## 1.9.2

### Patch Changes

- 8e190ee: Parquet support

## 1.9.1

### Patch Changes

- 0ff776c: technical release
- e0fd2e4: technical release
- a178a23: technical release
- 595e430: technical release

## 1.9.0

### Minor Changes

- 8ed3041: change chains name in columns specs

## 1.8.0

### Minor Changes

- 9970900: new chain name variant added

## 1.7.1

### Patch Changes

- f6168a2: Fix pip issue on windows (registry access errors)

## 1.7.0

### Minor Changes

- 1598eb5: support single cell data generated by cell ranger and mixcr

## 1.6.1

### Patch Changes

- d7c054e: New MIXCR column handling options
- 0eb610f: Update nt and aa VDJ column handling in custom and mixcr formats

## 1.6.0

### Minor Changes

- 6c87a4d: Improve custom format

## 1.5.0

### Minor Changes

- 71059a8: MiXCR format support

## 1.4.0

### Minor Changes

- bae17e4: - migration to txt.head() for header parsing, fixes window compatibility issues
  - schema handling fixes (schema not used in reading operations anymore)
    - fixes concatenation crashes
    - fixes incorrect calculation of mean fractions
  - result reproducibility improvements, with maps.forEach

## 1.3.1

### Patch Changes

- bc586e9: Fixes
- Updated dependencies [bc586e9]
  - @platforma-open/milaboratories.import-vdj.software@1.1.1

## 1.3.0

### Minor Changes

- de3f3b9: support qiagen data format

## 1.2.0

### Minor Changes

- ebcd6f1: Added custom format option for import.

## 1.1.1

### Patch Changes

- 56144f8: bugfix for empty read count in immunoSeq

## 1.1.0

### Minor Changes

- a639dd0: Update python env and add assemblingFeature label to immunoSeq data

### Patch Changes

- Updated dependencies [a639dd0]
  - @platforma-open/milaboratories.import-vdj.software@1.1.0
