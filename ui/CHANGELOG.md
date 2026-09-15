# @platforma-open/milaboratories.import-vdj.ui

## 1.13.2

### Patch Changes

- 0ce6b7b: Say what the block is checking, and refuse to run until it has

  Loading a file left the panel silent while every column of it was profiled — a whole-file pass,
  minutes on remote storage — and the profile outputs are retentive, so the dropdowns went on
  answering with the _previous_ file's headers as though nothing had happened. A mapping that had
  passed every check against that previous file also still counted as valid, so Run stayed live over
  a file nobody had read yet, against headers it might not even contain.

  - **The wait is announced, on both doors.** Prerun now states which file a profile was taken from,
    and which dataset and format an inference was run for; the model pairs each with its result so the
    two cannot get out of step. The panel announces the wait and withholds the mapping until the
    columns on offer really belong to what is selected. Keyed to the input rather than to "prerun is
    busy", because prerun also re-runs on every mapping edit to re-check the id column. The import
    itself now shows the block's loader, which it never did. The verdict about the selected columns
    now sits below the controls it is about, rather than between them.
  - **The column list waits until it has something to list.** "The following columns will be
    imported:" appeared with nothing under it as soon as a dataset was picked, before any format was,
    which read as an import that would emit nothing. It also outlived a dataset switch, listing the
    previous dataset's columns.
  - **Loading a second file disables Run.** Picking a different file drops the parts of the mapping
    that name columns, keeping the receptor declaration and the numbering scheme, which describe the
    data rather than one file. Re-picking the same file is not a swap and keeps the mapping.
  - **A repeated id column now stops the run.** The record key is the identity's hash, so a value
    repeated on rows that are not identical merges two records into one. Prerun always found these
    and the panel always warned, but the warning was only a warning, and a run driven through the API
    imported the merged set without complaint. Run is now refused both while the verdict is
    outstanding and when it reports a repeat, and the platform enforces it as well as the interface.
  - **The rows are compared whole.** The check compared the id column and the mapped sequences,
    but the import carries the accepted properties too and collapses on the id's hash alone, so two
    rows agreeing on their id and both sequences while disagreeing on a property passed the check —
    and the import then kept the first row's values, dropped the other's, and said nothing. The
    comparison is now over every column of the raw file, not the ones the import happens to keep:
    two rows given one name while disagreeing anywhere are two different things, and that is worth
    the scientist's attention whether or not the disagreeing column is one they asked to import.
    Files that imported before may now be refused — where they are, the id column has failed to
    identify the record, and the fix is the file or a different id column. The flip side is that a
    column nobody looks at now decides the verdict: a row counter or a stray trailing space makes
    every repeated id a conflict, so the verbatim-repeat allowance is rare in files carrying a
    per-row unique column.
  - **The id column is checked as soon as it is picked.** The check needed at least one sequence
    mapped, because it compared the sequence columns. Comparing whole rows removed that dependency,
    so a column that does not identify the records is reported at the moment it is chosen rather
    than after the rest of the mapping is finished.
  - **The warning names the mapping it is about.** It used to compare against the freshly picked
    column while the verdict was still the previous mapping's, so changing an offending column flashed
    the old accusation under the new selection. What a verdict covers is the id column, and — now
    that whole rows are compared — nothing else: the answer is a property of the file and the column
    chosen to identify its records, so remapping a chain or accepting another property reaches the
    same verdict instead of discarding a sound one and re-running a whole-file scan to be told the
    same thing. It also listed up to ten repeated values; it now lists three and a count,
    printed whole, since the id column can hold sequences and trimming those hides what tells them
    apart.
  - **Run waits for the dataset to be judged.** For the seven non-custom formats Run was gated on
    booleans the UI mirrored back from `validationResult`, keyed on the _format_ alone and never on
    the dataset. Switching between two datasets of the same format left the previous one's verdict
    standing, so Run armed at once while the panel was still scanning. The five `*ColumnsPresent`
    fields and their watcher are gone, replaced by a second case of `prerunCheck` — the same shape the
    collision check already uses: the verdict carries the dataset _and format_ it was reached for,
    and one left over from an earlier selection reads as "not judged yet" rather than being applied.
    Run is refused both while a verdict is outstanding and when it reports missing columns.

    `validationResult` now takes the format from prerun's stamp rather than from live block data, so
    both halves of the question come from one staging context and a verdict can no longer judge one
    dataset's headers under another's format. It states the dataset it judged, which is what lets the
    UI mirror it in by copying rather than by matching the two outputs against the selection — there
    is no comparison left in the hairpin to get wrong.

  - **One provenance stamp, not two, and it names a dataset.** The file door emitted
    `profiledSampleId` and the dataset door `inferredFor`; both answered the same question — what the
    prerun results on screen were computed for — and only one door is ever live. They are now a
    single `prerunDatasetValidationInfo`, tagged by door: `{ door: "file", datasetId }` or
    `{ door: "dataset", datasetRef, format }`. Tagged rather than flattened because the two answers
    are not interchangeable — the file door names a dataset that _is_ the file, the dataset door
    names one already in the pool — and side by side they otherwise read as one id in two formats. `FileSource.sampleId` is renamed `datasetId` to match — in the kind's
    init-params contract as well as in block data, since the type now lives there: one file is
    one dataset, and it is only _today_ that the dataset is also one sample, which is why that value
    also mints the `pl7.app/sampleId` key. A file carrying several samples would name those from its
    own contents while this stayed the identity of the file they came from. The value mints an axis
    key and v1 shipped in block 1.8.1, so the rename carries a `v1 -> v2` data migration rather than
    relying on the old key being absent — without it a saved project would key its records on
    `undefined` and lose every join a downstream block had made.

  - **Re-reading a file no longer changes its identity.** The id was minted on every pick, so
    re-selecting the same file — which is also how a file gets re-read — handed it a new one. Since
    that value mints the `pl7.app/sampleId` key, the re-read silently orphaned every join a
    downstream block had made against the old key, with nothing on screen to say so. It is now minted
    only when the handle changes, which is the same test that decides whether the mapping is dropped,
    and which the field's own contract had claimed all along. Two different files that share a name
    are still a swap: their handles differ. They do share a label, since that is the filename stem.
  - **Alert headings appear.** Four alerts passed their heading to a slot `PlAlert` does not have, so
    the headings had never rendered — a warning about a non-unique id column read as an unlabelled
    wall of values.
  - **The id column can be cleared.** Clearing it left the field reading "Value not available" in
    red: "nothing chosen" is stored as an empty string, and a dropdown counts any value that is not
    `undefined` as chosen. Relatedly, two places named the IG chain pair where they meant every
    mapped chain, so a TCR mapping could never clear itself and was offered its own sequence columns
    as record properties.

  Refusing the run on a prerun verdict needs that verdict inside the args projection, which sees only
  the block's own data, so the UI mirrors it in. That is a hairpin, and deliberate: unlike a column
  mapping there is no gesture at which the fact could be captured, because the scientist picks a
  column and only then does the check discover whether it is sound. The two rules that keep it safe —
  a verdict carries what it is about, and is dropped when the source changes — are stated on
  `BlockData.prerunChecks`, and the checks still to come should follow them. It can all go once
  `argsValid` can read prerun directly.

- Updated dependencies [0ce6b7b]
  - @platforma-open/milaboratories.import-vdj.model@1.13.1

## 1.13.1

### Patch Changes

- Updated dependencies [9fac67b]
  - @platforma-open/milaboratories.import-vdj.model@1.13.0

## 1.13.0

### Minor Changes

- b6a6ed5: Warn when receptor chain filtering leaves a sample with no clonotypes.

  A dataset whose rows all fail the chain filter imported successfully and silently produced an empty result. This is the same failure mode the case-insensitive chain matching fix addresses, but visible to the user rather than only to whoever reads the counts. The block now sums `pl7.app/vdj/stat/clonotypeCount` across every imported chain per sample and shows a warning naming the samples that came out at zero, capped at five names plus an overflow count.

### Patch Changes

- Updated dependencies [b6a6ed5]
  - @platforma-open/milaboratories.import-vdj.model@1.12.0

## 1.12.0

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

- 22bdf04: Migrate the block to BlockModelV3

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

- 38c7fc5: Choose the source in one dropdown, with "Load from file" in the list

  The panel asked two questions where there is one: a "Load from file" checkbox decided which door
  was showing, and a dropdown then chose within it. The checkbox is gone. The dataset dropdown now
  carries a "Load from file…" entry that opens the platform's file browser — the same dialog
  `PlFileInput` opens, so remote storages are reachable, not just the local disk — and a loaded
  file appears in the list as the selected entry, so the control always shows what the block is
  reading.

  Re-selecting a loaded file reopens the dialog, which is how a file is swapped. Cancelling leaves
  the previous selection untouched — nothing is cleared on the way in.

  `loadFromFile` is dropped from the block's data: which door is showing is derived from whether a
  file is loaded, so a stored flag could only disagree with it.

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

- 43d9a1e: Offer only the numbering schemes the declared chains can use

  Kabat and Chothia were defined on antibody structures, and ANARCI implements them for heavy and
  light chains only — a TCR chain raises "Unimplemented numbering scheme". IMGT is position-unified
  and chain-agnostic.

  The scheme dropdown now follows the receptor/chain declaration, and changing the declaration
  resets a scheme the new chains cannot be numbered under. Today every selection is IG, so all
  three remain on offer; the narrowing takes effect when TCR chains arrive.

- 290297d: Let the settings panel close before the mapping is finished

  The panel refused to close while a custom mapping was incomplete, so there was no way to look at
  the table, re-read the file or check an upstream block without finishing first. Nothing needed
  the refusal: the args projection already keeps Run disabled until the mapping is valid, and
  Settings reopens the panel.

  Applied to both doors. The refusal predates the file door but had been extended to it.

- da157b9: Give each import door its own column list

  The mapping dropdowns read one output that answered for both doors — the columns of a loaded
  file and the columns the pool infers for a selected dataset. The two are discovered by different
  means and belong to different panels, so a single output let one door offer columns that had
  been discovered for the other.

  `fileColumns` and `datasetColumns` are now separate, and each panel reads its own.

- Updated dependencies [704a96e]
- Updated dependencies [3aa8010]
- Updated dependencies [9261773]
- Updated dependencies [49f58bb]
- Updated dependencies [3275424]
- Updated dependencies [22bdf04]
- Updated dependencies [a9a2345]
- Updated dependencies [43d9a1e]
- Updated dependencies [88c20b9]
- Updated dependencies [38c7fc5]
- Updated dependencies [da157b9]
- Updated dependencies [4ba796b]
- Updated dependencies [692939e]
  - @platforma-open/milaboratories.import-vdj.model@1.11.0

## 1.11.3

### Patch Changes

- 572605a: Migrate the block onto the block-tools structurer (full SDK upgrade): model/ui-vue 1.79.14, workflow-tengo 6.6.3, tengo-builder 4.0.8, test 1.79.14. No behavior change.
- Updated dependencies [572605a]
  - @platforma-open/milaboratories.import-vdj.model@1.10.2

## 1.11.2

### Patch Changes

- e5bbeca: Fix unstable CIDs from non-canonical Tengo map iteration in pure-template-called code.
  Also migrates `model/` and `ui/` from the legacy `vue-tsc + vite` pipeline to `@milaboratories/ts-builder` (matching `clonotype-browser`, `immune-assay-data`, and other newer blocks). This unblocks fresh installs whose `vue-tsc -b` was failing on two pre-existing SDK-API type mismatches (`SdkPluginV2` plugin shape vs `Plugin<[],[]>`, and `ComputedRef<PlDataTableSettingsV2Base>` vs `Readonly<...>` on `PlAgDataTableV2`). No runtime behavior change.
- Updated dependencies [e5bbeca]
  - @platforma-open/milaboratories.import-vdj.model@1.10.1

## 1.11.1

### Patch Changes

- 2d651a2: Chain options adjusted for airr-sc dataset imports

## 1.11.0

### Minor Changes

- 643eaa1: Add supporting cells column
- 2b91d14: Supporting cells column added, dependencies updates

### Patch Changes

- Updated dependencies [2b91d14]
  - @platforma-open/milaboratories.import-vdj.model@1.10.0

## 1.10.0

### Minor Changes

- cef5de2: refactoring, airr format and dependencies updates

### Patch Changes

- Updated dependencies [cef5de2]
  - @platforma-open/milaboratories.import-vdj.model@1.9.0

## 1.9.0

### Minor Changes

- 9de2e3c: Support custom block title and running status

### Patch Changes

- Updated dependencies [9de2e3c]
  - @platforma-open/milaboratories.import-vdj.model@1.8.0

## 1.8.0

### Minor Changes

- cb63c0c: Abundance columns type fix & updating dependencies

### Patch Changes

- Updated dependencies [cb63c0c]
  - @platforma-open/milaboratories.import-vdj.model@1.7.0

## 1.7.0

### Minor Changes

- c054836: updating SDK and keep one abundance column (read count)

### Patch Changes

- Updated dependencies [c054836]
  - @platforma-open/milaboratories.import-vdj.model@1.6.0

## 1.6.1

### Patch Changes

- 0ff776c: technical release
- e0fd2e4: technical release
- a178a23: technical release
- 595e430: technical release
- Updated dependencies [0ff776c]
- Updated dependencies [e0fd2e4]
- Updated dependencies [a178a23]
- Updated dependencies [595e430]
  - @platforma-open/milaboratories.import-vdj.model@1.5.1

## 1.6.0

### Minor Changes

- 8ed3041: change chains name in columns specs

### Patch Changes

- Updated dependencies [8ed3041]
  - @platforma-open/milaboratories.import-vdj.model@1.5.0

## 1.5.0

### Minor Changes

- 1598eb5: support single cell data generated by cell ranger and mixcr

### Patch Changes

- Updated dependencies [1598eb5]
  - @platforma-open/milaboratories.import-vdj.model@1.4.0

## 1.4.1

### Patch Changes

- Updated dependencies [d7c054e]
  - @platforma-open/milaboratories.import-vdj.model@1.3.1

## 1.4.0

### Minor Changes

- 6c87a4d: Improve custom format

### Patch Changes

- Updated dependencies [6c87a4d]
  - @platforma-open/milaboratories.import-vdj.model@1.3.0

## 1.3.0

### Minor Changes

- 71059a8: MiXCR format support

## 1.2.1

### Patch Changes

- bc586e9: Fixes
- Updated dependencies [bc586e9]
  - @platforma-open/milaboratories.import-vdj.model@1.2.1

## 1.2.0

### Minor Changes

- de3f3b9: support qiagen data format

### Patch Changes

- Updated dependencies [de3f3b9]
  - @platforma-open/milaboratories.import-vdj.model@1.2.0

## 1.1.0

### Minor Changes

- ebcd6f1: Added custom format option for import.

### Patch Changes

- Updated dependencies [ebcd6f1]
  - @platforma-open/milaboratories.import-vdj.model@1.1.0

## 1.0.1

### Patch Changes

- 56144f8: bugfix for empty read count in immunoSeq
