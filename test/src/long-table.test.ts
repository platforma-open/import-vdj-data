/*
  Long tables: Samples & Data's "Multisample CSV/TSV" datasets, several samples per file told apart
  by one column. The workflow splits them into one file per sample before the peptide and V(D)J
  format paths (not bare sets, which the UI loads from one file), so each path must give the
  per-sample results of the same rows in files of one sample each.

  Fixtures are the per-sample ones of the other tests with a sample column added
  (test/assets/*-long*.tsv).
*/

import type { PeptideCheck } from "@platforma-open/milaboratories.import-vdj.model";
import { datasetCheckKey, peptideCheckKey } from "@platforma-open/milaboratories.import-vdj.model";
import { SamplesAndDataBlockPointer } from "@platforma-open/milaboratories.samples-and-data";
import type { PlRef, PTableHandle } from "@platforma-sdk/model";
import { createPlDataTableStateV2, uniquePlId } from "@platforma-sdk/model";
import { awaitStableState, blockTest } from "@platforma-sdk/test";
import { ImportVdjBlockPointer } from "this-block";

type Emitted = { name: string; axes: { name: string }[] };

type Project = {
  addBlock(label: string, pointer: unknown): Promise<string>;
  mutateBlockStorage(blockId: string, op: unknown): Promise<unknown>;
  runBlock(blockId: string): Promise<void>;
  getBlockState(blockId: string): Parameters<typeof awaitStableState>[0];
};
type Helpers = {
  getLocalFileHandle(path: string): Promise<unknown>;
  awaitBlockDoneAndGetStableBlockState(blockId: string, timeout: number): Promise<unknown>;
};
type Driver = {
  getSpec(handle: PTableHandle): Promise<{ type: string; spec: { name: string } }[]>;
  getData(handle: PTableHandle, columns: number[]): Promise<{ data: unknown }[]>;
};

/** Output values arrive wrapped as { ok, value, stable }. */
function unwrap<T>(raw: unknown): T | undefined {
  if (raw !== null && typeof raw === "object" && "value" in raw) return (raw as { value: T }).value;
  return raw as T | undefined;
}

async function stableOutputs(project: Project, blockId: string): Promise<Record<string, unknown>> {
  const state = (await awaitStableState(project.getBlockState(blockId), 200000)) as {
    outputs?: Record<string, unknown>;
  };
  return state.outputs ?? {};
}

/**
 * One S&D long-table dataset: each file (asset path) with the values of its sample column, one
 * S&D sample per value. Returns the sample ids by value.
 */
async function longTableDataset(
  project: Project,
  helpers: Helpers,
  files: { path: string; samples: string[] }[],
  sampleColumnName: string,
): Promise<Record<string, string>> {
  const sndBlockId = await project.addBlock("Samples & Data", SamplesAndDataBlockPointer);
  const ids: Record<string, string> = {};
  const data: Record<string, unknown> = {};
  const sampleGroups: Record<string, Record<string, string>> = {};
  const groupLabels: Record<string, string> = {};
  for (const [i, { path, samples }] of files.entries()) {
    const groupId = uniquePlId();
    data[groupId] = await helpers.getLocalFileHandle(path);
    groupLabels[groupId] = `file${i + 1}`;
    sampleGroups[groupId] = {};
    for (const value of samples) {
      ids[value] = uniquePlId();
      sampleGroups[groupId][ids[value]] = value;
    }
  }
  await project.mutateBlockStorage(sndBlockId, {
    operation: "update-block-data",
    value: {
      suggestedImport: false,
      h5adFilesToPreprocess: [],
      seuratFilesToPreprocess: [],
      xsvFilesToPreprocess: [],
      metadata: [],
      sampleIds: Object.values(ids),
      sampleLabelColumnLabel: "Sample Name",
      sampleLabels: Object.fromEntries(Object.entries(ids).map(([value, id]) => [id, value])),
      datasets: [
        {
          id: uniquePlId(),
          label: "Long table",
          content: {
            type: "MultiSampleXsv",
            xsvType: "tsv",
            sampleColumnName,
            gzipped: false,
            data,
            sampleGroups,
            groupLabels,
          },
        },
      ],
    },
  });
  await project.runBlock(sndBlockId);
  await helpers.awaitBlockDoneAndGetStableBlockState(sndBlockId, 200000);
  return ids;
}

/** Adds this block and returns the dataset it offers: the long table must be among them. */
async function addImport(project: Project): Promise<{ blockId: string; datasetRef: PlRef }> {
  const blockId = await project.addBlock("Import V(D)J Data", ImportVdjBlockPointer);
  const options = unwrap<{ ref: PlRef }[]>((await stableOutputs(project, blockId)).datasetOptions);
  if (options === undefined || options.length === 0) throw new Error("long table not offered");
  return { blockId, datasetRef: options[0].ref };
}

const viewState = {
  subtitleLabel: "Long table",
  customBlockLabel: "",
  tableState: createPlDataTableStateV2(),
  settingsOpen: true,
};

/** A stats column's value per sample id; the table repeats per-sample stats on each chain's row. */
async function statBySample(
  project: Project,
  blockId: string,
  driver: Driver,
  name: string,
): Promise<Record<string, number>> {
  const handle = unwrap<{ fullTableHandle?: PTableHandle }>(
    (await stableOutputs(project, blockId)).stats,
  )?.fullTableHandle;
  if (handle === undefined) throw new Error("no stats table");
  const specs = await driver.getSpec(handle);
  const sampleIndex = specs.findIndex(
    (s) => s.type === "axis" && s.spec.name === "pl7.app/sampleId",
  );
  const index = specs.findIndex((s) => s.type === "column" && s.spec.name === name);
  if (sampleIndex < 0 || index < 0) throw new Error(`${name} missing: ${sampleIndex} ${index}`);
  const [samples, values] = await driver.getData(handle, [sampleIndex, index]);
  const sampleIds = Array.from(samples.data as ArrayLike<string>, String);
  const numbers = Array.from(values.data as ArrayLike<number | bigint>, Number);
  return Object.fromEntries(sampleIds.map((id, row) => [id, numbers[row]]));
}

blockTest(
  "imports a peptide long table as the per-sample tables it holds",
  { timeout: 900000 },
  async ({ rawPrj: project, helpers, expect, ml }) => {
    // File 1 holds S1 and S2 (and a row with no sample value), file 2 holds S3.
    const ids = await longTableDataset(
      project,
      helpers,
      [
        { path: "./assets/peptide-nt-umi-long-a.tsv", samples: ["S1", "S2"] },
        { path: "./assets/peptide-nt-umi-long-b.tsv", samples: ["S3"] },
      ],
      "Sample",
    );
    const { blockId, datasetRef } = await addImport(project);
    const peptide = {
      aminoAcid: "Peptide aa",
      nucleotide: "Peptide nt",
      counts: { uniqueMolecules: "Unique UMIs", reads: "Reads" },
    };
    const data = {
      ...viewState,
      chains: [],
      datasetRef,
      format: "peptide-custom",
      peptide,
      primaryCountType: "umi",
    };
    await project.mutateBlockStorage(blockId, { operation: "update-block-data", value: data });

    // The files are checked before the split: they fit the mapping, and the panels are told which
    // column is the sample column.
    const outputs = await stableOutputs(project, blockId);
    expect(unwrap<string>(outputs.sampleColumn)).toBe("Sample");
    const check = unwrap<PeptideCheck>(outputs.peptideCheck);
    expect(check?.key).toBe(peptideCheckKey(datasetRef, peptide));
    expect(check?.problems).toEqual([]);

    await project.mutateBlockStorage(blockId, {
      operation: "update-block-data",
      value: { ...data, prerunCheck: { check: "peptide", subject: check!.key, problems: [] } },
    });
    await project.runBlock(blockId);
    await helpers.awaitBlockDoneAndGetStableBlockState(blockId, 600000);

    const columns = unwrap<Emitted[]>((await stableOutputs(project, blockId)).importedColumns);
    expect(
      columns?.find((c) => c.name === "pl7.app/uniqueMoleculeCount")?.axes.map((a) => a.name),
    ).toEqual(["pl7.app/sampleId", "pl7.app/variantKey"]);

    // The per-sample tables' stats (see peptide.test.ts); the row without a sample is in none.
    const driver = ml.driverKit.pFrameDriver as Driver;
    const stat = (name: string) =>
      statBySample(project, blockId, driver, `pl7.app/peptide/stat/${name}`);
    expect(await stat("recordCount")).toEqual({ [ids.S1]: 7, [ids.S2]: 3, [ids.S3]: 3 });
    expect(await stat("peptideCount")).toEqual({ [ids.S1]: 2, [ids.S2]: 3, [ids.S3]: 3 });
    expect(await stat("rowsMerged")).toEqual({ [ids.S1]: 1, [ids.S2]: 0, [ids.S3]: 0 });
  },
);

blockTest(
  "imports a MiXCR long table as one repertoire per sample",
  { timeout: 900000 },
  async ({ rawPrj: project, helpers, expect, ml }) => {
    const ids = await longTableDataset(
      project,
      helpers,
      [{ path: "./assets/mixcr-clones-long.tsv", samples: ["SA", "SB"] }],
      "sample",
    );
    const { blockId, datasetRef } = await addImport(project);
    await project.mutateBlockStorage(blockId, {
      operation: "update-block-data",
      value: {
        ...viewState,
        datasetRef,
        format: "mixcr",
        chains: ["IGHeavy"],
        primaryCountType: "read",
        // The dataset door's verdict, which a UI watcher would mirror in.
        prerunCheck: {
          check: "dataset",
          subject: datasetCheckKey({ datasetRef, format: "mixcr" })!,
          columnsPresent: true,
        },
      },
    });
    await project.runBlock(blockId);
    await helpers.awaitBlockDoneAndGetStableBlockState(blockId, 600000);

    // The first three clones are SA's, the other two SB's.
    const driver = ml.driverKit.pFrameDriver as Driver;
    expect(await statBySample(project, blockId, driver, "pl7.app/vdj/stat/recordCount")).toEqual({
      [ids.SA]: 3,
      [ids.SB]: 2,
    });
  },
);
