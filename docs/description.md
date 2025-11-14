# Overview

Imports V(D)J sequencing data from various formats (MiXCR, immunoSeq, AIRR, CSV, TSV, and their gzipped counterparts) for both bulk and single-cell data, and normalizes it for downstream analysis within the platform. The block automatically detects the appropriate separator, infers column information from the file header, handles different chain types (e.g., IGHeavy, IGLight, TRA, TRB), and produces a structured dataset suitable for use in downstream analysis blocks such as Clonotype Browser, Clonotype Clustering, and other V(D)J analysis workflows.
