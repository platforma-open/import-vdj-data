---
'@platforma-open/milaboratories.import-vdj.model': patch
'@platforma-open/milaboratories.import-vdj.ui': patch
'@platforma-open/milaboratories.import-vdj': patch
---

Offer only the numbering schemes the declared chains can use

Kabat and Chothia were defined on antibody structures, and ANARCI implements them for heavy and
light chains only — a TCR chain raises "Unimplemented numbering scheme". IMGT is position-unified
and chain-agnostic.

The scheme dropdown now follows the receptor/chain declaration, and changing the declaration
resets a scheme the new chains cannot be numbered under. Today every selection is IG, so all
three remain on offer; the narrowing takes effect when TCR chains arrive.
