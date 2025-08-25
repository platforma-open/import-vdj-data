<script setup lang="ts">
import type { PlRef, PlDataTableStateV2 } from '@platforma-sdk/model';
import { plRefsEqual } from '@platforma-sdk/model';
import { PlAccordion, PlAccordionSection, PlAgDataTableV2, PlAlert, PlBlockPage, PlBtnGhost, PlDropdown, PlDropdownMulti, PlDropdownRef, PlElementList, PlMaskIcon24, PlSectionSeparator, PlSlideModal, usePlDataTableSettingsV2 } from '@platforma-sdk/ui-vue';
import { computed, watch } from 'vue';
import { useApp } from '../app';

const app = useApp();

type UiLike = {
  tableState: PlDataTableStateV2;
  title: string;
  settingsOpen: boolean;
  qiagenColumnsPresent: boolean;
};
const ui = app.model.ui as unknown as UiLike;

type OutputsLike = {
  headerColumns?: string[];
  validationResult?: { isValid: boolean; missingColumns: string[]; format: string };
};
const outputs = app.model.outputs as unknown as OutputsLike;

const formatOptions = [
  { label: 'ImmunoSeq', value: 'immunoSeq' },
  { label: 'QIAseq Immune Repertoire Analysis', value: 'qiagen' },
  { label: 'MiXCR', value: 'mixcr' },
  { label: 'Custom', value: 'custom' },
];

const chainsOptions = [
  { label: 'IG Heavy', value: 'IGHeavy' },
  { label: 'IG Light', value: 'IGLight' },
  { label: 'TRA', value: 'TRA' },
  { label: 'TRB', value: 'TRB' },
  { label: 'TRD', value: 'TRD' },
  { label: 'TRG', value: 'TRG' },
];

const isSingleCell = computed(() => false);

const tableSettings = usePlDataTableSettingsV2({
  sourceId: () => app.model.args.datasetRef,
  model: () => app.model.outputs.stats,
});

const setDataset = (datasetRef: PlRef | undefined) => {
  app.model.args.datasetRef = datasetRef;
  if (datasetRef)
    app.model.ui.title = 'Import V(D)J Data - ' + app.model.outputs.datasetOptions?.find((o) => plRefsEqual(o.ref, datasetRef))?.label;
};

const requiredCanonical = [
  { key: 'cdr3-aa', label: 'CDR3 aa' },
  { key: 'cdr3-nt', label: 'CDR3 nt' },
  { key: 'v-gene', label: 'V gene' },
  { key: 'j-gene', label: 'J gene' },
  { key: 'read-count', label: 'Read count' },
] as const;

const optionalCanonical = [
  { key: 'umi-count', label: 'UMI count' },
  { key: 'v-allele', label: 'V allele' },
  { key: 'd-gene', label: 'D gene' },
  { key: 'd-allele', label: 'D allele' },
  { key: 'j-allele', label: 'J allele' },
  { key: 'is-productive', label: 'Productive' },
  { key: 'cdr3-aa-length', label: 'CDR3 length (aa)' },
  { key: 'cdr3-nt-length', label: 'CDR3 length (nt)' },
  // Newly added optional fields
  { key: 'c-gene', label: 'C gene' },
  { key: 'c-allele', label: 'C allele' },
  { key: 'isotype', label: 'Isotype' },
  { key: 'top-chains', label: 'Top chains' },
  { key: 'n-length-vj-junction', label: 'VJ junction length (nt)' },
  { key: 'n-length-vd-junction', label: 'VD junction length (nt)' },
  { key: 'n-length-dj-junction', label: 'DJ junction length (nt)' },
  { key: 'n-length-total-added', label: 'Total added nt' },
  { key: 'aa-mutations-count-v', label: 'AA mutations count (V)' },
  { key: 'aa-mutations-rate-v', label: 'AA mutations rate (V)' },
  { key: 'nt-mutations-count-v', label: 'NT mutations count (V)' },
  { key: 'nt-mutations-rate-v', label: 'NT mutations rate (V)' },
  { key: 'aa-mutations-count-j', label: 'AA mutations count (J)' },
  { key: 'aa-mutations-rate-j', label: 'AA mutations rate (J)' },
  { key: 'nt-mutations-count-j', label: 'NT mutations count (J)' },
  { key: 'nt-mutations-rate-j', label: 'NT mutations rate (J)' },
] as const;

watch(
  () => app.model.args,
  (args) => {
    const a = args as unknown as { customMapping?: Record<string, string> };
    if (!a.customMapping) a.customMapping = {};
  },
  { immediate: true, deep: false },
);

const headerOptions = computed(() => (outputs.headerColumns ?? []).map((h) => ({ label: h, value: h })));

function getMapping(key: string): string | undefined {
  const a = app.model.args as unknown as { customMapping?: Record<string, string | undefined> };
  return a.customMapping?.[key];
}
function setMapping(key: string, value: string | undefined) {
  const a = app.model.args as unknown as { customMapping?: Record<string, string> };
  if (!a.customMapping) a.customMapping = {};
  if (value === undefined || value === '') delete a.customMapping[key];
  else a.customMapping[key] = value;
}

const mappingComplete = computed(() => {
  const a = app.model.args as { customMapping?: Record<string, string | undefined> };
  const m = a.customMapping ?? {};
  const hasAA = !!m['cdr3-aa'];
  const hasNT = !!m['cdr3-nt'];
  const hasV = !!m['v-gene'];
  const hasJ = !!m['j-gene'];
  const hasReads = !!m['read-count'];
  const hasUmi = !!m['umi-count'];
  const hasAbundance = hasReads || hasUmi;
  const hasOneSeq = hasAA || hasNT;
  return hasOneSeq && hasV && hasJ && hasAbundance;
});

const validationResult = computed(() => outputs.validationResult);

const validationMessage = computed(() => {
  const result = validationResult.value;
  if (!result || result.isValid) return '';

  const formatName = result.format === 'qiagen'
    ? 'QIAseq Immune Repertoire Analysis'
    : result.format;

  return `The selected dataset is missing required ${formatName} columns: ${result.missingColumns.join(', ')}. Please verify the format selection or choose a different dataset.`;
});

const forceSettingsOpen = computed(() => {
  const mustStayOpen = String(app.model.args.format) === 'custom' && !mappingComplete.value;
  return ui.settingsOpen || mustStayOpen;
});

function onModalUpdate(val: boolean) {
  const mustStayOpen = String(app.model.args.format) === 'custom' && !mappingComplete.value;
  if (mustStayOpen) {
    ui.settingsOpen = true;
    return;
  }
  ui.settingsOpen = val;
}

watch(
  () => app.model.args.format,
  (fmt) => {
    if (String(fmt) === 'custom') {
      ui.settingsOpen = true;
      const a = app.model.args as unknown as { customMapping?: Record<string, string> };
      if (!a.customMapping) a.customMapping = {};
    }
    // Reset qiagenColumnsPresent when format changes away from qiagen
    if (String(fmt) !== 'qiagen') {
      ui.qiagenColumnsPresent = false;
    }
  },
  { immediate: true },
);

// Watch validation result and update the UI state
watch(
  validationResult,
  (result) => {
    if (result && result.format === 'qiagen') {
      ui.qiagenColumnsPresent = result.isValid;
    }
  },
  { immediate: true },
);

const isCustom = computed(() => String(app.model.args.format) === 'custom');

</script>

<template>
  <PlBlockPage>
    <template #title>{{ app.model.ui.title }}</template>
    <template #append>
      <PlBtnGhost @click.stop="() => (ui.settingsOpen = true)">
        Settings
        <template #append>
          <PlMaskIcon24 name="settings" />
        </template>
      </PlBtnGhost>
    </template>

    <PlSlideModal :model-value="forceSettingsOpen" @update:model-value="onModalUpdate">
      <template #title>Settings</template>

      <PlDropdownRef
        v-model="app.model.args.datasetRef"
        :options="app.model.outputs.datasetOptions"
        label="Select dataset"
        clearable
        required
        @update:model-value="setDataset"
      />

      <PlDropdown v-model="app.model.args.format" :options="formatOptions" label="Data format" required />

      <PlAlert v-if="validationMessage" type="warn" :style="{ width: '100%' }">
        <template #title>Invalid {{ validationResult?.format === 'qiagen' ? 'QIAseq Immune Repertoire Analysis' : validationResult?.format }} dataset</template>
        {{ validationMessage }}
      </PlAlert>

      <PlDropdownMulti v-if="!isSingleCell" v-model="app.model.args.chains" :options="chainsOptions" label="Chains to import" required />

      <template v-if="isCustom">
        <PlSectionSeparator>Required columns</PlSectionSeparator>
        <div class="field-col">
          <PlDropdown
            v-for="f in requiredCanonical"
            :key="f.key"
            :model-value="getMapping(f.key)"
            :options="headerOptions"
            :label="f.label"
            clearable
            required
            @update:model-value="(v: string | undefined) => setMapping(f.key, v)"
          />
        </div>

        <PlAccordion>
          <PlAccordionSection label="Optional columns">
            <div class="field-col">
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
        </PlAccordion>
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

    <PlAgDataTableV2 v-model="app.model.ui.tableState" :settings="tableSettings" show-export-button />
  </PlBlockPage>
</template>

<style scoped>
.field-col { display: grid; grid-template-columns: 1fr; gap: 12px; }
</style>
