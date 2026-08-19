"""Chain vocabulary shared by both entrypoints.

The block speaks `IGHeavy` / `IGLight`, the `pl7.app/vdj/chain` vocabulary its bulk path
already uses — a mapped chain is a locus, and one mapped chain is a bulk shape. ANARCI speaks
`H` / `KL` and writes one CSV per bucket. The two are related but not the same thing: the locus
is *declared* by the mapping slot the scientist assigned a column to, while `H` / `KL` is
*inferred* by ANARCI from the sequence itself.

(The workflow separately emits `pl7.app/vdj/scClonotypeChain` as `A` / `B` on a paired set. That
is a different, positional vocabulary for chains sharing one frame; nothing here uses it.)

Reconciling a declared chain against an inferred one is explicitly out of scope for this
spec, so this package never compares them. It records regions under the declared chain,
and takes the numbering (and therefore the range table) from whichever bucket ANARCI
actually put the sequence in. See `regions.py` for why.
"""

# Declared chains, in emission order.
CHAINS = ["IGHeavy", "IGLight"]

CHAIN_LABELS = {"IGHeavy": "heavy", "IGLight": "light"}

# ANARCI's own buckets. It writes `<out>_H.csv` and `<out>_KL.csv`.
ANARCI_BUCKETS = ["H", "KL"]

# The bucket a declared chain is expected to land in, used *only* to count disagreements —
# never to choose a range table, and never to stop a run. ANARCI merges kappa and lambda into
# one KL bucket, and IGLight is light regardless of which, so the pairing is total.
EXPECTED_BUCKET = {"IGHeavy": "H", "IGLight": "KL"}


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
