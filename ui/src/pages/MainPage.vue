<script setup lang="ts">
import type {
  BareSetChain,
  BareSetScheme,
  BlockData,
  ChainSelection,
  ImportedProperty,
} from "@platforma-open/milaboratories.import-vdj.model";
import {
  CHAIN_SLOT_LABELS,
  CHAIN_SLOTS,
  SCHEMES_FOR_SELECTION,
} from "@platforma-open/milaboratories.import-vdj.model";
import { propertyCollisions } from "@platforma-open/milaboratories.import-vdj.model";
import type { ImportFileHandle, PlRef } from "@platforma-sdk/model";
import { getFileNameFromHandle, uniquePlId } from "@platforma-sdk/model";
import canonicalize from "canonicalize";
import { plRefsEqual } from "@platforma-sdk/model";
import {
  PlAccordion,
  PlAccordionSection,
  PlAgDataTableV2,
  PlAlert,
  PlBlockPage,
  PlBtnGhost,
  PlDropdown,
  PlDropdownMulti,
  PlFileDialog,
  PlElementList,
  PlMaskIcon24,
  PlSectionSeparator,
  PlSlideModal,
  usePlDataTableSettingsV2,
} from "@platforma-sdk/ui-vue";
import type { ImportedFiles } from "@platforma-sdk/ui-vue";
import { computed, ref, watch, watchEffect } from "vue";
import { useApp } from "../app";

const app = useApp();

const formatOptions = [
  { label: "ImmunoSeq", value: "immunoSeq" },
  { label: "QIAseq Immune Repertoire Analysis", value: "qiagen" },
  { label: "MiXCR bulk", value: "mixcr" },
  { label: "MiXCR single cell", value: "mixcr-sc" },
  { label: "Cell Ranger VDJ", value: "cellranger" },
  { label: "AIRR bulk", value: "airr" },
  { label: "AIRR single cell", value: "airr-sc" },
  { label: "Custom", value: "custom" },
];

const chainsOptions = [
  { label: "IG Heavy", value: "IGHeavy" },
  { label: "IG Light", value: "IGLight" },
  { label: "TRA", value: "TCRAlpha" },
  { label: "TRB", value: "TCRBeta" },
  { label: "TRD", value: "TCRDelta" },
  { label: "TRG", value: "TCRGamma" },
];

const receptorOptions = [
  { value: "IG", label: "IG" },
  { value: "TCRAB", label: "TCR-αβ" },
  { value: "TCRGD", label: "TCR-ɣδ" },
];

// Warn when chain filtering left a sample with no clonotypes; cap the names so a big dataset can't flood the banner.
const EMPTY_SAMPLES_SHOWN = 5;

const emptySamplesMessage = computed(() => {
  const empty = app.model.outputs.emptyChainSamples?.emptySamples ?? [];
  if (empty.length === 0) return undefined;

  const shown = empty.slice(0, EMPTY_SAMPLES_SHOWN).join(", ");
  const overflow = empty.length - EMPTY_SAMPLES_SHOWN;
  const samples = overflow > 0 ? `${shown} and ${overflow} more` : shown;

  return `After receptor chain filtering, no clonotypes found in sample(s) ${samples}`;
});

const SCHEME_LABELS: Record<BareSetScheme, string> = {
  imgt: "IMGT",
  kabat: "Kabat",
  chothia: "Chothia",
};

/**
 * Only the schemes the declared chains can actually be numbered under. Kabat and Chothia are
 * antibody schemes — ANARCI implements them for heavy and light only and raises for a TCR chain
 * — so a TCR selection narrows this to IMGT rather than offering a choice that fails the run.
 */
const schemeOptions = computed(() => {
  const selection = app.model.data.bareSet?.chainSelection;
  const allowed = selection
    ? (SCHEMES_FOR_SELECTION[selection] ?? (["imgt"] as BareSetScheme[]))
    : (["imgt", "kabat", "chothia"] as BareSetScheme[]);
  return allowed.map((s) => ({ label: SCHEME_LABELS[s], value: s }));
});

// updating defaultBlockLabel
watchEffect(() => {
  const args = app.model.data as any;
  const parts: string[] = [];

  // On the file door the file IS the dataset, so its name is the only useful thing to show.
  // Falling through to the chain list below would title every such block with the same six
  // chain names, which are a default the scientist never chose and which say nothing about
  // what was imported.
  if (args.fileSource) {
    parts.push(args.fileSource.label);
    const scheme = args.bareSet?.scheme as BareSetScheme | undefined;
    if (scheme && scheme !== "imgt") {
      parts.push(SCHEME_LABELS[scheme] ?? scheme);
    }
    args.defaultBlockLabel = parts.filter(Boolean).join(" - ");
    return;
  }

  // Add dataset name if available
  if (args.datasetRef) {
    const datasetOptions = app.model.outputs.datasetOptions ?? [];
    const datasetOption = datasetOptions.find(
      (p: any) => args.datasetRef && plRefsEqual(p.ref, args.datasetRef),
    );
    if (datasetOption?.label) {
      parts.push(datasetOption.label);
    }
  }
  // Add chains if available
  if (args.chains && args.chains.length > 0) {
    parts.push(args.chains.join(", "));
  }
  args.defaultBlockLabel = parts.filter(Boolean).join(" - ");
});

// A bare set is not a mode the scientist declares up front — whether a set is bare is
// something the block works out from what they mapped. So there is no toggle: the slots are
// always offered, and filling the identity slot plus at least one chain is what makes it one.
type BareSetArgs = NonNullable<BlockData["bareSet"]>;

function getBare(): BareSetArgs | undefined {
  return app.model.data.bareSet;
}

/**
 * What is being imported. Receptors expand to both their chains; a single chain is its own
 * entry, which is how a heavy-only panel is declared rather than inferred from an unfilled slot.
 *
 * The more diverse chain — the one recombining a D segment — comes first in every pair, which is
 * MiXCR's rule and the order its receptorInfos uses. TCR is numbered under IMGT only; the scheme
 * dropdown narrows itself from the selection.
 */
const chainSelectionOptions = [
  // Receptors then chains, with the labels mixcr-clonotyping's combined receptor-or-chain list
  // uses (SettingsPanel.vue:288-301) — the same control, so the same words.
  { label: "IG", value: "IG" },
  { label: "TCR-αβ", value: "TCRAB" },
  { label: "TCR-ɣδ", value: "TCRGD" },
  { label: "IG Heavy", value: "IGHeavy" },
  { label: "IG Light", value: "IGLight" },
  { label: "TCR-α", value: "TCRAlpha" },
  { label: "TCR-β", value: "TCRBeta" },
  { label: "TCR-ɣ", value: "TCRGamma" },
  { label: "TCR-δ", value: "TCRDelta" },
];

/** The slots the current declaration asks for, in emission order. */
const chainSlots = computed<BareSetChain[]>(() => {
  const selection = app.model.data.bareSet?.chainSelection;
  return selection ? (CHAIN_SLOTS[selection] ?? []) : [];
});

function slotLabel(slot: BareSetChain): string {
  return CHAIN_SLOT_LABELS[slot];
}

function setChainSelection(value: string | undefined) {
  const a = app.model.data;
  const current: BareSetArgs = a.bareSet ?? {
    identity: "",
    chainSelection: "IG",
    sequences: {},
    scheme: "imgt",
  };
  if (!value) return;

  const selection = value as ChainSelection;
  // Columns mapped to a slot the new declaration does not ask for are dropped. Keeping them
  // would leave the block emitting a chain the scientist just said they were not importing.
  const kept: Partial<Record<BareSetChain, string>> = {};
  for (const slot of CHAIN_SLOTS[selection] ?? []) {
    const existing = current.sequences?.[slot];
    if (existing) kept[slot] = existing;
  }

  // A scheme the new chains cannot be numbered under would fail the run rather than the
  // mapping, so it is reset here rather than left for ANARCI to reject.
  const allowed = SCHEMES_FOR_SELECTION[selection] ?? (["imgt"] as BareSetScheme[]);
  const scheme = allowed.includes(current.scheme) ? current.scheme : allowed[0];

  a.bareSet = { ...current, chainSelection: selection, sequences: kept, scheme };
}

function bareField(field: "identity" | BareSetChain): string | undefined {
  const bare = getBare();
  if (!bare) return undefined;
  return field === "identity" ? bare.identity : bare.sequences?.[field];
}

/** Written on user gesture only, never from a watcher on an output. */
function setBareField(field: "identity" | BareSetChain, value: string | undefined) {
  const a = app.model.data;
  const current: BareSetArgs = a.bareSet ?? {
    identity: "",
    chainSelection: "IG",
    sequences: {},
    scheme: "imgt",
  };
  const next: BareSetArgs = {
    identity: field === "identity" ? (value ?? "") : current.identity,
    chainSelection: current.chainSelection,
    sequences: { ...current.sequences },
    scheme: current.scheme,
  };
  if (field !== "identity") {
    if (value) next.sequences[field] = value;
    else delete next.sequences[field];
  }

  // Cleared right back out when nothing is mapped, so its mere presence stays a reliable
  // signal that this is a bare set.
  const empty = !next.identity && !next.sequences.IGHeavy && !next.sequences.IGLight;
  a.bareSet = empty ? undefined : next;
}

function setBareScheme(value: string | undefined) {
  const a = app.model.data;
  if (!a.bareSet || !value) return;
  a.bareSet = { ...a.bareSet, scheme: value as BareSetArgs["scheme"] };
}

/**
 * A column has been assigned. Not `bareSet !== undefined`: picking a new file keeps the receptor
 * declaration and the scheme (see forgetMappedColumns), so the object outlives the mapping.
 */
const isBareSet = computed(() => {
  const bare = app.model.data.bareSet;
  if (bare === undefined) return false;
  return !!bare.identity || Object.values(bare.sequences ?? {}).some(Boolean);
});

/**
 * Identity values the file repeats on rows that are not identical — but only once they are known
 * to be about the column now selected. The record key is the identity's hash, so a repeat merges
 * two different records into one.
 *
 * The output carries the column it was computed for; anything else is a verdict about a column
 * the scientist has already moved on from.
 */
const identityCollisions = computed<string[]>(() => {
  const found = app.model.outputs.identityCollisions;
  if (found === undefined) return [];
  if (found.identity !== app.model.data.bareSet?.identity) return [];
  return found.values;
});

/** Headers not taken by a sequence or the identity — offered as record properties rather than
 *  dropped, which is what the block used to do with them. */
const propertyCandidates = computed(() => {
  const bare = app.model.data.bareSet;
  const taken = new Set(
    [bare?.identity, bare?.sequences?.IGHeavy, bare?.sequences?.IGLight].filter(
      Boolean,
    ) as string[],
  );
  // File door only — record properties exist only for a bare set.
  return (app.model.outputs.fileColumns ?? []).filter((h) => !taken.has(h));
});

const acceptedProperties = computed<string[]>({
  get: () => (app.model.data.bareSet?.properties ?? []).map((p) => p.header),
  set: (headers) => {
    const a = app.model.data;
    if (!a.bareSet) return;
    // The type is written here, on the accept gesture, from the profile prerun produced by
    // reading every row. The panel asks no type question — see ColumnProfile — and taking a
    // snapshot at the gesture keeps the args projection a pure function of `data`.
    const types = app.model.outputs.columnProfile?.types ?? {};
    a.bareSet = {
      ...a.bareSet,
      properties: headers.map(
        (h): ImportedProperty => ({ header: h, valueType: types[h] ?? "String" }),
      ),
    };
  },
});

const propertyCollisionMessage = computed(() => {
  const collisions = propertyCollisions(app.model.data.bareSet?.properties ?? []);
  const groups = Object.values(collisions);
  if (groups.length === 0) return "";
  const pairs = groups.map((hs) => hs.join(" / ")).join("; ");
  return `These headers would become the same column: ${pairs}. Rename one in the file — importing both is not possible, and dropping one silently would lose a column you asked for.`;
});

// Enough values to recognise the problem in the file, not enough to bury the sentence that says
// what to do about it.
const COLLISIONS_SHOWN = 3;

const identityCollisionMessage = computed(() => {
  const values = identityCollisions.value;
  if (values.length === 0) return "";
  const shown = values.slice(0, COLLISIONS_SHOWN).join(", ");
  const rest =
    values.length > COLLISIONS_SHOWN ? ` and ${values.length - COLLISIONS_SHOWN} more` : "";
  return `Repeated on rows that are not identical: ${shown}${rest}. Two rows sharing an id become one record — pick a different column, or fix the file.`;
});

const countTypeOptions = [
  { label: "Reads", value: "read" },
  { label: "UMIs", value: "umi" },
];

const secondaryTypeOptions = computed(() => {
  const p = app.model.data.primaryCountType;
  if (p === "read") return [{ label: "UMIs", value: "umi" }];
  if (p === "umi") return [{ label: "Reads", value: "read" }];
  return countTypeOptions;
});

const isSingleCell = computed(
  () =>
    app.model.data.format === "mixcr-sc" ||
    app.model.data.format === "cellranger" ||
    app.model.data.format === "airr-sc",
);

const tableSettings = usePlDataTableSettingsV2({
  model: () => app.model.outputs.stats,
});

const setDataset = (datasetRef: PlRef | undefined) => {
  app.model.data.datasetRef = datasetRef;
  // Exactly one door. Picking a dataset clears the file and the reverse, so the two can never
  // both be set and the block never has to guess which the scientist meant.
  if (datasetRef !== undefined) app.model.data.fileSource = undefined;
};

const fileSourceError = ref("");

/**
 * What the block is reading: a dataset from the pool, or a file this block loads itself.
 *
 * One dropdown rather than a checkbox plus a dropdown. The two doors are alternatives, and a
 * checkbox made that a second question — the scientist had to know they were on the right door
 * before the dropdown in front of them meant anything.
 *
 * Values are strings because the list mixes two kinds of entry: a canonicalised PlRef per pool
 * dataset, and one sentinel that opens a file dialog instead of selecting anything. `PlDropdownRef`
 * cannot express the sentinel — its value is a PlRef — so this is a plain dropdown that maps back.
 */
const LOAD_FROM_FILE = "__load_from_file__";

const datasetOptions = computed(() => app.model.outputs.datasetOptions ?? []);

const sourceOptions = computed(() => {
  const opts = datasetOptions.value.map((o) => ({
    label: o.label,
    value: canonicalize(o.ref) as string,
  }));
  // The loaded file appears as a selected entry of its own, so the dropdown always shows what
  // the block is actually reading rather than going blank on the file door.
  const file = app.model.data.fileSource;
  if (file) opts.push({ label: file.label, value: LOAD_FROM_FILE });
  return [...opts, { label: "Load from file…", value: LOAD_FROM_FILE }].filter(
    (o, i, all) => all.findIndex((x) => x.value === o.value) === i,
  );
});

const selectedSource = computed<string | undefined>(() => {
  if (app.model.data.fileSource !== undefined) return LOAD_FROM_FILE;
  const ref = app.model.data.datasetRef;
  return ref ? (canonicalize(ref) as string) : undefined;
});

/**
 * The platform's own file browser, not the OS one — the same dialog PlFileInput opens.
 *
 * It lists every storage the scientist has, remote ones included, so a file on S3 can be loaded
 * the same way as one on the desktop. `lsDriver.showOpenSingleFileDialog` opens the operating
 * system's picker instead, which can only see the local disk.
 */
const fileDialogOpen = ref(false);

function onFilesImported(imported: ImportedFiles) {
  // Cancelling emits nothing, and nothing was cleared on the way in, so the previous selection
  // simply stands.
  if (imported.files.length > 0) void setFile(imported.files[0]);
}

function setSource(value: string | undefined) {
  const a = app.model.data;

  if (value === LOAD_FROM_FILE) {
    // Re-selecting the entry for an already-loaded file reopens the dialog, which is how the
    // scientist swaps the file without first clearing it.
    fileDialogOpen.value = true;
    return;
  }

  fileSourceError.value = "";
  a.fileSource = undefined;
  a.bareSet = undefined;
  // The dataset door opens on a clean format choice rather than inheriting one. Without this a
  // block that had been on the file door shows the whole per-format mapping unfurled under a
  // format nobody picked. customMapping is deliberately kept: re-picking a format brings the
  // scientist's own mapping back with it.
  a.format = undefined;

  if (value === undefined) {
    a.datasetRef = undefined;
    return;
  }
  const picked = datasetOptions.value.find((o) => canonicalize(o.ref) === value);
  setDataset(picked?.ref);
}

/** The file door is showing exactly when a file is loaded. No stored flag decides it. */
const loadFromFile = computed(() => app.model.data.fileSource !== undefined);

/**
 * The loaded file is still being profiled — the columns on offer are the previous file's, since
 * the profile outputs are retentive. True between picking a file and its scan finishing.
 */
const fileScanning = computed(() => {
  const file = app.model.data.fileSource;
  if (file === undefined) return false;
  return app.model.outputs.profiledSampleId !== file.sampleId;
});

/**
 * The mapping with everything that names a column dropped. The receptor declaration and the
 * numbering scheme describe the biology and outlive any one file; the column names do not.
 */
function forgetMappedColumns(bare: BareSetArgs | undefined): BareSetArgs | undefined {
  if (bare === undefined) return undefined;
  return {
    identity: "",
    chainSelection: bare.chainSelection,
    sequences: {},
    scheme: bare.scheme,
  };
}

async function setFile(handle: ImportFileHandle | undefined) {
  fileSourceError.value = "";
  const a = app.model.data;
  if (handle === undefined) {
    a.fileSource = undefined;
    return;
  }

  const previous = a.fileSource;
  const name = getFileNameFromHandle(handle);
  // A workbook is identified by its name — there is no first line to read, and the workflow
  // converts it to csv before anything else looks at it. For text files the delimiter is
  // decided from the content workflow-side, so the name only has to distinguish the two kinds.
  const extension: "csv" | "tsv" | "xlsx" = name.toLowerCase().endsWith(".xlsx")
    ? "xlsx"
    : name.toLowerCase().endsWith(".csv")
      ? "csv"
      : "tsv";

  // The id is minted here, at the user's gesture, rather than derived from the handle, so the
  // sample keeps its identity across runs. The label is the filename stem, which is exactly
  // what samples-and-data would have produced.
  a.fileSource = {
    handle,
    sampleId: uniquePlId(),
    label: name.replace(/\.[^.]+$/, ""),
    extension,
  };
  a.datasetRef = undefined;

  // This is what disables Run: a mapping that passed against the last file still satisfies
  // `bareSetValid`, so otherwise the block stays runnable over a file nothing has read yet.
  // Cleared on the gesture because `args` sees only `data` and cannot consult prerun.
  // Re-picking the same file is not a swap — the dialog is also how a file gets re-read.
  if (previous?.handle !== handle) a.bareSet = forgetMappedColumns(a.bareSet);
}

function setReceptors(selected: string[]) {
  const chains: string[] = [];
  if (selected.includes("IG")) {
    chains.push("IGHeavy", "IGLight");
  }
  if (selected.includes("TCRAB")) {
    chains.push("TCRBeta", "TCRAlpha");
  }
  if (selected.includes("TCRGD")) {
    chains.push("TCRDelta", "TCRGamma");
  }
  app.model.data.chains = chains;
}

const selectedReceptors = computed<string[]>({
  get: () => {
    const c = app.model.data.chains ?? [];
    const sel: string[] = [];
    if (c.includes("IGHeavy") || c.includes("IGLight")) sel.push("IG");
    if (c.includes("TCRAlpha") || c.includes("TCRBeta")) sel.push("TCRAB");
    if (c.includes("TCRDelta") || c.includes("TCRGamma")) sel.push("TCRGD");
    return sel;
  },
  set: (val) => setReceptors(val),
});

const requiredCanonicalBase = [
  { key: "cdr3-aa", label: "CDR3 aa" },
  { key: "cdr3-nt", label: "CDR3 nt" },
  { key: "v-gene", label: "V gene" },
  { key: "j-gene", label: "J gene" },
];

const optionalSequence = [
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

const optionalCanonical = [
  { key: "top-chains", label: "Top chains" },
  { key: "v-allele", label: "V allele" },
  { key: "j-allele", label: "J allele" },
  { key: "d-gene", label: "D gene" },
  { key: "d-allele", label: "D allele" },
  { key: "c-gene", label: "C gene" },
  { key: "c-allele", label: "C allele" },
  { key: "is-productive", label: "Productive" },
  // This is calculated by the workflow
  // { key: 'cdr3-aa-length', label: 'CDR3 length (aa)' },
  // { key: 'cdr3-nt-length', label: 'CDR3 length (nt)' },
  // Newly added optional fields
  { key: "isotype", label: "Isotype" },
  { key: "n-length-vj-junction", label: "VJ junction length (nt)" },
  { key: "n-length-vd-junction", label: "VD junction length (nt)" },
  { key: "n-length-dj-junction", label: "DJ junction length (nt)" },
  { key: "n-length-total-added", label: "Total added nt" },
];

const optionalMutations = [
  { key: "aa-mutations-count-v", label: "AA mutations count (V)" },
  { key: "aa-mutations-rate-v", label: "AA mutations rate (V)" },
  { key: "nt-mutations-count-v", label: "NT mutations count (V)" },
  { key: "nt-mutations-rate-v", label: "NT mutations rate (V)" },
  { key: "aa-mutations-count-j", label: "AA mutations count (J)" },
  { key: "aa-mutations-rate-j", label: "AA mutations rate (J)" },
  { key: "nt-mutations-count-j", label: "NT mutations count (J)" },
  { key: "nt-mutations-rate-j", label: "NT mutations rate (J)" },
];

/**
 * The columns of whatever this block is reading. Each door has its own output — the file door
 * profiles a file we hold, the dataset door takes the pool's inference — so a door never offers
 * columns discovered for the other one.
 */
const headerOptions = computed(() => {
  const columns = loadFromFile.value
    ? app.model.outputs.fileColumns
    : app.model.outputs.datasetColumns;
  return (columns ?? []).map((h) => ({ label: h, value: h }));
});

/** Headers whose sampled values actually read as amino-acid variable domains. The workflow
 *  works this out at prerun by reading a few rows — a header cannot say it, and offering every
 *  column here lets an antibody's *name* be mapped into a sequence slot, which imports cleanly
 *  and leaves every record Failed after ANARCI declines to number it.
 *
 *  Falls back to every header when the classification is empty, which happens before the file
 *  is read and on a file whose rows could not be sampled. An empty dropdown would be a worse
 *  failure than an unfiltered one: the scientist could not proceed at all. */
const sequenceOptions = computed(() => {
  const aminoAcid = app.model.outputs.aminoAcidColumns ?? [];
  if (aminoAcid.length === 0) return headerOptions.value;
  return aminoAcid.map((h) => ({ label: h, value: h }));
});

function getMapping(key: string): string | undefined {
  const a = app.model.data as unknown as { customMapping?: Record<string, string | undefined> };
  return a.customMapping?.[key];
}
function setMapping(key: string, value: string | undefined) {
  const a = app.model.data as unknown as { customMapping?: Record<string, string> };
  if (!a.customMapping) a.customMapping = {};
  if (value === undefined || value === "") delete a.customMapping[key];
  else a.customMapping[key] = value;
}

const validationResult = computed(() => {
  // Access format to create dependency and ensure reactivity when format changes
  const format = app.model.data.format;
  // Access outputs - Vue should track this if outputs is reactive
  const outputs = app.model.outputs;
  const result = (
    outputs as { validationResult?: { isValid: boolean; missingColumns: string[]; format: string } }
  )?.validationResult;
  // Return result - format dependency ensures recomputation when format changes
  return format ? result : result;
});

/** The display name for a format id, from the same list the dropdown is built from. */
function formatLabel(format: string | undefined): string {
  if (!format) return "";
  const key = format.toLowerCase();
  return formatOptions.find((o) => o.value.toLowerCase() === key)?.label ?? format;
}

const validationMessage = computed(() => {
  const result = validationResult.value;
  if (!result || result.isValid) return "";

  return `The selected dataset is missing required ${formatLabel(result.format)} columns: ${result.missingColumns.join(", ")}. Please verify the format selection or choose a different dataset.`;
});

watch(
  () => app.model.data,
  (args) => {
    if (args.format === "custom") {
      const a = app.model.data as unknown as {
        customMapping?: Record<string, string>;
        primaryCountType?: "read" | "umi";
        secondaryCountType?: "read" | "umi";
      };
      if (!a.customMapping) a.customMapping = {};
      if (!a.primaryCountType) a.primaryCountType = "read";
      if (a.secondaryCountType && a.secondaryCountType === a.primaryCountType)
        a.secondaryCountType = undefined;
      // don't allow same column for read-count and umi
      if (
        a.customMapping["read-count"] !== undefined &&
        a.customMapping["read-count"] === a.customMapping?.["umi-count"]
      ) {
        if (a.primaryCountType === "read") {
          delete a.customMapping["umi-count"];
        } else {
          delete a.customMapping["read-count"];
        }
      }
      // clear not used count type from customMapping
      if (a.primaryCountType === "read" && !a.secondaryCountType) {
        delete a.customMapping["umi-count"];
      }
      if (a.primaryCountType === "umi" && !a.secondaryCountType) {
        delete a.customMapping["read-count"];
      }
    }
  },
  { immediate: true },
);

const formatFlags = {
  qiagen: "qiagenColumnsPresent",
  immunoSeq: "immunoSeqColumnsPresent",
  immunoseq: "immunoSeqColumnsPresent",
  mixcr: "mixcrColumnsPresent",
  "mixcr-sc": "mixcrColumnsPresent",
  cellranger: "crColumnsPresent",
  airr: "airrColumnsPresent",
  "airr-sc": "airrColumnsPresent",
} as const;

watch(
  [() => app.model.data.format, validationResult],
  ([format, result]) => {
    Object.values(formatFlags).forEach((flag) => (app.model.data[flag] = false));

    if (!result) return;

    if (result.format === format) {
      const flag = formatFlags[result.format as keyof typeof formatFlags];
      if (flag) {
        app.model.data[flag] = result.isValid;
      }
    }
  },
  { immediate: true, deep: true },
);

// The panel closes whenever the scientist closes it, finished or not. It used to refuse while
// the mapping was incomplete, which left no way to look at the table, re-read the file or check
// an upstream block without finishing first. Nothing needs the refusal: the args projection
// already keeps Run disabled until the mapping is valid, and Settings reopens the panel.
</script>

<template>
  <PlBlockPage title="Import V(D)J Data">
    <template #append>
      <PlBtnGhost @click.stop="() => (app.model.data.settingsOpen = true)">
        Settings
        <template #append>
          <PlMaskIcon24 name="settings" />
        </template>
      </PlBtnGhost>
    </template>

    <PlSlideModal v-model="app.model.data.settingsOpen">
      <template #title>Settings</template>

      <PlDropdown
        :model-value="selectedSource"
        :options="sourceOptions"
        label="Select dataset"
        clearable
        required
        @update:model-value="(v: string | undefined) => setSource(v)"
      />

      <PlFileDialog
        v-model="fileDialogOpen"
        :extensions="['csv', 'tsv', 'txt', 'xlsx']"
        title="Load sequences from file"
        @import:files="onFilesImported"
      />

      <template v-if="loadFromFile">
        <PlAlert v-if="fileSourceError" type="warn" :style="{ width: '100%' }">
          {{ fileSourceError }}
        </PlAlert>

        <PlAlert v-if="fileScanning" type="info" :style="{ width: '100%' }">
          Checking the file's columns. This can take a moment, please wait...
        </PlAlert>

        <template v-if="!fileScanning && headerOptions.length > 0">
          <PlSectionSeparator>Columns to import</PlSectionSeparator>
          <PlAlert
            v-if="identityCollisionMessage"
            type="warn"
            label="Id column is not unique"
            :style="{ width: '100%' }"
          >
            {{ identityCollisionMessage }}
          </PlAlert>
          <div class="field-col">
            <PlDropdown
              :model-value="bareField('identity')"
              :options="headerOptions"
              label="Select id column"
              clearable
              required
              @update:model-value="(v: string | undefined) => setBareField('identity', v)"
            />
            <PlDropdown
              :model-value="app.model.data.bareSet?.chainSelection"
              :options="chainSelectionOptions"
              label="Receptors"
              required
              @update:model-value="(v: string | undefined) => setChainSelection(v)"
            />
            <PlDropdown
              v-for="slot in chainSlots"
              :key="slot"
              :model-value="bareField(slot)"
              :options="sequenceOptions"
              :label="slotLabel(slot)"
              clearable
              required
              @update:model-value="(v: string | undefined) => setBareField(slot, v)"
            />
            <template v-if="isBareSet">
              <PlDropdownMulti
                v-model="acceptedProperties"
                :options="propertyCandidates.map((h) => ({ label: h, value: h }))"
                label="Import as record properties"
              />
            </template>
          </div>
          <PlAlert
            v-if="propertyCollisionMessage"
            type="warn"
            label="Two headers would become one column"
            :style="{ width: '100%' }"
          >
            {{ propertyCollisionMessage }}
          </PlAlert>
        </template>

        <!-- Not a column mapping: it chooses how the mapped sequences are numbered, and the
             region boundaries every downstream block reads follow from it. Kept apart from the
             mapping so it does not read as one more column to assign. -->
        <template v-if="isBareSet && !fileScanning">
          <PlSectionSeparator>Region annotation</PlSectionSeparator>
          <div class="field-col">
            <PlDropdown
              :model-value="app.model.data.bareSet?.scheme"
              :options="schemeOptions"
              label="Numbering scheme"
              required
              @update:model-value="(v: string | undefined) => setBareScheme(v)"
            />
          </div>
        </template>
      </template>

      <template v-else>
        <PlDropdown
          v-model="app.model.data.format"
          :options="formatOptions"
          label="Data format"
          required
        />

        <PlAlert
          v-if="validationMessage"
          type="warn"
          :label="`Invalid ${formatLabel(validationResult?.format)} dataset`"
          :style="{ width: '100%' }"
        >
          {{ validationMessage }}
        </PlAlert>

        <PlDropdownMulti
          v-if="!isSingleCell"
          v-model="app.model.data.chains"
          :options="chainsOptions"
          label="Chains to import"
          required
        />
        <PlDropdownMulti
          v-else
          v-model="selectedReceptors"
          :options="receptorOptions"
          label="Immune receptors"
          required
        />

        <template v-if="app.model.data.format === 'custom'">
          <PlSectionSeparator>Required columns</PlSectionSeparator>
          <div class="field-col">
            <PlDropdown
              v-for="f in requiredCanonicalBase"
              :key="f.key"
              :model-value="getMapping(f.key)"
              :options="headerOptions"
              :label="f.label"
              clearable
              required
              @update:model-value="
                (v: string | undefined) => setMapping(f.key, v as string | undefined)
              "
            />

            <PlDropdown
              v-model="(app.model.data as any).primaryCountType"
              :options="countTypeOptions"
              label="Primary count type"
              required
            />

            <PlDropdown
              v-if="(app.model.data as any).primaryCountType === 'read'"
              :model-value="getMapping('read-count')"
              :options="headerOptions"
              label="Read count column (primary)"
              clearable
              required
              @update:model-value="
                (v: string | undefined) => setMapping('read-count', v as string | undefined)
              "
            />
            <PlDropdown
              v-if="(app.model.data as any).primaryCountType === 'umi'"
              :model-value="getMapping('umi-count')"
              :options="headerOptions"
              label="UMI count column (primary)"
              clearable
              required
              @update:model-value="
                (v: string | undefined) => setMapping('umi-count', v as string | undefined)
              "
            />
          </div>

          <PlSectionSeparator>Optional columns</PlSectionSeparator>
          <PlAccordion>
            <PlAccordionSection label="Canonical">
              <div class="field-col">
                <PlDropdown
                  v-model="(app.model.data as any).secondaryCountType"
                  :options="secondaryTypeOptions"
                  label="Secondary count type"
                  clearable
                />
                <PlDropdown
                  v-if="(app.model.data as any).secondaryCountType === 'umi'"
                  :model-value="getMapping('umi-count')"
                  :options="headerOptions"
                  label="UMI count column (secondary, optional)"
                  clearable
                  @update:model-value="
                    (v: string | undefined) => setMapping('umi-count', v as string | undefined)
                  "
                />
                <PlDropdown
                  v-if="(app.model.data as any).secondaryCountType === 'read'"
                  :model-value="getMapping('read-count')"
                  :options="headerOptions"
                  label="Read count column (secondary, optional)"
                  clearable
                  @update:model-value="
                    (v: string | undefined) => setMapping('read-count', v as string | undefined)
                  "
                />
                <PlDropdown
                  v-for="f in optionalCanonical"
                  :key="f.key"
                  :model-value="getMapping(f.key)"
                  :options="headerOptions"
                  :label="f.label"
                  clearable
                  @update:model-value="(v: string | undefined) => setMapping(f.key, v)"
                />
              </div>
            </PlAccordionSection>
            <PlAccordionSection label="Sequence">
              <div class="field-col">
                <PlDropdown
                  v-for="f in optionalSequence"
                  :key="f.key"
                  :model-value="getMapping(f.key)"
                  :options="headerOptions"
                  :label="f.label"
                  clearable
                  @update:model-value="
                    (v: string | undefined) => setMapping(f.key, v as string | undefined)
                  "
                />
              </div>
            </PlAccordionSection>
            <PlAccordionSection label="Mutations">
              <div class="field-col">
                <PlDropdown
                  v-for="f in optionalMutations"
                  :key="f.key"
                  :model-value="getMapping(f.key)"
                  :options="headerOptions"
                  :label="f.label"
                  clearable
                  @update:model-value="
                    (v: string | undefined) => setMapping(f.key, v as string | undefined)
                  "
                />
              </div>
            </PlAccordionSection>
          </PlAccordion>
        </template>
      </template>

      <template v-if="app.model.outputs.columnDescriptions">
        <PlSectionSeparator>Columns</PlSectionSeparator>
        The following columns will be imported:
        <PlElementList
          v-model:items="app.model.outputs.columnDescriptions"
          disable-removing
          disable-dragging
          disable-pinning
          disable-expanding
          disable-collapsing
          disable-toggling
        >
          <template #item-title="{ item }">
            {{ item.label }}
          </template>
          <template #item-content="{ item }">
            {{ item.description }}
          </template>
        </PlElementList>
      </template>
    </PlSlideModal>

    <PlAlert
      v-if="emptySamplesMessage"
      type="warn"
      label="No clonotypes imported"
      :style="{ width: '100%' }"
    >
      {{ emptySamplesMessage }}
    </PlAlert>

    <PlAgDataTableV2
      v-model="app.model.data.tableState"
      :settings="tableSettings"
      show-export-button
    />
  </PlBlockPage>
</template>

<style scoped>
.field-col {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}
</style>
