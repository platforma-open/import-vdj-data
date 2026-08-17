"""Build the region + status TSV from ANARCI's per-bucket CSVs.

Input:
  --input_tsv   the same per-record TSV `fasta.py` consumed: key column plus one
                `<chain>_sequence` column per mapped chain.
  --h_csv/--kl_csv  ANARCI's `<out>_H.csv` / `<out>_KL.csv`. Either may be absent.
  --scheme      imgt | kabat | chothia — the convention the scientist chose.

Output: one row per record, and for each mapped chain seven `<chain>_<region>_aa` columns
plus one `<chain>_regionAnnotationStatus`. Status is never empty; regions are empty for
any chain whose status is not `Annotated`.

Why the lookup keys on `key|chain` rather than on the record key
---------------------------------------------------------------
ANARCI decides for itself whether a sequence is H or KL and writes it to that bucket's CSV.
The chain this block emits under is the one the scientist *declared* by assigning a column
to a slot. Those can disagree, and reconciling them is out of scope for this spec — there
is no status value for it and no threshold has been agreed for how much disagreement should
stop a run.

So this script does not compare them. It finds the record by its full `key|chain` id in
either bucket, and uses the range table of the bucket it was found in, because that is the
numbering space ANARCI actually produced. Using the declared chain's table on numbering from
the other bucket would silently shift every boundary; dropping the record to `Failed` would
throw away a chain the instrument numbered perfectly well.

Keying on the record key alone — as the block this is forked from does — collapses the two
chains of one paired record onto one entry, which is only safe if declared chain and ANARCI
bucket are assumed to agree.
"""

import argparse
import os
import sys
from typing import Dict, List, Optional, Tuple

import polars as pl

from chains import ANARCI_BUCKETS, CHAINS, parse_fasta_id, region_column, sequence_column, status_column
from regions import REGION_RANGES, REGIONS, SCHEMES, annotate, parse_positions

# (key, chain) -> (bucket, residues)
Numbering = Dict[Tuple[str, str], Tuple[str, List[str]]]


def load_anarci_csv(path: Optional[str], bucket: str, into: Numbering, positions: Dict[str, List[str]]) -> None:
    """Merge one ANARCI CSV into `into`, keyed by the (key, chain) parsed from its Id."""
    if not path or not os.path.exists(path):
        return

    df = pl.read_csv(path, infer_schema_length=0)
    if "Id" not in df.columns:
        print(f"{path}: no 'Id' column, skipping", file=sys.stderr)
        return

    pos_labels = parse_positions(df.columns)
    if not pos_labels:
        # Expected, not an anomaly: the workflow pre-creates both bucket CSVs with just an
        # `Id` header so the exec can always save both, and ANARCI overwrites only the
        # buckets it actually found. A header-only file means this bucket was empty.
        print(f"{path}: no sequences in the {bucket} bucket")
        return
    positions[bucket] = pos_labels

    for row in df.select(["Id"] + pos_labels).iter_rows(named=True):
        key, chain = parse_fasta_id(row.get("Id") or "")
        if not key:
            continue
        entry = (key, chain)
        if entry in into:
            # First numbering wins. ANARCI can emit more than one domain hit per record;
            # the first is the primary one, and a mapping assigning two sequences to one
            # chain is refused upstream, so there is exactly one per (key, chain).
            continue
        into[entry] = (bucket, [(row.get(p) or "").strip() for p in pos_labels])


def main() -> None:
    p = argparse.ArgumentParser(description="Locate FR/CDR regions from ANARCI numbering")
    p.add_argument("--input_tsv", required=True, help="Per-record TSV: key column + <chain>_sequence columns")
    p.add_argument("--key_column", required=True, help="Name of the record key column")
    p.add_argument("--scheme", required=True, choices=SCHEMES, help="Numbering scheme")
    p.add_argument("--h_csv", required=False, help="ANARCI H-bucket CSV")
    p.add_argument("--kl_csv", required=False, help="ANARCI KL-bucket CSV")
    p.add_argument("--out_tsv", required=True, help="Output TSV path")
    args = p.parse_args()

    df = pl.read_csv(args.input_tsv, separator="\t", infer_schema_length=0)
    if args.key_column not in df.columns:
        print(f"Key column '{args.key_column}' not found in {args.input_tsv}", file=sys.stderr)
        sys.exit(2)

    chains = [c for c in CHAINS if sequence_column(c) in df.columns]
    if not chains:
        expected = ", ".join(sequence_column(c) for c in CHAINS)
        print(f"No sequence column found in {args.input_tsv}; expected one of: {expected}", file=sys.stderr)
        sys.exit(2)

    numbering: Numbering = {}
    positions: Dict[str, List[str]] = {}
    for bucket, path in zip(ANARCI_BUCKETS, [args.h_csv, args.kl_csv]):
        load_anarci_csv(path, bucket, numbering, positions)

    columns = [args.key_column]
    for chain in chains:
        columns.extend(region_column(chain, region) for region in REGIONS)
        columns.append(status_column(chain))

    rows: List[List[str]] = []
    status_counts: Dict[str, int] = {}

    for row in df.iter_rows(named=True):
        key = (row.get(args.key_column) or "").strip()
        if not key:
            continue

        out_row: List[str] = [key]
        for chain in chains:
            sequence = (row.get(sequence_column(chain)) or "").strip()

            found = numbering.get((key, chain))
            if found is None:
                located, status = annotate(sequence, None, None)
            else:
                bucket, residues = found
                located, status = annotate(
                    sequence,
                    (positions[bucket], residues),
                    REGION_RANGES[args.scheme][bucket],
                )

            out_row.extend(located[region] for region in REGIONS)
            out_row.append(status)
            status_counts[status] = status_counts.get(status, 0) + 1

        rows.append(out_row)

    pl.DataFrame(rows, schema=columns, orient="row").write_csv(args.out_tsv, separator="\t")

    summary = ", ".join(f"{s}: {n}" for s, n in sorted(status_counts.items()))
    print(f"Wrote {len(rows)} records x chains [{', '.join(chains)}] to {args.out_tsv} ({summary})")


if __name__ == "__main__":
    main()
