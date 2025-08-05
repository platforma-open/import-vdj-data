<script setup lang="ts">
import type { PlRef } from '@platforma-sdk/model';
import { plRefsEqual } from '@platforma-sdk/model';
import { PlAgDataTableV2, PlBlockPage, PlBtnGhost, PlDropdown, PlDropdownMulti, PlDropdownRef, PlElementList, PlMaskIcon24, PlSectionSeparator, PlSlideModal, usePlDataTableSettingsV2 } from '@platforma-sdk/ui-vue';
import { computed, ref } from 'vue';
import { useApp } from '../app';

const app = useApp();

const settingsOpen = ref(app.model.args.datasetRef === undefined);

const formatOptions = [
  { label: 'ImmunoSeq', value: 'immunoSeq' },
  { label: 'MiXCR', value: 'mixcr' },
  { label: 'AIRR', value: 'airr' },
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

</script>

<template>
  <PlBlockPage>
    <template #title>{{ app.model.ui.title }}</template>
    <template #append>
      <PlBtnGhost @click.stop="() => (settingsOpen = true)">
        Settings
        <template #append>
          <PlMaskIcon24 name="settings" />
        </template>
      </PlBtnGhost>
    </template>

    <PlSlideModal v-model="settingsOpen">
      <PlDropdownRef
        v-model="app.model.args.datasetRef"
        :options="app.model.outputs.datasetOptions"
        label="Select dataset"
        clearable
        @update:model-value="setDataset"
      />
      <PlDropdown v-model="app.model.args.format" :options="formatOptions" label="Data format" />

      <PlDropdownMulti v-if="!isSingleCell" v-model="app.model.args.chains" :options="chainsOptions" label="Chains to import" />

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
