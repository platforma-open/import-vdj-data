/*
  End-to-end test of the peptide import path: Samples & Data (one table per sample) -> this block
  with `format: "peptide-custom"`.

  Asserts the contract that lets peptide blocks read an import as they read a Peptide Profiling
  dataset: the variantKey axis with the peptide run-id domain, the primary abundance on
  [sampleId, variantKey], everything else on [variantKey] alone, and the per-sample import stats.

  Fixtures are synthetic (test/assets/peptide-*): made-up 7-mers, nt encoded with one codon per
  residue. Every table has an amino-acid column; the nt one, when present, is the peptide key.
*/

import type { PeptideCheck, PeptideMapping } from "@platforma-open/milaboratories.import-vdj.model";
import { peptideCheckKey } from "@platforma-open/milaboratories.import-vdj.model";
import { SamplesAndDataBlockPointer } from "@platforma-open/milaboratories.samples-and-data";
import type { PlRef, PTableHandle } from "@platforma-sdk/model";
import { createPlDataTableStateV2, uniquePlId } from "@platforma-sdk/model";
import { awaitStableState, blockTest } from "@platforma-sdk/test";
import { ImportVdjBlockPointer } from "this-block";

type Emitted = {
  name: string;
  valueType: string;
  domain: Record<string, string>;
  annotations: Record<string, string>;
  axes: { name: string; domain: Record<string, string> }[];
};

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

/** One S&D dataset of `files` (sample label -> asset path), one sample per file. */
async function samplesAndData(
  project: Project,
  helpers: Helpers,
  files: Record<string, string>,
  xsvType: "tsv" | "csv",
  gzipped = false,
): Promise<Record<string, string>> {
  const sndBlockId = await project.addBlock("Samples & Data", SamplesAndDataBlockPointer);
  const ids: Record<string, string> = {};
  const data: Record<string, unknown> = {};
  for (const [label, path] of Object.entries(files)) {
    ids[label] = uniquePlId();
    data[ids[label]] = await helpers.getLocalFileHandle(path);
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
      sampleLabels: Object.fromEntries(Object.entries(ids).map(([label, id]) => [id, label])),
      datasets: [
        { id: uniquePlId(), label: "Peptides", content: { type: "Xsv", xsvType, gzipped, data } },
      ],
    },
  });
  await project.runBlock(sndBlockId);
  await helpers.awaitBlockDoneAndGetStableBlockState(sndBlockId, 200000);
  return ids;
}

/**
 * One S&D "tagged CSV/TSV" dataset: several tables per sample, told apart by a `part` tag
 * (sample label -> its tables). Returns the sample ids by label.
 */
async function taggedSamplesAndData(
  project: Project,
  helpers: Helpers,
  files: Record<string, { part: string; path: string }[]>,
): Promise<Record<string, string>> {
  const sndBlockId = await project.addBlock("Samples & Data", SamplesAndDataBlockPointer);
  const ids: Record<string, string> = {};
  const data: Record<string, { tags: Record<string, string>; file: unknown }[]> = {};
  for (const [label, tables] of Object.entries(files)) {
    ids[label] = uniquePlId();
    data[ids[label]] = [];
    for (const { part, path } of tables) {
      data[ids[label]].push({ tags: { part }, file: await helpers.getLocalFileHandle(path) });
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
      sampleLabels: Object.fromEntries(Object.entries(ids).map(([label, id]) => [id, label])),
      datasets: [
        {
          id: uniquePlId(),
          label: "Peptides",
          content: { type: "TaggedXsv", xsvType: "tsv", tags: ["part"], data },
        },
      ],
    },
  });
  await project.runBlock(sndBlockId);
  await helpers.awaitBlockDoneAndGetStableBlockState(sndBlockId, 200000);
  return ids;
}

/**
 * Adds this block, picks the dataset and sets the peptide mapping; returns its stable outputs and
 * the data it set.
 */
async function setUpImport(
  project: Project,
  peptide: PeptideMapping,
  primaryCountType?: "read" | "umi",
): Promise<{
  blockId: string;
  outputs: Record<string, unknown>;
  data: Record<string, unknown>;
  datasetRef: PlRef;
  peptide: PeptideMapping;
}> {
  const blockId = await project.addBlock("Import V(D)J Data", ImportVdjBlockPointer);
  const before = (await awaitStableState(project.getBlockState(blockId), 100000)) as {
    outputs?: Record<string, unknown>;
  };
  const options = unwrap<{ ref: PlRef }[]>(before.outputs?.datasetOptions) ?? [];
  if (options.length === 0) throw new Error("no dataset offered");
  const datasetRef = options[0].ref;

  const data = {
    subtitleLabel: "Peptides",
    customBlockLabel: "",
    chains: [],
    tableState: createPlDataTableStateV2(),
    settingsOpen: true,
    datasetRef,
    format: "peptide-custom",
    peptide,
    ...(primaryCountType === undefined ? {} : { primaryCountType }),
  };
  await project.mutateBlockStorage(blockId, { operation: "update-block-data", value: data });
  const after = (await awaitStableState(project.getBlockState(blockId), 200000)) as {
    outputs?: Record<string, unknown>;
  };
  return { blockId, outputs: after.outputs ?? {}, data, datasetRef, peptide };
}

/**
 * Carries prerun's peptide check into `data`, as the UI watcher does (`ui/src/app.ts`); nothing in
 * a headless run does it. The check must be about the dataset and mapping set, or Run stays
 * disabled.
 */
async function acceptPeptideCheck(
  project: Project,
  setUp: Awaited<ReturnType<typeof setUpImport>>,
): Promise<PeptideCheck> {
  const check = unwrap<PeptideCheck>(setUp.outputs.peptideCheck);
  if (check === undefined) throw new Error("prerun produced no peptide check");
  if (check.key !== peptideCheckKey(setUp.datasetRef, setUp.peptide)) {
    throw new Error(`peptide check is about ${check.key}, not the mapping set`);
  }
  await project.mutateBlockStorage(setUp.blockId, {
    operation: "update-block-data",
    value: {
      ...setUp.data,
      prerunCheck: {
        check: "peptide",
        subject: check.key,
        problems: check.problems,
      },
    },
  });
  await awaitStableState(project.getBlockState(setUp.blockId), 100000);
  return check;
}

/** Sets the import up as above and runs it. */
async function importPeptides(
  project: Project,
  helpers: Helpers,
  peptide: PeptideMapping,
  primaryCountType?: "read" | "umi",
): Promise<{
  blockId: string;
  columns: Emitted[];
  stats: Emitted[];
  outputs: Record<string, unknown>;
}> {
  const setUp = await setUpImport(project, peptide, primaryCountType);
  const check = await acceptPeptideCheck(project, setUp);
  if (check.problems.length > 0) throw new Error(`refused: ${check.problems.join("; ")}`);
  const { blockId } = setUp;
  await project.runBlock(blockId);
  await helpers.awaitBlockDoneAndGetStableBlockState(blockId, 600000);

  const state = (await awaitStableState(project.getBlockState(blockId), 100000)) as {
    outputs?: Record<string, unknown>;
  };
  return {
    blockId,
    columns: unwrap<Emitted[]>(state.outputs?.importedColumns) ?? [],
    stats: unwrap<Emitted[]>(state.outputs?.statColumns) ?? [],
    outputs: state.outputs ?? {},
  };
}

const STAT_NAMES = [
  "peptideCount",
  "recordCount",
  "recordsWithoutSequence",
  "recordsWithoutCount",
  "rowsMerged",
] as const;

/** Peptides dropped by rule; the trailing-nucleotide count exists for nucleotide input only. */
const NT_DROP_NAMES = [
  "peptidesWithTrailingNucleotides",
  "peptidesWithEarlyStopCodon",
  "peptidesTooShort",
] as const;

/** Mean peptide lengths; the nucleotide one exists for nucleotide input only. */
const NT_LENGTH_NAMES = ["avgLengthAa", "avgLengthNt"] as const;

/** The import stats per sample id, read from the block's stats table. */
async function statsBySample(
  project: Project,
  blockId: string,
  driver: Driver,
  names: readonly string[] = STAT_NAMES,
): Promise<Record<string, Record<string, number>>> {
  const state = (await awaitStableState(project.getBlockState(blockId), 100000)) as {
    outputs?: Record<string, unknown>;
  };
  const handle = unwrap<{ fullTableHandle?: PTableHandle }>(state.outputs?.stats)?.fullTableHandle;
  if (handle === undefined) throw new Error("no stats table");
  const specs = await driver.getSpec(handle);
  const sampleIndex = specs.findIndex(
    (s) => s.type === "axis" && s.spec.name === "pl7.app/sampleId",
  );
  const indices = names.map((n) =>
    specs.findIndex((s) => s.type === "column" && s.spec.name === `pl7.app/peptide/stat/${n}`),
  );
  if (sampleIndex < 0 || indices.some((i) => i < 0)) {
    throw new Error(`stats missing: ${sampleIndex} ${indices}`);
  }
  const data = await driver.getData(handle, [sampleIndex, ...indices]);
  const samples = Array.from(data[0].data as ArrayLike<string>, String);
  const result: Record<string, Record<string, number>> = {};
  samples.forEach((sample, row) => {
    result[sample] = Object.fromEntries(
      names.map((n, i) => [n, Number((data[i + 1].data as ArrayLike<number | bigint>)[row])]),
    );
  });
  return result;
}

const find = (columns: Emitted[], name: string, alphabet?: string) =>
  columns.find(
    (c) => c.name === name && (alphabet === undefined || c.domain["pl7.app/alphabet"] === alphabet),
  );

blockTest(
  "imports nt peptide tables with unique UMIs and reads in Peptide Profiling's shape",
  { timeout: 900000 },
  async ({ rawPrj: project, helpers, expect, ml }) => {
    const ids = await samplesAndData(
      project,
      helpers,
      {
        S1: "./assets/peptide-nt-umi-s1.tsv",
        S2: "./assets/peptide-nt-umi-s2.tsv",
        S3: "./assets/peptide-nt-umi-s3.tsv",
      },
      "tsv",
    );
    const { blockId, columns, stats } = await importPeptides(
      project,
      helpers,
      {
        aminoAcid: "Peptide aa",
        nucleotide: "Peptide nt",
        counts: { uniqueMolecules: "Unique UMIs", reads: "Reads" },
      },
      "umi",
    );
    expect(columns.length).toBeGreaterThan(0);

    // Peptide consumers detect peptide data by this axis and domain, not by the column names.
    const keyAxis = columns[0].axes[columns[0].axes.length - 1];
    expect(keyAxis.name).toBe("pl7.app/variantKey");
    expect(keyAxis.domain["pl7.app/peptide/extractionRunId"]).toBe(blockId);
    expect(keyAxis.domain["pl7.app/vdj/clonotypingRunId"]).toBeUndefined();

    // Counts and fractions on [sampleId, variantKey]; everything else on [variantKey] alone.
    const perSample = [
      "pl7.app/uniqueMoleculeCount",
      "pl7.app/uniqueMoleculeFraction",
      "pl7.app/readCount",
      "pl7.app/readFraction",
    ];
    for (const c of columns) {
      const axes = c.axes.map((a) => a.name);
      if (perSample.includes(c.name)) {
        expect(axes, c.name).toEqual(["pl7.app/sampleId", "pl7.app/variantKey"]);
      } else {
        expect(axes, c.name).toEqual(["pl7.app/variantKey"]);
      }
    }

    // UMIs, chosen as the primary count, are the primary abundance and the only anchor.
    const umi = find(columns, "pl7.app/uniqueMoleculeCount");
    expect(umi?.annotations["pl7.app/abundance/isPrimary"]).toBe("true");
    expect(umi?.annotations["pl7.app/abundance/normalized"]).toBe("false");
    expect(columns.filter((c) => c.annotations["pl7.app/isAnchor"] === "true")).toHaveLength(1);
    expect(find(columns, "pl7.app/readCount")?.annotations["pl7.app/abundance/isPrimary"]).toBe(
      undefined,
    );

    // Sequences and lengths of both alphabets, the UMI aggregates, the label and the QC flags.
    for (const alphabet of ["nucleotide", "aminoacid"]) {
      expect(find(columns, "pl7.app/sequence", alphabet), alphabet).toBeDefined();
      expect(find(columns, "pl7.app/sequenceLength", alphabet), alphabet).toBeDefined();
      expect(find(columns, "pl7.app/sequence", alphabet)?.domain["pl7.app/feature"]).toBe(
        "peptide",
      );
    }
    for (const name of [
      "pl7.app/uniqueMoleculeCountTotal",
      "pl7.app/uniqueMoleculeFractionMean",
      "pl7.app/sampleCount",
      "pl7.app/label",
      "pl7.app/peptide/qc/hasTrailingNucleotides",
      "pl7.app/peptide/qc/hasEarlyStopCodon",
    ]) {
      expect(find(columns, name), name).toBeDefined();
    }
    expect(find(columns, "pl7.app/readCountTotal")).toBeUndefined();

    // Stats per sample: S1 reads 7 rows, drops one without a sequence and one with zero UMIs,
    // merges one lower-case repeat, drops a peptide with trailing nucleotides (GDLKRYF, 23 nt) and
    // one with a stop codon (SPTQ*LA), and keeps 2 peptides, both 7 aa (21 nt).
    // Total Reads: the reads of the rows kept before the drops, 1000 + 500 + 150 + 40 in S1.
    const names = [...STAT_NAMES, ...NT_DROP_NAMES, ...NT_LENGTH_NAMES, "totalReads"];
    expect(stats.map((s) => s.name).sort()).toEqual(
      names.map((n) => `pl7.app/peptide/stat/${n}`).sort(),
    );
    const bySample = await statsBySample(
      project,
      blockId,
      ml.driverKit.pFrameDriver as Driver,
      names,
    );
    expect(bySample[ids.S1]).toEqual({
      peptideCount: 2,
      recordCount: 7,
      recordsWithoutSequence: 1,
      recordsWithoutCount: 1,
      rowsMerged: 1,
      peptidesWithTrailingNucleotides: 1,
      peptidesWithEarlyStopCodon: 1,
      peptidesTooShort: 0,
      avgLengthAa: 7,
      avgLengthNt: 21,
      totalReads: 1690,
    });
    expect(bySample[ids.S2]).toEqual({
      peptideCount: 3,
      recordCount: 3,
      recordsWithoutSequence: 0,
      recordsWithoutCount: 0,
      rowsMerged: 0,
      peptidesWithTrailingNucleotides: 0,
      peptidesWithEarlyStopCodon: 0,
      peptidesTooShort: 0,
      avgLengthAa: 7,
      avgLengthNt: 21,
      totalReads: 1180,
    });
  },
);

blockTest(
  "imports aa-only peptide tables with reads as the primary abundance",
  { timeout: 900000 },
  async ({ rawPrj: project, helpers, expect, ml }) => {
    const ids = await samplesAndData(
      project,
      helpers,
      { S1: "./assets/peptide-aa-reads-s1.csv", S2: "./assets/peptide-aa-reads-s2.csv" },
      "csv",
    );
    const { blockId, columns } = await importPeptides(project, helpers, {
      aminoAcid: "Peptide",
      counts: { reads: "Count" },
    });

    const reads = find(columns, "pl7.app/readCount");
    expect(reads?.annotations["pl7.app/abundance/isPrimary"]).toBe("true");
    expect(reads?.annotations["pl7.app/isAnchor"]).toBe("true");
    expect(find(columns, "pl7.app/uniqueMoleculeCount")).toBeUndefined();
    expect(find(columns, "pl7.app/readCountTotal")).toBeDefined();

    // aa input: the aa sequence and its length, nothing nucleotide, no QC flags.
    expect(find(columns, "pl7.app/sequence", "aminoacid")).toBeDefined();
    expect(find(columns, "pl7.app/sequenceLength", "aminoacid")).toBeDefined();
    expect(find(columns, "pl7.app/sequence", "nucleotide")).toBeUndefined();
    expect(columns.find((c) => c.name.startsWith("pl7.app/peptide/qc/"))).toBeUndefined();

    // "120.0" reads as 120; the lower-case repeat is merged.
    const bySample = await statsBySample(project, blockId, ml.driverKit.pFrameDriver as Driver);
    expect(bySample[ids.S1]).toEqual({
      peptideCount: 3,
      recordCount: 4,
      recordsWithoutSequence: 0,
      recordsWithoutCount: 0,
      rowsMerged: 1,
    });
  },
);

blockTest(
  "profiles a Peptide Profiling export, checks the mapping before Run, and imports it",
  { timeout: 900000 },
  async ({ rawPrj: project, helpers, expect }) => {
    await samplesAndData(
      project,
      helpers,
      { S1: "./assets/peptide-pp-export-s1.csv", S2: "./assets/peptide-pp-export-s2.csv" },
      "csv",
    );
    const peptide: PeptideMapping = {
      aminoAcid: "Peptide aa",
      nucleotide: "Peptide ID",
      counts: { reads: "Number of Reads" },
    };
    const { outputs } = await setUpImport(project, peptide);

    // With the peptide threshold, the profile counts 7-mers as sequences.
    const profile = unwrap<{
      aminoAcid: string[];
      nucleotide: string[];
      wholeNumber: string[];
      headersBySample: Record<string, string[]>;
    }>(outputs.datasetProfile);
    expect(profile?.nucleotide).toContain("Peptide ID");
    expect(profile?.aminoAcid).toContain("Peptide aa");
    expect(profile?.wholeNumber).toContain("Number of Reads");
    expect(Object.keys(profile?.headersBySample ?? {})).toHaveLength(2);

    // The files fit the mapping.
    const check = unwrap<PeptideCheck>(outputs.peptideCheck);
    expect(check?.problems).toEqual([]);

    const { columns } = await importPeptides(project, helpers, peptide);
    expect(find(columns, "pl7.app/readFraction")?.annotations["pl7.app/abundance/isPrimary"]).toBe(
      "true",
    );
  },
);

blockTest(
  "flags a non-integer count before Run",
  { timeout: 900000 },
  async ({ rawPrj: project, helpers, expect }) => {
    await samplesAndData(project, helpers, { S1: "./assets/peptide-aa-reads-decimal.csv" }, "csv");
    const setUp = await setUpImport(project, {
      aminoAcid: "Peptide",
      counts: { reads: "Count" },
    });
    const check = await acceptPeptideCheck(project, setUp);
    expect(check.problems).toEqual([
      'Number of Reads ("Count") has values that are not whole numbers in S1',
    ]);
  },
);

blockTest(
  "imports gzipped tables as it imports plain ones",
  { timeout: 900000 },
  async ({ rawPrj: project, helpers, expect, ml }) => {
    const ids = await samplesAndData(
      project,
      helpers,
      { S1: "./assets/peptide-nt-umi-s1.tsv.gz", S2: "./assets/peptide-nt-umi-s2.tsv.gz" },
      "tsv",
      true,
    );
    const { blockId, outputs } = await importPeptides(
      project,
      helpers,
      {
        aminoAcid: "Peptide aa",
        nucleotide: "Peptide nt",
        counts: { uniqueMolecules: "Unique UMIs", reads: "Reads" },
      },
      "umi",
    );

    // The profile reads the files through gzip: the first file's columns, every file's header.
    const profile = unwrap<{ headers: string[]; headersBySample: Record<string, string[]> }>(
      outputs.datasetProfile,
    );
    expect(profile?.headers).toEqual(["Peptide nt", "Peptide aa", "Unique UMIs", "Reads"]);
    expect(Object.keys(profile?.headersBySample ?? {})).toHaveLength(2);

    // The same counts as the plain S1 table gives in the first test.
    const bySample = await statsBySample(project, blockId, ml.driverKit.pFrameDriver as Driver);
    expect(bySample[ids.S1]).toEqual({
      peptideCount: 2,
      recordCount: 7,
      recordsWithoutSequence: 1,
      recordsWithoutCount: 1,
      rowsMerged: 1,
    });
  },
);

blockTest(
  "imports a sample's tagged tables as one sample",
  { timeout: 900000 },
  async ({ rawPrj: project, helpers, expect, ml }) => {
    const ids = await taggedSamplesAndData(project, helpers, {
      S1: [
        { part: "a", path: "./assets/peptide-nt-umi-s1.tsv" },
        { part: "b", path: "./assets/peptide-nt-umi-s2.tsv" },
      ],
      S2: [{ part: "a", path: "./assets/peptide-nt-umi-s3.tsv" }],
    });
    const { blockId, columns } = await importPeptides(
      project,
      helpers,
      {
        aminoAcid: "Peptide aa",
        nucleotide: "Peptide nt",
        counts: { uniqueMolecules: "Unique UMIs", reads: "Reads" },
      },
      "umi",
    );

    // The tag is folded into the sample: no tag axis in the output.
    expect(find(columns, "pl7.app/uniqueMoleculeCount")?.axes.map((a) => a.name)).toEqual([
      "pl7.app/sampleId",
      "pl7.app/variantKey",
    ]);

    // S1 reads both of its tables: 7 + 3 rows; the repeats across them are merged, and the stop-codon
    // and trailing-nucleotide peptides of the first table are dropped.
    const bySample = await statsBySample(project, blockId, ml.driverKit.pFrameDriver as Driver);
    expect(bySample[ids.S1]).toEqual({
      peptideCount: 3,
      recordCount: 10,
      recordsWithoutSequence: 1,
      recordsWithoutCount: 1,
      rowsMerged: 3,
    });
    expect(bySample[ids.S2]).toEqual({
      peptideCount: 3,
      recordCount: 3,
      recordsWithoutSequence: 0,
      recordsWithoutCount: 0,
      rowsMerged: 0,
    });
  },
);
