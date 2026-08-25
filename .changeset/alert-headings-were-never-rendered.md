---
'@platforma-open/milaboratories.import-vdj.ui': patch
'@platforma-open/milaboratories.import-vdj': patch
---

Show the headings on the warning alerts

Four alerts passed their heading as `<template #title>`, but `PlAlert` declares only a default
slot — it takes a heading through the `label` prop. The headings had therefore never rendered:
"Id column is not unique", "Two headers would become one column", "Invalid <format> dataset" and
"No clonotypes imported" all showed their body text with nothing above it, so a warning about a
non-unique id column read as an unlabelled wall of values.
