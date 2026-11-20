# Overview

Imports V(D)J sequencing data from various formats (MiXCR, immunoSeq, QIAseq, Cell Ranger, CSV, TSV, and their gzipped counterparts) for both bulk and single-cell data, and normalizes it for downstream analysis within the platform. The block automatically detects the appropriate separator, infers column information from the file header, handles different chain types (e.g., IGHeavy, IGLight, TRA, TRB), and produces a structured dataset suitable for use in downstream analysis blocks such as Clonotype Browser, Clonotype Clustering, and other V(D)J analysis workflows.

It also imports peptide count tables from phage display panning or other library selections: one table per sample, or one long table with a sample column. They come in as a peptide dataset in the shape Peptide Profiling produces, so Enrichment, Sequence Clustering, Lead Selection and the other peptide blocks read them directly.
