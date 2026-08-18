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
