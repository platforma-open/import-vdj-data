import type { PlRef } from "@platforma-sdk/model";
import {
  BlockStorageFacadeCallbacks,
  createBlockStorage,
  createPlDataTableStateV2,
  stringifyJson,
} from "@platforma-sdk/model";
import { beforeAll, describe, expect, test } from "vitest";
import type { BareSetMapping, FileSource } from "@platforma-open/milaboratories.import-vdj.kind";
import type { BlockData } from "./types";
import { collisionCheckKey, datasetCheckKey } from "./types";

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
  ])("%s keeps Run disabled", (_, data, message) => {
    expect(deriveArgs(data)).toMatchObject({ issues: [{ severity: "error", message }] });
  });
});

// Internals

function deriveArgs(data: BlockData): unknown {
  const derive = callbackRegistry[BlockStorageFacadeCallbacks.ArgsDerive];
  if (derive === undefined) throw new Error("The args derive callback is not registered");
  return derive(stringifyJson(createBlockStorage(data)));
}
