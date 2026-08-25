---
'@platforma-open/milaboratories.import-vdj.workflow': patch
'@platforma-open/milaboratories.import-vdj.model': patch
'@platforma-open/milaboratories.import-vdj.ui': patch
'@platforma-open/milaboratories.import-vdj': patch
---

Say when a loaded file is being read, and stop the run until it has been

Picking a file left the panel silent. Every column of the file is profiled before anything can be
mapped — a whole-file pass, minutes on remote storage — and nothing said so: the profile outputs
are retentive, so the dropdowns kept answering with the *previous* file's headers as though
nothing had happened. Worse, a mapping that had passed every check against that previous file
still satisfied the validity rule, so Run stayed live over a file nobody had looked at yet, and
over headers it might not even contain.

Three changes:

- Prerun states which file the profile was taken from (`profiledSampleId`), and the model pairs
  the two under `retentive` — while the new scan runs, the reported id stays the old file's. The
  panel compares it with the loaded file and announces the wait, withholding the mapping until
  the columns on offer are really this file's. Keyed to the file rather than to "prerun is busy"
  on purpose: prerun also re-runs on every mapping edit, to re-check the identity column for
  collisions, and a message that appeared on each dropdown pick would train the scientist to
  ignore it.
- Picking a different file drops the parts of the mapping that name columns, keeping the receptor
  declaration and the numbering scheme, which are statements about the data rather than about one
  file. That is what disables Run. Done on the gesture rather than by reconciling against the new
  profile: `args` is a pure function of the block's data and cannot consult prerun, and mirroring
  prerun's verdict back into that data is the pattern this block is trying to shed. Re-picking the
  same file is not a swap and keeps the mapping.
- The import itself now shows the block's loader, which it never did. Scoped to the main run: the
  loader covers the whole block, and prerun runs while the settings panel is being edited.
