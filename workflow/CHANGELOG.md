# @platforma-open/milaboratories.import-vdj.workflow

## 1.4.0

### Minor Changes

- bae17e4: - migration to txt.head() for header parsing, fixes window compatibility issues
  - schema handling fixes (schema not used in reading operations anymore)
    - fixes concatenation crashes
    - fixes incorrect calculation of mean fractions
  - result reproducibility improvements, with maps.forEach

## 1.3.1

### Patch Changes

- bc586e9: Fixes
- Updated dependencies [bc586e9]
  - @platforma-open/milaboratories.import-vdj.software@1.1.1

## 1.3.0

### Minor Changes

- de3f3b9: support qiagen data format

## 1.2.0

### Minor Changes

- ebcd6f1: Added custom format option for import.

## 1.1.1

### Patch Changes

- 56144f8: bugfix for empty read count in immunoSeq

## 1.1.0

### Minor Changes

- a639dd0: Update python env and add assemblingFeature label to immunoSeq data

### Patch Changes

- Updated dependencies [a639dd0]
  - @platforma-open/milaboratories.import-vdj.software@1.1.0
