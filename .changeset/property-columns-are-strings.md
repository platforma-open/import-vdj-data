---
'@platforma-open/milaboratories.import-vdj.workflow': patch
'@platforma-open/milaboratories.import-vdj.model': patch
'@platforma-open/milaboratories.import-vdj.ui': patch
'@platforma-open/milaboratories.import-vdj': patch
---

Import record properties as text, without asking for a type

The panel offered Text / Whole number / Decimal per accepted property column. It asked the
scientist to declare something nothing verifies: no stage re-reads the values, so a column typed
Decimal that turns out to hold `N/A` further down fails at import or nulls out, and the mistake
surfaces far from where it was made. The choice is gone and every property column is emitted as
String.

Guessing the type by sampling the file was the alternative and has the same tail — the guess
comes from the first rows and is applied to all of them. A downstream block that needs a number
can convert a column it can see in full.
