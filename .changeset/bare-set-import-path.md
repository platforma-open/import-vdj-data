---
'@platforma-open/milaboratories.import-vdj.workflow': minor
'@platforma-open/milaboratories.import-vdj.model': minor
'@platforma-open/milaboratories.import-vdj.ui': minor
'@platforma-open/milaboratories.import-vdj': minor
---

Import bare paired sequence sets

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

Non-sequence columns are offered for import rather than dropped. Each one the scientist accepts
becomes a record property, named from the header with special characters replaced and labelled
with the header exactly as the file wrote it. Two headers that would become the same column are
refused rather than silently merged.

The block also reports the columns it emitted, so a successful import shows what it produced
rather than an empty table.
