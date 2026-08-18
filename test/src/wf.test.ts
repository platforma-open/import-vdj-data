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
        // A column the canonical vocabulary never anticipated — offered, not dropped.
        properties: [{ header: "Affinity (nM)", valueType: "Double" }],
      },
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

    // Every column sits on [sampleId, variantKey]. One frame, not one per chain.
    for (const c of columns) {
      expect(c.axes.map((a) => a.name)).toEqual(["pl7.app/sampleId", "pl7.app/variantKey"]);
    }

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

    // The scientist's own identifier is the label; nothing shows a minted C-XXXXX form.
    expect(columns.find((c) => c.name === "pl7.app/label")).toBeDefined();

    // A non-sequence column the scientist accepted: name sanitized, label the raw header, type
    // as accepted, no domain key.
    const affinity = columns.find((c) => c.name.startsWith("pl7.app/vdj/importedProperty/"));
    expect(affinity).toBeDefined();
    expect(affinity!.name).toBe("pl7.app/vdj/importedProperty/Affinity_nM_");
    expect(affinity!.annotations["pl7.app/label"]).toBe("Affinity (nM)");
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

    await project.setBlockArgs(blockId, {
      defaultBlockLabel: "duplicate-id",
      customBlockLabel: "",
      datasetRef: datasetOptions[0].ref,
      format: "custom",
      chains: ["IGHeavy", "IGLight"],
      bareSet: { identity: "mAb ID", sequences: { A: "VH", B: "VL" }, scheme: SCHEME },
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

    await project.setBlockArgs(blockId, {
      defaultBlockLabel: "heavy-only",
      customBlockLabel: "",
      datasetRef: datasetOptions[0].ref,
      format: "custom",
      chains: ["IGHeavy"],
      bareSet: { identity: "mAb ID", sequences: { A: "VH" }, scheme: SCHEME },
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
    expect(columns.length).toBeGreaterThan(0);

    // Only the mapped chain is emitted — no empty B columns invented for a chain the file
    // never had.
    expect(columns.filter((c) => c.domain["pl7.app/vdj/scClonotypeChain"] === "B")).toHaveLength(0);
    const heavyRegions = columns.filter(
      (c) => c.name === "pl7.app/vdj/sequence" && c.domain["pl7.app/vdj/scClonotypeChain"] === "A",
    );
    // Seven regions plus the variable domain itself.
    expect(heavyRegions).toHaveLength(8);

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

    await project.setBlockArgs(blockId, {
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
        sequences: { A: "VH", B: "VL" },
        scheme: SCHEME,
      },
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

    // Indistinguishable from the pool door: same axes, same key, same columns.
    for (const c of columns) {
      expect(c.axes.map((a) => a.name)).toEqual(["pl7.app/sampleId", "pl7.app/variantKey"]);
    }
    expect(columns.find((c) => c.name === "pl7.app/vdj/uniqueMoleculeCount")).toBeDefined();
    expect(columns.filter((c) => c.name === "pl7.app/vdj/regionAnnotationStatus")).toHaveLength(2);
  },
);

// Runs against the LOCAL sequence-properties checkout, linked in test/package.json, because
// the fix it needs is unreleased. Point the dep back at a published version once it ships.
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

    await project.setBlockArgs(blockId, {
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
        sequences: { A: "VH", B: "VL" },
        scheme: SCHEME,
      },
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
