---
'@platforma-open/milaboratories.import-vdj.workflow': minor
'@platforma-open/milaboratories.import-vdj.model': minor
'@platforma-open/milaboratories.import-vdj.ui': minor
'@platforma-open/milaboratories.import-vdj.column-profile': minor
'@platforma-open/milaboratories.import-vdj': minor
---

Detect column types by reading the whole file

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
