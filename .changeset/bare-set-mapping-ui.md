---
'@platforma-open/milaboratories.import-vdj.workflow': patch
'@platforma-open/milaboratories.import-vdj.model': patch
'@platforma-open/milaboratories.import-vdj.ui': patch
'@platforma-open/milaboratories.import-vdj': patch
---

Name a file import after its file, and stop offering identifiers as sequences

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
