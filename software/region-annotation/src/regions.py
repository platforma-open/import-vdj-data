"""Pure region-location logic. No IO, no argparse — see `main.py` for the CLI.

Everything here is a function of its arguments so it can be unit-tested directly.
"""

import re
from typing import Dict, List, Optional, Tuple

# All seven regions. FR4 is included deliberately: the region list is the thing that has
# historically been short in three different places, and a set imported without FR4 gets
# no FR4 liability scored downstream, silently.
REGIONS = ["FR1", "CDR1", "FR2", "CDR2", "FR3", "CDR3", "FR4"]

# Closed status vocabulary. Exactly these three values, never null.
STATUS_ANNOTATED = "Annotated"
STATUS_NOT_APPLICABLE = "Not applicable"
STATUS_FAILED = "Failed"

# Per-scheme, per-ANARCI-bucket region boundaries, inclusive, in the scheme's own
# numbering space.
#
# Copied verbatim from blocks/redefine-clonotypes/software/anarci-numbering/src/main.py.
# ANARCI supplies the numbering; the region *definitions* are this table, so numbering and
# region boundaries are one choice here rather than two. Kept as a copy rather than shared:
# the two callers want different outputs, and sharing would put a change to
# redefine-clonotypes on this block's critical path. Consolidation candidate — if you
# change a boundary here, change it there too.
REGION_RANGES: Dict[str, Dict[str, Dict[str, Tuple[int, int]]]] = {
    "imgt": {
        "H": {
            "FR1": (1, 26),
            "CDR1": (27, 38),
            "FR2": (39, 55),
            "CDR2": (56, 65),
            "FR3": (66, 104),
            "CDR3": (105, 117),
            "FR4": (118, 129),
        },
        "KL": {
            "FR1": (1, 26),
            "CDR1": (27, 38),
            "FR2": (39, 55),
            "CDR2": (56, 65),
            "FR3": (66, 104),
            "CDR3": (105, 117),
            "FR4": (118, 129),
        },
    },
    "kabat": {
        "H": {
            "FR1": (1, 30),
            "CDR1": (31, 35),
            "FR2": (36, 49),
            "CDR2": (50, 65),
            "FR3": (66, 94),
            "CDR3": (95, 102),
            "FR4": (103, 113),
        },
        "KL": {
            "FR1": (1, 23),
            "CDR1": (24, 34),
            "FR2": (35, 49),
            "CDR2": (50, 56),
            "FR3": (57, 88),
            "CDR3": (89, 97),
            "FR4": (98, 107),
        },
    },
    "chothia": {
        "H": {
            "FR1": (1, 25),
            "CDR1": (26, 32),
            "FR2": (33, 52),
            "CDR2": (53, 55),
            "FR3": (56, 94),
            "CDR3": (95, 102),
            "FR4": (103, 113),
        },
        "KL": {
            "FR1": (1, 23),
            "CDR1": (24, 34),
            "FR2": (35, 49),
            "CDR2": (50, 56),
            "FR3": (57, 88),
            "CDR3": (89, 97),
            "FR4": (98, 107),
        },
    },
}

SCHEMES = sorted(REGION_RANGES.keys())


def parse_positions(fields: List[str]) -> List[str]:
    """ANARCI's CSV carries metadata columns first, then one column per position.

    Position columns are the ones whose header starts with a digit (`1`, `2`, … `111A`).
    Returns them in file order, which is numbering order.
    """
    for i, field in enumerate(fields):
        if re.match(r"^\d", field):
            return fields[i:]
    return []


def position_number(label: str) -> Optional[int]:
    """`"111A"` -> 111. Insertion codes share the number of the position they follow."""
    m = re.match(r"^(\d+)", label)
    return int(m.group(1)) if m else None


def region_for_pos(num: int, ranges: Dict[str, Tuple[int, int]]) -> Optional[str]:
    for region in REGIONS:
        start, end = ranges[region]
        if start <= num <= end:
            return region
    return None


def is_gap(residue: Optional[str]) -> bool:
    return (residue or "").strip() in {"", "-", "."}


def build_regions(
    pos_labels: List[str],
    residues: List[str],
    ranges: Dict[str, Tuple[int, int]],
) -> Dict[str, str]:
    """Assemble one amino-acid string per region from ANARCI's aligned residues.

    Gaps are dropped, so the result is the ungapped subsequence of each region. Positions
    outside every region range are dropped too.

    Amino acid only: a bare set carries no nucleotide variable domain, so there is no
    nucleotide counterpart to project onto these boundaries.
    """
    collected: Dict[str, List[str]] = {r: [] for r in REGIONS}

    for pos_label, residue in zip(pos_labels, residues):
        if is_gap(residue):
            continue
        num = position_number(pos_label)
        if num is None:
            continue
        region = region_for_pos(num, ranges)
        if region is None:
            continue
        collected[region].append(residue.strip())

    return {r: "".join(collected[r]) for r in REGIONS}


def annotate(
    sequence: str,
    numbering: Optional[Tuple[List[str], List[str]]],
    ranges: Optional[Dict[str, Tuple[int, int]]],
) -> Tuple[Dict[str, str], str]:
    """Locate one chain's regions and say what happened.

    `sequence`  — the declared amino-acid variable domain, "" when the chain was not
                  supplied for this record.
    `numbering` — (position labels, residues) from whichever ANARCI bucket contained this
                  record, or None if ANARCI did not number it.
    `ranges`    — the range table of that same bucket, or None alongside `numbering`.

    Returns (region -> value, status). A chain that is not `Annotated` carries **no
    value** in any region — the empty string here becomes an absent cell in the TSV and a
    null in the imported p-column. It is never an empty sequence presented as a result.
    """
    empty = {r: "" for r in REGIONS}

    if not (sequence or "").strip():
        # Nothing was supplied for this chain, so there is nothing the input could have
        # supported an answer for. Not a failure of the instrument.
        return empty, STATUS_NOT_APPLICABLE

    if numbering is None or ranges is None:
        # A sequence was supplied and ANARCI did not return numbering for it.
        return empty, STATUS_FAILED

    pos_labels, residues = numbering
    located = build_regions(pos_labels, residues, ranges)

    if not any(located.values()):
        # Numbered, but nothing landed inside any region range.
        return empty, STATUS_FAILED

    return located, STATUS_ANNOTATED
