---
'@platforma-open/milaboratories.import-vdj.region-annotation': minor
'@platforma-open/milaboratories.import-vdj.workflow': minor
'@platforma-open/milaboratories.import-vdj': minor
---

Add ANARCI region annotation to the import block

A new `region-annotation` software package and an `annotate-regions` template locate FR1–FR4
and CDR1–CDR3 in amino-acid antibody variable domains, with the numbering scheme (`imgt`,
`kabat`, `chothia`) as the scientist's choice. ANARCI is the shared published artifact
already used elsewhere in the workspace, reused rather than introduced.

Each chain of each record also gets a region-annotation status — `Annotated`,
`Not applicable` or `Failed`, never empty — so a record whose boundaries could not be located
says so instead of silently receiving empty region strings.

Not yet wired into the import pipeline; the template is callable but no path invokes it.
