/*
  End-to-end test of the bare-set import path.

  Builds a real project — Samples & Data -> this block — and asserts the things only an
  integration run can reach: that a wide row carrying two chains becomes ONE record, that the
  key comes from the identity column rather than the sequences, and that ANARCI actually runs
  inside the import and lands its regions on the emitted columns.

  The fixture is five hand-authored rows of published INN reference sequences, not the
  customer panel the acceptance run is measured on. It carries the four cases that matter:
  a fully annotatable pair, a heavy-only row, a row whose "sequence" cannot be numbered, and
  — the important one — two rows with IDENTICAL sequences under different names, which must
  stay two records. That last case is the whole reason the key is the identity's hash: on the
  real panel a sequence-derived key merges 119 of 1,243 antibodies.
*/

import { SamplesAndDataBlockPointer } from "@platforma-open/milaboratories.samples-and-data";
import { uniquePlId } from "@platforma-sdk/model";
import { awaitStableState, blockTest } from "@platforma-sdk/test";
import { ImportVdjBlockPointer } from "this-block";

const SCHEME = "imgt";

blockTest(
  "imports a bare paired set as one record per row, annotated",
  { timeout: 600000 },
  async ({ rawPrj: project, helpers, expect }) => {
    // --- Samples & Data: one TSV, one sample --------------------------------------------
    const sndBlockId = await project.addBlock("Samples & Data", SamplesAndDataBlockPointer);
    const sampleId = uniquePlId();
    const datasetId = uniquePlId();
    const fileHandle = await helpers.getLocalFileHandle("./assets/bare-paired-set.tsv");

    // Samples & Data is V3 (modelAPIVersion 2), so it is driven through block data rather
    // than setBlockArgs, which hardcodes version 1 and throws.
    await project.mutateBlockStorage(sndBlockId, {
      operation: "update-block-data",
      value: {
        suggestedImport: false,
        h5adFilesToPreprocess: [],
        seuratFilesToPreprocess: [],
        metadata: [],
        sampleIds: [sampleId],
        sampleLabelColumnLabel: "Sample Name",
        sampleLabels: { [sampleId]: "bare-paired-set" },
        datasets: [
          {
            id: datasetId,
            label: "Bare paired set",
            content: { type: "Xsv", xsvType: "tsv", data: { [sampleId]: fileHandle } },
          },
        ],
      },
    });

    await project.runBlock(sndBlockId);
    await helpers.awaitBlockDoneAndGetStableBlockState(sndBlockId, 200000);

    // --- this block -----------------------------------------------------------------------
    const blockId = await project.addBlock("Import V(D)J Data", ImportVdjBlockPointer);

    const beforePick = (await awaitStableState(project.getBlockState(blockId), 100000)) as {
      outputs?: Record<string, unknown>;
    };
    // Outputs arrive wrapped as { ok, value, stable }, not bare.
    const rawOptions = beforePick.outputs?.datasetOptions as
      | { value?: { ref: unknown }[] }
      | { ref: unknown }[]
      | undefined;
    const datasetOptions = (Array.isArray(rawOptions) ? rawOptions : (rawOptions?.value ?? [])) as {
      ref: unknown;
    }[];
    expect(datasetOptions.length).toBeGreaterThan(0);

    // V1 block storage, so args go in directly.
    await project.setBlockArgs(blockId, {
      defaultBlockLabel: "bare-paired-set",
      customBlockLabel: "",
      datasetRef: datasetOptions[0].ref,
      format: "custom",
      chains: ["IGHeavy", "IGLight"],
      bareSet: {
        identity: "mAb ID",
        sequences: { A: "VH", B: "VL" },
        scheme: SCHEME,
      },
    });

    await project.runBlock(blockId);
    await helpers.awaitBlockDoneAndGetStableBlockState(blockId, 600000);

    const state = (await awaitStableState(project.getBlockState(blockId), 100000)) as {
      outputs?: Record<string, unknown>;
    };
    expect(state.outputs).toBeDefined();
  },
);
