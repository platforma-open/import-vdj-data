import { collisionCheckKey } from "@platforma-open/milaboratories.import-vdj.model";
import { describe, expect, test } from "vitest";
import {
  emptySamplesMessage,
  formatLabel,
  identityCollisionMessage,
  missingColumnsMessage,
  propertyCollisionMessage,
} from "../../ui/src/pages/messages";

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

  test("a verdict for a different mapping says nothing", () => {
    const other = { identity: "other", sequences: { IGHeavy: "VH" } } as never;
    expect(identityCollisionMessage({ key: keyFor(other), values: ["x"] }, mapping)).toBe("");
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
