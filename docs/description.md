# Overview

This block is designed to import V(D)J data from various formats, including CSV, TSV, and their gzipped counterparts. It automatically detects the appropriate separator and infers column information from the file header. The primary function of this block is to process and normalize the input data, making it suitable for downstream analysis within the platform. It prepares the data by identifying relevant columns, handling different chain types (e.g., IGHeavy, IGLight, TRA, TRB), and ultimately producing a structured dataset along with summary statistics. This ensures that diverse V(D)J datasets can be seamlessly integrated into standardized analysis pipelines.


