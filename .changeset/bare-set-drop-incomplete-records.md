---
'@platforma-open/milaboratories.import-vdj.region-annotation': minor
'@platforma-open/milaboratories.import-vdj.workflow': minor
'@platforma-open/milaboratories.import-vdj.model': minor
'@platforma-open/milaboratories.import-vdj.ui': minor
'@platforma-open/milaboratories.import-vdj': minor
---

Directly imported sequence sets keep only records with a sequence on every mapped chain, annotated on every chain; a record missing a chain is dropped before annotation, and one that cannot be numbered after it. Rows with an empty id are ignored too, instead of being merged into one record. The block now says before the run how many rows have no id or no sequence for a chain and are ignored, and which identical rows are collapsed into one record. The import statistics show Rows Read per sample, as the other formats do, with the rows discarded for a missing id, a repeated id, a missing sequence or a sequence that could not be numbered, each row under one reason. The per-chain Annotated, Not applicable and Failed counts are removed: the discards replace them, and "Numbered as the other chain" stays, now counting imported records only. The per-chain region annotation status is no longer emitted as a dataset column. Its abundance column is labelled "Number of Variants" with unit "variants" instead of "Number of UMIs" / "molecules"
