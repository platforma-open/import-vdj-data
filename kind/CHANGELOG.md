# @platforma-open/milaboratories.import-vdj.kind

## 1.0.1

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
