import type { ImportFileHandle, PlRef } from "@platforma-sdk/model";
export type { ImportFileHandle, PlRef } from "@platforma-sdk/model";

/** The file layouts the block knows how to read. */
export type ImportFormat =
  | "immunoSeq"
  | "qiagen"
  | "mixcr"
  | "mixcr-sc"
  | "cellranger"
  | "airr"
  | "airr-sc"
  | "custom";

/** Which abundance a mapped count column holds. */
export type CountType = "read" | "umi";

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

/**
 * The numbering schemes each selection can be numbered under.
 *
 * IMGT is position-unified and chain-agnostic — ANARCI's `number_imgt` takes no chain type at
 * all. Kabat, Chothia, Martin and Wolfguy were defined on antibody structures and ANARCI
 * implements them for `H`/`K`/`L` only, raising "Unimplemented numbering scheme" for a TCR chain
 * (anarci.py:558-592). So a TCR selection can only be numbered under IMGT, and offering the
 * others would hand the scientist a choice that fails the run.
 *
 * Lives here rather than in the model because the contract enforces it: the panel cannot
 * produce an unnumberable pair, so refusing one costs no reachable state and spares a
 * hand-written template a run that dies in ANARCI.
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

/** What a column can hold, decided by profiling every row of the file. */
export type ColumnValueType = "Long" | "Double" | "String";

/** One file the block imports itself, as the panel recorded it. */
export type FileSource = {
  handle: ImportFileHandle;
  /**
   * Unique id for the dataset this file holds. Minted only when the handle changes — the same
   * test that decides whether the column mapping is dropped — so re-reading the same file keeps
   * its identity and the axis keys it minted.
   */
  datasetId: string;
  /** The filename stem — exactly what samples-and-data would have labelled the sample. */
  label: string;
  /**
   * What kind of file this is. `xlsx` is converted to csv by the workflow before anything
   * reads it, so the pipeline only ever sees csv or tsv.
   */
  extension: "csv" | "tsv" | "xlsx";
};

/** A non-sequence column the scientist accepted as a record property. */
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

/**
 * The germline gene columns the file already carries for one chain. Taken as given: nothing
 * infers them, so an unmapped gene is simply absent from the emitted set.
 */
export type BareSetGenes = {
  /** Header of the V gene column. May carry an allele (`IGHV3-23*01`); the workflow splits it. */
  v?: string;
  /** Header of the J gene column. Same as `v`. */
  j?: string;
};

/** How to read a directly-loaded file as a set of receptor records. */
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
  /**
   * V and J gene columns per chain, keyed by the same slots as `sequences`. Optional throughout:
   * a set with no gene columns is the ordinary case, and a gene is never part of the record key.
   */
  genes?: Partial<Record<BareSetChain, BareSetGenes>>;
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

/**
 * This block's init-params contract — the import as a scientist set it up: which door they
 * came in by, how the columns map, and the subtitle they type.
 *
 * `defaultBlockLabel` is absent: the panel derives it from the chosen source.
 *
 * `fileSource` is accepted but is not what the block's own projection sends. A file travels
 * only when it is a storage reference — `index://` names a `{storageId, path}` any installation
 * carrying that storage can resolve, while `upload://` carries a local path signed with the
 * installation's own secret — and whether a given handle still resolves is knowable only where
 * the block lands. Both handle forms are legal values of the type, so both are valid params;
 * which of them an exporting block sends is that block's call, not this contract's.
 *
 * Every field is optional. A half-configured import is ordinary state the UI reaches -- a file
 * loaded with no mapping yet, a dataset picked with no format chosen -- and the projection
 * hands that state back untouched, so a required field would break the export/apply round trip.
 */
export type BlockParams = Partial<{
  datasetRef: PlRef;
  fileSource: FileSource;
  format: ImportFormat;
  chains: string[];
  customMapping: Record<string, string | undefined>;
  primaryCountType: CountType;
  secondaryCountType: CountType;
  bareSet: BareSetMapping;
  customBlockLabel: string;
}>;
