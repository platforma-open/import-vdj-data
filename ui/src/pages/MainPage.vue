<script setup lang="ts">
import type { PlRef } from '@platforma-sdk/model';
import { plRefsEqual } from '@platforma-sdk/model';
import { PlAgDataTableV2, PlBlockPage, PlBtnGhost, PlDropdown, PlDropdownMulti, PlDropdownRef, PlElementList, PlMaskIcon24, PlSectionSeparator, PlSlideModal, usePlDataTableSettingsV2, PlAccordion, PlAccordionSection } from '@platforma-sdk/ui-vue';
import { computed, watch } from 'vue';
import { useApp } from '../app';

const app = useApp();

const formatOptions = [
  { label: 'ImmunoSeq', value: 'immunoSeq' },
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
  { key: 'umi-count', label: 'UMI count' },
] as const;

const optionalCanonical = [
  { key: 'v-allele', label: 'V allele' },
  { key: 'd-gene', label: 'D gene' },
  { key: 'd-allele', label: 'D allele' },
  { key: 'j-allele', label: 'J allele' },
  { key: 'is-productive', label: 'Productive' },
  { key: 'cdr3-aa-length', label: 'CDR3 length (aa)' },
  { key: 'cdr3-nt-length', label: 'CDR3 length (nt)' },
] as const;

watch(
  () => app.model.args,
  (args) => {
    const a = args as unknown as { customMapping?: Record<string, string> };
    if (!a.customMapping) a.customMapping = {};
  },
  { immediate: true, deep: false },
);

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
  const a = app.model.args as unknown as { customMapping?: Record<string, string | undefined> };
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
  () => app.model.args.format,
  (fmt) => {
    if (fmt === 'custom') {
      app.model.ui.settingsOpen = true;
      const a = app.model.args as unknown as { customMapping?: Record<string, string> };
      if (!a.customMapping) a.customMapping = {};
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
        @update:model-value="setDataset"
      />

      <PlDropdown v-model="app.model.args.format" :options="formatOptions" label="Data format" />

      <PlDropdownMulti v-if="!isSingleCell" v-model="app.model.args.chains" :options="chainsOptions" label="Chains to import" />

      <template v-if="app.model.args.format === 'custom'">
        <PlSectionSeparator>Required columns</PlSectionSeparator>
        <div class="field-col">
          <PlDropdown
            v-for="f in requiredCanonical"
            :key="f.key"
            :model-value="getMapping(f.key)"
            :options="headerOptions"
            :label="f.label"
            clearable
            @update:model-value="(v) => setMapping(f.key, v as string | undefined)"
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
