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
  { label: 'MiXCR bulk', value: 'mixcr' },
  { label: 'MiXCR single cell', value: 'mixcr-sc' },
  { label: 'Cell Ranger VDJ', value: 'cellranger' },
  { label: 'AIRR bulk', value: 'airr' },
  { label: 'AIRR single cell', value: 'airr-sc' },
  { label: 'Custom', value: 'custom' },
];

const chainsOptions = [
  { label: 'IG Heavy', value: 'IGHeavy' },
  { label: 'IG Light', value: 'IGLight' },
  { label: 'TRA', value: 'TCRAlpha' },
  { label: 'TRB', value: 'TCRBeta' },
  { label: 'TRD', value: 'TCRDelta' },
  { label: 'TRG', value: 'TCRGamma' },
];

const receptorOptions = [
  { value: 'IG', label: 'IG' },
  { value: 'TCRAB', label: 'TCR-αβ' },
  { value: 'TCRGD', label: 'TCR-ɣδ' },
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

const isSingleCell = computed(() => app.model.args.format === 'mixcr-sc' || app.model.args.format === 'cellranger');

const tableSettings = usePlDataTableSettingsV2({
  sourceId: () => app.model.args.datasetRef,
  model: () => app.model.outputs.stats,
});

const setDataset = (datasetRef: PlRef | undefined) => {
  app.model.args.datasetRef = datasetRef;
  if (datasetRef)
    app.model.ui.title = 'Import V(D)J Data - ' + app.model.outputs.datasetOptions?.find((o) => plRefsEqual(o.ref, datasetRef))?.label;
};

function setReceptors(selected: string[]) {
  const chains: string[] = [];
  if (selected.includes('IG')) {
    chains.push('IGHeavy', 'IGLight');
  }
  if (selected.includes('TCRAB')) {
    chains.push('TCRBeta', 'TCRAlpha');
  }
  if (selected.includes('TCRGD')) {
    chains.push('TCRDelta', 'TCRGamma');
  }
  app.model.args.chains = chains;
}

const selectedReceptors = computed<string[]>({
  get: () => {
    const c = app.model.args.chains ?? [];
    const sel: string[] = [];
    if (c.includes('IGHeavy') || c.includes('IGLight')) sel.push('IG');
    if (c.includes('TCRAlpha') || c.includes('TCRBeta')) sel.push('TCRAB');
    if (c.includes('TCRDelta') || c.includes('TCRGamma')) sel.push('TCRGD');
    return sel;
  },
  set: (val) => setReceptors(val),
});

const requiredCanonicalBase = [
  { key: 'cdr3-aa', label: 'CDR3 aa' },
  { key: 'cdr3-nt', label: 'CDR3 nt' },
  { key: 'v-gene', label: 'V gene' },
  { key: 'j-gene', label: 'J gene' },
];

const optionalSequence = [
  { key: 'fr1-aa', label: 'FR1 aa' },
  { key: 'fr2-aa', label: 'FR2 aa' },
  { key: 'fr3-aa', label: 'FR3 aa' },
  { key: 'fr4-aa', label: 'FR4 aa' },
  { key: 'cdr1-aa', label: 'CDR1 aa' },
  { key: 'cdr2-aa', label: 'CDR2 aa' },
  { key: 'vdj-aa', label: 'Full VDJ region aa' },
  { key: 'fr1-nt', label: 'FR1 nt' },
  { key: 'fr2-nt', label: 'FR2 nt' },
  { key: 'fr3-nt', label: 'FR3 nt' },
  { key: 'fr4-nt', label: 'FR4 nt' },
  { key: 'cdr1-nt', label: 'CDR1 nt' },
  { key: 'cdr2-nt', label: 'CDR2 nt' },
  { key: 'vdj-nt', label: 'Full VDJ region nt' },
];

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
  { key: 'n-length-total-added', label: 'Total added nt' }];

const optionalMutations = [
  { key: 'aa-mutations-count-v', label: 'AA mutations count (V)' },
  { key: 'aa-mutations-rate-v', label: 'AA mutations rate (V)' },
  { key: 'nt-mutations-count-v', label: 'NT mutations count (V)' },
  { key: 'nt-mutations-rate-v', label: 'NT mutations rate (V)' },
  { key: 'aa-mutations-count-j', label: 'AA mutations count (J)' },
  { key: 'aa-mutations-rate-j', label: 'AA mutations rate (J)' },
  { key: 'nt-mutations-count-j', label: 'NT mutations count (J)' },
  { key: 'nt-mutations-rate-j', label: 'NT mutations rate (J)' },
];

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
  const a = app.model.args as { customMapping?: Record<string, string | undefined>; primaryCountType?: 'read' | 'umi' };
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

const validationResult = computed(() => {
  // Access format to create dependency and ensure reactivity when format changes
  const format = app.model.args.format;
  // Access outputs - Vue should track this if outputs is reactive
  const outputs = app.model.outputs;
  const result = (outputs as { validationResult?: { isValid: boolean; missingColumns: string[]; format: string } })?.validationResult;
  // Return result - format dependency ensures recomputation when format changes
  return format ? result : result;
});

const validationMessage = computed(() => {
  const result = validationResult.value;
  if (!result || result.isValid) return '';

  const formatKey = result.format?.toLowerCase?.() ?? result.format;
  const formatName = formatKey === 'qiagen'
    ? 'QIAseq Immune Repertoire Analysis'
    : formatKey === 'immunoseq'
      ? 'ImmunoSeq'
      : formatKey === 'mixcr'
        ? 'MiXCR bulk'
        : formatKey === 'mixcr-sc'
          ? 'MiXCR single cell'
          : formatKey === 'cellranger'
            ? 'Cell Ranger VDJ'
            : formatKey === 'airr'
              ? 'AIRR bulk'
              : formatKey === 'airr-sc'
                ? 'AIRR single cell'
                : result.format;

  return `The selected dataset is missing required ${formatName} columns: ${result.missingColumns.join(', ')}. Please verify the format selection or choose a different dataset.`;
});

watch(
  () => app.model.args,
  (args) => {
    if (args.format === 'custom') {
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
  },
  { immediate: true },
);

const formatFlags = {
  'qiagen': 'qiagenColumnsPresent',
  'immunoSeq': 'immunoSeqColumnsPresent',
  'immunoseq': 'immunoSeqColumnsPresent',
  'mixcr': 'mixcrColumnsPresent',
  'mixcr-sc': 'mixcrColumnsPresent',
  'cellranger': 'crColumnsPresent',
  'airr': 'airrColumnsPresent',
  'airr-sc': 'airrColumnsPresent',
} as const;

watch([() => app.model.args.format, validationResult], ([format, result]) => {
  Object.values(formatFlags).forEach((flag) => (app.model.ui[flag] = false));

  if (!result) return;

  if (result.format === format) {
    const flag = formatFlags[result.format as keyof typeof formatFlags];
    if (flag) {
      app.model.ui[flag] = result.isValid;
    }
  }
}, { immediate: true, deep: true });

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

      <PlAlert v-if="validationMessage" type="warn" :style="{ width: '100%' }">
        <template #title>
          Invalid {{ validationResult?.format === 'qiagen'
            ? 'QIAseq Immune Repertoire Analysis'
            : (validationResult?.format === 'immunoSeq' || validationResult?.format === 'immunoseq'
              ? 'ImmunoSeq'
              : (validationResult?.format === 'mixcr'
                ? 'MiXCR bulk'
                : (validationResult?.format === 'mixcr-sc'
                  ? 'MiXCR single cell'
                  : (validationResult?.format === 'cellranger'
                    ? 'Cell Ranger VDJ'
                    : (validationResult?.format === 'airr'
                      ? 'AIRR bulk'
                      : validationResult?.format)))))
          }} dataset
        </template>
        {{ validationMessage }}
      </PlAlert>

      <PlDropdownMulti v-if="!isSingleCell" v-model="app.model.args.chains" :options="chainsOptions" label="Chains to import" required />
      <PlDropdownMulti v-else v-model="selectedReceptors" :options="receptorOptions" label="Immune receptors" required />
      <!-- receptor selector for single-cell formats can be added here if needed -->

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
            @update:model-value="(v: string | undefined) => setMapping(f.key, v as string | undefined)"
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
            @update:model-value="(v: string | undefined) => setMapping('read-count', v as string | undefined)"
          />
          <PlDropdown
            v-if="(app.model.args as any).primaryCountType === 'umi'"
            :model-value="getMapping('umi-count')"
            :options="headerOptions"
            label="UMI count column (primary)"
            clearable
            required
            @update:model-value="(v: string | undefined) => setMapping('umi-count', v as string | undefined)"
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
                @update:model-value="(v: string | undefined) => setMapping('umi-count', v as string | undefined)"
              />
              <PlDropdown
                v-if="(app.model.args as any).secondaryCountType === 'read'"
                :model-value="getMapping('read-count')"
                :options="headerOptions"
                label="Read count column (secondary, optional)"
                clearable
                @update:model-value="(v: string | undefined) => setMapping('read-count', v as string | undefined)"
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
                @update:model-value="(v: string | undefined) => setMapping(f.key, v as string | undefined)"
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
                @update:model-value="(v: string | undefined) => setMapping(f.key, v as string | undefined)"
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
