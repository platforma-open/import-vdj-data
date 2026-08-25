// Author-owned. `block-tools structure` does not modify this file.
// Add block-specific helper types or values the consumer surface
// should expose. Anything you `export` here flows out via the
// main entry (./index re-exports this file).
//
// Do NOT redefine: BlockContract, BlockOutputs, BlockData,
// BlockPointer, platforma, or the block-named <PascalName>Block*
// aliases — those names come from ./index and `export *` from this
// file would shadow them.

// The rule that decides whether a collision verdict is about the mapping now selected. Exposed
// because the run gate depends on it and the block's own tests have to state the verdict the UI
// would have mirrored in; a test that rebuilt the rule by hand would drift from the gate it means
// to exercise.
export { collisionCheckKey } from "@platforma-open/milaboratories.import-vdj.model";
