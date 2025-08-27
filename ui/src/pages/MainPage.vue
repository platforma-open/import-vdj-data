<script setup lang="ts">
import type { PlRef } from '@platforma-sdk/model';
import { plRefsEqual } from '@platforma-sdk/model';
import { PlAccordion, PlAccordionSection, PlAgDataTableV2, PlAlert, PlBlockPage, PlBtnGhost, PlDropdown, PlDropdownMulti, PlDropdownRef, PlElementList, PlMaskIcon24, PlSectionSeparator, PlSlideModal, usePlDataTableSettingsV2 } from '@platforma-sdk/ui-vue';
import { computed, watch } from 'vue';
import { useApp } from '../app';

const app = useApp();

const formatOptions = [
  { label: 'ImmunoSeq', value: 'immunoSeq' },
  { label: 'QIAseq Immune Repertoire Analysis', value: 'qiagen' },
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

const countTypeOptions = [
  { label: 'Reads', value: 'read' },
  { label: 'UMIs', value: 'umi' },
];

const secondaryTypeOptions = computed(() => {
  const p = app.model.args.primaryCountType;
  if (p === 'read') return [{ label: 'UMIs', value: 'umi' }];
  if (p === 'umi') return [{ label: 'Reads', value: 'read' }];
  return countTypeOptions;
});

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

const requiredCanonicalBase = [
  { key: 'cdr3-aa', label: 'CDR3 aa' },
  { key: 'cdr3-nt', label: 'CDR3 nt' },
  { key: 'v-gene', label: 'V gene' },
  { key: 'j-gene', label: 'J gene' },
] as const;

const optionalCanonical = [
  { key: 'top-chains', label: 'Top chains' },
  { key: 'v-allele', label: 'V allele' },
  { key: 'j-allele', label: 'J allele' },
  { key: 'd-gene', label: 'D gene' },
  { key: 'd-allele', label: 'D allele' },
  { key: 'c-gene', label: 'C gene' },
  { key: 'c-allele', label: 'C allele' },
  { key: 'is-productive', label: 'Productive' },
  // This is calculated by the workflow
  // { key: 'cdr3-aa-length', label: 'CDR3 length (aa)' },
  // { key: 'cdr3-nt-length', label: 'CDR3 length (nt)' },
  // Newly added optional fields
  { key: 'isotype', label: 'Isotype' },
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

const headerOptions = computed(() => (app.model.outputs.headerColumns ?? []).map((h) => ({ label: h, value: h })));

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
  const a = app.model.args as unknown as { customMapping?: Record<string, string | undefined>; primaryCountType?: 'read' | 'umi' };
  const m = a.customMapping ?? {};
  const hasAA = !!m['cdr3-aa'];
  const hasNT = !!m['cdr3-nt'];
  const hasV = !!m['v-gene'];
  const hasJ = !!m['j-gene'];
  const pct = a.primaryCountType ?? 'read';
  const hasPrimary = pct === 'umi' ? !!m['umi-count'] : !!m['read-count'];
  const hasOneSeq = hasAA || hasNT;
  return hasOneSeq && hasV && hasJ && hasPrimary;
});

const qiagenColumnsPresent = computed(() => {
  if (app.model.args.format !== 'qiagen') return true;

  const headers = app.model.outputs.headerColumns ?? [];
  const qiagenColumns = [
    'read set',
    'chain',
    'V-region',
    'J-region',
    'CDR3 nucleotide seq',
    'CDR3 amino acid seq',
    'frequency',
    'rank',
    'UMIs with analytical threshold',
    'nucleotide length',
    'amino acid length',
  ];

  // Check if ALL Qiagen-specific columns are present
  const hasAllQiagenColumns = qiagenColumns.every((col) => headers.includes(col));
  return hasAllQiagenColumns;
});

// Watch qiagenColumnsPresent and update the args
watch(
  qiagenColumnsPresent,
  (newValue) => {
    if (app.model.args.format === 'qiagen') {
      app.model.args.qiagenColumnsPresent = newValue;
    }
  },
  { immediate: true },
);

const qiagenValidationMessage = computed(() => {
  if (app.model.args.format !== 'qiagen' || qiagenColumnsPresent.value) return '';

  const headers = app.model.outputs.headerColumns ?? [];
  const qiagenColumns = [
    'read set',
    'chain',
    'V-region',
    'J-region',
    'CDR3 nucleotide seq',
    'CDR3 amino acid seq',
    'frequency',
    'rank',
    'UMIs with analytical threshold',
    'nucleotide length',
    'amino acid length',
  ];

  const missingColumns = qiagenColumns.filter((col) => !headers.includes(col));

  return `The selected dataset is missing required Qiagen columns: ${missingColumns.join(', ')}. Please verify the format selection or choose a different dataset.`;
});

const forceSettingsOpen = computed(() => {
  const mustStayOpen = app.model.args.format === 'custom' && !mappingComplete.value;
  return app.model.ui.settingsOpen || mustStayOpen;
});

function onModalUpdate(val: boolean) {
  const mustStayOpen = app.model.args.format === 'custom' && !mappingComplete.value;
  if (mustStayOpen) {
    app.model.ui.settingsOpen = true;
    return;
  }
  app.model.ui.settingsOpen = val;
}

watch(
  () => app.model.args,
  (args) => {
    if (args.format === 'custom') {
      app.model.ui.settingsOpen = true;
      const a = app.model.args as unknown as { customMapping?: Record<string, string>; primaryCountType?: 'read' | 'umi'; secondaryCountType?: 'read' | 'umi' };
      if (!a.customMapping) a.customMapping = {};
      if (!a.primaryCountType) a.primaryCountType = 'read';
      if (a.secondaryCountType && a.secondaryCountType === a.primaryCountType) a.secondaryCountType = undefined;
      // don't allow same column for read-count and umi
      if (a.customMapping['read-count'] !== undefined
        && (a.customMapping['read-count'] === a.customMapping?.['umi-count'])) {
        if (a.primaryCountType === 'read') {
          delete a.customMapping['umi-count'];
        } else {
          delete a.customMapping['read-count'];
        }
      }
      // clear not used count type from customMapping
      if (a.primaryCountType === 'read' && !a.secondaryCountType) {
        delete a.customMapping['umi-count'];
      }
      if (a.primaryCountType === 'umi' && !a.secondaryCountType) {
        delete a.customMapping['read-count'];
      }
    }
    // Reset qiagenColumnsPresent when format changes away from qiagen
    if (args.format !== 'qiagen') {
      app.model.args.qiagenColumnsPresent = undefined;
    }
  },
  { immediate: true },
);

</script>

<template>
  <PlBlockPage>
    <template #title>{{ app.model.ui.title }}</template>
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

      <PlDropdownRef
        v-model="app.model.args.datasetRef"
        :options="app.model.outputs.datasetOptions"
        label="Select dataset"
        clearable
        required
        @update:model-value="setDataset"
      />

      <PlDropdown v-model="app.model.args.format" :options="formatOptions" label="Data format" required />

      <PlAlert v-if="qiagenValidationMessage" type="warn" :style="{ width: '100%' }">
        <template #title>Invalid Qiagen dataset</template>
        {{ qiagenValidationMessage }}
      </PlAlert>

      <PlDropdownMulti v-if="!isSingleCell" v-model="app.model.args.chains" :options="chainsOptions" label="Chains to import" required />

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
            @update:model-value="(v) => setMapping(f.key, v as string | undefined)"
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
            @update:model-value="(v) => setMapping('read-count', v as string | undefined)"
          />
          <PlDropdown
            v-if="(app.model.args as any).primaryCountType === 'umi'"
            :model-value="getMapping('umi-count')"
            :options="headerOptions"
            label="UMI count column (primary)"
            clearable
            required
            @update:model-value="(v) => setMapping('umi-count', v as string | undefined)"
          />
        </div>

        <PlAccordion>
          <PlAccordionSection label="Optional columns">
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
                @update:model-value="(v) => setMapping('umi-count', v as string | undefined)"
              />
              <PlDropdown
                v-if="(app.model.args as any).secondaryCountType === 'read'"
                :model-value="getMapping('read-count')"
                :options="headerOptions"
                label="Read count column (secondary, optional)"
                clearable
                @update:model-value="(v) => setMapping('read-count', v as string | undefined)"
              />
              <PlDropdown
                v-for="f in optionalCanonical"
                :key="f.key"
                :model-value="getMapping(f.key)"
                :options="headerOptions"
                :label="f.label"
                clearable
                @update:model-value="(v) => setMapping(f.key, v as string | undefined)"
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
