---
'@platforma-open/milaboratories.import-vdj.workflow': patch
'@platforma-open/milaboratories.import-vdj.column-profile': patch
'@platforma-open/milaboratories.import-vdj': patch
---

Pass the column-profile separator by name, not as a tab character

Loading a TSV failed on server deployments with `TypeError: "delimiter" must be a 1-character
string`, while the same file loaded on a desktop backend. The block was passing a real tab as an
argv element. Desktop runners exec argv directly, so the tab arrived intact; the k8s and
google-batch runners serialise the command with Go's `%q` and re-run it through `sh -c`, where
the tab has already become the two characters `\` and `t` and stays that way. `csv.reader`
rejects a two-character delimiter.

Prerun now sends `tab` or `comma` and `main.py` maps the name back to the character, so only
plain words cross the runner boundary. A separator that still arrives malformed now fails with a
message naming the accepted values rather than a `TypeError`.

The underlying quoting is a backend issue and is unfixed: `toShellCmd` in `util/k8s/template.go`
uses Go quoting where POSIX shell quoting is needed.
