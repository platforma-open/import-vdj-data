import { parseTsvRows } from "@platforma-open/milaboratories.import-vdj.model";
import { describe, expect, test } from "vitest";

describe("parseTsvRows", () => {
  test("drops the header and blank lines", () => {
    expect(parseTsvRows("id\trows\nAB-1\t3\n\nAB-2\t2\n")).toEqual([
      ["AB-1", "3"],
      ["AB-2", "2"],
    ]);
  });
  test("decodes quoted fields holding a tab, a newline or a quote", () => {
    expect(parseTsvRows('id\trows\n"A\tB"\t2\n"line\nbreak"\t3\n"say ""hi"""\t4\n')).toEqual([
      ["A\tB", "2"],
      ["line\nbreak", "3"],
      ['say "hi"', "4"],
    ]);
  });
  test("keeps surrounding spaces and handles CRLF and a missing final newline", () => {
    expect(parseTsvRows("id\r\n AB-1 \r\nAB-2")).toEqual([[" AB-1 "], ["AB-2"]]);
  });
  test("header-only and empty text give no rows", () => {
    expect(parseTsvRows("rowCount\tmissingSequence\n")).toEqual([]);
    expect(parseTsvRows("")).toEqual([]);
  });
});
