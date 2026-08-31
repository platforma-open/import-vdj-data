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

import { upgradeLegacyData } from "@platforma-open/milaboratories.import-vdj.model";
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
          sampleId: "S1",
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
