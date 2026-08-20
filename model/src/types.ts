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
export type BareSetChain = "IGHeavy" | "IGLight" | "TCRBeta" | "TCRAlpha" | "TCRDelta" | "TCRGamma";

/**
 * What the scientist declares they are importing — a receptor, or one of its chains.
 *
 * The declaration decides how many sequence columns the panel asks for, and it is a statement
 * rather than an inference. Before this, "paired or single-chain" was read off how many slots
 * happened to be filled, so a paired panel with the light column not yet mapped was
 * indistinguishable from a deliberately heavy-only one — and the two emit different shapes.
 */
export type ChainSelection =
  | "IG"
  | "IGHeavy"
  | "IGLight"
  | "TCRAB"
  | "TCRBeta"
  | "TCRAlpha"
  | "TCRGD"
  | "TCRDelta"
  | "TCRGamma";

/** Numbering conventions the block offers. */
export type BareSetScheme = "imgt" | "kabat" | "chothia";

/** The sequence columns each selection asks for, in emission order. */
export const CHAIN_SLOTS: Record<ChainSelection, BareSetChain[]> = {
  IG: ["IGHeavy", "IGLight"],
  IGHeavy: ["IGHeavy"],
  IGLight: ["IGLight"],
  // The more diverse chain first, matching MiXCR's receptorInfos order.
  TCRAB: ["TCRBeta", "TCRAlpha"],
  TCRBeta: ["TCRBeta"],
  TCRAlpha: ["TCRAlpha"],
  TCRGD: ["TCRDelta", "TCRGamma"],
  TCRDelta: ["TCRDelta"],
  TCRGamma: ["TCRGamma"],
};

/**
 * The numbering schemes each selection can be numbered under.
 *
 * IMGT is position-unified and chain-agnostic — ANARCI's `number_imgt` takes no chain type at
 * all. Kabat, Chothia, Martin and Wolfguy were defined on antibody structures and ANARCI
 * implements them for `H`/`K`/`L` only, raising "Unimplemented numbering scheme" for a TCR chain
 * (anarci.py:558-592). So a TCR selection can only be numbered under IMGT, and offering the
 * others would hand the scientist a choice that fails the run.
 */
export const SCHEMES_FOR_SELECTION: Record<ChainSelection, BareSetScheme[]> = {
  IG: ["imgt", "kabat", "chothia"],
  IGHeavy: ["imgt", "kabat", "chothia"],
  IGLight: ["imgt", "kabat", "chothia"],
  TCRAB: ["imgt"],
  TCRBeta: ["imgt"],
  TCRAlpha: ["imgt"],
  TCRGD: ["imgt"],
  TCRDelta: ["imgt"],
  TCRGamma: ["imgt"],
};

/**
 * What to call each slot in front of the scientist — the same words the receptor/chain list
 * uses, so the slot that appears after a choice is named the way the choice was.
 *
 * No alphabet in the name. Every sequence a bare set takes is amino acid today, and when that
 * stops being true it will be a control of its own rather than a suffix on six labels.
 */
export const CHAIN_SLOT_LABELS: Record<BareSetChain, string> = {
  IGHeavy: "IG Heavy",
  IGLight: "IG Light",
  TCRBeta: "TCR-β",
  TCRAlpha: "TCR-α",
  TCRDelta: "TCR-δ",
  TCRGamma: "TCR-ɣ",
};

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
   * What is being imported. Decides which sequence slots the panel offers, and therefore
   * whether the emitted set is paired or bulk-shaped.
   */
  chainSelection: ChainSelection;
  /**
   * Amino-acid variable domain per chain, keyed by the slot the column was assigned to — so the
   * file needs no chain column and nothing is matched against a locus map. A row carrying both
   * chains is unpivoted into one record, not split into two.
   */
  sequences: Partial<Record<BareSetChain, string>>;
  /** The numbering convention ANARCI is asked for, and the one recorded on every region. */
  scheme: BareSetScheme;
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
  if (!bare.chainSelection) return false;
  // Every slot the declaration asks for must be filled. Declaring IG and mapping only the heavy
  // column is an unfinished mapping, not a heavy-only set: the scientist said there are two
  // chains, and emitting one of them instead would be answering a question they did not ask.
  const slots = CHAIN_SLOTS[bare.chainSelection] ?? [];
  if (slots.length === 0) return false;
  if (slots.some((slot) => !bare.sequences?.[slot])) return false;
  if (!bare.scheme) return false;
  // Two headers that sanitize alike would produce identical specs and dedupe into one column,
  // losing a column the scientist explicitly chose. Refused rather than disambiguated: a
  // generated suffix would leave names matching nothing in their file.
  return Object.keys(propertyCollisions(bare.properties ?? [])).length === 0;
}
