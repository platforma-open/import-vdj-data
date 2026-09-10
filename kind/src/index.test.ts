import { describe, expect, it } from "vitest";
import { kind } from "./index";

const parse = (params: unknown) => kind.parseInitializationParams(params);

const REF = { __isRef: true as const, blockId: "b1", name: "pf/dataset" };

/** The two handle forms the SDK guards recognize. */
const INDEX_HANDLE = "index://index/storage-1/data/run7/clones.tsv";
const UPLOAD_HANDLE = "upload://upload/eyJsb2NhbFBhdGgiOiIvdG1wL2Nsb25lcy50c3YifQ==.sig";

const FILE_SOURCE = {
  handle: INDEX_HANDLE,
  sampleId: "smpl1",
  label: "clones",
  extension: "tsv" as const,
};

const BARE_SET = {
  identity: "Clone ID",
  chainSelection: "IG" as const,
  sequences: { IGHeavy: "VH aa", IGLight: "VL aa" },
  scheme: "kabat" as const,
  properties: [{ header: "Affinity (nM)", valueType: "Double" as const }],
};

describe("datasetRef", () => {
  it("accepts a PlRef", () => {
    expect(parse({ datasetRef: REF })).toEqual({ datasetRef: REF });
  });

  it.each([
    ["an object missing the marker", { blockId: "b1", name: "pf/dataset" }],
    ["a serialized ref rather than the object", JSON.stringify(REF)],
    ["a number", 42],
  ])("rejects %s", (_label, datasetRef) => {
    expect(() => parse({ datasetRef })).toThrow("'datasetRef' must be a reference");
  });
});

describe("fileSource", () => {
  it.each([
    ["an index handle", INDEX_HANDLE],
    ["an upload handle", UPLOAD_HANDLE],
  ])("accepts %s", (_label, handle) => {
    const fileSource = { ...FILE_SOURCE, handle };
    expect(parse({ fileSource })).toEqual({ fileSource });
  });

  it.each(["csv", "tsv", "xlsx"])("accepts the %s extension", (extension) => {
    const fileSource = { ...FILE_SOURCE, extension };
    expect(parse({ fileSource })).toEqual({ fileSource });
  });

  it.each([
    ["a bare handle string", INDEX_HANDLE],
    ["a handle of neither scheme", { ...FILE_SOURCE, handle: "/tmp/clones.tsv" }],
    ["an unknown extension", { ...FILE_SOURCE, extension: "parquet" }],
    ["a missing sampleId", { handle: INDEX_HANDLE, label: "clones", extension: "tsv" }],
    ["a missing label", { handle: INDEX_HANDLE, sampleId: "smpl1", extension: "tsv" }],
  ])("rejects %s", (_label, fileSource) => {
    expect(() => parse({ fileSource })).toThrow("'fileSource' must be a file source");
  });
});

describe("the dataset-door mapping", () => {
  it.each(["immunoSeq", "qiagen", "mixcr", "mixcr-sc", "cellranger", "airr", "airr-sc", "custom"])(
    "accepts the %s format",
    (format) => {
      expect(parse({ format })).toEqual({ format });
    },
  );

  it("rejects a format outside the vocabulary", () => {
    expect(() => parse({ format: "adaptive" })).toThrow("'format' must be one of");
  });

  it.each(["primaryCountType", "secondaryCountType"] as const)("accepts %s read/umi", (field) => {
    expect(parse({ [field]: "read" })).toEqual({ [field]: "read" });
    expect(parse({ [field]: "umi" })).toEqual({ [field]: "umi" });
  });

  it.each(["primaryCountType", "secondaryCountType"] as const)("rejects an unknown %s", (field) => {
    expect(() => parse({ [field]: "count" })).toThrow(`'${field}' must be one of`);
  });

  it("accepts chains as an array of names", () => {
    const chains = ["IGHeavy", "TCRBeta"];
    expect(parse({ chains })).toEqual({ chains });
  });

  it("rejects chains as a bare string", () => {
    expect(() => parse({ chains: "IGHeavy" })).toThrow("'chains' must be an array");
  });

  it("accepts a customMapping, undefined slot values included -- clearing a slot writes one", () => {
    const customMapping = { cdr3: "CDR3 aa", vGene: undefined };
    expect(parse({ customMapping })).toEqual({ customMapping });
  });

  it("rejects a customMapping whose value is not a header", () => {
    expect(() => parse({ customMapping: { cdr3: 7 } })).toThrow(
      "'customMapping' must be an object",
    );
  });
});

describe("bareSet", () => {
  it("accepts a complete mapping", () => {
    expect(parse({ bareSet: BARE_SET })).toEqual({ bareSet: BARE_SET });
  });

  it("accepts a mapping with no properties", () => {
    const bareSet = { ...BARE_SET, properties: undefined };
    expect(parse({ bareSet })).toEqual({ bareSet });
  });

  it("accepts a declaration whose slots are not all mapped yet -- the panel reaches that state", () => {
    const bareSet = { ...BARE_SET, sequences: { IGHeavy: "VH aa" } };
    expect(parse({ bareSet })).toEqual({ bareSet });
  });

  it.each(["imgt", "kabat", "chothia"])("accepts the %s scheme", (scheme) => {
    const bareSet = { ...BARE_SET, scheme };
    expect(parse({ bareSet })).toEqual({ bareSet });
  });

  it.each([
    ["a missing identity column", { ...BARE_SET, identity: undefined }],
    ["a chain selection outside the vocabulary", { ...BARE_SET, chainSelection: "IGKappa" }],
    ["a sequence slot that is not a chain", { ...BARE_SET, sequences: { IGKappa: "VK aa" } }],
    ["a sequence header that is not a string", { ...BARE_SET, sequences: { IGHeavy: 3 } }],
    ["a scheme outside the vocabulary", { ...BARE_SET, scheme: "martin" }],
    [
      "a property with an unknown value type",
      { ...BARE_SET, properties: [{ header: "x", valueType: "Float" }] },
    ],
    ["properties that are not an array", { ...BARE_SET, properties: { header: "x" } }],
  ])("rejects %s", (_label, bareSet) => {
    expect(() => parse({ bareSet })).toThrow("'bareSet' must be a bare set mapping");
  });
});

describe("the params envelope", () => {
  it("accepts an empty object -- every field is optional", () => {
    expect(parse({})).toEqual({});
  });

  it("accepts a fully configured dataset-door import", () => {
    const params = {
      datasetRef: REF,
      format: "custom",
      chains: ["IGHeavy"],
      customMapping: { cdr3: "CDR3 aa" },
      primaryCountType: "umi",
      secondaryCountType: "read",
      customBlockLabel: "run 7",
    };
    expect(parse(params)).toEqual(params);
  });

  it("accepts a fully configured bare-set import", () => {
    const params = { fileSource: FILE_SOURCE, bareSet: BARE_SET, customBlockLabel: "panel A" };
    expect(parse(params)).toEqual(params);
  });

  it("accepts both doors at once -- the args lambda, not the kind, is what refuses that", () => {
    const params = { datasetRef: REF, fileSource: FILE_SOURCE };
    expect(parse(params)).toEqual(params);
  });

  it("drops keys the contract does not name", () => {
    expect(parse({ format: "mixcr", notAParam: "x" })).toEqual({ format: "mixcr" });
  });

  it("rejects params that are not an object", () => {
    expect(() => parse(null)).toThrow();
    expect(() => parse([REF])).toThrow();
    expect(() => parse(5)).toThrow();
  });

  it("rejects a customBlockLabel that is not a string", () => {
    expect(() => parse({ customBlockLabel: 42 })).toThrow("'customBlockLabel' must be a string.");
  });
});
