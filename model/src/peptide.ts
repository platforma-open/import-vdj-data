import type { CountType, PeptideMapping } from "@platforma-open/milaboratories.import-vdj.kind";
import type { PlRef } from "@platforma-sdk/model";
import type { ColumnProfile, PeptideSlot } from "./types";

// --- The peptide mapping: its fields, its check before Run and its run gate.

/**
 * The name of each peptide mapping field in the panel and in messages: the label Platforma gives
 * the column the import creates from it.
 */
export const PEPTIDE_FIELD_LABELS = {
  aminoAcid: "Peptide aa",
  nucleotide: "Peptide nt",
  counts: { uniqueMolecules: "Number of UMIs", reads: "Number of Reads" },
} as const;

/** The mapping's count slots, in the order the panel and the messages list them. */
const PEPTIDE_SLOT_KEYS = ["uniqueMolecules", "reads"] as const satisfies readonly PeptideSlot[];

/** The count field of the primary count type: reads unless UMIs were chosen, as for V(D)J. */
export function peptidePrimarySlot(primaryCountType: CountType | undefined): PeptideSlot {
  return primaryCountType === "umi" ? "uniqueMolecules" : "reads";
}

/** Every column a peptide mapping reads, by its field label. */
export function peptideMappedColumns(mapping: PeptideMapping): MappedColumn[] {
  const columns: MappedColumn[] = [
    { label: PEPTIDE_FIELD_LABELS.aminoAcid, header: mapping.aminoAcid },
    { label: PEPTIDE_FIELD_LABELS.nucleotide, header: mapping.nucleotide ?? "" },
  ];
  for (const slot of PEPTIDE_SLOT_KEYS) {
    columns.push({ label: PEPTIDE_FIELD_LABELS.counts[slot], header: mapping.counts[slot] ?? "" });
  }
  return columns.filter((c) => c.header !== "");
}

/** Whether a peptide mapping names an amino-acid column and at least one count column. */
export function peptideMappingComplete(peptide: PeptideMapping | undefined): boolean {
  if (peptide === undefined || !peptide.aminoAcid) return false;
  return !!peptide.counts?.uniqueMolecules || !!peptide.counts?.reads;
}

/**
 * The peptide mapping with every column name dropped, for a dataset switch: column names belong
 * to one dataset's files.
 */
export function forgetPeptideColumns(
  peptide: PeptideMapping | undefined,
): PeptideMapping | undefined {
  if (peptide === undefined) return undefined;
  return { aminoAcid: "", counts: {} };
}

/**
 * What a peptide check is about: the dataset and every mapping field the check reads, as a
 * fixed-order list (an object's key order does not survive the round trip through the backend).
 * `undefined` until a dataset is picked and the mapping is complete.
 */
export function peptideCheckKey(
  datasetRef: PlRef | undefined,
  peptide: PeptideMapping | undefined,
): string | undefined {
  if (datasetRef === undefined || !peptideMappingComplete(peptide)) return undefined;
  const p = peptide!;
  return JSON.stringify([
    datasetRef.blockId,
    datasetRef.name,
    p.aminoAcid,
    p.nucleotide ?? "",
    p.counts.uniqueMolecules ?? "",
    p.counts.reads ?? "",
  ]);
}

/**
 * What keeps a peptide import from running, one message per problem; none when the files fit the
 * mapping.
 */
export function peptideProblems(
  profile: ColumnProfile,
  mapping: PeptideMapping,
  labels: Record<string, string>,
): string[] {
  const missing = missingColumns(peptideMappedColumns(mapping), profile.headersBySample, labels);
  if (missing.length > 0) return missing;

  // The profiled file is the dataset's first by sorted key, and the keys are the sample ids.
  const first = Object.keys(profile.headersBySample ?? {}).sort()[0];
  const where = first === undefined ? "" : ` in ${labels[first] ?? first}`;
  const problems: string[] = [];
  // A nucleotide column reads as amino acids too: A, C, G and T are amino-acid letters.
  const nucleotide = profile.nucleotide ?? [];
  if (!profile.aminoAcid.includes(mapping.aminoAcid) || nucleotide.includes(mapping.aminoAcid)) {
    const name = field(PEPTIDE_FIELD_LABELS.aminoAcid, mapping.aminoAcid);
    problems.push(`${name} is not an amino-acid sequence column${where}`);
  }
  if (mapping.nucleotide && !nucleotide.includes(mapping.nucleotide)) {
    const name = field(PEPTIDE_FIELD_LABELS.nucleotide, mapping.nucleotide);
    problems.push(`${name} is not a nucleotide sequence column${where}`);
  }
  for (const slot of PEPTIDE_SLOT_KEYS) {
    const header = mapping.counts[slot];
    if (!header || (profile.wholeNumber ?? []).includes(header)) continue;
    const name = field(PEPTIDE_FIELD_LABELS.counts[slot], header);
    problems.push(`${name} has values that are not whole numbers${where}`);
  }
  return problems;
}

// --- Columns a mapping reads, for any data type.
// TODO: move this section to model/src/columns.ts when V(D)J custom starts using it (after PR #57
// merges): it names columns missing from some sample's file and the columns every file has.

/** A column a mapping reads: the field's label in Platforma and the column's name in the file. */
export type MappedColumn = { label: string; header: string };

/** `Number of Reads ("Count")`: the field's label, then the header it reads in the file. */
const field = (label: string, header: string) => `${label} ("${header}")`;

/** Sample labels named per message before "and N more". */
const SAMPLES_SHOWN = 3;

/** `a, b, c and 4 more`. */
function andMore(values: string[], shown: number): string {
  const head = values.slice(0, shown).join(", ");
  const rest = values.length - shown;
  return rest > 0 ? `${head} and ${rest} more` : head;
}

/**
 * A message for each mapped column some sample's file lacks, naming the samples. Empty when the
 * header rows are not known yet. Any data type: the caller lists the columns its mapping reads.
 */
export function missingColumns(
  columns: MappedColumn[],
  headersBySample: Record<string, string[]> | undefined,
  labels: Record<string, string>,
): string[] {
  if (headersBySample === undefined) return [];
  return columns.flatMap(({ label, header }) => {
    const lacking = Object.entries(headersBySample)
      .filter(([, headers]) => !headers.includes(header))
      .map(([sample]) => labels[sample] ?? sample);
    if (lacking.length === 0) return [];
    return [`${field(label, header)} is missing in ${andMore(lacking, SAMPLES_SHOWN)}`];
  });
}

/** The headers every sample's file has, in the first file's order. */
export function commonHeaders(profile: ColumnProfile): string[] {
  const all = Object.values(profile.headersBySample ?? {});
  return profile.headers.filter((h) => all.every((headers) => headers.includes(h)));
}
