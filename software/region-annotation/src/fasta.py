"""Turn the per-record sequence TSV into one FASTA for ANARCI.

Input TSV: a key column plus one `<chain>_sequence` column per mapped chain.
Output FASTA: one record per (key, chain) that actually carries a sequence.

Records with no sequence for a chain are simply not written. They are not an error —
that chain has nothing to number, and `main.py` reports them as `Not applicable` from
the same input TSV.
"""

import argparse
import sys

import polars as pl

from chains import ANARCI_BUCKETS, CHAINS, PAD_KEY, PAD_SEQUENCES, fasta_id, sequence_column


def to_fasta(input_tsv: str, key_column: str, output_fasta: str) -> None:
    df = pl.read_csv(input_tsv, separator="\t", infer_schema_length=0)

    if key_column not in df.columns:
        print(f"Key column '{key_column}' not found in {input_tsv}", file=sys.stderr)
        sys.exit(2)

    present = [c for c in CHAINS if sequence_column(c) in df.columns]
    if not present:
        expected = ", ".join(sequence_column(c) for c in CHAINS)
        print(f"No sequence column found in {input_tsv}; expected one of: {expected}", file=sys.stderr)
        sys.exit(2)

    written = 0
    with open(output_fasta, "w") as out:
        for row in df.iter_rows(named=True):
            key = (row.get(key_column) or "").strip()
            if not key:
                continue
            for chain in present:
                seq = (row.get(sequence_column(chain)) or "").strip()
                if not seq:
                    continue
                out.write(f">{fasta_id(key, chain)}\n{seq}\n")
                written += 1

        # Always, even when the set covers both buckets: making it conditional would mean the
        # workflow could not know in advance which CSVs to save, which is the whole problem.
        for bucket in ANARCI_BUCKETS:
            out.write(f">{fasta_id(PAD_KEY, bucket)}\n{PAD_SEQUENCES[bucket]}\n")

    print(
        f"Wrote {written} sequences for chains [{', '.join(present)}] to {output_fasta}"
        f" (plus {len(ANARCI_BUCKETS)} bucket-padding references)"
    )


def main() -> None:
    p = argparse.ArgumentParser(description="Build a FASTA of variable domains for ANARCI")
    p.add_argument("--input_tsv", required=True, help="Input TSV: key column + <chain>_sequence columns")
    p.add_argument("--key_column", required=True, help="Name of the record key column")
    p.add_argument("--output_fasta", required=True, help="Output FASTA path")
    args = p.parse_args()

    to_fasta(args.input_tsv, args.key_column, args.output_fasta)


if __name__ == "__main__":
    main()
