"""Chain vocabulary shared by both entrypoints.

The block speaks `A` / `B` (heavy / light) because that is the vocabulary of the
`pl7.app/vdj/scClonotypeChain` column domain the emitted columns carry. ANARCI speaks
`H` / `KL` and writes one CSV per bucket. The two are related but not the same thing:
`A` / `B` is *declared* by the mapping slot the scientist assigned a column to, while
`H` / `KL` is *inferred* by ANARCI from the sequence itself.

Reconciling a declared chain against an inferred one is explicitly out of scope for this
spec, so this package never compares them. It records regions under the declared chain,
and takes the numbering (and therefore the range table) from whichever bucket ANARCI
actually put the sequence in. See `regions.py` for why.
"""

# Declared chains, in emission order.
CHAINS = ["A", "B"]

CHAIN_LABELS = {"A": "heavy", "B": "light"}

# ANARCI's own buckets. It writes `<out>_H.csv` and `<out>_KL.csv`.
ANARCI_BUCKETS = ["H", "KL"]


def sequence_column(chain: str) -> str:
    """Input TSV column holding the amino-acid variable domain of `chain`."""
    return f"{chain}_sequence"


def region_column(chain: str, region: str) -> str:
    """Output TSV column holding one located region of `chain`."""
    return f"{chain}_{region}_aa"


def status_column(chain: str) -> str:
    """Output TSV column holding the region-annotation status of `chain`."""
    return f"{chain}_regionAnnotationStatus"


def fasta_id(key: str, chain: str) -> str:
    """FASTA record id.

    The chain is part of the id, not just the bucket the record lands in. Keying the
    lookup on the record key alone would collide the two chains of one paired record,
    which is only safe if you already assume declared chain == ANARCI bucket.
    """
    return f"{key}|{chain}"


def parse_fasta_id(record_id: str) -> tuple[str, str]:
    """Inverse of `fasta_id`. Returns ("", "") for anything unparseable."""
    key, sep, chain = (record_id or "").strip().rpartition("|")
    if not sep or not key or chain not in CHAINS:
        return "", ""
    return key, chain
