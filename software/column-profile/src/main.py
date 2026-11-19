"""Profile every column of a csv/tsv so the mapping panel can offer the right things.

Two questions, one pass over the file:

  types       — the value type each column can hold, for the record-property columns.
  aminoAcid   — which columns hold amino-acid variable domains, for the chain slots.
  nucleotide  — which columns could be nucleotide sequences by their alphabet, so a chain slot
                mapped to one can be warned about.

Both are answered from ALL rows, not a sample. That is the whole point: a column that looks
numeric for twenty rows and holds "N/A" on row five hundred must come out String, and a sampled
answer cannot promise that. The type only ever widens as rows are read — the same monotonic rule
`samples-and-data` uses when it imports a metadata table (ui/src/dataimport.ts:85-101), so one
non-numeric value anywhere is enough to settle the column.

Empty cells never decide a type. A column of numbers with gaps is still numeric; a column of
nothing but gaps has no type at all and is reported String.

No polars: the whole point is to stream the file once, and the stdlib csv reader does that
without pulling a dataframe engine into a step that only counts characters.

Two lighter modes for a dataset's files: `--headers-manifest` adds the header row (first line
only) of every file a JSON manifest lists, by sample, and `--first-line` writes the input's first
line and profiles nothing. Every
file is read through gzip when it starts with the gzip magic bytes, whatever its name.
"""

import argparse
import csv
import gzip
import io
import json
import re
import sys

# Ordered: a column's type is the maximum over its values, so one string settles it.
T_NONE, T_LONG, T_DOUBLE, T_STRING = 0, 1, 2, 3
TYPE_NAMES = {T_NONE: "String", T_LONG: "Long", T_DOUBLE: "Double", T_STRING: "String"}

INT_RE = re.compile(r"^[+-]?\d+$")

# A whole number with thousands separators, 1,234 or 1,234.0. Typed String like any text, but a
# whole number all the same: imports strip the commas, as V(D)J's custom import does.
GROUPED_INT_RE = re.compile(r"^[+-]?\d{1,3}(,\d{3})+(\.0+)?$")

# A whole number written as a decimal, 120.0, which imports read as 120. Not 1e+05: Python reads
# it as a number, but the imports' integer cast refuses it.
WHOLE_DECIMAL_RE = re.compile(r"^[+-]?\d+\.0+$")

# Standard 20 plus X (unknown) and * (stop), both of which appear in real exports. Deliberately
# excludes B, J, O, U and Z, which is what keeps antibody INNs — trastuzumab, adalimumab — from
# reading as sequences.
AA_RE = re.compile(r"^[ACDEFGHIKLMNPQRSTVWYXacdefghiklmnpqrstvwyx*]+$")

# A, C, G, T and N are amino-acid letters too, so a DNA column passes AA_RE and is offered as a
# chain. A variable domain of MIN_DOMAIN_LENGTH residues never uses only these letters, so a
# match here means nucleotides. U and the lower case are kept for RNA and soft-masked exports.
NT_RE = re.compile(r"^[ACGTUNacgtun]+$")

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


GZIP_MAGIC = b"\x1f\x8b"


def open_text(path: str) -> io.TextIOBase:
    """The file as text, decompressed when it is gzip."""
    with open(path, "rb") as f:
        gzipped = f.read(2) == GZIP_MAGIC
    if gzipped:
        return gzip.open(path, "rt", newline="", encoding="utf-8-sig")
    return open(path, newline="", encoding="utf-8-sig")


def header_row(path: str, separator: str) -> list[str]:
    """The file's header row, stripped, without its empty names; empty for an empty file."""
    with open_text(path) as f:
        row = next(csv.reader(f, delimiter=separator), [])
    return [h.strip() for h in row if h.strip()]


def first_line(path: str) -> str:
    with open_text(path) as f:
        return f.readline().rstrip("\r\n")


def profile(path: str, separator: str, min_length: int = MIN_DOMAIN_LENGTH) -> dict:
    with open_text(path) as f:
        reader = csv.reader(f, delimiter=separator)
        try:
            headers = [h.strip() for h in next(reader)]
        except StopIteration:
            return {"headers": [], "types": {}, "aminoAcid": [], "nucleotide": [], "wholeNumber": []}

        types = [T_NONE] * len(headers)
        seen = [0] * len(headers)
        domain_like = [0] * len(headers)
        nucleotide_like = [0] * len(headers)
        # Every value a whole number in a form the imports read: 120, 120.0 or 1,234; not 12.5 or
        # 1e+05. A count typed Double or String can still be one.
        whole = [True] * len(headers)

        for row in reader:
            for i, raw in enumerate(row):
                if i >= len(headers):
                    break
                v = (raw or "").strip()
                if not v:
                    # An empty cell decides nothing — neither the type nor the alphabet.
                    continue

                kind = value_type(v)
                types[i] = max(types[i], kind)
                if whole[i] and kind != T_LONG:
                    whole[i] = bool(GROUPED_INT_RE.match(v) or WHOLE_DECIMAL_RE.match(v))
                seen[i] += 1
                if len(v) >= min_length:
                    if AA_RE.match(v):
                        domain_like[i] += 1
                    if NT_RE.match(v):
                        nucleotide_like[i] += 1

    out_types = {}
    amino_acid = []
    nucleotide = []
    whole_number = []
    for i, name in enumerate(headers):
        if not name:
            continue
        out_types[name] = TYPE_NAMES[types[i]]
        if seen[i] and domain_like[i] / seen[i] >= MIN_DOMAIN_SHARE:
            amino_acid.append(name)
        # Same share rule as aminoAcid. The column stays in aminoAcid: it is warned about, not hidden.
        if seen[i] and nucleotide_like[i] / seen[i] >= MIN_DOMAIN_SHARE:
            nucleotide.append(name)
        if seen[i] and whole[i]:
            whole_number.append(name)

    return {
        "headers": [h for h in headers if h],
        "types": out_types,
        "aminoAcid": amino_acid,
        "nucleotide": nucleotide,
        "wholeNumber": whole_number,
    }


def main() -> None:
    p = argparse.ArgumentParser(description="Profile a csv/tsv's columns")
    p.add_argument("--input", required=True, help="Input csv or tsv")
    p.add_argument(
        "--separator",
        help='Field separator: a name ("tab", "comma", "semicolon") or the character itself; '
        "required unless --first-line is given",
    )
    p.add_argument("--output", help="Output JSON: the input's profile")
    p.add_argument(
        "--min-sequence-length",
        type=int,
        default=MIN_DOMAIN_LENGTH,
        help="Shortest value counted as a sequence (default: a variable domain; peptides need less)",
    )
    p.add_argument(
        "--headers-manifest",
        metavar="JSON",
        help='Also report the header row of each listed file, by sample, in the profile\'s '
        'headersBySample: {"headers": [{"sample": ID, "file": PATH}, ...]}; for a sample listed '
        "twice, the headers both files have",
    )
    p.add_argument("--first-line", metavar="OUT", help="Write the input's first line here and stop")
    args = p.parse_args()

    if args.first_line:
        with open(args.first_line, "w") as f:
            f.write(first_line(args.input) + "\n")
        print("Wrote the first line")
        return
    if not args.output:
        raise SystemExit("--output is required unless --first-line is given")
    if not args.separator:
        raise SystemExit("--separator is required unless --first-line is given")

    separator = resolve_separator(args.separator)
    result = profile(args.input, separator, args.min_sequence_length)
    if args.headers_manifest:
        with open(args.headers_manifest) as f:
            entries = json.load(f)["headers"]
        result["headersBySample"] = {}
        for entry in entries:
            sample, path = entry["sample"], entry["file"]
            headers = header_row(path, separator)
            # A sample with several files (a tagged dataset) keeps the headers all of them have.
            seen = result["headersBySample"].get(sample)
            result["headersBySample"][sample] = (
                headers if seen is None else [h for h in seen if h in headers]
            )
    with open(args.output, "w") as f:
        json.dump(result, f, sort_keys=True)

    print(
        f"Profiled {len(result['headers'])} columns:"
        f" {sum(1 for t in result['types'].values() if t != 'String')} numeric,"
        f" {len(result['aminoAcid'])} amino-acid,"
        f" {len(result['nucleotide'])} nucleotide"
    )


if __name__ == "__main__":
    sys.exit(main())
