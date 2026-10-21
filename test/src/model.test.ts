/*
  Unit tests for the two pure functions the V3 migration turns on: the legacy upgrade that
  reads a project saved under V1, and the args projection that replaces `argsValid`.

  These are here rather than in an integration test because neither is reachable from one. The
  integration suite creates fresh projects, so it exercises `.init()` and never
  `.upgradeLegacy()`; and a V1 project cannot be built against a V3 block to drive the upgrade,
  because `setBlockArgs` refuses a modelAPIVersion 2 block. The field mapping is exactly the
  part of a migration that goes wrong silently — a missed field reads as a setting the
  scientist "lost" when they reopen an old project.
*/

import {
  collisionCheckKey,
  datasetCheckKey,
  declaredSlotsOnly,
  importedChains,
  projectArgs,
  upgradeLegacyData,
} from "@platforma-open/milaboratories.import-vdj.model";
import type { BareSetMapping, BlockData } from "@platforma-open/milaboratories.import-vdj.model";
import type { PlRef } from "@platforma-sdk/model";
import { describe, expect, test } from "vitest";

const ref = { __isRef: true, blockId: "b1", name: "out" } as unknown as PlRef;

describe("upgradeLegacyData", () => {
  test("carries every V1 args field across", () => {
    const data = upgradeLegacyData({
      args: {
        defaultBlockLabel: "my import",
        customBlockLabel: "renamed",
        datasetRef: ref,
        format: "custom",
        chains: ["IGHeavy"],
        customMapping: { "cdr3-aa": "CDR3" },
        primaryCountType: "umi",
        secondaryCountType: "read",
        bareSet: {
          identity: "id",
          chainSelection: "IGHeavy",
          sequences: { IGHeavy: "VH" },
          scheme: "kabat",
        },
      },
      uiState: { settingsOpen: false },
    });

    expect(data.defaultBlockLabel).toBe("my import");
    expect(data.customBlockLabel).toBe("renamed");
    expect(data.datasetRef).toBe(ref);
    expect(data.format).toBe("custom");
    expect(data.chains).toEqual(["IGHeavy"]);
    expect(data.customMapping).toEqual({ "cdr3-aa": "CDR3" });
    expect(data.primaryCountType).toBe("umi");
    expect(data.secondaryCountType).toBe("read");
    expect(data.bareSet?.scheme).toBe("kabat");

    // uiState survives too, set the other way from the defaults.
    expect(data.settingsOpen).toBe(false);
  });

  test("fills view state and chains a project saved without them has no value for", () => {
    const data = upgradeLegacyData({ args: { format: "qiagen" }, uiState: {} });

    expect(data.tableState).toBeDefined();
    expect(data.settingsOpen).toBe(true);
    expect(data.chains.length).toBe(6);
  });

  test("carries a fileSource across without a door flag", () => {
    // V1 stored which door the panel showed. It is gone: the panel derives that from whether a
    // file is loaded, so a stored flag could only disagree with the data.
    const data = upgradeLegacyData({
      args: {
        fileSource: {
          handle: "index://x" as never,
          datasetId: "S1",
          label: "panel",
          extension: "tsv",
        },
      },
      uiState: {},
    });

    expect(data.fileSource?.label).toBe("panel");
    expect("loadFromFile" in data).toBe(false);
  });

  test("survives a project with neither bucket populated", () => {
    const data = upgradeLegacyData({});
    expect(data.chains.length).toBe(6);
    expect(data.customBlockLabel).toBe("");
    expect(data.datasetRef).toBeUndefined();
  });
});

describe("importedChains", () => {
  test("a single-cell import takes both chains of a receptor", () => {
    expect(importedChains("mixcr-sc", ["IGLight"])).toEqual(["IGLight", "IGHeavy"]);
    expect(importedChains("cellranger", ["TCRBeta", "TCRAlpha"])).toEqual(["TCRBeta", "TCRAlpha"]);
  });
  test("a bulk import keeps the chains as chosen", () => {
    expect(importedChains("mixcr", ["IGLight"])).toEqual(["IGLight"]);
  });
});

describe("declaredSlotsOnly", () => {
  test("drops columns mapped to a chain the selection does not declare", () => {
    const bare: BareSetMapping = {
      identity: "id",
      chainSelection: "IGHeavy",
      sequences: { IGHeavy: "VH", IGLight: "VL" },
      genes: { IGLight: { v: "VL gene" } },
      scheme: "imgt",
    };
    expect(declaredSlotsOnly(bare)).toEqual({ ...bare, sequences: { IGHeavy: "VH" }, genes: {} });
  });
});

describe("projectArgs", () => {
  const base = upgradeLegacyData({});

  test("a single-cell import sends whole receptors", () => {
    const data: BlockData = { ...base, datasetRef: ref, format: "mixcr-sc", chains: ["IGLight"] };
    const subject = datasetCheckKey(data)!;
    const args = projectArgs({
      ...data,
      prerunCheck: { check: "dataset", subject, columnsPresent: true },
    });
    expect(args.chains).toEqual(["IGLight", "IGHeavy"]);
  });

  test("a count type left over from the custom format is not sent for another format", () => {
    const data: BlockData = {
      ...base,
      datasetRef: ref,
      format: "mixcr",
      chains: ["IGHeavy"],
      primaryCountType: "read",
    };
    const subject = datasetCheckKey(data)!;
    const args = projectArgs({
      ...data,
      prerunCheck: { check: "dataset", subject, columnsPresent: true },
    });
    expect(args.primaryCountType).toBeUndefined();
  });

  test("a dataset-door bare set does not need the chain picker it never shows", () => {
    const bareSet: BareSetMapping = {
      identity: "id",
      chainSelection: "IGHeavy",
      sequences: { IGHeavy: "VH" },
      scheme: "imgt",
    };
    const data: BlockData = { ...base, datasetRef: ref, format: "custom", chains: [], bareSet };
    const subject = collisionCheckKey(bareSet)!;
    const args = projectArgs({
      ...data,
      prerunCheck: { check: "columns", subject, identityCollides: false },
    });
    expect(args.bareSet).toEqual(bareSet);
  });

  test("a chain-filtered import still needs a chain", () => {
    expect(() => projectArgs({ ...base, datasetRef: ref, format: "mixcr", chains: [] })).toThrow(
      "Choose at least one chain",
    );
  });
});
