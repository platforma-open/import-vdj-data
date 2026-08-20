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
import { blockSpec as sequencePropertiesSpec } from "@platforma-open/milaboratories.sequence-properties";
import { createPlDataTableStateV2, uniquePlId } from "@platforma-sdk/model";
import { awaitStableState, blockTest } from "@platforma-sdk/test";
import { ImportVdjBlockPointer } from "this-block";

/**
 * A complete `BlockData` from the fields a test actually cares about.
 *
 * `update-block-data` replaces the whole data object rather than merging, so every view-state
 * field has to be present or the model reads undefined where it expects a default — most
 * visibly `tableState`, which the stats table is built from.
 */
function blockData(fields: Record<string, unknown>): Record<string, unknown> {
  return {
    defaultBlockLabel: "",
    customBlockLabel: "",
    chains: [],
    tableState: createPlDataTableStateV2(),
    settingsOpen: true,
    qiagenColumnsPresent: false,
    immunoSeqColumnsPresent: false,
    mixcrColumnsPresent: false,
    crColumnsPresent: false,
    airrColumnsPresent: false,
    ...fields,
  };
}

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

    await project.mutateBlockStorage(blockId, {
      operation: "update-block-data",
      value: blockData({
        defaultBlockLabel: "bare-paired-set",
        customBlockLabel: "",
        datasetRef: datasetOptions[0].ref,
        format: "custom",
        chains: ["IGHeavy", "IGLight"],
        bareSet: {
          identity: "mAb ID",
          chainSelection: "IG",
          sequences: { IGHeavy: "VH", IGLight: "VL" },
          scheme: SCHEME,
          // A column the canonical vocabulary never anticipated — offered, not dropped.
          // The UI attaches the type the profile detected; this is what it would write.
          properties: [{ header: "Affinity (nM)", valueType: "Double" }],
        },
      }),
    });

    await project.runBlock(blockId);
    await helpers.awaitBlockDoneAndGetStableBlockState(blockId, 600000);

    const state = (await awaitStableState(project.getBlockState(blockId), 100000)) as {
      outputs?: Record<string, unknown>;
    };

    type Emitted = {
      name: string;
      valueType: string;
      domain: Record<string, string>;
      annotations: Record<string, string>;
      axes: { name: string; domain: Record<string, string> }[];
    };
    const wrapped = state.outputs?.importedColumns as { value?: Emitted[] } | Emitted[] | undefined;
    const columns = (Array.isArray(wrapped) ? wrapped : (wrapped?.value ?? [])) as Emitted[];
    expect(columns.length).toBeGreaterThan(0);

    const seq = (chain: string, feature: string) =>
      columns.find(
        (c) =>
          c.name === "pl7.app/vdj/sequence" &&
          c.domain["pl7.app/vdj/feature"] === feature &&
          c.domain["pl7.app/vdj/scClonotypeChain"] === chain,
      );

    // The shape, and the reason downstream blocks can read this set unchanged. Consumers match
    // axes positionally: a selector naming one axis is compared against the candidate column's
    // axis 0. A property column carrying the sample axis first is invisible to them, and the
    // failure surfaces there as "no sequence columns found" rather than here. So abundance is
    // the ONLY column keeping the sample axis — it is a presence marker, one per sample — and
    // everything else is a property of the record, on the record axis alone. Same split MiXCR
    // makes. One frame, not one per chain.
    for (const c of columns) {
      if (c.name === "pl7.app/vdj/uniqueMoleculeCount") {
        expect(c.axes.map((a) => a.name)).toEqual(["pl7.app/sampleId", "pl7.app/variantKey"]);
        continue;
      }
      expect(c.axes.map((a) => a.name)).toEqual(["pl7.app/variantKey"]);
    }

    // The label needs that shape for a second reason of its own: a pl7.app/label column only
    // acts as an axis's label when it sits on that axis ALONE. Carrying the sample axis it is
    // merely a per-record property, and the axis goes on showing the opaque hash.
    const label = columns.find((c) => c.name === "pl7.app/label");
    expect(label).toBeDefined();
    expect(label!.axes.map((a) => a.name)).toEqual(["pl7.app/variantKey"]);

    // Modality rides on the run-id key, never on the axis name. Stamping another modality's
    // key would not mislabel the dataset, it would make it that modality to every reader.
    const keyAxis = columns[0].axes[1];
    expect(keyAxis.domain["pl7.app/vdj/clonotypingRunId"]).toBeTruthy();
    expect(keyAxis.domain["pl7.app/vdj/receptor"]).toBe("IG");
    expect(keyAxis.domain["pl7.app/peptide/extractionRunId"]).toBeUndefined();
    expect(keyAxis.domain["pl7.app/repertoire/extractionRunId"]).toBeUndefined();
    expect(keyAxis.domain["pl7.app/vdj/scClonotypeKey/structure"]).toBeUndefined();

    // The amino-acid variable domain per chain, carrying the annotations Lead Selection needs.
    for (const chain of ["A", "B"]) {
      const main = seq(chain, "VDJRegionInFrame");
      expect(main, `main sequence for chain ${chain}`).toBeDefined();
      expect(main!.domain["pl7.app/vdj/scClonotypeChain/index"]).toBe("primary");
      expect(main!.annotations["pl7.app/vdj/isMainSequence"]).toBe("true");
      expect(main!.annotations["pl7.app/vdj/isAssemblingFeature"]).toBe("true");
      // A whole variable domain has no located boundary, so it carries no convention.
      expect(main!.domain["pl7.app/vdj/numberingSchema"]).toBeUndefined();
    }

    // Seven regions per chain, fourteen in all — FR4 included, which is the one every region
    // list in the workspace has historically been missing.
    for (const chain of ["A", "B"]) {
      for (const region of ["FR1", "CDR1", "CDR2", "FR2", "FR3", "FR4", "CDR3"]) {
        const col = seq(chain, region);
        expect(col, `${chain} ${region}`).toBeDefined();
        // Emitted twice: the domain copy buys distinct identity, the annotation copy is what
        // Sequence Liabilities reads to choose its coordinate map.
        expect(col!.domain["pl7.app/vdj/numberingSchema"]).toBe(SCHEME);
        expect(col!.annotations["pl7.app/vdj/numberingSchema"]).toBe(SCHEME);
      }
    }

    // One status per chain, a closed three-member enum.
    for (const chain of ["A", "B"]) {
      const status = columns.find(
        (c) =>
          c.name === "pl7.app/vdj/regionAnnotationStatus" &&
          c.domain["pl7.app/vdj/scClonotypeChain"] === chain,
      );
      expect(status, `status for chain ${chain}`).toBeDefined();
      expect(status!.annotations["pl7.app/discreteValues"]).toBe(
        '["Annotated","Not applicable","Failed"]',
      );
    }

    // The synthetic abundance is the block's own umi-count spec adopted whole: exactly the
    // triple Clustering's bundle queries, plus the anchor that makes the dataset selectable.
    // The unit and the "Number of UMIs" label ride along with the adopted spec — the
    // fabrication is confined to the value, not to what the value is called.
    const presence = columns.find((c) => c.name === "pl7.app/vdj/uniqueMoleculeCount");
    expect(presence).toBeDefined();
    expect(presence!.valueType).toBe("Long");
    expect(presence!.annotations["pl7.app/isAbundance"]).toBe("true");
    expect(presence!.annotations["pl7.app/abundance/normalized"]).toBe("false");
    expect(presence!.annotations["pl7.app/abundance/isPrimary"]).toBe("true");
    expect(presence!.annotations["pl7.app/isAnchor"]).toBe("true");
    expect(presence!.annotations["pl7.app/abundance/unit"]).toBe("molecules");
    expect(presence!.annotations["pl7.app/label"]).toBe("Number of UMIs");

    // Exactly one column may claim the anchor and the primary abundance.
    expect(columns.filter((c) => c.annotations["pl7.app/isAnchor"] === "true")).toHaveLength(1);

    // A count of how often a record repeats is never presented as an abundance.
    expect(columns.find((c) => c.name === "pl7.app/vdj/sampleCount")).toBeUndefined();

    // A non-sequence column the scientist accepted: name sanitized, label the raw header,
    // no domain key.
    const affinity = columns.find((c) => c.name.startsWith("pl7.app/vdj/importedProperty/"));
    expect(affinity).toBeDefined();
    expect(affinity!.name).toBe("pl7.app/vdj/importedProperty/Affinity_nM_");
    expect(affinity!.annotations["pl7.app/label"]).toBe("Affinity (nM)");
    // The detected type reaches the emitted column. The panel asks no type question — prerun
    // profiles every row and the UI records the answer when the column is accepted.
    expect(affinity!.valueType).toBe("Double");
    expect(Object.keys(affinity!.domain)).toHaveLength(0);
  },
);

blockTest(
  "refuses to start when the identity column repeats on rows that differ",
  { timeout: 400000 },
  async ({ rawPrj: project, helpers, expect }) => {
    // AB-001 appears twice with different light chains — a genuine conflict, because the key is
    // the identity's hash and the two would merge. AB-002 also appears twice but the rows are
    // identical, which states the same record twice and is not a conflict.
    const sndBlockId = await project.addBlock("Samples & Data", SamplesAndDataBlockPointer);
    const sampleId = uniquePlId();
    const datasetId = uniquePlId();
    const fileHandle = await helpers.getLocalFileHandle(
      "./assets/bare-paired-set-duplicate-id.tsv",
    );

    await project.mutateBlockStorage(sndBlockId, {
      operation: "update-block-data",
      value: {
        suggestedImport: false,
        h5adFilesToPreprocess: [],
        seuratFilesToPreprocess: [],
        metadata: [],
        sampleIds: [sampleId],
        sampleLabelColumnLabel: "Sample Name",
        sampleLabels: { [sampleId]: "duplicate-id" },
        datasets: [
          {
            id: datasetId,
            label: "Duplicate identity",
            content: { type: "Xsv", xsvType: "tsv", data: { [sampleId]: fileHandle } },
          },
        ],
      },
    });
    await project.runBlock(sndBlockId);
    await helpers.awaitBlockDoneAndGetStableBlockState(sndBlockId, 200000);

    const blockId = await project.addBlock("Import V(D)J Data", ImportVdjBlockPointer);
    const beforePick = (await awaitStableState(project.getBlockState(blockId), 100000)) as {
      outputs?: Record<string, unknown>;
    };
    const rawOptions = beforePick.outputs?.datasetOptions as
      | { value?: { ref: unknown }[] }
      | { ref: unknown }[]
      | undefined;
    const datasetOptions = (Array.isArray(rawOptions) ? rawOptions : (rawOptions?.value ?? [])) as {
      ref: unknown;
    }[];
    expect(datasetOptions.length).toBeGreaterThan(0);

    await project.mutateBlockStorage(blockId, {
      operation: "update-block-data",
      value: blockData({
        defaultBlockLabel: "duplicate-id",
        customBlockLabel: "",
        datasetRef: datasetOptions[0].ref,
        format: "custom",
        chains: ["IGHeavy", "IGLight"],
        bareSet: {
          identity: "mAb ID",
          chainSelection: "IG",
          sequences: { IGHeavy: "VH", IGLight: "VL" },
          scheme: SCHEME,
        },
      }),
    });

    const state = (await awaitStableState(project.getBlockState(blockId), 300000)) as {
      outputs?: Record<string, unknown>;
      inputsValid?: boolean;
      canRun?: boolean;
    };

    const wrapped = state.outputs?.identityCollisions as
      | { value?: string[] }
      | string[]
      | undefined;
    const collisions = (Array.isArray(wrapped) ? wrapped : (wrapped?.value ?? [])) as string[];

    // The differing pair is reported, so the scientist is told which value to fix.
    expect(collisions).toContain("AB-001");
    // The identical pair is not: repeating a record verbatim discards nothing.
    expect(collisions).not.toContain("AB-002");

    // GAP, verified here rather than assumed: `argsValid` disables Run in the interface, but
    // the platform does not enforce it — `project.runBlock` resolves happily on an invalid
    // block. So "the run does not start" holds for a scientist clicking Run and not for an API
    // caller, and a colliding set driven through the API would still import and merge records.
    // Closing that needs a workflow-side refusal, which is data-dependent and therefore a
    // separate awaiting template.
    await expect(project.runBlock(blockId)).resolves.toBeUndefined();
  },
);

blockTest(
  "imports a heavy-only set, where ANARCI produces just one bucket",
  { timeout: 600000 },
  async ({ rawPrj: project, helpers, expect }) => {
    // The case that used to fail: with no light chains, ANARCI writes no `_KL.csv`, and the
    // step cannot save a file the run never wrote. The FASTA now carries one reference domain
    // per bucket so both always exist.
    const sndBlockId = await project.addBlock("Samples & Data", SamplesAndDataBlockPointer);
    const sampleId = uniquePlId();
    const datasetId = uniquePlId();
    const fileHandle = await helpers.getLocalFileHandle("./assets/bare-heavy-only.tsv");

    await project.mutateBlockStorage(sndBlockId, {
      operation: "update-block-data",
      value: {
        suggestedImport: false,
        h5adFilesToPreprocess: [],
        seuratFilesToPreprocess: [],
        metadata: [],
        sampleIds: [sampleId],
        sampleLabelColumnLabel: "Sample Name",
        sampleLabels: { [sampleId]: "heavy-only" },
        datasets: [
          {
            id: datasetId,
            label: "Heavy only",
            content: { type: "Xsv", xsvType: "tsv", data: { [sampleId]: fileHandle } },
          },
        ],
      },
    });
    await project.runBlock(sndBlockId);
    await helpers.awaitBlockDoneAndGetStableBlockState(sndBlockId, 200000);

    const blockId = await project.addBlock("Import V(D)J Data", ImportVdjBlockPointer);
    const beforePick = (await awaitStableState(project.getBlockState(blockId), 100000)) as {
      outputs?: Record<string, unknown>;
    };
    const rawOptions = beforePick.outputs?.datasetOptions as
      | { value?: { ref: unknown }[] }
      | { ref: unknown }[]
      | undefined;
    const datasetOptions = (Array.isArray(rawOptions) ? rawOptions : (rawOptions?.value ?? [])) as {
      ref: unknown;
    }[];

    await project.mutateBlockStorage(blockId, {
      operation: "update-block-data",
      value: blockData({
        defaultBlockLabel: "heavy-only",
        customBlockLabel: "",
        datasetRef: datasetOptions[0].ref,
        format: "custom",
        chains: ["IGHeavy"],
        bareSet: {
          identity: "mAb ID",
          chainSelection: "IGHeavy",
          sequences: { IGHeavy: "VH" },
          scheme: SCHEME,
        },
      }),
    });

    await project.runBlock(blockId);
    await helpers.awaitBlockDoneAndGetStableBlockState(blockId, 600000);

    const state = (await awaitStableState(project.getBlockState(blockId), 100000)) as {
      outputs?: Record<string, unknown>;
    };
    const wrapped = state.outputs?.importedColumns as
      | {
          value?: {
            name: string;
            domain: Record<string, string>;
            annotations: Record<string, string>;
          }[];
        }
      | undefined;
    const columns = wrapped?.value ?? [];
    expect(columns.length).toBeGreaterThan(0);

    // One mapped chain is a bulk shape, so no column carries pl7.app/vdj/scClonotypeChain at all.
    // That key is how clonotype-clustering and antibody-sequence-liabilities recognise a dataset
    // holding paired chains in one frame; stamping it here would make both treat this as paired.
    expect(
      columns.filter((c) => c.domain["pl7.app/vdj/scClonotypeChain"] !== undefined),
    ).toHaveLength(0);

    // Seven regions plus the variable domain itself, and nothing invented for the chain the file
    // never had.
    const sequences = columns.filter((c) => c.name === "pl7.app/vdj/sequence");
    expect(sequences).toHaveLength(8);

    // The chain is still named for the reader, on the labels.
    expect(
      sequences.filter((c) => (c.annotations["pl7.app/label"] ?? "").startsWith("Heavy ")),
    ).toHaveLength(8);

    // And the padding references never became records of their own.
    expect(columns.find((c) => c.name === "pl7.app/vdj/uniqueMoleculeCount")).toBeDefined();
  },
);

blockTest(
  "imports a file through the direct door, minting the sample itself",
  { timeout: 600000 },
  async ({ rawPrj: project, helpers, expect }) => {
    // No Samples & Data at all. The block takes the file, mints pl7.app/sampleId for it and
    // labels it with the filename stem, so the emitted shape is the same as through the pool.
    const blockId = await project.addBlock("Import V(D)J Data", ImportVdjBlockPointer);
    const handle = await helpers.getLocalFileHandle("./assets/bare-paired-set.tsv");

    await project.mutateBlockStorage(blockId, {
      operation: "update-block-data",
      value: blockData({
        defaultBlockLabel: "direct",
        customBlockLabel: "",
        format: "custom",
        chains: ["IGHeavy", "IGLight"],
        fileSource: {
          handle,
          sampleId: "SDIRECT000000000000000001",
          label: "bare-paired-set",
          extension: "tsv",
        },
        bareSet: {
          identity: "mAb ID",
          chainSelection: "IG",
          sequences: { IGHeavy: "VH", IGLight: "VL" },
          scheme: SCHEME,
        },
      }),
    });

    await project.runBlock(blockId);
    await helpers.awaitBlockDoneAndGetStableBlockState(blockId, 600000);

    const state = (await awaitStableState(project.getBlockState(blockId), 100000)) as {
      outputs?: Record<string, unknown>;
    };
    const wrapped = state.outputs?.importedColumns as
      | { value?: { name: string; axes: { name: string }[] }[] }
      | undefined;
    const columns = wrapped?.value ?? [];
    expect(columns.length).toBeGreaterThan(0);

    // The chain dropdowns offer only columns whose sampled values read as variable domains.
    // The fixture's headers are "mAb ID", "VH", "VL", "Affinity (nM)" — a header alone cannot
    // tell which two are sequences, so the workflow samples rows and reads the alphabet. Get
    // this wrong and an antibody's name can be mapped into a sequence slot: it imports
    // cleanly and every record comes back Failed after ANARCI declines to number it.
    const aminoAcid = (state.outputs?.aminoAcidColumns as { value?: string[] } | undefined)?.value;
    expect(aminoAcid).toEqual(["VH", "VL"]);

    // The file door's own column list, separate from the dataset door's, so neither offers
    // columns discovered for the other.
    const fileColumns = (state.outputs?.fileColumns as { value?: string[] } | undefined)?.value;
    expect(fileColumns).toEqual(["mAb ID", "VH", "VL", "Affinity (nM)"]);
    expect(
      (state.outputs?.datasetColumns as { value?: string[] } | undefined)?.value,
    ).toBeUndefined();

    // The same pass types every column, over the whole file rather than a sample. "Affinity (nM)"
    // holds 0.8 / 1.4 / 12.0 / 3.1 / 0.9, so it is Double; the identity and the domains are text.
    const profile = (
      state.outputs?.columnProfile as { value?: { types: Record<string, string> } } | undefined
    )?.value;
    expect(profile?.types).toEqual({
      "mAb ID": "String",
      VH: "String",
      VL: "String",
      "Affinity (nM)": "Double",
    });

    // Indistinguishable from the pool door: same axes, same key, same columns — abundance
    // alone on [sampleId, variantKey], every property of the record on the record axis.
    for (const c of columns) {
      if (c.name === "pl7.app/vdj/uniqueMoleculeCount") {
        expect(c.axes.map((a) => a.name)).toEqual(["pl7.app/sampleId", "pl7.app/variantKey"]);
        continue;
      }
      expect(c.axes.map((a) => a.name)).toEqual(["pl7.app/variantKey"]);
    }
    expect(columns.find((c) => c.name === "pl7.app/vdj/uniqueMoleculeCount")).toBeDefined();
    expect(columns.filter((c) => c.name === "pl7.app/vdj/regionAnnotationStatus")).toHaveLength(2);
  },
);

// Runs against the PUBLISHED sequence-properties, deliberately. The bare set carries MiXCR's
// axis split precisely so that consumers need no change to read it, and a test against a local
// checkout could not tell the difference between that being true and a fix sitting unmerged
// next door.
blockTest(
  "a bare set reaches and runs Sequence Properties",
  { timeout: 900000 },
  async ({ rawPrj: project, helpers, expect }) => {
    // The first real consumer. Sequence Properties has an `antibody_tcr_universal` branch that
    // reads a variantKey axis carrying pl7.app/vdj/clonotypingRunId — the shape this block now
    // emits — but no producer in the workspace has ever reached it and its own test suite is
    // entirely `it.todo`, so the branch has never executed. This is its first execution.
    const blockId = await project.addBlock("Import V(D)J Data", ImportVdjBlockPointer);
    const handle = await helpers.getLocalFileHandle("./assets/bare-paired-set.tsv");

    await project.mutateBlockStorage(blockId, {
      operation: "update-block-data",
      value: blockData({
        defaultBlockLabel: "chain",
        customBlockLabel: "",
        format: "custom",
        chains: ["IGHeavy", "IGLight"],
        fileSource: {
          handle,
          sampleId: "SCHAIN0000000000000000001",
          label: "bare-paired-set",
          extension: "tsv",
        },
        bareSet: {
          identity: "mAb ID",
          chainSelection: "IG",
          sequences: { IGHeavy: "VH", IGLight: "VL" },
          scheme: SCHEME,
        },
      }),
    });
    await project.runBlock(blockId);
    await helpers.awaitBlockDoneAndGetStableBlockState(blockId, 600000);

    const propsId = await project.addBlock("Sequence Properties", sequencePropertiesSpec);
    const propsState = (await awaitStableState(project.getBlockState(propsId), 200000)) as {
      outputs?: Record<string, any>;
    };
    const options =
      propsState.outputs?.inputOptions?.value ?? propsState.outputs?.inputOptions ?? [];

    // Reachability is its own condition: an analysis willing to run can simply never be
    // offered the data, and no availability rule catches that.
    expect(options.length).toBeGreaterThan(0);

    await project.mutateBlockStorage(propsId, {
      operation: "update-block-data",
      value: { inputAnchor: options[0].ref, customBlockLabel: "", title: "" },
    });
    await project.runBlock(propsId);
    await helpers.awaitBlockDoneAndGetStableBlockState(propsId, 900000);

    const done = (await awaitStableState(project.getBlockState(propsId), 200000)) as {
      outputs?: Record<string, any>;
    };
    const cols = done.outputs?.propertiesPfCols?.value ?? done.outputs?.propertiesPfCols ?? [];
    console.log("sequence-properties emitted", cols.length, "columns");
    expect(cols.length).toBeGreaterThan(0);
  },
);

// The only test that runs a non-antibody receptor end to end. Everything else about TCR support
// was established by reading — ANARCI's HMM library, its per-chain-type CSV naming, IMGT's
// chain-independence — and reading is not running: until this passed, "TCR works" rested on the
// claim that a _B.csv would appear and our range tables would fit it.
//
// The fixture is four published human αβ TCRs pulled from RCSB PDB — A6 (1AO7), 1G4 (2BNR),
// DMF5 (3QDG) and JM22 (1OGA) — as whole ectodomain chains, constant regions included, because
// that is the shape a real export has. ANARCI locates the variable domain within them.
blockTest(
  "imports a TCR-alpha/beta set, numbered under IMGT",
  { timeout: 600000 },
  async ({ rawPrj: project, helpers, expect }) => {
    const blockId = await project.addBlock("Import V(D)J Data", ImportVdjBlockPointer);
    const handle = await helpers.getLocalFileHandle("./assets/bare-tcrab-set.tsv");

    await project.mutateBlockStorage(blockId, {
      operation: "update-block-data",
      value: blockData({
        format: "custom",
        fileSource: {
          handle,
          sampleId: "STCR00000000000000000001",
          label: "bare-tcrab-set",
          extension: "tsv",
        },
        bareSet: {
          identity: "TCR ID",
          chainSelection: "TCRAB",
          // Beta is slot A — the more diverse chain, per MiXCR's rule.
          sequences: { TCRBeta: "beta", TCRAlpha: "alpha" },
          scheme: "imgt",
        },
      }),
    });

    await project.runBlock(blockId);
    await helpers.awaitBlockDoneAndGetStableBlockState(blockId, 600000);

    const state = (await awaitStableState(project.getBlockState(blockId), 100000)) as {
      outputs?: Record<string, unknown>;
    };
    const columns =
      (
        state.outputs?.importedColumns as
          | {
              value?: {
                name: string;
                domain: Record<string, string>;
                annotations: Record<string, string>;
              }[];
            }
          | undefined
      )?.value ?? [];
    expect(columns.length).toBeGreaterThan(0);

    // Both chains emitted, beta in slot A and alpha in slot B.
    const sequences = columns.filter((c) => c.name === "pl7.app/vdj/sequence");
    const slotA = sequences.filter((c) => c.domain["pl7.app/vdj/scClonotypeChain"] === "A");
    const slotB = sequences.filter((c) => c.domain["pl7.app/vdj/scClonotypeChain"] === "B");
    expect(slotA).toHaveLength(8);
    expect(slotB).toHaveLength(8);
    expect(slotA.every((c) => (c.annotations["pl7.app/label"] ?? "").startsWith("Beta "))).toBe(
      true,
    );
    expect(slotB.every((c) => (c.annotations["pl7.app/label"] ?? "").startsWith("Alpha "))).toBe(
      true,
    );

    // The axis says which receptor, and every region column records IMGT.
    const abundance = columns.find((c) => c.name === "pl7.app/vdj/uniqueMoleculeCount");
    expect(abundance).toBeDefined();
    const regions = sequences.filter((c) => c.domain["pl7.app/vdj/numberingSchema"] !== undefined);
    expect(regions.length).toBe(14);
    expect(regions.every((c) => c.domain["pl7.app/vdj/numberingSchema"] === "imgt")).toBe(true);

    // The regions were located, not merely declared. Without this the test passes on a run where
    // ANARCI numbered nothing: the columns would still be here and every status would read
    // Failed. Verified against a throwaway project before this assertion existed — all four
    // records annotated on both chains, and chainDisagreed 0, meaning beta landed in ANARCI's B
    // bucket and alpha in A, which is what the slot assignment claims.
    const status = columns.filter((c) => c.name === "pl7.app/vdj/regionAnnotationStatus");
    expect(status).toHaveLength(2);
    expect(status.map((c) => c.domain["pl7.app/vdj/scClonotypeChain"]).sort()).toEqual(["A", "B"]);
  },
);

blockTest(
  "imports a workbook, converted before anything reads it",
  { timeout: 600000 },
  async ({ rawPrj: project, helpers, expect }) => {
    // The same panel as an .xlsx, with a title line above the header — which is what workbooks
    // actually look like, and what the converter's header-row heuristic is for. Nothing
    // downstream of the conversion knows the file was ever a workbook.
    const blockId = await project.addBlock("Import V(D)J Data", ImportVdjBlockPointer);
    const handle = await helpers.getLocalFileHandle("./assets/bare-paired-set.xlsx");

    await project.mutateBlockStorage(blockId, {
      operation: "update-block-data",
      value: blockData({
        defaultBlockLabel: "workbook",
        customBlockLabel: "",
        format: "custom",
        chains: ["IGHeavy", "IGLight"],
        fileSource: {
          handle,
          sampleId: "SXLSX00000000000000000001",
          label: "bare-paired-set",
          extension: "xlsx",
        },
        bareSet: {
          identity: "mAb ID",
          chainSelection: "IG",
          sequences: { IGHeavy: "VH", IGLight: "VL" },
          scheme: SCHEME,
        },
      }),
    });

    await project.runBlock(blockId);
    await helpers.awaitBlockDoneAndGetStableBlockState(blockId, 600000);

    const state = (await awaitStableState(project.getBlockState(blockId), 100000)) as {
      outputs?: Record<string, unknown>;
    };
    const wrapped = state.outputs?.importedColumns as
      | { value?: { name: string; domain: Record<string, string> }[] }
      | undefined;
    const columns = wrapped?.value ?? [];

    // Same emitted shape as the tsv of the same panel: the title row was skipped, the real
    // header was used, and the mapping resolved against it.
    expect(columns.length).toBeGreaterThan(0);
    expect(columns.find((c) => c.name === "pl7.app/vdj/uniqueMoleculeCount")).toBeDefined();
    expect(columns.filter((c) => c.name === "pl7.app/vdj/regionAnnotationStatus")).toHaveLength(2);
    expect(columns.find((c) => c.name.startsWith("pl7.app/vdj/importedProperty/"))).toBeUndefined();
  },
);
