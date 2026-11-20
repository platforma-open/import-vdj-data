import type { PlDataTableStateV2, PlRef, PObjectSpec } from "@platforma-sdk/model";
import { isPColumnSpec } from "@platforma-sdk/model";
// The import vocabularies, the file source and the bare-set mapping live in the kind: its
// init-params contract names them and a kind cannot import from the model.
import type {
  AssemblingFeature,
  BareSetChain,
  BareSetMapping,
  BareSetScheme,
  ChainSelection,
  ColumnValueType,
  CountType,
  FileSource,
  ImportedProperty,
  ImportFormat,
  PeptideMapping,
} from "@platforma-open/milaboratories.import-vdj.kind";

export type * from "@platforma-open/milaboratories.import-vdj.kind";

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

// The scheme/selection pairing lives in the kind: its contract enforces it, and the panel
// reads the same table so the two can never disagree.
export { SCHEMES_FOR_SELECTION } from "@platforma-open/milaboratories.import-vdj.kind";

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

/** What to call each numbering scheme in front of the scientist. */
export const SCHEME_LABELS: Record<BareSetScheme, string> = {
  imgt: "IMGT",
  kabat: "Kabat",
  chothia: "Chothia",
};

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
  /**
   * Columns whose values use only nucleotide letters. A subset of what may also be in `aminoAcid`
   * — A, C, G, T and N are amino-acid letters too — so the chain slots warn about these rather
   * than hide them. Optional: a profile from an older software version does not carry it.
   */
  nucleotide?: string[];
  /**
   * Columns whose every value is a whole number the import reads: 120, 120.0 or 1,234; not 12.5
   * or 1e+05.
   */
  wholeNumber?: string[];
  /** Every file's header row, by sample id (by file id for a long table). Peptide datasets only. */
  headersBySample?: Record<string, string[]>;
};

/**
 * The column profile of a dataset's first sample file, with every file's header row
 * (`headersBySample`) and the dataset it came from.
 */
export type DatasetProfile = ColumnProfile & { datasetRef: PlRef };

/** Why a dataset's files could not be profiled, and the dataset they belong to. */
export type DatasetProfileFailure = { datasetRef: PlRef; failure: string };

/** A count field of the peptide mapping: UMIs or reads. */
export type PeptideSlot = keyof PeptideMapping["counts"];

/**
 * What a dataset holds: V(D)J repertoires or peptide count tables, in the values of the
 * `pl7.app/modality` annotation. Not stored: it follows from the format.
 */
export type Modality = "vdj" | "peptide";

/** The data type each format reads. */
export const FORMAT_MODALITY = {
  immunoSeq: "vdj",
  qiagen: "vdj",
  mixcr: "vdj",
  "mixcr-sc": "vdj",
  cellranger: "vdj",
  airr: "vdj",
  "airr-sc": "vdj",
  custom: "vdj",
  "peptide-custom": "peptide",
} as const satisfies Record<ImportFormat, Modality>;

/** The data type the format belongs to. With no format chosen yet, V(D)J. */
export function modalityOf(data: { format?: ImportFormat }): Modality {
  return data.format ? FORMAT_MODALITY[data.format] : "vdj";
}

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
  /** Absent means CDR3 — the workflow's own default, so an untouched import keys as it always did. */
  assemblingFeature?: AssemblingFeature;
  bareSet?: BareSetMapping;
  /** Present only with `format: "peptide-custom"`. */
  peptide?: PeptideMapping;
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
  customBlockLabel: string;
  /** Label of the picked pool dataset, shown in the subtitle; the UI keeps it in sync. */
  subtitleLabel?: string;

  // --- the two doors. Exactly one is set; the run check enforces it.
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
  /**
   * Which gene feature clonotypes are assembled by, for the AIRR formats. CDR3 when unset.
   * Widening it is the scientist's call: it decides both the clonotype key and how many
   * rearrangements survive, since a row that does not cover the feature cannot be keyed on it.
   */
  assemblingFeature?: AssemblingFeature;

  // --- bare set. Its presence is what selects the bare path in the workflow.
  bareSet?: BareSetMapping;

  // --- peptide count tables, read with `format: "peptide-custom"`.
  peptide?: PeptideMapping;

  /**
   * What prerun found, kept here so the run check — which sees only `data` — can gate the run
   * on it. Written by the UI (`ui/src/app.ts`).
   *
   * The verdict carries what it is *about*, so one reached for something no longer selected is
   * ignored rather than applied. Tagged by which check it is: the paths through `runRefusal`
   * that consult a verdict return before reaching each other, so only ever one is live.
   */
  prerunCheck?:
    | {
        check: "columns";
        /** The mapping the verdict was reached for — see {@link collisionCheckKey}. */
        subject: string;
        /** The id column repeats on rows that are not identical, so two records would merge. */
        identityCollides: boolean;
      }
    | {
        check: "dataset";
        /** The dataset and format the verdict was reached for — see {@link datasetCheckKey}. */
        subject: string;
        /** The dataset carries the columns its declared format needs. */
        columnsPresent: boolean;
      }
    | {
        check: "peptide";
        /** The dataset and peptide mapping the verdict was reached for — see {@link peptideCheckKey}. */
        subject: string;
        /** What the import would read wrongly or fail on; empty when every file is clean. */
        problems: string[];
      };

  // --- view state. None of this is projected anywhere.
  tableState: PlDataTableStateV2;
  settingsOpen: boolean;
};

/** Block data up to v2, when the panel stored the whole subtitle text it had derived. */
export type BlockDataV2 = Omit<BlockData, "subtitleLabel"> & { defaultBlockLabel: string };

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
};

/**
 * The SDK's `substituteSpecialCharacters` class, mirrored so the model can refuse a collision
 * without a round trip to the workflow. Kept in step with
 * the SDK's `strings.lib.tengo`.
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

/** The mapped sequence slots and headers, in slot order. */
function mappedSequences(mapping: Partial<Pick<BareSetMapping, "sequences">>): [string, string][] {
  return Object.entries(mapping.sequences ?? {})
    .filter((e): e is [string, string] => !!e[1])
    .sort(([a], [b]) => a.localeCompare(b));
}

/**
 * What a collision verdict is about: the id column and the sequence columns, since rows missing
 * a mapped sequence are left out of the comparison. The file is not in the key: `prerunCheck` is
 * dropped when the file or dataset changes.
 */
export function collisionCheckKey(
  mapping:
    | (Pick<BareSetMapping, "identity"> & Partial<Pick<BareSetMapping, "sequences">>)
    | undefined,
): string | undefined {
  if (mapping === undefined || !mapping.identity) return undefined;
  return JSON.stringify([mapping.identity, mappedSequences(mapping)]);
}

/** What a row report is about: the id and sequence columns. `undefined` until both are chosen. */
export function rowReportKey(
  mapping: Pick<BareSetMapping, "identity" | "sequences"> | undefined,
): string | undefined {
  if (mapping === undefined || !mapping.identity) return undefined;
  const sequences = mappedSequences(mapping);
  if (sequences.length === 0) return undefined;
  return JSON.stringify([mapping.identity, sequences]);
}

/** Rows that will not become records of their own. `collapsed` is most-repeated first. */
export type RowReport = {
  key: string;
  rowCount: number;
  /** Rows with an id but no sequence on a mapped chain. */
  missingSequence: number;
  /** Rows with no id (empty or whitespace), with or without a sequence. */
  missingId: number;
  /** Distinct, sorted. Rows with no id are only counted. */
  missingIds: string[];
  collapsed: { id: string; rows: number }[];
};

/**
 * What a dataset-door verdict is about: the dataset picked and the format it was declared to be.
 * Both, because the same dataset answers differently under a different format.
 *
 * `undefined` when there is nothing to check yet — no dataset, or no format — which is also how
 * the caller tells the dataset door from the file door.
 */
export function datasetCheckKey(
  data: Pick<BlockData, "datasetRef" | "format">,
): string | undefined {
  const ref = data.datasetRef;
  if (ref === undefined || data.format === undefined) return undefined;
  return [ref.blockId, ref.name, data.format].join("\u0000");
}

/**
 * The header of a long table's sample column (Samples & Data's "Multisample CSV/TSV": several
 * samples per file), read off the dataset spec; `undefined` for any other dataset. The annotation
 * sits on the file axis and tells a long table from a Bulk Count Matrix, which has the same axis
 * without it. Same rule as the workflow's `dataset-door.tpl.tengo`.
 */
export function sampleColumnOf(spec: PObjectSpec): string | undefined {
  if (!isPColumnSpec(spec)) return undefined;
  return spec.axesSpec[0]?.annotations?.["pl7.app/sampleColumnName"];
}

/**
 * Which prerun verdict gates the run: the identity check of a loaded file or bare set, the peptide
 * check, or the dataset's columns. The run check reads this one, and the UI writes this one.
 */
export function liveCheck(
  data: Pick<BlockData, "fileSource" | "format" | "bareSet">,
): NonNullable<BlockData["prerunCheck"]>["check"] {
  if (data.fileSource !== undefined) return "columns";
  if (data.format === "custom" && data.bareSet !== undefined) return "columns";
  if (data.format === "peptide-custom") return "peptide";
  return "dataset";
}

/**
 * The mapping with everything that names a column dropped. The receptor declaration and the
 * numbering scheme describe the biology and outlive any one file; the column names do not.
 */
export function forgetMappedColumns(bare: BareSetMapping | undefined): BareSetMapping | undefined {
  if (bare === undefined) return undefined;
  return {
    identity: "",
    chainSelection: bare.chainSelection,
    sequences: {},
    scheme: bare.scheme,
  };
}

/** The check of a peptide mapping against the selected dataset's files. */
export type PeptideCheck = {
  /** The dataset and mapping checked; see {@link peptideCheckKey}. */
  key: string;
  /** What keeps the import from running, one message per problem; see {@link peptideProblems}. */
  problems: string[];
};

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
