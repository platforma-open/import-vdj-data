import { assertParamsObject } from "@platforma-sdk/block-kind";
import { isImportFileHandleIndex, isImportFileHandleUpload, isPlRef } from "@platforma-sdk/model";
import type {
  BareSetChain,
  BareSetMapping,
  BareSetScheme,
  BlockParams,
  ChainSelection,
  ColumnValueType,
  CountType,
  FileSource,
  ImportedProperty,
  ImportFileHandle,
  ImportFormat,
} from "./types";
import { SCHEMES_FOR_SELECTION } from "./types";

/**
 * The contract at runtime, for params that arrive from a template file rather than from typed
 * code.
 *
 * Each field the contract names is read and checked; a key it does not name is dropped by never
 * being read, so it needs no rejection here. Params written against a different version of the
 * contract are caught by the version in the template entry's `{name}@{selector}` reference, not
 * by a key-set check.
 */
export function parseInitializationParams(value: unknown): BlockParams {
  assertParamsObject(value);

  const params: Record<string, unknown> = {};
  for (const [field, { is, must }] of Object.entries(CONTRACT)) {
    const raw = value[field];
    if (raw === undefined) continue;
    if (!is(raw)) throw new Error(`'${field}' must be ${must}.`);
    params[field] = raw;
  }
  // Every value placed here passed its own field's guard, and `CONTRACT` is proven exhaustive
  // over `BlockParams` by the `satisfies` below.
  return params as BlockParams;
}

// Internals

type Guard<T> = (value: unknown) => value is T;

const isString = (v: unknown): v is string => typeof v === "string";
const isUndefined = (v: unknown): v is undefined => v === undefined;

/** A JSON object, which is the only object shape a template document can carry. */
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A guard plus how to finish the sentence "'field' must be …". */
type Check<T> = { readonly is: Guard<T>; readonly must: string };

function check<T>(is: Guard<T>, must: string): Check<T> {
  return { is, must };
}

function arrayOf<T>(item: Guard<T>): Guard<T[]> {
  return (v): v is T[] => Array.isArray(v) && v.every((e) => item(e));
}

/** A guard for one of a vocabulary's members, from the vocabulary itself. */
function oneOf<T extends string>(vocabulary: Record<T, true>): Guard<T> {
  return (v): v is T => isString(v) && Object.hasOwn(vocabulary, v);
}

function vocabularyList(vocabulary: Record<string, true>): string {
  return Object.keys(vocabulary).join(", ");
}

const IMPORT_FORMATS = {
  immunoSeq: true,
  qiagen: true,
  mixcr: true,
  "mixcr-sc": true,
  cellranger: true,
  airr: true,
  "airr-sc": true,
  custom: true,
} as const satisfies Record<ImportFormat, true>;

const COUNT_TYPES = { read: true, umi: true } as const satisfies Record<CountType, true>;

const CHAIN_SELECTIONS = {
  IG: true,
  IGHeavy: true,
  IGLight: true,
  TCRAB: true,
  TCRBeta: true,
  TCRAlpha: true,
  TCRGD: true,
  TCRDelta: true,
  TCRGamma: true,
} as const satisfies Record<ChainSelection, true>;

const BARE_SET_CHAINS = {
  IGHeavy: true,
  IGLight: true,
  TCRBeta: true,
  TCRAlpha: true,
  TCRDelta: true,
  TCRGamma: true,
} as const satisfies Record<BareSetChain, true>;

const BARE_SET_SCHEMES = {
  imgt: true,
  kabat: true,
  chothia: true,
} as const satisfies Record<BareSetScheme, true>;

const COLUMN_VALUE_TYPES = {
  Long: true,
  Double: true,
  String: true,
} as const satisfies Record<ColumnValueType, true>;

const FILE_EXTENSIONS = { csv: true, tsv: true, xlsx: true } as const;

/**
 * Both handle forms are accepted. The two SDK guards are prefix tests -- the cast only gets a
 * checked string past a signature that expects the union.
 */
const isFileHandle: Guard<ImportFileHandle> = (v): v is ImportFileHandle =>
  isString(v) &&
  (isImportFileHandleIndex(v as ImportFileHandle) ||
    isImportFileHandleUpload(v as ImportFileHandle));

const isFileSource: Guard<FileSource> = (v): v is FileSource =>
  isPlainObject(v) &&
  isFileHandle(v.handle) &&
  isString(v.sampleId) &&
  isString(v.label) &&
  oneOf(FILE_EXTENSIONS)(v.extension);

/**
 * A mapping slot holds a header from the file, so the check is the string test: which headers
 * a file actually has is knowable only once the file is read.
 */
const isSequenceMap: Guard<BareSetMapping["sequences"]> = (v): v is BareSetMapping["sequences"] =>
  isPlainObject(v) &&
  Object.entries(v).every(([slot, header]) => oneOf(BARE_SET_CHAINS)(slot) && isString(header));

const isImportedProperty: Guard<ImportedProperty> = (v): v is ImportedProperty =>
  isPlainObject(v) && isString(v.header) && oneOf(COLUMN_VALUE_TYPES)(v.valueType);

/**
 * A bare-set mapping at the envelope. Whether the mapping is *complete* is not asked here:
 * `bareSetValid` in the model decides that, and it decides it about a mapping the panel is
 * still being filled in -- a declaration whose slots are not all mapped yet is a state the UI
 * reaches, and refusing it would refuse a template exported from that state.
 *
 * The scheme is the exception, and it is not a completeness question. A TCR selection can only
 * be numbered under IMGT, and the panel enforces that from both ends -- the scheme dropdown
 * offers only what the selection allows, and changing the selection resets a scheme the new
 * chains cannot carry. So an unnumberable pair is a state the UI cannot reach: refusing it
 * costs no reachable state, and accepting it would let a hand-written template start a run that
 * dies in ANARCI with "Unimplemented numbering scheme".
 */
const isBareSetMapping: Guard<BareSetMapping> = (v): v is BareSetMapping =>
  isPlainObject(v) &&
  isString(v.identity) &&
  oneOf(CHAIN_SELECTIONS)(v.chainSelection) &&
  isSequenceMap(v.sequences) &&
  oneOf(BARE_SET_SCHEMES)(v.scheme) &&
  SCHEMES_FOR_SELECTION[v.chainSelection].includes(v.scheme) &&
  (isUndefined(v.properties) || arrayOf(isImportedProperty)(v.properties));

/**
 * The dataset-door column mapping: a canonical slot name to the file's header. `undefined` is a
 * legal value -- the panel writes it when a slot is cleared.
 */
const isCustomMapping: Guard<Record<string, string | undefined>> = (
  v,
): v is Record<string, string | undefined> =>
  isPlainObject(v) && Object.values(v).every((h) => isUndefined(h) || isString(h));

/**
 * The contract, field by field, at runtime.
 *
 * The `satisfies` clause is the drift guard: it demands an entry for every key `BlockParams`
 * declares, and types each guard against that key's own type. Add a field to the contract and
 * this stops compiling until the check exists -- which matters here because every field is
 * optional, so a parser that simply forgot one would otherwise return a valid `BlockParams` and
 * say nothing.
 */
const CONTRACT = {
  datasetRef: check(isPlRef, "a reference to an upstream dataset, written as { block, name }"),
  fileSource: check(isFileSource, "a file source with a handle, sample id, label and extension"),
  format: check(oneOf(IMPORT_FORMATS), `one of: ${vocabularyList(IMPORT_FORMATS)}`),
  chains: check(arrayOf(isString as Guard<string>), "an array of chain names"),
  customMapping: check(isCustomMapping, "an object of mapping slot to file header"),
  primaryCountType: check(oneOf(COUNT_TYPES), `one of: ${vocabularyList(COUNT_TYPES)}`),
  secondaryCountType: check(oneOf(COUNT_TYPES), `one of: ${vocabularyList(COUNT_TYPES)}`),
  bareSet: check(
    isBareSetMapping,
    `a bare set mapping with an identity column, one of: ${vocabularyList(CHAIN_SELECTIONS)}, ` +
      `its sequence columns, and a numbering scheme that selection can carry ` +
      `(a TCR selection can only be numbered under imgt)`,
  ),
  customBlockLabel: check(isString, "a string"),
} satisfies { [K in keyof BlockParams]-?: Check<NonNullable<BlockParams[K]>> };
