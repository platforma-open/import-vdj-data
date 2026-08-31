import { formatOptions } from "./constants";

/**
 * How many sample names the empty-samples banner lists before summarising the rest, so a large
 * dataset cannot flood it.
 */
const EMPTY_SAMPLES_SHOWN = 5;

/**
 * How many repeated identity values the non-unique-id warning lists. Printed whole rather than
 * trimmed: the id column can hold sequences, and cutting those hides what tells them apart.
 */
const COLLISIONS_SHOWN = 3;

/**
 * `a, b, c and 4 more`. Long lists are truncated rather than scrolled: the values can be
 * sequences or sample names, and a banner that fills the panel hides the controls under it.
 */
function andMore(values: string[], shown: number): string {
  const head = values.slice(0, shown).join(", ");
  const rest = values.length - shown;
  return rest > 0 ? `${head} and ${rest} more` : head;
}

/** The display name for a format id, from the same list the dropdown is built from. */
export function formatLabel(format: string | undefined): string {
  if (!format) return "";
  const key = format.toLowerCase();
  return formatOptions.find((o) => o.value.toLowerCase() === key)?.label ?? format;
}

/**
 * Samples left with no clonotypes once the chosen chains were filtered for. `undefined` when
 * every sample kept something, which is the caller's signal not to raise a banner at all.
 */
export function emptySamplesMessage(empty: string[]): string | undefined {
  if (empty.length === 0) return undefined;
  return `After receptor chain filtering, no clonotypes found in sample(s) ${andMore(empty, EMPTY_SAMPLES_SHOWN)}`;
}

/** The dataset does not carry the columns its declared format needs. Empty when it does. */
export function missingColumnsMessage(
  result: { isValid: boolean; missingColumns: string[]; format: string } | undefined,
): string {
  if (!result || result.isValid) return "";
  return (
    `The selected dataset is missing required ${formatLabel(result.format)} columns: ` +
    `${result.missingColumns.join(", ")}. ` +
    `Please verify the format selection or choose a different dataset.`
  );
}

/**
 * The identity column repeats on rows that are not identical, so two rows would merge into one
 * record. Empty when it does not.
 */
export function identityCollisionMessage(values: string[]): string {
  if (values.length === 0) return "";
  return (
    `Repeated on rows that are not identical: ${andMore(values, COLLISIONS_SHOWN)}. ` +
    `Two rows sharing an id become one record — pick a different column, or fix the file.`
  );
}

/**
 * Two accepted property headers that sanitize to the same column name. Refused rather than
 * disambiguated: a generated suffix would name nothing in the scientist's file.
 */
export function propertyCollisionMessage(groups: string[][]): string {
  if (groups.length === 0) return "";
  const pairs = groups.map((headers) => headers.join(" / ")).join("; ");
  return (
    `These headers would become the same column: ${pairs}. ` +
    `Rename one in the file — importing both is not possible, and dropping one silently would ` +
    `lose a column you asked for.`
  );
}
