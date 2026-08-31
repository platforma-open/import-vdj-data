---
'@platforma-open/milaboratories.import-vdj.workflow': patch
'@platforma-open/milaboratories.import-vdj.model': patch
'@platforma-open/milaboratories.import-vdj.ui': patch
'@platforma-open/milaboratories.import-vdj': patch
---

Say what the block is checking, and refuse to run until it has

Loading a file left the panel silent while every column of it was profiled — a whole-file pass,
minutes on remote storage — and the profile outputs are retentive, so the dropdowns went on
answering with the *previous* file's headers as though nothing had happened. A mapping that had
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
- **The warning names the mapping it is about.** It used to compare against the freshly picked
  column while the verdict was still the previous mapping's, so changing an offending column flashed
  the old accusation under the new selection. What a verdict covers is the id column *and* the
  sequence columns, since a collision is a repeated id whose other mapped cells differ — keyed on
  the id alone, a clean verdict outlived a remapped chain and the run gate accepted it. It also listed up to ten repeated values; it now lists three and a count,
  printed whole, since the id column can hold sequences and trimming those hides what tells them
  apart.
- **The per-format column gate is gone, and with it the last stale-verdict hairpin.** For the seven
  non-custom formats Run was gated on booleans the UI mirrored back from `validationResult`. They
  were keyed on the *format* alone, never on the dataset, so switching between two datasets of the
  same format left the previous one's verdict in place: Run armed immediately while the panel was
  still scanning and still showing the old verdict. It broke the rule the surviving hairpin follows
  — a verdict must carry what it is about. It could not be fixed in place, since the check needs the
  file's headers and a V3 args lambda sees only `data`, so the five `*ColumnsPresent` fields, the
  mirroring watcher and the check itself are removed. The verdict stays on screen, driven straight
  from `validationResult` and suppressed while a new dataset is being scanned; what is lost is the
  refusal, so a dataset that lacks the format's columns can now be run and will fail in the
  workflow. Restoring it properly means moving the check onto `prerunChecks`, keyed on dataset and
  format the way the collision check is keyed on the mapping.
- **One provenance stamp, not two, and it names a dataset.** The file door emitted
  `profiledSampleId` and the dataset door `inferredFor`; both answered the same question — what the
  prerun results on screen were computed for — and only one door is ever live. They are now a
  single `prerunDatasetValidationInfo`, carrying `datasetId` on the file door and `datasetRef` +
  `format` on the dataset door. `FileSource.sampleId` is renamed `datasetId` to match: one file is
  one dataset, and it is only *today* that the dataset is also one sample, which is why that value
  also mints the `pl7.app/sampleId` key. A file carrying several samples would name those from its
  own contents while this stayed the identity of the file they came from. The value mints an axis
  key and v1 shipped in block 1.8.1, so the rename carries a `v1 -> v2` data migration rather than
  relying on the old key being absent — without it a saved project would key its records on
  `undefined` and lose every join a downstream block had made.

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
