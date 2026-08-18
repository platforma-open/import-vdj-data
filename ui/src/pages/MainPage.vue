<script setup lang="ts">
import type { BlockArgs, ImportedProperty } from "@platforma-open/milaboratories.import-vdj.model";
import { propertyCollisions } from "@platforma-open/milaboratories.import-vdj.model";
import type { ImportFileHandle, PlRef } from "@platforma-sdk/model";
import { getFileNameFromHandle, uniquePlId } from "@platforma-sdk/model";
import { plRefsEqual } from "@platforma-sdk/model";
import { PlCheckbox, PlFileInput } from "@platforma-sdk/ui-vue";
import {
  PlAccordion,
  PlAccordionSection,
  PlAgDataTableV2,
  PlAlert,
  PlBlockPage,
  PlBtnGhost,
  PlDropdown,
  PlDropdownMulti,
  PlDropdownRef,
  PlElementList,
  PlMaskIcon24,
  PlSectionSeparator,
  PlSlideModal,
  usePlDataTableSettingsV2,
} from "@platforma-sdk/ui-vue";
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

// updating defaultBlockLabel
watchEffect(() => {
  const args = app.model.args as any;
  const parts: string[] = [];
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

const schemeOptions = [
  { label: "IMGT", value: "imgt" },
  { label: "Kabat", value: "kabat" },
  { label: "Chothia", value: "chothia" },
];

// A bare set is not a mode the scientist declares up front — whether a set is bare is
// something the block works out from what they mapped. So there is no toggle: the slots are
// always offered, and filling the identity slot plus at least one chain is what makes it one.
type BareSetArgs = NonNullable<BlockArgs["bareSet"]>;

function getBare(): BareSetArgs | undefined {
  return app.model.args.bareSet;
}

function bareField(field: "identity" | "A" | "B"): string | undefined {
  const bare = getBare();
  if (!bare) return undefined;
  return field === "identity" ? bare.identity : bare.sequences?.[field];
}

/** Written on user gesture only, never from a watcher on an output. */
function setBareField(field: "identity" | "A" | "B", value: string | undefined) {
  const a = app.model.args;
  const current: BareSetArgs = a.bareSet ?? { identity: "", sequences: {}, scheme: "imgt" };
  const next: BareSetArgs = {
    identity: field === "identity" ? (value ?? "") : current.identity,
    sequences: { ...current.sequences },
    scheme: current.scheme,
  };
  if (field !== "identity") {
    if (value) next.sequences[field] = value;
    else delete next.sequences[field];
  }

  // Cleared right back out when nothing is mapped, so its mere presence stays a reliable
  // signal that this is a bare set.
  const empty = !next.identity && !next.sequences.A && !next.sequences.B;
  a.bareSet = empty ? undefined : next;
}

function setBareScheme(value: string | undefined) {
  const a = app.model.args;
  if (!a.bareSet || !value) return;
  a.bareSet = { ...a.bareSet, scheme: value as BareSetArgs["scheme"] };
}

const isBareSet = computed(() => app.model.args.bareSet !== undefined);

/** Identity values the file repeats on rows that are not identical. The run cannot start
 *  while any exist: the record key is the identity's hash, so a repeat would merge two
 *  different records into one. */
const identityCollisions = computed<string[]>(
  () => (app.model.outputs.identityCollisions as string[] | undefined) ?? [],
);

const propertyTypeOptions = [
  { label: "Text", value: "String" },
  { label: "Whole number", value: "Int" },
  { label: "Decimal", value: "Double" },
];

/** Headers not taken by a sequence or the identity — offered as record properties rather than
 *  dropped, which is what the block used to do with them. */
const propertyCandidates = computed(() => {
  const bare = app.model.args.bareSet;
  const taken = new Set(
    [bare?.identity, bare?.sequences?.A, bare?.sequences?.B].filter(Boolean) as string[],
  );
  return (app.model.outputs.headerColumns ?? []).filter((h) => !taken.has(h));
});

const acceptedProperties = computed<string[]>({
  get: () => (app.model.args.bareSet?.properties ?? []).map((p) => p.header),
  set: (headers) => {
    const a = app.model.args;
    if (!a.bareSet) return;
    const existing = new Map((a.bareSet.properties ?? []).map((p) => [p.header, p]));
    // Text unless the scientist says otherwise: nothing re-reads the values, so a wrong guess
    // here would be emitted as-is.
    a.bareSet = {
      ...a.bareSet,
      properties: headers.map(
        (h): ImportedProperty => existing.get(h) ?? { header: h, valueType: "String" },
      ),
    };
  },
});

function setPropertyType(header: string, valueType: string | undefined) {
  const a = app.model.args;
  if (!a.bareSet || !valueType) return;
  a.bareSet = {
    ...a.bareSet,
    properties: (a.bareSet.properties ?? []).map((p) =>
      p.header === header ? { ...p, valueType: valueType as ImportedProperty["valueType"] } : p,
    ),
  };
}

const propertyCollisionMessage = computed(() => {
  const collisions = propertyCollisions(app.model.args.bareSet?.properties ?? []);
  const groups = Object.values(collisions);
  if (groups.length === 0) return "";
  const pairs = groups.map((hs) => hs.join(" / ")).join("; ");
  return `These headers would become the same column: ${pairs}. Rename one in the file — importing both is not possible, and dropping one silently would lose a column you asked for.`;
});

const identityCollisionMessage = computed(() => {
  const values = identityCollisions.value;
  if (values.length === 0) return "";
  const shown = values.slice(0, 10).join(", ");
  const rest = values.length > 10 ? ` and ${values.length - 10} more` : "";
  return `These values of "${app.model.args.bareSet?.identity}" appear on rows that are not identical: ${shown}${rest}. Each record needs its own identifier — two rows sharing one would become a single record. Fix them in the file, or choose a different identity column.`;
});

const countTypeOptions = [
  { label: "Reads", value: "read" },
  { label: "UMIs", value: "umi" },
];

const secondaryTypeOptions = computed(() => {
  const p = app.model.args.primaryCountType;
  if (p === "read") return [{ label: "UMIs", value: "umi" }];
  if (p === "umi") return [{ label: "Reads", value: "read" }];
  return countTypeOptions;
});

const isSingleCell = computed(
  () =>
    app.model.args.format === "mixcr-sc" ||
    app.model.args.format === "cellranger" ||
    app.model.args.format === "airr-sc",
);

const tableSettings = usePlDataTableSettingsV2({
  model: () => app.model.outputs.stats,
});

const setDataset = (datasetRef: PlRef | undefined) => {
  app.model.args.datasetRef = datasetRef;
  // Exactly one door. Picking a dataset clears the file and the reverse, so the two can never
  // both be set and the block never has to guess which the scientist meant.
  if (datasetRef !== undefined) app.model.args.fileSource = undefined;
};

const fileSourceError = ref("");

/** Which door the panel shows. Switching clears the other one, so exactly one is ever set. */
const loadFromFile = computed({
  // Falls back to whichever door is actually in use. A block created before this field existed
  // has no value for it — V1 ui state does not backfill new defaults into existing blocks — and
  // without the fallback such a block shows the dataset door while holding a loaded file.
  get: () => app.model.ui.loadFromFile ?? app.model.args.fileSource !== undefined,
  set: (on) => {
    app.model.ui.loadFromFile = on;
    const a = app.model.args;
    if (on) {
      a.datasetRef = undefined;
      // The direct door serves the custom format and no other.
      a.format = "custom";
    } else {
      a.fileSource = undefined;
      a.bareSet = undefined;
    }
    fileSourceError.value = "";
  },
});

/**
 * The file's own first line decides the delimiter. The declared extension is not trusted —
 * a .txt holding tabs and a .csv holding tabs are both things scientists actually have.
 */
function detectExtension(firstLine: string): "csv" | "tsv" | undefined {
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  if (tabs === 0 && commas === 0) return undefined;
  return tabs >= commas ? "tsv" : "csv";
}

async function setFile(handle: ImportFileHandle | undefined) {
  fileSourceError.value = "";
  const a = app.model.args;
  if (handle === undefined) {
    a.fileSource = undefined;
    return;
  }

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
  // The direct door serves the custom format and no other, so picking a file settles the
  // format too. Leaving it unset left the scientist looking at a file they had loaded, no
  // mapping controls — those are gated on the format — and a disabled Run with nothing
  // indicating what was missing.
  a.format = "custom";
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
  app.model.args.chains = chains;
}

const selectedReceptors = computed<string[]>({
  get: () => {
    const c = app.model.args.chains ?? [];
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

const headerOptions = computed(() =>
  (app.model.outputs.headerColumns ?? []).map((h) => ({ label: h, value: h })),
);

function getMapping(key: string): string | undefined {
  const a = app.model.args as unknown as { customMapping?: Record<string, string | undefined> };
  return a.customMapping?.[key];
}
function setMapping(key: string, value: string | undefined) {
  const a = app.model.args as unknown as { customMapping?: Record<string, string> };
  if (!a.customMapping) a.customMapping = {};
  if (value === undefined || value === "") delete a.customMapping[key];
  else a.customMapping[key] = value;
}

const mappingComplete = computed(() => {
  const bare = app.model.args.bareSet;
  if (bare) return !!bare.identity && (!!bare.sequences?.A || !!bare.sequences?.B) && !!bare.scheme;

  const a = app.model.args as {
    customMapping?: Record<string, string | undefined>;
    primaryCountType?: "read" | "umi";
  };
  const m = a.customMapping ?? {};
  const hasAA = !!m["cdr3-aa"];
  const hasNT = !!m["cdr3-nt"];
  const hasV = !!m["v-gene"];
  const hasJ = !!m["j-gene"];
  const pct = a.primaryCountType ?? "read";
  const hasPrimary = pct === "umi" ? !!m["umi-count"] : !!m["read-count"];
  const hasOneSeq = hasAA || hasNT;
  return hasOneSeq && hasV && hasJ && hasPrimary;
});

const validationResult = computed(() => {
  // Access format to create dependency and ensure reactivity when format changes
  const format = app.model.args.format;
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
  () => app.model.args,
  (args) => {
    if (args.format === "custom") {
      const a = app.model.args as unknown as {
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
  [() => app.model.args.format, validationResult],
  ([format, result]) => {
    Object.values(formatFlags).forEach((flag) => (app.model.ui[flag] = false));

    if (!result) return;

    if (result.format === format) {
      const flag = formatFlags[result.format as keyof typeof formatFlags];
      if (flag) {
        app.model.ui[flag] = result.isValid;
      }
    }
  },
  { immediate: true, deep: true },
);

const forceSettingsOpen = computed(() => {
  const mustStayOpen = app.model.args.format === "custom" && !mappingComplete.value;
  return app.model.ui.settingsOpen || mustStayOpen;
});

function onModalUpdate(val: boolean) {
  const mustStayOpen = app.model.args.format === "custom" && !mappingComplete.value;
  if (mustStayOpen) {
    app.model.ui.settingsOpen = true;
    return;
  }
  app.model.ui.settingsOpen = val;
}
</script>

<template>
  <PlBlockPage title="Import V(D)J Data">
    <template #append>
      <PlBtnGhost @click.stop="() => (app.model.ui.settingsOpen = true)">
        Settings
        <template #append>
          <PlMaskIcon24 name="settings" />
        </template>
      </PlBtnGhost>
    </template>

    <PlSlideModal :model-value="forceSettingsOpen" @update:model-value="onModalUpdate">
      <template #title>Settings</template>

      <PlCheckbox v-model="loadFromFile">Load from file</PlCheckbox>

      <template v-if="loadFromFile">
        <PlFileInput
          :model-value="app.model.args.fileSource?.handle"
          :extensions="['csv', 'tsv', 'txt', 'xlsx']"
          label="File"
          clearable
          @update:model-value="(v: ImportFileHandle | undefined) => setFile(v)"
        />
        <PlAlert v-if="fileSourceError" type="warn" :style="{ width: '100%' }">
          {{ fileSourceError }}
        </PlAlert>

        <template v-if="headerOptions.length > 0">
          <PlSectionSeparator>Columns to import</PlSectionSeparator>
          <PlAlert v-if="identityCollisionMessage" type="warn" :style="{ width: '100%' }">
            <template #title>Record identity is not unique</template>
            {{ identityCollisionMessage }}
          </PlAlert>
          <div class="field-col">
            <PlDropdown
              :model-value="bareField('identity')"
              :options="headerOptions"
              label="Record identity"
              clearable
              required
              @update:model-value="(v: string | undefined) => setBareField('identity', v)"
            />
            <PlDropdown
              :model-value="bareField('A')"
              :options="headerOptions"
              label="Heavy chain variable domain (aa)"
              clearable
              @update:model-value="(v: string | undefined) => setBareField('A', v)"
            />
            <PlDropdown
              :model-value="bareField('B')"
              :options="headerOptions"
              label="Light chain variable domain (aa)"
              clearable
              @update:model-value="(v: string | undefined) => setBareField('B', v)"
            />
            <PlDropdown
              v-if="isBareSet"
              :model-value="app.model.args.bareSet?.scheme"
              :options="schemeOptions"
              label="Numbering scheme"
              required
              @update:model-value="(v: string | undefined) => setBareScheme(v)"
            />
          </div>
        </template>

        <template v-if="isBareSet">
          <PlSectionSeparator>Other columns</PlSectionSeparator>
          <PlAlert v-if="propertyCollisionMessage" type="warn" :style="{ width: '100%' }">
            <template #title>Two headers would become one column</template>
            {{ propertyCollisionMessage }}
          </PlAlert>
          <div class="field-col">
            <PlDropdownMulti
              v-model="acceptedProperties"
              :options="propertyCandidates.map((h) => ({ label: h, value: h }))"
              label="Import as record properties"
            />
            <PlDropdown
              v-for="p in app.model.args.bareSet?.properties ?? []"
              :key="p.header"
              :model-value="p.valueType"
              :options="propertyTypeOptions"
              :label="p.header"
              @update:model-value="(v: string | undefined) => setPropertyType(p.header, v)"
            />
          </div>
        </template>
      </template>

      <template v-else>
        <PlDropdownRef
          v-model="app.model.args.datasetRef"
          :options="app.model.outputs.datasetOptions"
          label="Select dataset"
          clearable
          required
          @update:model-value="setDataset"
        />

        <PlDropdown
          v-model="app.model.args.format"
          :options="formatOptions"
          label="Data format"
          required
        />

        <PlAlert v-if="validationMessage" type="warn" :style="{ width: '100%' }">
          <template #title>Invalid {{ formatLabel(validationResult?.format) }} dataset</template>
          {{ validationMessage }}
        </PlAlert>

        <PlDropdownMulti
          v-if="!isSingleCell"
          v-model="app.model.args.chains"
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

        <template v-if="app.model.args.format === 'custom'">
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
              v-model="(app.model.args as any).primaryCountType"
              :options="countTypeOptions"
              label="Primary count type"
              required
            />

            <PlDropdown
              v-if="(app.model.args as any).primaryCountType === 'read'"
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
              v-if="(app.model.args as any).primaryCountType === 'umi'"
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
                  v-model="(app.model.args as any).secondaryCountType"
                  :options="secondaryTypeOptions"
                  label="Secondary count type"
                  clearable
                />
                <PlDropdown
                  v-if="(app.model.args as any).secondaryCountType === 'umi'"
                  :model-value="getMapping('umi-count')"
                  :options="headerOptions"
                  label="UMI count column (secondary, optional)"
                  clearable
                  @update:model-value="
                    (v: string | undefined) => setMapping('umi-count', v as string | undefined)
                  "
                />
                <PlDropdown
                  v-if="(app.model.args as any).secondaryCountType === 'read'"
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

    <PlAgDataTableV2
      v-model="app.model.ui.tableState"
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
