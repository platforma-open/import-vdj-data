import type {
  ChainSelection,
  CountType,
  ImportFormat,
} from "@platforma-open/milaboratories.import-vdj.model";

/** A `PlDropdown` option. */
type Option<T> = { label: string; value: T };

/** The formats the dataset door can read. `custom` is the mapping-by-hand path. */
export const formatOptions: Option<ImportFormat>[] = [
  { label: "ImmunoSeq", value: "immunoSeq" },
  { label: "QIAseq Immune Repertoire Analysis", value: "qiagen" },
  { label: "MiXCR bulk", value: "mixcr" },
  { label: "MiXCR single cell", value: "mixcr-sc" },
  { label: "Cell Ranger VDJ", value: "cellranger" },
  { label: "AIRR bulk", value: "airr" },
  { label: "AIRR single cell", value: "airr-sc" },
  { label: "Custom", value: "custom" },
];

/** Chains to import from the selected dataset. Values are the `pl7.app/vdj/chain` vocabulary. */
export const chainsOptions: Option<ChainSelection>[] = [
  { label: "IG Heavy", value: "IGHeavy" },
  { label: "IG Light", value: "IGLight" },
  { label: "TCR-α", value: "TCRAlpha" },
  { label: "TCR-β", value: "TCRBeta" },
  { label: "TCR-ɣ", value: "TCRDelta" },
  { label: "TCR-δ", value: "TCRGamma" },
];

/** Receptors offered on the direct-file door, where the scientist declares what they are importing. */
export const receptorOptions: Option<ChainSelection>[] = [
  { value: "IG", label: "IG" },
  { value: "TCRAB", label: "TCR-αβ" },
  { value: "TCRGD", label: "TCR-ɣδ" },
];

export const countTypeOptions: Option<CountType>[] = [
  { label: "Reads", value: "read" },
  { label: "UMIs", value: "umi" },
];

/**
 * Sentinel for the "load from file" entry in the dataset dropdown. `PlDropdownRef` cannot express
 * it — its values are `PlRef`s — so the source picker is a plain dropdown that maps back.
 */
export const LOAD_FROM_FILE = "__load_from_file__";

/** A column the custom mapping can name. */
type MappableColumn = { key: string; label: string };

/** Always asked for on the custom format, whichever chains are picked. */
export const requiredCanonicalBase: MappableColumn[] = [
  { key: "cdr3-aa", label: "CDR3 aa" },
  { key: "cdr3-nt", label: "CDR3 nt" },
  { key: "v-gene", label: "V gene" },
  { key: "j-gene", label: "J gene" },
];

export const optionalSequence: MappableColumn[] = [
  { key: "fr1-aa", label: "FR1 aa" },
  { key: "fr2-aa", label: "FR2 aa" },
  { key: "fr3-aa", label: "FR3 aa" },
  { key: "fr4-aa", label: "FR4 aa" },
  { key: "cdr1-aa", label: "CDR1 aa" },
  { key: "cdr2-aa", label: "CDR2 aa" },
  { key: "vdj-aa", label: "Full VDJ region aa" },
  { key: "fr1-nt", label: "FR1 nt" },
  { key: "fr2-nt", label: "FR2 nt" },
  { key: "fr3-nt", label: "FR3 nt" },
  { key: "fr4-nt", label: "FR4 nt" },
  { key: "cdr1-nt", label: "CDR1 nt" },
  { key: "cdr2-nt", label: "CDR2 nt" },
  { key: "vdj-nt", label: "Full VDJ region nt" },
];

export const optionalCanonical: MappableColumn[] = [
  { key: "top-chains", label: "Top chains" },
  { key: "v-allele", label: "V allele" },
  { key: "j-allele", label: "J allele" },
  { key: "d-gene", label: "D gene" },
  { key: "d-allele", label: "D allele" },
  { key: "c-gene", label: "C gene" },
  { key: "c-allele", label: "C allele" },
  { key: "is-productive", label: "Productive" },
  // CDR3 lengths are calculated by the workflow, so they are not offered here.
  { key: "isotype", label: "Isotype" },
  { key: "n-length-vj-junction", label: "VJ junction length (nt)" },
  { key: "n-length-vd-junction", label: "VD junction length (nt)" },
  { key: "n-length-dj-junction", label: "DJ junction length (nt)" },
  { key: "n-length-total-added", label: "Total added nt" },
];

export const optionalMutations: MappableColumn[] = [
  { key: "aa-mutations-count-v", label: "AA mutations count (V)" },
  { key: "aa-mutations-rate-v", label: "AA mutations rate (V)" },
  { key: "nt-mutations-count-v", label: "NT mutations count (V)" },
  { key: "nt-mutations-rate-v", label: "NT mutations rate (V)" },
  { key: "aa-mutations-count-j", label: "AA mutations count (J)" },
  { key: "aa-mutations-rate-j", label: "AA mutations rate (J)" },
  { key: "nt-mutations-count-j", label: "NT mutations count (J)" },
  { key: "nt-mutations-rate-j", label: "NT mutations rate (J)" },
];
