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
        w.writerow(["variantKey", "A_sequence", "B_sequence"])
        w.writerow(["K1", "EVQLVQ", "DIQMTQ"])  # both chains numbered
        w.writerow(["K2", "EVQLVQ", ""])        # B not supplied
        w.writerow(["K3", "EVQLVQ", ""])        # A supplied, ANARCI returned nothing
        w.writerow(["K4", "EVQLVQ", ""])        # A numbered, every position a gap
        w.writerow(["K5", "DIQMTQ", ""])        # A declared, ANARCI bucketed it KL
        w.writerow(["", "EVQLVQ", ""])          # blank key

    h_csv = os.path.join(work, "anarci.csv_H.csv")
    kl_csv = os.path.join(work, "anarci.csv_KL.csv")
    write_anarci_csv(h_csv, ["K1|A", "K2|A", "K4|A"], all_gaps={"K4|A"})
    write_anarci_csv(kl_csv, ["K1|B", "K5|A"])

    fasta = os.path.join(work, "out.fasta")
    print(run(os.path.join(SRC, "fasta.py"), "--input_tsv", in_tsv,
              "--key_column", "variantKey", "--output_fasta", fasta))

    ids = [line[1:].strip() for line in open(fasta) if line.startswith(">")]
    record_ids = [i for i in ids if not i.startswith("__anarci_bucket_pad__")]
    pad_ids = [i for i in ids if i.startswith("__anarci_bucket_pad__")]
    assert record_ids == ["K1|A", "K1|B", "K2|A", "K3|A", "K4|A", "K5|A"], record_ids
    print("  fasta: chain is in the id, unsupplied chains skipped, blank key dropped")

    # Without these, a single-bucket set leaves one CSV unwritten and the workflow cannot save it.
    assert pad_ids == ["__anarci_bucket_pad__|H", "__anarci_bucket_pad__|KL"], pad_ids
    print("  fasta: one padding reference per ANARCI bucket, always")

    out_tsv = os.path.join(work, "out.tsv")
    stats_tsv = os.path.join(work, "stats.tsv")
    print(run(os.path.join(SRC, "main.py"), "--input_tsv", in_tsv, "--key_column", "variantKey",
              "--scheme", "kabat", "--h_csv", h_csv, "--kl_csv", kl_csv,
              "--out_tsv", out_tsv, "--out_stats", stats_tsv))

    rows = list(csv.DictReader(open(out_tsv), delimiter="\t"))
    by_key = {r["variantKey"]: r for r in rows}
    assert [r["variantKey"] for r in rows] == ["K1", "K2", "K3", "K4", "K5"], list(by_key)

    want_header = (["variantKey"]
                   + [f"A_{r}_aa" for r in REGIONS] + ["A_regionAnnotationStatus"]
                   + [f"B_{r}_aa" for r in REGIONS] + ["B_regionAnnotationStatus"])
    assert list(rows[0].keys()) == want_header, list(rows[0].keys())
    print("  header: seven regions per chain including FR4, plus a status per chain")

    for chain, bucket in (("A", "H"), ("B", "KL")):
        for region in REGIONS:
            got = by_key["K1"][f"{chain}_{region}_aa"]
            exp = expected(*KABAT[bucket][region])
            assert got == exp, f"K1 {chain} {region}: {got!r} != {exp!r}"
        assert by_key["K1"][f"{chain}_regionAnnotationStatus"] == "Annotated"
    print("  K1: both chains Annotated, all seven regions match their bucket's kabat ranges")

    assert by_key["K2"]["B_regionAnnotationStatus"] == "Not applicable"
    assert all(by_key["K2"][f"B_{r}_aa"] == "" for r in REGIONS)
    print("  K2: chain not supplied -> Not applicable, no region values")

    assert by_key["K3"]["A_regionAnnotationStatus"] == "Failed"
    assert all(by_key["K3"][f"A_{r}_aa"] == "" for r in REGIONS)
    print("  K3: supplied but unnumbered -> Failed, no region values (not empty strings)")

    assert by_key["K4"]["A_regionAnnotationStatus"] == "Failed"
    assert all(by_key["K4"][f"A_{r}_aa"] == "" for r in REGIONS)
    print("  K4: numbered but nothing located -> Failed, no region values")

    # The declared chain labels the column; the bucket ANARCI chose supplies the ranges.
    assert by_key["K5"]["A_regionAnnotationStatus"] == "Annotated"
    for region in REGIONS:
        assert by_key["K5"][f"A_{region}_aa"] == expected(*KABAT["KL"][region]), region
    assert by_key["K5"]["A_FR1_aa"] != expected(*KABAT["H"]["FR1"])
    print("  K5: declared A, bucketed KL -> Annotated under A, with KL ranges")

    for key, row in by_key.items():
        for chain in ("A", "B"):
            assert row[f"{chain}_regionAnnotationStatus"], f"{key} {chain}: empty status"
    print("  status is never empty")

    stats = {r["chain"]: r for r in csv.DictReader(open(stats_tsv), delimiter="\t")}
    assert list(stats) == ["A", "B"], list(stats)
    # A: K1 K2 K5 annotated, K3 K4 failed, none unsupplied.
    assert stats["A"] == {"chain": "A", "annotated": "3", "notApplicable": "0",
                          "failed": "2", "chainDisagreed": "1"}, stats["A"]
    # B: only K1 supplied and annotated; K2..K5 unsupplied. K1|B is in KL, which is where a
    # declared B belongs, so nothing disagrees.
    assert stats["B"] == {"chain": "B", "annotated": "1", "notApplicable": "4",
                          "failed": "0", "chainDisagreed": "0"}, stats["B"]
    print("  stats: per-chain counts correct; K5 is the one chainDisagreed, and it is"
          " counted without changing its status or its values")

    # The count must not leak into the dataset — K5 is a normal Annotated record.
    assert by_key["K5"]["A_regionAnnotationStatus"] == "Annotated"
    print("  stats: disagreement is reported, not acted on")

    # A single-chain set, with the other bucket left header-only as the workflow creates it.
    single_tsv = os.path.join(work, "single.tsv")
    with open(single_tsv, "w", newline="") as f:
        w = csv.writer(f, delimiter="\t")
        w.writerow(["variantKey", "A_sequence"])
        w.writerow(["S1", "EVQLVQ"])
    empty_kl = os.path.join(work, "empty_KL.csv")
    write_header_only_csv(empty_kl)
    single_out = os.path.join(work, "single_out.tsv")
    print(run(os.path.join(SRC, "main.py"), "--input_tsv", single_tsv, "--key_column", "variantKey",
              "--scheme", "imgt", "--h_csv", h_csv, "--kl_csv", empty_kl, "--out_tsv", single_out))
    single = list(csv.DictReader(open(single_out), delimiter="\t"))
    assert list(single[0].keys()) == ["variantKey"] + [f"A_{r}_aa" for r in REGIONS] + ["A_regionAnnotationStatus"]
    assert single[0]["A_regionAnnotationStatus"] == "Failed"  # S1 is not in the H csv
    print("  single-chain set: only that chain's columns emitted, header-only bucket tolerated")

    # The padding must be invisible downstream: its ids name buckets, not chains, so the
    # id parser rejects them and no record is ever emitted for them.
    pad_csv = os.path.join(work, "pad_H.csv")
    write_anarci_csv(pad_csv, ["__anarci_bucket_pad__|H", "K1|A"])
    pad_out = os.path.join(work, "pad_out.tsv")
    run(os.path.join(SRC, "main.py"), "--input_tsv", in_tsv, "--key_column", "variantKey",
        "--scheme", "imgt", "--h_csv", pad_csv, "--out_tsv", pad_out)
    padded = list(csv.DictReader(open(pad_out), delimiter="\t"))
    assert all(r["variantKey"] != "__anarci_bucket_pad__" for r in padded)
    assert [r["variantKey"] for r in padded] == ["K1", "K2", "K3", "K4", "K5"]
    print("  padding references never become records")

    print("\nALL ASSERTIONS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
