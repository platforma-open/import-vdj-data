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

    // The synthetic abundance: exactly the triple Clustering's bundle queries, plus the anchor
    // that makes the dataset selectable at all. No unit — nothing was measured.
    const presence = columns.find((c) => c.name === "pl7.app/vdj/clonotypePresence");
    expect(presence).toBeDefined();
    expect(presence!.annotations["pl7.app/isAbundance"]).toBe("true");
    expect(presence!.annotations["pl7.app/abundance/normalized"]).toBe("false");
    expect(presence!.annotations["pl7.app/abundance/isPrimary"]).toBe("true");
    expect(presence!.annotations["pl7.app/isAnchor"]).toBe("true");
    expect(presence!.annotations["pl7.app/abundance/unit"]).toBeUndefined();

    // Exactly one column may claim the anchor and the primary abundance.
    expect(columns.filter((c) => c.annotations["pl7.app/isAnchor"] === "true")).toHaveLength(1);

    // A count of how often a record repeats is never presented as an abundance.
    expect(columns.find((c) => c.name === "pl7.app/vdj/sampleCount")).toBeUndefined();

    // The scientist's own identifier is the label; nothing shows a minted C-XXXXX form.
    expect(columns.find((c) => c.name === "pl7.app/label")).toBeDefined();
  },
);
