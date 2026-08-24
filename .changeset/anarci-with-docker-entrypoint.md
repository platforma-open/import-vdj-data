---
'@platforma-open/milaboratories.import-vdj.workflow': patch
'@platforma-open/milaboratories.import-vdj': patch
---

Move to software-anarci 1.0.1, which records its docker entrypoint

Region annotation failed on k8s deployments with `sh: 1: ANARCI: not found`
(exit 127). The conda image puts its environment on PATH solely through
`ENTRYPOINT ["micromamba", "run", "--prefix", "/conda-env"]`, and a k8s pod spec
overrides the image entrypoint — so the runner has to re-apply it from the
software descriptor. Every software-anarci up to 1.0.0 records
`docker.entrypoint: []`, because the package-builder that published them did not
read the built image's entrypoint back. Nothing re-applied the wrapper, ANARCI
was never on PATH, and the step died before it started.

1.0.1 was rebuilt with a package-builder that reads `.Config.Entrypoint` from the
image, so its descriptor carries the micromamba wrapper and the k8s runner
reconstructs the right command. `^0.0.3` is exact for a 0.0.x range, so the pin
could never pick the fix up on its own.

No ANARCI behaviour changes between these versions — 1.0.0 was a plain release
and 1.0.1 was "update build deps".
