"""End-to-end check of both entrypoints against a synthetic ANARCI CSV.

Not wired into `pnpm test`: it needs a python interpreter with polars, which the block's
node/turbo test lane does not provide. Run it by hand from this directory:

    uv venv .venv && uv pip install --python .venv/bin/python polars
    .venv/bin/python test_region_annotation.py

Residues are deterministic per position, so every region's expected content is computable
and the assertions pin the actual boundary arithmetic rather than just the shape.
"""

import csv
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "src")

AAS = "ACDEFGHIKLMNPQRSTVWY"
MAXPOS = 130
POSITIONS = [str(i) for i in range(1, MAXPOS + 1)]

REGIONS = ["FR1", "CDR1", "FR2", "CDR2", "FR3", "CDR3", "FR4"]

# kabat is used throughout because its H and KL ranges differ, which is what makes the
# "declared chain vs ANARCI bucket" assertion meaningful. Under imgt they are identical.
KABAT = {
    "H": {"FR1": (1, 30), "CDR1": (31, 35), "FR2": (36, 49), "CDR2": (50, 65),
          "FR3": (66, 94), "CDR3": (95, 102), "FR4": (103, 113)},
    "KL": {"FR1": (1, 23), "CDR1": (24, 34), "FR2": (35, 49), "CDR2": (50, 56),
           "FR3": (57, 88), "CDR3": (89, 97), "FR4": (98, 107)},
}

ANARCI_META = ["domain_no", "hmm_species", "chain_type", "e-value", "score",
               "seqstart_index", "seqend_index", "v_gene", "v_identity", "j_gene", "j_identity"]


def residue(i):
    return AAS[(i - 1) % len(AAS)]


def expected(lo, hi):
    return "".join(residue(i) for i in range(lo, hi + 1) if i <= MAXPOS)


def write_anarci_csv(path, ids, all_gaps=()):
    """A stand-in for ANARCI's `--csv` output: metadata columns, then one per position."""
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Id"] + ANARCI_META + POSITIONS)
        for rid in ids:
            meta = ["1", "human", "H", "1e-60", "150.0", "0", "120", "IGHV3-23", "0.9", "IGHJ4", "0.9"]
            res = ["-"] * len(POSITIONS) if rid in all_gaps else [residue(i) for i in range(1, MAXPOS + 1)]
            w.writerow([rid] + meta + res)


def write_header_only_csv(path):
    """What the workflow pre-creates, and what an empty ANARCI bucket leaves behind."""
    with open(path, "w") as f:
        f.write("Id\n")


def run(*argv):
    r = subprocess.run([sys.executable] + list(argv), capture_output=True, text=True)
    if r.returncode != 0:
        raise AssertionError(f"{argv[0]} failed:\n{r.stdout}\n{r.stderr}")
    return r.stdout.strip()


def main():
    work = tempfile.mkdtemp(prefix="region-annotation-test-")

    in_tsv = os.path.join(work, "in.tsv")
    with open(in_tsv, "w", newline="") as f:
        w = csv.writer(f, delimiter="\t")
        w.writerow(["variantKey", "IGHeavy_sequence", "IGLight_sequence"])
        w.writerow(["K1", "EVQLVQ", "DIQMTQ"])  # both chains numbered
        w.writerow(["K2", "EVQLVQ", ""])        # B not supplied
        w.writerow(["K3", "EVQLVQ", ""])        # A supplied, ANARCI returned nothing
        w.writerow(["K4", "EVQLVQ", ""])        # A numbered, every position a gap
        w.writerow(["K5", "DIQMTQ", ""])        # A declared, ANARCI bucketed it KL
        w.writerow(["", "EVQLVQ", ""])          # blank key

    h_csv = os.path.join(work, "anarci.csv_H.csv")
    kl_csv = os.path.join(work, "anarci.csv_KL.csv")
    write_anarci_csv(h_csv, ["K1|IGHeavy", "K2|IGHeavy", "K4|IGHeavy"], all_gaps={"K4|IGHeavy"})
    write_anarci_csv(kl_csv, ["K1|IGLight", "K5|IGHeavy"])

    fasta = os.path.join(work, "out.fasta")
    print(run(os.path.join(SRC, "fasta.py"), "--input_tsv", in_tsv,
              "--key_column", "variantKey", "--output_fasta", fasta))

    ids = [line[1:].strip() for line in open(fasta) if line.startswith(">")]
    assert ids == ["K1|IGHeavy", "K1|IGLight", "K2|IGHeavy", "K3|IGHeavy", "K4|IGHeavy", "K5|IGHeavy"], ids
    print("  fasta: chain is in the id, unsupplied chains skipped, blank key dropped")

    # Only records. A bucket ANARCI never fills is handled by the workflow, which pre-creates
    # both CSVs as writable header-only placeholders — nothing synthetic enters the FASTA.
    assert not any(i.startswith("__") for i in ids), ids
    print("  fasta: nothing but the scientist's own records")

    out_tsv = os.path.join(work, "out.tsv")
    stats_tsv = os.path.join(work, "stats.tsv")
    print(run(os.path.join(SRC, "main.py"), "--input_tsv", in_tsv, "--key_column", "variantKey",
              "--scheme", "kabat", "--csv_h", h_csv, "--csv_kl", kl_csv,
              "--out_tsv", out_tsv, "--out_stats", stats_tsv))

    rows = list(csv.DictReader(open(out_tsv), delimiter="\t"))
    by_key = {r["variantKey"]: r for r in rows}
    assert [r["variantKey"] for r in rows] == ["K1", "K2", "K3", "K4", "K5"], list(by_key)

    want_header = (["variantKey"]
                   + [f"IGHeavy_{r}_aa" for r in REGIONS] + ["IGHeavy_regionAnnotationStatus"]
                   + [f"IGLight_{r}_aa" for r in REGIONS] + ["IGLight_regionAnnotationStatus"])
    assert list(rows[0].keys()) == want_header, list(rows[0].keys())
    print("  header: seven regions per chain including FR4, plus a status per chain")

    for chain, bucket in (("IGHeavy", "H"), ("IGLight", "KL")):
        for region in REGIONS:
            got = by_key["K1"][f"{chain}_{region}_aa"]
            exp = expected(*KABAT[bucket][region])
            assert got == exp, f"K1 {chain} {region}: {got!r} != {exp!r}"
        assert by_key["K1"][f"{chain}_regionAnnotationStatus"] == "Annotated"
    print("  K1: both chains Annotated, all seven regions match their bucket's kabat ranges")

    assert by_key["K2"]["IGLight_regionAnnotationStatus"] == "Not applicable"
    assert all(by_key["K2"][f"IGLight_{r}_aa"] == "" for r in REGIONS)
    print("  K2: chain not supplied -> Not applicable, no region values")

    assert by_key["K3"]["IGHeavy_regionAnnotationStatus"] == "Failed"
    assert all(by_key["K3"][f"IGHeavy_{r}_aa"] == "" for r in REGIONS)
    print("  K3: supplied but unnumbered -> Failed, no region values (not empty strings)")

    assert by_key["K4"]["IGHeavy_regionAnnotationStatus"] == "Failed"
    assert all(by_key["K4"][f"IGHeavy_{r}_aa"] == "" for r in REGIONS)
    print("  K4: numbered but nothing located -> Failed, no region values")

    # The declared chain labels the column; the bucket ANARCI chose supplies the ranges.
    assert by_key["K5"]["IGHeavy_regionAnnotationStatus"] == "Annotated"
    for region in REGIONS:
        assert by_key["K5"][f"IGHeavy_{region}_aa"] == expected(*KABAT["KL"][region]), region
    assert by_key["K5"]["IGHeavy_FR1_aa"] != expected(*KABAT["H"]["FR1"])
    print("  K5: declared A, bucketed KL -> Annotated under A, with KL ranges")

    for key, row in by_key.items():
        for chain in ("IGHeavy", "IGLight"):
            assert row[f"{chain}_regionAnnotationStatus"], f"{key} {chain}: empty status"
    print("  status is never empty")

    # One wide row, one column per chain per statistic: the workflow reads this with no axes and
    # carries the chain in each column's domain, as the block's bulk path does.
    stats_rows = list(csv.DictReader(open(stats_tsv), delimiter="\t"))
    assert len(stats_rows) == 1, stats_rows
    stats = stats_rows[0]
    assert list(stats) == [
        "IGHeavy_annotated", "IGHeavy_notApplicable", "IGHeavy_failed", "IGHeavy_chainDisagreed",
        "IGLight_annotated", "IGLight_notApplicable", "IGLight_failed", "IGLight_chainDisagreed",
    ], list(stats)
    # A: K1 K2 K5 annotated, K3 K4 failed, none unsupplied.
    assert (stats["IGHeavy_annotated"], stats["IGHeavy_notApplicable"], stats["IGHeavy_failed"],
            stats["IGHeavy_chainDisagreed"]) == ("3", "0", "2", "1"), stats
    # B: only K1 supplied and annotated; K2..K5 unsupplied. K1|IGLight is in KL, which is where a
    # declared B belongs, so nothing disagrees.
    assert (stats["IGLight_annotated"], stats["IGLight_notApplicable"], stats["IGLight_failed"],
            stats["IGLight_chainDisagreed"]) == ("1", "4", "0", "0"), stats
    print("  stats: one wide row, per-chain counts correct; K5 is the one chainDisagreed, and it"
          " is counted without changing its status or its values")

    # The count must not leak into the dataset — K5 is a normal Annotated record.
    assert by_key["K5"]["IGHeavy_regionAnnotationStatus"] == "Annotated"
    print("  stats: disagreement is reported, not acted on")

    # A single-chain set, with the other bucket left header-only as the workflow creates it.
    single_tsv = os.path.join(work, "single.tsv")
    with open(single_tsv, "w", newline="") as f:
        w = csv.writer(f, delimiter="\t")
        w.writerow(["variantKey", "IGHeavy_sequence"])
        w.writerow(["S1", "EVQLVQ"])
    empty_kl = os.path.join(work, "empty_KL.csv")
    write_header_only_csv(empty_kl)
    single_out = os.path.join(work, "single_out.tsv")
    print(run(os.path.join(SRC, "main.py"), "--input_tsv", single_tsv, "--key_column", "variantKey",
              "--scheme", "imgt", "--csv_h", h_csv, "--csv_kl", empty_kl, "--out_tsv", single_out))
    single = list(csv.DictReader(open(single_out), delimiter="\t"))
    assert list(single[0].keys()) == ["variantKey"] + [f"IGHeavy_{r}_aa" for r in REGIONS] + ["IGHeavy_regionAnnotationStatus"]
    assert single[0]["IGHeavy_regionAnnotationStatus"] == "Failed"  # S1 is not in the H csv
    print("  single-chain set: only that chain's columns emitted, header-only bucket tolerated")

    # An id whose suffix is not a mapped slot must never become a record. Nothing writes such
    # ids today, but the parser is what keeps a stray one out of the dataset.
    pad_csv = os.path.join(work, "pad_H.csv")
    write_anarci_csv(pad_csv, ["K9|H", "K1|IGHeavy"])
    pad_out = os.path.join(work, "pad_out.tsv")
    run(os.path.join(SRC, "main.py"), "--input_tsv", in_tsv, "--key_column", "variantKey",
        "--scheme", "imgt", "--csv_h", pad_csv, "--out_tsv", pad_out)
    padded = list(csv.DictReader(open(pad_out), delimiter="\t"))
    assert all(r["variantKey"] != "K9" for r in padded)
    assert [r["variantKey"] for r in padded] == ["K1", "K2", "K3", "K4", "K5"]
    print("  ids whose suffix is not a mapped slot never become records")

    print("\nALL ASSERTIONS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
