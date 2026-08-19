import type { ImportFileHandle, PlDataTableStateV2, PlRef } from "@platforma-sdk/model";

export type ImportFormat =
  | "immunoSeq"
  | "qiagen"
  | "mixcr"
  | "mixcr-sc"
  | "cellranger"
  | "airr"
  | "airr-sc"
  | "custom";

export type CountType = "read" | "umi";

export type FileSource = {
  handle: ImportFileHandle;
  /**
   * Minted in the UI at the moment the file is picked, not derived from the handle, so the
   * sample keeps its identity across runs even if the same file is re-selected.
   */
  sampleId: string;
  /** The filename stem — exactly what samples-and-data would have labelled the sample. */
  label: string;
  /**
   * What kind of file this is. `xlsx` is converted to csv by the workflow before anything
   * reads it, so the pipeline only ever sees csv or tsv.
   */
  extension: "csv" | "tsv" | "xlsx";
};

/**
 * The mapping slots a scientist can assign a sequence column to.
 *
 * Named in the `pl7.app/vdj/chain` vocabulary the block's bulk path already uses, rather than
 * the A/B of `pl7.app/vdj/scClonotypeChain`: a mapped chain is a locus, and one mapped chain is
 * a bulk shape. The workflow translates to A/B where the paired-chain domain needs it.
 */
export type BareSetChain = "IGHeavy" | "IGLight";

/** What a column can hold, decided by profiling every row of the file. */
export type ColumnValueType = "Long" | "Double" | "String";

/**
 * Every column of a directly-loaded file, profiled over the whole file.
 *
 * `types` widens monotonically as rows are read, so one non-numeric value anywhere settles the
 * column as `String` — the same rule samples-and-data applies to an imported metadata table.
 */
export type ColumnProfile = {
  headers: string[];
  types: Record<string, ColumnValueType>;
  aminoAcid: string[];
};

export type ImportedProperty = {
  /** The source header, exactly as the file wrote it. It becomes the column's label. */
  header: string;
  /**
   * Detected, never chosen. Written when the scientist accepts the column, from the profile the
   * whole-file scan produced — so the panel asks no type question and the answer cannot be
   * wrong about a value it never saw.
   */
  valueType: ColumnValueType;
};

export type BareSetMapping = {
  /**
   * The column whose value identifies the record. Required, never inferred: the record key
   * is its hash and the record label is its value, so a set without one has nothing to key on.
   */
  identity: string;
  /**
   * Amino-acid variable domain per chain. The chain comes from the
   * slot the column was assigned to, so the file needs no chain column and nothing is matched
   * against a locus map. A row carrying both is unpivoted into one record, not split into two.
   */
  sequences: Partial<Record<BareSetChain, string>>;
  /** The numbering convention ANARCI is asked for, and the one recorded on every region. */
  scheme: "imgt" | "kabat" | "chothia";
  /**
   * Non-sequence columns the scientist accepted as record properties. Offered rather than
   * discarded: a column holding anything the canonical vocabulary never anticipated has no slot
   * to be given, however ordinary the value is.
   *
   * Each carries the type the whole-file profile detected for it.
   */
  properties?: ImportedProperty[];
};

export type ColumnDescription = {
  label: string;
  description: string;
};

/**
 * What the workflow consumes. Strictly smaller than {@link BlockData}: the block's labels and
 * the secondary count type never reach it, and the door that is not in use is stripped.
 *
 * Kept as a named type rather than inlined because the args lambda's job is to produce exactly
 * this — a reader comparing the two shapes can see at a glance what is UI-only.
 */
export type BlockArgs = {
  datasetRef?: PlRef;
  fileSource?: FileSource;
  format?: ImportFormat;
  chains: string[];
  customMapping?: Record<string, string | undefined>;
  primaryCountType?: CountType;
  bareSet?: BareSetMapping;
};

/**
 * Everything the scientist can edit, in the shape the panel wants it.
 *
 * Three channels come out of this (see `model.md`): the workflow's `args`, the auto-rerunning
 * `prerunArgs`, and the fields that stay here and never leave the UI. The last group is the
 * point of V3 for this block — under V1 the two labels lived in `args`, so renaming a block
 * marked it stale and asked for a re-import.
 */
export type BlockData = {
  // --- naming. UI-only: the workflow reads neither, and projecting them would mean a rename
  // --- stales the block.
  defaultBlockLabel: string;
  customBlockLabel: string;

  // --- the two doors. Exactly one is set; the args lambda enforces it.
  /** A dataset somebody already loaded into the project. */
  datasetRef?: PlRef;
  /** A file this block imports itself. */
  fileSource?: FileSource;

  // --- dataset-door mapping
  format?: ImportFormat;
  chains: string[];
  customMapping?: Record<string, string | undefined>;
  primaryCountType?: CountType;
  /**
   * UI-only, despite looking like a mapping field: the workflow never reads it. It decides
   * which count columns the panel offers, and its effect reaches the workflow through
   * `customMapping`. Projecting it would stale the block on a choice that changes nothing.
   */
  secondaryCountType?: CountType;

  // --- bare set. Its presence is what selects the bare path in the workflow.
  bareSet?: BareSetMapping;

  // --- view state. None of this is projected anywhere.
  tableState: PlDataTableStateV2;
  settingsOpen: boolean;
  /**
   * Which door the panel is showing. The block already knows which door is in use from whether
   * `fileSource` or `datasetRef` is set; this exists so the panel can show one door's controls
   * before either is filled in.
   */
  loadFromFile: boolean;
  qiagenColumnsPresent: boolean;
  immunoSeqColumnsPresent: boolean;
  mixcrColumnsPresent: boolean;
  crColumnsPresent: boolean;
  airrColumnsPresent: boolean;
};

/** The V1 `args` bucket, as it sits in projects saved before the V3 migration. */
export type LegacyBlockArgs = {
  defaultBlockLabel?: string;
  customBlockLabel?: string;
  datasetRef?: PlRef;
  format?: ImportFormat;
  chains?: string[];
  customMapping?: Record<string, string | undefined>;
  primaryCountType?: CountType;
  secondaryCountType?: CountType;
  bareSet?: BareSetMapping;
  fileSource?: FileSource;
};

/** The V1 `uiState` bucket. */
export type LegacyUiState = {
  tableState?: PlDataTableStateV2;
  settingsOpen?: boolean;
  loadFromFile?: boolean;
  qiagenColumnsPresent?: boolean;
  immunoSeqColumnsPresent?: boolean;
  mixcrColumnsPresent?: boolean;
  crColumnsPresent?: boolean;
  airrColumnsPresent?: boolean;
};

/**
 * The SDK's `substituteSpecialCharacters` class, mirrored so the model can refuse a collision
 * without a round trip to the workflow. Kept in step with
 * `sdk/workflow-tengo/src/strings.lib.tengo:4`.
 */
const SPECIAL_CHARACTERS = /[-_,.:; +()!<>[\]}{"\\/:$%^#@*&]+/g;

export function sanitizeHeader(header: string): string {
  return header.replace(SPECIAL_CHARACTERS, "_");
}

/** Headers that sanitize to the same token, grouped by that token. */
export function propertyCollisions(properties: ImportedProperty[]): Record<string, string[]> {
  const byToken: Record<string, string[]> = {};
  for (const p of properties) {
    const token = sanitizeHeader(p.header);
    (byToken[token] ??= []).push(p.header);
  }
  return Object.fromEntries(Object.entries(byToken).filter(([, hs]) => hs.length > 1));
}

/**
 * Whether a bare-set mapping is complete enough to run.
 *
 * The identity-uniqueness refusal is NOT here, and that is a constraint rather than a choice:
 * the args lambda is a pure function of `data` and cannot reach prerun's collision report. The
 * verdict is surfaced by the `identityCollisions` output instead, and the refusal that actually
 * protects the data has to live in the workflow. Until it does, a colliding set can be run and
 * will merge records.
 */
export function bareSetValid(bare: BareSetMapping | undefined): boolean {
  if (bare === undefined) return false;
  if (!bare.identity) return false;
  if (!bare.sequences?.IGHeavy && !bare.sequences?.IGLight) return false;
  if (!bare.scheme) return false;
  // Two headers that sanitize alike would produce identical specs and dedupe into one column,
  // losing a column the scientist explicitly chose. Refused rather than disambiguated: a
  // generated suffix would leave names matching nothing in their file.
  return Object.keys(propertyCollisions(bare.properties ?? [])).length === 0;
}
