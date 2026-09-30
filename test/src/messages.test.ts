import { collisionCheckKey, rowReportKey } from "@platforma-open/milaboratories.import-vdj.model";
import { describe, expect, test } from "vitest";
import {
  emptySamplesMessage,
  formatLabel,
  identityCollisionMessage,
  missingColumnsMessage,
  propertyCollisionMessage,
  collapsedRowsMessage,
  missingSequenceMessage,
} from "../../ui/src/pages/messages";

const MAPPING = {
  identity: "mAb ID",
  chainSelection: "IG" as const,
  sequences: { IGHeavy: "VH", IGLight: "VL" },
  scheme: "imgt" as const,
};
const report = (
  missingSequence: number,
  collapsed: { id: string; rows: number }[],
  missingIds: string[] = [],
) => ({
  key: rowReportKey(MAPPING)!,
  rowCount: 20,
  missingSequence,
  missingIds,
  collapsed,
});

describe("row report", () => {
  test("says nothing when every row becomes its own record", () => {
    expect(missingSequenceMessage(report(0, []), MAPPING)).toBe("");
    expect(collapsedRowsMessage(report(0, []), MAPPING)).toBe("");
    expect(missingSequenceMessage(undefined, MAPPING)).toBe("");
    expect(collapsedRowsMessage(undefined, MAPPING)).toBe("");
  });
  test("names rows without a sequence, like the non-unique id warning", () => {
    expect(missingSequenceMessage(report(3, [], ["AB-1", "AB-2", "AB-3", "AB-4"]), MAPPING)).toBe(
      "No sequence for at least one chain: AB-1, AB-2, AB-3 and 1 more. These 3 rows are ignored.",
    );
    expect(missingSequenceMessage(report(1, [], ["AB-1"]), MAPPING)).toBe(
      "No sequence for at least one chain: AB-1. This row is ignored.",
    );
  });
  test("a single-chain mapping does not mention chains", () => {
    const heavyOnly = {
      ...MAPPING,
      chainSelection: "IGHeavy" as const,
      sequences: { IGHeavy: "VH" },
    };
    const single = { ...report(2, [], ["AB-1", "AB-2"]), key: rowReportKey(heavyOnly)! };
    expect(missingSequenceMessage(single, heavyOnly)).toBe(
      "No sequence: AB-1, AB-2. These 2 rows are ignored.",
    );
  });
  test("still counts rows without a sequence that have no id to name", () => {
    expect(missingSequenceMessage(report(2, []), MAPPING)).toBe(
      "No sequence for at least one chain. These 2 rows are ignored.",
    );
  });
  test("names collapsed ids, most repeated first, and counts the rows they absorbed", () => {
    const collapsed = [
      { id: "AB-7", rows: 3 },
      { id: "AB-2", rows: 2 },
      { id: "AB-3", rows: 2 },
      { id: "AB-9", rows: 2 },
    ];
    expect(collapsedRowsMessage(report(0, collapsed), MAPPING)).toBe(
      "Identical rows: AB-7 (3 rows), AB-2 (2 rows), AB-3 (2 rows) and 1 more. " +
        "Rows sharing an id become one record, so 5 rows are collapsed.",
    );
  });
  test("each reason is its own message", () => {
    const both = report(2, [{ id: "AB-1", rows: 2 }], ["AB-5", "AB-6"]);
    expect(missingSequenceMessage(both, MAPPING)).toBe(
      "No sequence for at least one chain: AB-5, AB-6. These 2 rows are ignored.",
    );
    expect(collapsedRowsMessage(both, MAPPING)).toBe(
      "Identical rows: AB-1 (2 rows). Rows sharing an id become one record, so 1 row is collapsed.",
    );
  });
  test("a report on another mapping says nothing", () => {
    const remapped = { ...MAPPING, sequences: { IGHeavy: "VH", IGLight: "other" } };
    expect(missingSequenceMessage(report(3, []), remapped)).toBe("");
    expect(collapsedRowsMessage(report(0, [{ id: "AB-1", rows: 2 }]), remapped)).toBe("");
  });
  test("the key ignores slot order and needs an id and a sequence", () => {
    const reordered = { ...MAPPING, sequences: { IGLight: "VL", IGHeavy: "VH" } };
    expect(rowReportKey(reordered)).toBe(rowReportKey(MAPPING));
    expect(rowReportKey({ ...MAPPING, identity: "" })).toBeUndefined();
    expect(rowReportKey({ ...MAPPING, sequences: {} })).toBeUndefined();
  });
});

describe("ui messages", () => {
  test("empty samples: under the cap", () => {
    expect(emptySamplesMessage({ emptySamples: ["S1", "S2"] })).toBe(
      "After receptor chain filtering, no clonotypes found in sample(s) S1, S2",
    );
  });
  test("empty samples: over the cap truncates at 5", () => {
    expect(emptySamplesMessage({ emptySamples: ["a", "b", "c", "d", "e", "f", "g"] })).toBe(
      "After receptor chain filtering, no clonotypes found in sample(s) a, b, c, d, e and 2 more",
    );
  });
  test("empty samples: none is undefined, not an empty string", () => {
    expect(emptySamplesMessage({ emptySamples: [] })).toBeUndefined();
    expect(emptySamplesMessage(undefined)).toBeUndefined();
  });
  test("format label falls back to the raw id", () => {
    expect(formatLabel("mixcr")).toBe("MiXCR bulk");
    expect(formatLabel("MIXCR-SC")).toBe("MiXCR single cell");
    expect(formatLabel("nope")).toBe("nope");
    expect(formatLabel(undefined)).toBe("");
  });
  test("missing columns", () => {
    expect(
      missingColumnsMessage({
        isValid: false,
        missingColumns: ["v_call", "j_call"],
        format: "airr",
      }),
    ).toBe(
      "The selected dataset is missing required AIRR bulk columns: v_call, j_call. Please verify the format selection or choose a different dataset.",
    );
    expect(missingColumnsMessage({ isValid: true, missingColumns: [], format: "airr" })).toBe("");
    expect(missingColumnsMessage(undefined)).toBe("");
  });
  const mapping = { identity: "id", sequences: { IGHeavy: "VH" } } as never;
  const keyFor = (m: never) => collisionCheckKey(m)!;

  test("identity collisions truncate at 3", () => {
    expect(
      identityCollisionMessage(
        { key: keyFor(mapping), values: ["x", "y", "z", "w", "v"] },
        mapping,
      ),
    ).toBe(
      "Repeated on rows that are not identical: x, y, z and 2 more. Two rows sharing an id become one record — pick a different column, or fix the file.",
    );
    expect(identityCollisionMessage({ key: keyFor(mapping), values: [] }, mapping)).toBe("");
    expect(identityCollisionMessage(undefined, mapping)).toBe("");
  });

  test("a verdict for a different id column says nothing", () => {
    const other = { identity: "other", sequences: { IGHeavy: "VH" } } as never;
    expect(identityCollisionMessage({ key: keyFor(other), values: ["x"] }, mapping)).toBe("");
  });

  test("the key covers the id and sequence columns, not properties", () => {
    // Rows missing a mapped sequence are left out of the comparison, so sequences are in the key.
    const remapped = { identity: "id", sequences: { IGHeavy: "VH2" } } as never;
    const withProperty = {
      identity: "id",
      sequences: { IGHeavy: "VH" },
      properties: [{ header: "Assay", valueType: "String" }],
    } as never;
    expect(keyFor(remapped)).not.toBe(keyFor(mapping));
    expect(keyFor(withProperty)).toBe(keyFor(mapping));
    expect(identityCollisionMessage({ key: keyFor(mapping), values: ["x"] }, withProperty)).toBe(
      "Repeated on rows that are not identical: x. Two rows sharing an id become one record — " +
        "pick a different column, or fix the file.",
    );
  });
  test("property collisions", () => {
    const props = [
      { header: "A b", valueType: "String" },
      { header: "A/b", valueType: "String" },
    ] as never;
    expect(propertyCollisionMessage(props)).toBe(
      "These headers would become the same column: A b / A/b. Rename one in the file — importing both is not possible, and dropping one silently would lose a column you asked for.",
    );
    expect(propertyCollisionMessage([])).toBe("");
    expect(propertyCollisionMessage(undefined)).toBe("");
  });
});
