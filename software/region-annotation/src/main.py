"""Build the region + status TSV from ANARCI's per-bucket CSVs.

Input:
  --input_tsv   the same per-record TSV `fasta.py` consumed: key column plus one
                `<chain>_sequence` column per mapped chain.
  --csv_<bucket>    ANARCI's `<out>_<BUCKET>.csv`, one flag per bucket. Any may be absent.
  --scheme      imgt | kabat | chothia — the convention the scientist chose.

Output: one row per record, and for each mapped chain seven `<chain>_<region>_aa` columns
plus one `<chain>_regionAnnotationStatus`. Status is never empty; regions are empty for
any chain whose status is not `Annotated`.

Why the lookup keys on `key|chain` rather than on the record key
---------------------------------------------------------------
ANARCI decides for itself which chain type a sequence is and writes it to that bucket's CSV.
The chain this block emits under is the one the scientist *declared* by assigning a column
to a slot. Those can disagree, and reconciling them is out of scope for this spec — there
is no status value for it and no threshold has been agreed for how much disagreement should
stop a run.

So this script does not *act* on the comparison. It finds the record by its full `key|chain`
id in either bucket, and uses the range table of the bucket it was found in, because that is
the numbering space ANARCI actually produced. Using the declared chain's table on numbering
from the other bucket would silently shift every boundary; dropping the record to `Failed`
would throw away a chain the instrument numbered perfectly well.

It does *count* the disagreements, into `--out_stats`. Counting is not reconciling: nothing
here refuses a run or changes an output because of it. Without the count, mapping the two
sequence columns to the wrong slots produces a clean import in which every record is
annotated and every chain label is wrong, and nothing else in the output would reveal it.

Keying on the record key alone — as the block this is forked from does — collapses the two
chains of one paired record onto one entry, which is only safe if declared chain and ANARCI
bucket are assumed to agree.
"""

import argparse
import os
import sys
from typing import Dict, List, Optional, Tuple

import polars as pl

from chains import (
    ANARCI_BUCKETS,
    CHAINS,
    EXPECTED_BUCKET,
    parse_fasta_id,
    region_column,
    sequence_column,
    status_column,
)
from regions import (
    REGION_RANGES,
    REGIONS,
    SCHEMES,
    STATUS_ANNOTATED,
    STATUS_FAILED,
    STATUS_NOT_APPLICABLE,
    annotate,
    parse_positions,
)

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


def write_stats(path: str, chains: List[str], tally: Dict[str, Dict[str, int]]) -> None:
    """One row per declared chain, counting outcomes and chain disagreements.

    `chainDisagreed` is the number of *annotated* records whose sequence ANARCI bucketed as
    the other chain — a light chain in the slot declared heavy, or the reverse. It is a
    subset of `annotated`: those records are annotated correctly, under their declared chain,
    using the ranges of the bucket ANARCI chose.

    It is counted and reported, and nothing acts on it. Reconciling a declared chain against
    an inferred one is out of scope for this spec, and the threshold at which disagreement
    should stop a run turns on a rate nobody has measured. This is that measurement — the
    missing input to that decision, not the decision.

    Reading it: a handful of disagreements is a few odd rows in the file. Nearly all of them,
    on both chains, means the sequence columns were mapped to the wrong slots — in which case
    every record is annotated consistently and labelled wrongly, and no other signal in the
    output would show it.

    One row per declared chain, keyed on the chain. A scientist reading a paired set wants the
    two chains side by side to compare them, which is a row each; folding them into one wide row
    puts the same four numbers twice across the header instead.
    """
    header = ["chain", "annotated", "notApplicable", "failed", "chainDisagreed"]
    rows = [
        [
            chain,
            str(tally[chain][STATUS_ANNOTATED]),
            str(tally[chain][STATUS_NOT_APPLICABLE]),
            str(tally[chain][STATUS_FAILED]),
            str(tally[chain]["chainDisagreed"]),
        ]
        for chain in chains
    ]
    pl.DataFrame(rows, schema=header, orient="row").write_csv(path, separator="\t")


def main() -> None:
    p = argparse.ArgumentParser(description="Locate FR/CDR regions from ANARCI numbering")
    p.add_argument("--input_tsv", required=True, help="Per-record TSV: key column + <chain>_sequence columns")
    p.add_argument("--key_column", required=True, help="Name of the record key column")
    p.add_argument("--scheme", required=True, choices=SCHEMES, help="Numbering scheme")
    # One flag per bucket rather than a directory: the workflow declares which files it saves
    # up front, and naming them here keeps that list and this one impossible to disagree about.
    for bucket in ANARCI_BUCKETS:
        p.add_argument(
            f"--csv_{bucket.lower()}",
            required=False,
            help=f"ANARCI {bucket}-bucket CSV",
        )
    p.add_argument("--out_tsv", required=True, help="Output TSV path")
    p.add_argument("--out_stats", required=False, help="Optional per-chain outcome counts TSV")
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
    for bucket in ANARCI_BUCKETS:
        load_anarci_csv(getattr(args, f"csv_{bucket.lower()}"), bucket, numbering, positions)

    columns = [args.key_column]
    for chain in chains:
        columns.extend(region_column(chain, region) for region in REGIONS)
        columns.append(status_column(chain))

    rows: List[List[str]] = []
    # Per declared chain: the three statuses, plus how many of the annotated ones ANARCI
    # bucketed as the *other* chain. See `write_stats` for what that number is for.
    tally: Dict[str, Dict[str, int]] = {
        c: {STATUS_ANNOTATED: 0, STATUS_NOT_APPLICABLE: 0, STATUS_FAILED: 0, "chainDisagreed": 0}
        for c in chains
    }

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
                if status == STATUS_ANNOTATED and bucket != EXPECTED_BUCKET[chain]:
                    tally[chain]["chainDisagreed"] += 1

            out_row.extend(located[region] for region in REGIONS)
            out_row.append(status)
            tally[chain][status] += 1

        rows.append(out_row)

    pl.DataFrame(rows, schema=columns, orient="row").write_csv(args.out_tsv, separator="\t")
    if args.out_stats:
        write_stats(args.out_stats, chains, tally)

    for chain in chains:
        t = tally[chain]
        print(
            f"chain {chain}: {t[STATUS_ANNOTATED]} annotated, "
            f"{t[STATUS_NOT_APPLICABLE]} not applicable, {t[STATUS_FAILED]} failed, "
            f"{t['chainDisagreed']} numbered as the other chain"
        )
    print(f"Wrote {len(rows)} records to {args.out_tsv}")


if __name__ == "__main__":
    main()
