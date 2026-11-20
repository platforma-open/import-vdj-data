import type { PlRef } from "@platforma-sdk/model";
import {
  BlockStorageFacadeCallbacks,
  createBlockStorage,
  createPlDataTableStateV2,
  stringifyJson,
} from "@platforma-sdk/model";
import { beforeAll, describe, expect, test } from "vitest";
import type {
  BareSetMapping,
  FileSource,
  PeptideMapping,
} from "@platforma-open/milaboratories.import-vdj.kind";
import type { BlockData, ColumnProfile } from "./types";
import { collisionCheckKey, datasetCheckKey } from "./types";
import { missingColumns, peptideCheckKey, peptideMappedColumns, peptideProblems } from "./peptide";

const callbackRegistry: Record<string, (storageJson: string) => unknown> = {};

beforeAll(async () => {
  Object.assign(globalThis, { cfgRenderCtx: { callbackRegistry } });
  await import("./index");
});

const dataset: PlRef = { __isRef: true, blockId: "samples", name: "sequencing.data" };

const file: FileSource = {
  handle: "index://index/records.csv",
  datasetId: "file-dataset",
  label: "records",
  extension: "csv",
};

const bareSet: BareSetMapping = {
  identity: "id",
  chainSelection: "IGHeavy",
  sequences: { IGHeavy: "heavy" },
  scheme: "imgt",
};

const nothingPicked: BlockData = {
  customBlockLabel: "",
  chains: [],
  tableState: createPlDataTableStateV2(),
  settingsOpen: true,
};

const datasetPicked: BlockData = {
  ...nothingPicked,
  datasetRef: dataset,
  format: "mixcr",
  chains: ["IGHeavy"],
};

const datasetJudged = (columnsPresent: boolean): BlockData => ({
  ...datasetPicked,
  prerunCheck: { check: "dataset", subject: datasetCheckKey(datasetPicked) ?? "", columnsPresent },
});

const fileMapped: BlockData = { ...nothingPicked, fileSource: file, bareSet };

const peptide: PeptideMapping = {
  aminoAcid: "Peptide aa",
  counts: { reads: "Reads" },
};

const peptideMapped: BlockData = {
  ...nothingPicked,
  datasetRef: dataset,
  format: "peptide-custom",
  peptide,
};

const peptideJudged = (problems: string[]): BlockData => ({
  ...peptideMapped,
  prerunCheck: { check: "peptide", subject: peptideCheckKey(dataset, peptide) ?? "", problems },
});

const columnsJudged = (identityCollides: boolean): BlockData => ({
  ...fileMapped,
  prerunCheck: { check: "columns", subject: collisionCheckKey(bareSet) ?? "", identityCollides },
});

describe("args issues", () => {
  test("a dataset whose columns prerun found derives runnable args", () => {
    expect(deriveArgs(datasetJudged(true))).toEqual({
      value: { datasetRef: dataset, format: "mixcr", chains: ["IGHeavy"] },
      issues: [],
    });
  });

  test("with only a dataset picked the args carry it, so the block links to its producer", () => {
    expect(deriveArgs({ ...nothingPicked, datasetRef: dataset })).toMatchObject({
      args: { datasetRef: dataset },
      issues: [{ severity: "error", message: "Choose a data format" }],
    });
  });

  test("a peptide table whose files are clean derives runnable args without chains", () => {
    expect(deriveArgs({ ...peptideJudged([]), chains: ["IGHeavy"] })).toEqual({
      value: {
        datasetRef: dataset,
        format: "peptide-custom",
        chains: [],
        peptide,
        primaryCountType: "read",
      },
      issues: [],
    });
  });

  test("a mapped file whose identity column does not collide derives runnable args", () => {
    expect(deriveArgs(columnsJudged(false))).toMatchObject({
      value: { fileSource: file, bareSet },
      issues: [],
    });
  });

  test.each<[string, BlockData, string]>([
    ["nothing picked", nothingPicked, "Select a dataset, or load a file"],
    ["both doors set", { ...datasetPicked, fileSource: file }, "Select a dataset, or load a file"],
    [
      "a file without a finished mapping",
      { ...nothingPicked, fileSource: file },
      "Finish mapping the file's columns",
    ],
    ["a file not checked yet", fileMapped, "Validating the selected columns"],
    [
      "a file whose identity collides",
      columnsJudged(true),
      '"id" repeats on rows that are not identical',
    ],
    ["a dataset without a format", { ...datasetPicked, format: undefined }, "Choose a data format"],
    ["a dataset without chains", { ...datasetPicked, chains: [] }, "Choose at least one chain"],
    [
      "a custom bare set without a finished mapping",
      { ...datasetPicked, format: "custom", bareSet: { ...bareSet, identity: "" } },
      "Finish mapping the record's columns",
    ],
    [
      "a custom bare set not checked yet",
      { ...datasetPicked, format: "custom", bareSet },
      "Validating the selected columns",
    ],
    [
      "a custom mapping without an abundance",
      {
        ...datasetPicked,
        format: "custom",
        customMapping: { "cdr3-aa": "cdr3", "v-gene": "v", "j-gene": "j" },
      },
      "Map a sequence, a V gene, a J gene and an abundance column",
    ],
    ["a dataset not checked yet", datasetPicked, "Validating the selected columns"],
    [
      "a dataset missing the format's columns",
      datasetJudged(false),
      "The dataset does not carry the columns a mixcr dataset needs",
    ],
    [
      "a peptide table without an amino-acid column",
      { ...peptideMapped, peptide: { ...peptide, aminoAcid: "" } },
      "Choose a column for Peptide aa",
    ],
    [
      "a peptide table without a count column",
      { ...peptideMapped, peptide: { ...peptide, counts: {} } },
      "Choose a column for Number of Reads (primary)",
    ],
    [
      "a peptide table with UMIs as the primary count but only reads mapped",
      { ...peptideMapped, primaryCountType: "umi" },
      "Choose a column for Number of UMIs (primary)",
    ],
    ["a peptide table not checked yet", peptideMapped, "Validating the selected columns"],
    [
      "a peptide table checked under another mapping",
      { ...peptideJudged([]), peptide: { ...peptide, counts: { reads: "Other" } } },
      "Validating the selected columns",
    ],
    [
      "a peptide table checked for another dataset",
      { ...peptideJudged([]), datasetRef: { ...dataset, blockId: "other" } },
      "Validating the selected columns",
    ],
    [
      "a peptide table checked under the dataset door's verdict",
      { ...peptideMapped, prerunCheck: datasetJudged(true).prerunCheck },
      "Validating the selected columns",
    ],
    [
      "a peptide table with one problem",
      peptideJudged(['Number of Reads ("Reads") has values that are not whole numbers in S1']),
      'Number of Reads ("Reads") has values that are not whole numbers in S1',
    ],
    [
      "a peptide table with three problems",
      peptideJudged(["first", "second", "third"]),
      "first, and 2 more problems",
    ],
  ])("%s keeps Run disabled", (_, data, message) => {
    expect(deriveArgs(data)).toMatchObject({ issues: [{ severity: "error", message }] });
  });
});

describe("peptide problems", () => {
  const labels = { s1: "S1", s2: "S2", s3: "S3" };
  const headers = ["Peptide aa", "DNA", "Reads", "Share", "Note"];
  // The first sample's file, as column-profile reads it. A, C, G and T are amino-acid letters too.
  const profile = (headersBySample: Record<string, string[]>): ColumnProfile => ({
    headers,
    types: {
      "Peptide aa": "String",
      DNA: "String",
      Reads: "Long",
      Share: "Double",
      Note: "String",
    },
    aminoAcid: ["Peptide aa", "DNA"],
    nucleotide: ["DNA"],
    wholeNumber: ["Reads"],
    headersBySample,
  });
  const alike = profile({ s1: headers, s2: headers });

  test("a mapping the files fit has no problems", () => {
    expect(peptideProblems(alike, { ...peptide, nucleotide: "DNA" }, labels)).toEqual([]);
  });

  test("each column that doesn't fit its field is named, with the first sample", () => {
    const mapping: PeptideMapping = {
      aminoAcid: "Note",
      nucleotide: "Peptide aa",
      counts: { uniqueMolecules: "Share", reads: "Reads" },
    };
    expect(peptideProblems(alike, mapping, labels)).toEqual([
      'Peptide aa ("Note") is not an amino-acid sequence column in S1',
      'Peptide nt ("Peptide aa") is not a nucleotide sequence column in S1',
      'Number of UMIs ("Share") has values that are not whole numbers in S1',
    ]);
  });

  test("columns missing from some file are reported alone", () => {
    const lacking = profile({ s1: headers, s2: ["Peptide aa"], s3: ["Peptide aa"] });
    expect(peptideProblems(lacking, { ...peptide, aminoAcid: "Note" }, labels)).toEqual([
      'Peptide aa ("Note") is missing in S2, S3',
      'Number of Reads ("Reads") is missing in S2, S3',
    ]);
  });

  test("a nucleotide column is not an amino-acid column", () => {
    expect(peptideProblems(alike, { ...peptide, aminoAcid: "DNA" }, labels)).toEqual([
      'Peptide aa ("DNA") is not an amino-acid sequence column in S1',
    ]);
  });

  test("an unlabelled sample is named by its id", () => {
    expect(peptideProblems(alike, { ...peptide, aminoAcid: "Note" }, {})).toEqual([
      'Peptide aa ("Note") is not an amino-acid sequence column in s1',
    ]);
  });

  test("a mapped column some files lack names the field and those samples", () => {
    const headersBySample = {
      s1: ["Peptide aa", "Reads"],
      s2: ["Peptide aa", "Count"],
      s3: ["Peptide aa", "Count"],
    };
    expect(missingColumns(peptideMappedColumns(peptide), headersBySample, labels)).toEqual([
      'Number of Reads ("Reads") is missing in S2, S3',
    ]);
    expect(missingColumns(peptideMappedColumns(peptide), undefined, labels)).toEqual([]);
  });
});

// Internals

function deriveArgs(data: BlockData): unknown {
  const derive = callbackRegistry[BlockStorageFacadeCallbacks.ArgsDerive];
  if (derive === undefined) throw new Error("The args derive callback is not registered");
  return derive(stringifyJson(createBlockStorage(data)));
}
