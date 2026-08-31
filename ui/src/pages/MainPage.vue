<script setup lang="ts">
import type { BareSetScheme } from "@platforma-open/milaboratories.import-vdj.model";
import {
  forgetMappedColumns,
  SCHEME_LABELS,
} from "@platforma-open/milaboratories.import-vdj.model";
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
import {
  chainsOptions,
  countTypeOptions,
  formatOptions,
  LOAD_FROM_FILE,
  optionalCanonical,
  optionalMutations,
  optionalSequence,
  receptorOptions,
  requiredCanonicalBase,
} from "./constants";
import {
  emptySamplesMessage as buildEmptySamplesMessage,
  formatLabel,
  missingColumnsMessage,
} from "./messages";
import BareSetForm from "./components/BareSetForm.vue";

const app = useApp();

const emptySamplesMessage = computed(() =>
  buildEmptySamplesMessage(app.model.outputs.emptyChainSamples?.emptySamples ?? []),
);

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
 */
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
  const stamp = app.model.outputs.prerunDatasetValidationInfo;
  return !(stamp?.door === "file" && stamp.datasetId === file.datasetId);
});

/**
 * The selected dataset's columns are still being inferred — {@link fileScanning} for the other
 * door. `datasetColumns` and `validationResult` are retentive, so until then the panel would offer
 * the previous dataset's headers and verdict.
 *
 * Needs a format, which is what the inference is asked about. Not raised on the bare-set path,
 * where prerun answers with collisions and never produces columns.
 */
const datasetScanning = computed(() => {
  if (loadFromFile.value) return false;
  const ref = app.model.data.datasetRef;
  if (ref === undefined || app.model.data.format === undefined) return false;
  if (app.model.data.bareSet !== undefined) return false;
  const stamp = app.model.outputs.prerunDatasetValidationInfo;
  if (stamp?.door !== "dataset" || stamp.datasetRef === undefined) return true;
  return !plRefsEqual(stamp.datasetRef, ref) || stamp.format !== app.model.data.format;
});

/**
 * The columns the import will emit, once known for what is selected now. Only the dataset door
 * produces them, only under a chosen format, and the output is retentive — drop any guard and the
 * list shows the previous dataset's columns, or a heading with nothing under it.
 */
const columnDescriptions = computed(() => {
  if (loadFromFile.value || app.model.data.format === undefined || datasetScanning.value) return [];
  return app.model.outputs.columnDescriptions ?? [];
});

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

  // Re-picking the same file is not a swap: the dialog is also how a file gets re-read, and the
  // handle is derived from the path, so an unchanged handle means the same file.
  const isSwap = previous?.handle !== handle;

  a.fileSource = {
    handle,
    datasetId: isSwap ? uniquePlId() : previous.datasetId,
    label: name.replace(/\.[^.]+$/, ""),
    extension,
  };
  a.datasetRef = undefined;

  // This is what disables Run: a mapping that passed against the last file still satisfies
  // `bareSetValid`.
  if (isSwap) a.bareSet = forgetMappedColumns(a.bareSet);
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

const validationMessage = computed(() => missingColumnsMessage(validationResult.value));

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

        <BareSetForm
          v-if="!fileScanning && headerOptions.length > 0"
          :header-options="headerOptions"
        />
      </template>

      <template v-else>
        <PlDropdown
          v-model="app.model.data.format"
          :options="formatOptions"
          label="Data format"
          required
        />

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

        <PlAlert v-if="datasetScanning" type="info" :style="{ width: '100%' }">
          Validating the selected columns. This can take a moment, please wait...
        </PlAlert>

        <PlAlert
          v-if="!datasetScanning && validationMessage"
          type="warn"
          :label="`Invalid ${formatLabel(validationResult?.format)} dataset`"
          :style="{ width: '100%' }"
        >
          {{ validationMessage }}
        </PlAlert>

        <template v-if="app.model.data.format === 'custom' && !datasetScanning">
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

      <template v-if="columnDescriptions.length > 0">
        <PlSectionSeparator>Columns</PlSectionSeparator>
        The following columns will be imported:
        <PlElementList
          :items="columnDescriptions"
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
