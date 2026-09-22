"""Profile every column of a csv/tsv so the mapping panel can offer the right things.

Two questions, one pass over the file:

  types       — the value type each column can hold, for the record-property columns.
  aminoAcid   — which columns hold amino-acid variable domains, for the chain slots.
  fill        — the share of usable rows in which each column actually holds a value.

Both are answered from ALL rows, not a sample. That is the whole point: a column that looks
numeric for twenty rows and holds "N/A" on row five hundred must come out String, and a sampled
answer cannot promise that. The type only ever widens as rows are read — the same monotonic rule
`samples-and-data` uses when it imports a metadata table (ui/src/dataimport.ts:85-101), so one
non-numeric value anywhere is enough to settle the column.

Empty cells never decide a type. A column of numbers with gaps is still numeric; a column of
nothing but gaps has no type at all and is reported String.

No polars: the whole point is to stream the file once, and the stdlib csv reader does that
without pulling a dataframe engine into a step that only counts characters.
"""

import argparse
import csv
import json
import re
import sys

# Ordered: a column's type is the maximum over its values, so one string settles it.
T_NONE, T_LONG, T_DOUBLE, T_STRING = 0, 1, 2, 3
TYPE_NAMES = {T_NONE: "String", T_LONG: "Long", T_DOUBLE: "Double", T_STRING: "String"}

INT_RE = re.compile(r"^[+-]?\d+$")

# Standard 20 plus X (unknown) and * (stop), both of which appear in real exports. Deliberately
# excludes B, J, O, U and Z, which is what keeps antibody INNs — trastuzumab, adalimumab — from
# reading as sequences.
AA_RE = re.compile(r"^[ACDEFGHIKLMNPQRSTVWYXacdefghiklmnpqrstvwyx*]+$")

# Shorter than this is not a variable domain. An scFv runs ~110-130 residues and a single domain
# ~110; the threshold sits far enough below to tolerate a truncated entry and far enough above an
# accession or a clone name to exclude one.
MIN_DOMAIN_LENGTH = 50

# Share of a column's non-empty values that must look like domains for it to be offered as one.
# Not all of them: one blank-ish or truncated entry in a real panel should not disqualify it.
MIN_DOMAIN_SHARE = 0.8


def value_type(value: str) -> int:
    if INT_RE.match(value):
        return T_LONG
    try:
        float(value)
    except ValueError:
        return T_STRING
    return T_DOUBLE


# The workflow passes a name rather than the character. On the k8s and google-batch runners the
# backend serialises argv with Go's %q and re-runs it through `sh -c`: a real tab arrives here as
# the two characters \ and t, which csv.reader rejects outright. A plain word survives that
# round-trip, so the name is what crosses the boundary and the character is chosen here.
SEPARATOR_NAMES = {"tab": "\t", "comma": ",", "semicolon": ";"}


def resolve_separator(separator: str) -> str:
    resolved = SEPARATOR_NAMES.get(separator, separator)
    if len(resolved) != 1:
        raise SystemExit(
            f"--separator must be one of {sorted(SEPARATOR_NAMES)} or a single character,"
            f" got {separator!r}"
        )
    return resolved


def usable_indices(headers: list[str], required: list[str]) -> list[list[int]]:
    """Each --required value is one OR-group of header names; all groups must be satisfied."""
    groups = []
    for spec in required:
        idx = [headers.index(n) for n in spec.split(",") if n in headers]
        if not idx:
            # A group no column can satisfy would report every column as empty, so treat it
            # as no constraint and let the caller's own required-column check speak.
            continue
        groups.append(idx)
    return groups


def profile(path: str, separator: str, required: list[str] | None = None) -> dict:
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f, delimiter=separator)
        try:
            headers = [h.strip() for h in next(reader)]
        except StopIteration:
            return {"headers": [], "types": {}, "aminoAcid": []}

        types = [T_NONE] * len(headers)
        seen = [0] * len(headers)
        domain_like = [0] * len(headers)
        filled = [0] * len(headers)
        groups = usable_indices(headers, required or [])
        usable_rows = 0

        for row in reader:
            # Rows that are not rearrangements would drag every fill rate down, so the
            # denominator is the rows a caller could use. No groups means all rows.
            usable = all(
                any((row[j] or "").strip() for j in group if j < len(row)) for group in groups
            )
            if usable:
                usable_rows += 1
            for i, raw in enumerate(row):
                if i >= len(headers):
                    break
                v = (raw or "").strip()
                if not v:
                    # An empty cell decides nothing — neither the type nor the alphabet.
                    continue

                types[i] = max(types[i], value_type(v))
                if usable:
                    filled[i] += 1

                seen[i] += 1
                if len(v) >= MIN_DOMAIN_LENGTH and AA_RE.match(v):
                    domain_like[i] += 1

    out_types = {}
    out_fill = {}
    amino_acid = []
    for i, name in enumerate(headers):
        if not name:
            continue
        out_types[name] = TYPE_NAMES[types[i]]
        out_fill[name] = (filled[i] / usable_rows) if usable_rows else 0.0
        if seen[i] and domain_like[i] / seen[i] >= MIN_DOMAIN_SHARE:
            amino_acid.append(name)

    return {
        "headers": [h for h in headers if h],
        "types": out_types,
        "aminoAcid": amino_acid,
        "fill": out_fill,
        "usableRows": usable_rows,
    }


def main() -> None:
    p = argparse.ArgumentParser(description="Profile a csv/tsv's columns")
    p.add_argument("--input", required=True, help="Input csv or tsv")
    p.add_argument(
        "--separator",
        required=True,
        help='Field separator: a name ("tab", "comma", "semicolon") or the character itself',
    )
    p.add_argument("--output", required=True, help="Output JSON")
    p.add_argument(
        "--required",
        action="append",
        default=[],
        help="Comma-separated OR-group of column names; repeat for an AND of groups. "
        "Only rows satisfying every group count towards `fill`.",
    )
    args = p.parse_args()

    result = profile(args.input, resolve_separator(args.separator), args.required)
    with open(args.output, "w") as f:
        json.dump(result, f, sort_keys=True)

    print(
        f"Profiled {len(result['headers'])} columns:"
        f" {sum(1 for t in result['types'].values() if t != 'String')} numeric,"
        f" {len(result['aminoAcid'])} amino-acid;"
        f" {result['usableRows']} usable rows"
    )


if __name__ == "__main__":
    sys.exit(main())
