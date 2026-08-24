# Import V(D)J Data

Bring V(D)J sequencing results into Platforma from whatever tool produced them. This block reads MiXCR, ImmunoSeq, QIAseq, Cell Ranger, AIRR, and custom CSV/TSV exports — bulk or single-cell — and normalizes them into one standard clonotype dataset that every downstream Platforma block can consume.

Open-source analysis block for Platforma, the biologics discovery platform by MiLaboratories. For the full no-code workflow, see [platforma.bio](https://platforma.bio/).

## What it does

Immune repertoire data arrives in whatever shape the upstream tool emitted: different column names, different count semantics, different chain conventions, different separators. Every downstream analysis then has to special-case the source. This block absorbs that problem once, at import.

Point it at your files and it detects the separator, reads the header, and infers which columns hold what. For recognized formats the mapping is automatic; for anything else, Custom mode lets you map columns yourself. Gzipped files work throughout.

You declare what the data contains — which chains to import, whether counts are reads or UMIs, and which columns hold them. Both a primary and an optional secondary count type can be carried, so a dataset with both read and UMI counts keeps both. Sequence, mutation, and canonical-form columns are picked up when present.

The result is a standard Platforma clonotype dataset: the same shape whether it came from Cell Ranger or a hand-rolled TSV, so downstream blocks work identically across sources.

## Inputs & outputs

* **Input:** clonotype tables in MiXCR (bulk or single-cell), ImmunoSeq, QIAseq Immune Repertoire Analysis, Cell Ranger VDJ, AIRR (bulk or single-cell), or custom CSV/TSV format, optionally gzipped.
* **Output:** a normalized clonotype dataset with per-sample abundances, chain assignments, and sequence columns, ready for any downstream V(D)J block.

## Specifications

| | |
|---|---|
| Block title in app | Import V(D)J Data |
| Formats | MiXCR bulk, MiXCR single cell, ImmunoSeq, QIAseq Immune Repertoire Analysis, Cell Ranger VDJ, AIRR bulk, AIRR single cell, Custom CSV/TSV — gzipped supported |
| Data types | Bulk and single-cell |
| Chains | IG Heavy, IG Light, TRA, TRB, TRG, TRD; receptor groups IG, TCR-αβ, TCR-ɣδ |
| Count types | Reads or UMIs, with an optional secondary count column |
| Optional columns | Sequence, mutations, canonical form |
| Detection | Separator auto-detected, columns inferred from the header |

## Use cases

* **Reanalyze existing data:** bring clonotype tables produced outside Platforma into the platform without reprocessing raw reads.
* **Public and published datasets:** import AIRR-format repertoires from repositories and analyze them alongside your own.
* **Cell Ranger single-cell VDJ:** load 10x Genomics output for downstream single-cell repertoire analysis.
* **Vendor kit output:** import ImmunoSeq or QIAseq results directly.
* **Mixed-source studies:** normalize repertoires from several tools into one comparable dataset.
* **Anything tabular:** map a custom CSV or TSV column by column when no preset fits.

## FAQ

### Which formats are supported?

MiXCR (bulk and single-cell), ImmunoSeq, QIAseq Immune Repertoire Analysis, Cell Ranger VDJ, AIRR (bulk and single-cell), and custom CSV/TSV. Gzipped versions of all of these work.

### What if my file is not in a supported format?

Use Custom mode and map the columns yourself. As long as the file is delimited text with a header, it can be imported.

### What is the secondary count type for?

Some pipelines report both read counts and UMI counts. Configure the primary count type you want abundances based on, and carry the other as a secondary count so both remain available downstream.

### Can I use imported data with MiXCR SHM Trees?

No. SHM tree building needs MiXCR's own alignment files, which a clonotype table does not contain. Imported datasets work with the rest of the downstream blocks — clustering, enrichment, sequence space, lead selection, liabilities — but lineage tree building requires clonotyping to have been run inside Platforma by a MiXCR block.

### Does it handle single-cell data?

Yes. MiXCR single cell, AIRR single cell, and Cell Ranger VDJ are all single-cell formats, and produce single-cell clonotype datasets with paired-chain structure preserved.

## Documentation

Step-by-step guide: [How to Import Data](https://docs.platforma.bio/guides/antibody-discovery/data-import/)

## Part of the Platforma ecosystem

This block is part of [Platforma](https://platforma.bio/) by [MiLaboratories](https://github.com/milaboratory). Explore the other open-source blocks at [github.com/platforma-open](https://github.com/platforma-open) and the docs for antibody discovery at [docs.platforma.bio/biology-guides/antibody-discovery](https://docs.platforma.bio/biology-guides/antibody-discovery/).
