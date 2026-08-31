<script setup lang="ts">
import type {
  BareSetChain,
  BareSetMapping,
  BareSetScheme,
  ChainSelection,
  ImportedProperty,
} from "@platforma-open/milaboratories.import-vdj.model";
import {
  bareSetValid,
  CHAIN_SLOT_LABELS,
  collisionCheckKey,
  CHAIN_SLOTS,
  SCHEME_LABELS,
  SCHEMES_FOR_SELECTION,
} from "@platforma-open/milaboratories.import-vdj.model";
import { PlAlert, PlDropdown, PlDropdownMulti, PlSectionSeparator } from "@platforma-sdk/ui-vue";
import { computed } from "vue";
import { useApp } from "../../app";
import { chainsOptions, receptorOptions } from "../constants";
import {
  identityCollisionMessage as buildIdentityCollisionMessage,
  propertyCollisionMessage as buildPropertyCollisionMessage,
} from "../messages";

const { headerOptions } = defineProps<{
  /** Every column of the loaded file. Computed by the parent, which needs it for the other door. */
  headerOptions: { label: string; value: string }[];
}>();

const app = useApp();

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

const chainSelectionOptions = [...receptorOptions, ...chainsOptions];

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
  const current: BareSetMapping = a.bareSet ?? {
    identity: "",
    chainSelection: "IG",
    sequences: {},
    scheme: "imgt",
  };
  if (!value) return;

  const selection = value as ChainSelection;
  // Columns mapped to a slot the new declaration does not ask for are dropped. Keeping them would
  // leave the block emitting a chain the scientist just said they were not importing.
  const kept: Partial<Record<BareSetChain, string>> = {};
  for (const slot of CHAIN_SLOTS[selection] ?? []) {
    const existing = current.sequences?.[slot];
    if (existing) kept[slot] = existing;
  }

  // A scheme the new chains cannot be numbered under would fail the run rather than the mapping,
  // so it is reset here rather than left for ANARCI to reject.
  const allowed = SCHEMES_FOR_SELECTION[selection] ?? (["imgt"] as BareSetScheme[]);
  const scheme = allowed.includes(current.scheme) ? current.scheme : allowed[0];

  a.bareSet = { ...current, chainSelection: selection, sequences: kept, scheme };
}

function bareField(field: "identity" | BareSetChain): string | undefined {
  const bare = app.model.data.bareSet;
  if (!bare) return undefined;
  if (field !== "identity") return bare.sequences?.[field];
  // `identity` is a required string, so "nothing chosen" is stored as "". A dropdown counts any
  // non-undefined value as chosen, so handing it "" showed an italic red "Value not available"
  // instead of an empty field, and clearing the id column looked like it had broken it.
  return bare.identity === "" ? undefined : bare.identity;
}

/** Written on user gesture only, never from a watcher on an output. */
function setBareField(field: "identity" | BareSetChain, value: string | undefined) {
  const a = app.model.data;
  const current: BareSetMapping = a.bareSet ?? {
    identity: "",
    chainSelection: "IG",
    sequences: {},
    scheme: "imgt",
  };
  const next: BareSetMapping = {
    identity: field === "identity" ? (value ?? "") : current.identity,
    chainSelection: current.chainSelection,
    sequences: { ...current.sequences },
    scheme: current.scheme,
  };
  if (field !== "identity") {
    if (value) next.sequences[field] = value;
    else delete next.sequences[field];
  }

  // Cleared right back out when nothing is mapped, so its mere presence stays a reliable signal
  // that this is a bare set. Every slot, not just the two IG ones — naming those two left a TCR
  // mapping unable to clear itself.
  const empty = !next.identity && !Object.values(next.sequences).some(Boolean);
  a.bareSet = empty ? undefined : next;
}

function setBareScheme(value: string | undefined) {
  const a = app.model.data;
  if (!a.bareSet || !value) return;
  a.bareSet = { ...a.bareSet, scheme: value as BareSetScheme };
}

/** A column has been assigned. Not `bareSet !== undefined` — that outlives the mapping it held. */
const isBareSet = computed(() => {
  const bare = app.model.data.bareSet;
  if (bare === undefined) return false;
  return !!bare.identity || Object.values(bare.sequences ?? {}).some(Boolean);
});

/**
 * Headers whose sampled values actually read as amino-acid variable domains. The workflow works
 * this out at prerun by reading the file — a header cannot say it, and offering every column here
 * lets an antibody's *name* be mapped into a sequence slot, which imports cleanly and leaves every
 * record Failed after ANARCI declines to number it.
 *
 * Falls back to every header when the classification is empty, which happens before the file is
 * read and on a file whose rows could not be sampled. An empty dropdown would be a worse failure
 * than an unfiltered one: the scientist could not proceed at all.
 */
const sequenceOptions = computed(() => {
  const aminoAcid = app.model.outputs.aminoAcidColumns ?? [];
  if (aminoAcid.length === 0) return headerOptions;
  return aminoAcid.map((h) => ({ label: h, value: h }));
});

/**
 * Identity values repeated on rows that are not identical — the record key is the identity's hash,
 * so a repeat merges two records into one. Empty unless the verdict is about the mapping now
 * selected; anything else is about one the scientist has moved on from.
 */
/**
 * The mapping is finished but prerun has not yet cleared the columns it names. Run is disabled
 * meanwhile and this layout does not surface the args error, so the reason is said here.
 */
const columnChecksPending = computed(() => {
  const bare = app.model.data.bareSet;
  if (bare === undefined || !bareSetValid(bare)) return false;
  const check = app.model.data.prerunCheck;
  return check?.check !== "columns" || check.subject !== collisionCheckKey(bare);
});

/**
 * Headers not taken by a sequence or the identity — offered as record properties rather than
 * dropped, which is what the block used to do with them.
 */
const propertyCandidates = computed(() => {
  const bare = app.model.data.bareSet;
  const taken = new Set(
    [bare?.identity, ...Object.values(bare?.sequences ?? {})].filter(Boolean) as string[],
  );
  return (app.model.outputs.fileColumns ?? []).filter((h) => !taken.has(h));
});

const acceptedProperties = computed<string[]>({
  get: () => (app.model.data.bareSet?.properties ?? []).map((p) => p.header),
  set: (headers) => {
    const a = app.model.data;
    if (!a.bareSet) return;
    // The type is written here, on the accept gesture, from the profile prerun produced by reading
    // every row. The panel asks no type question — see ColumnProfile — and taking a snapshot at the
    // gesture keeps the args projection a pure function of `data`.
    const types = app.model.outputs.columnProfile?.types ?? {};
    a.bareSet = {
      ...a.bareSet,
      properties: headers.map(
        (h): ImportedProperty => ({ header: h, valueType: types[h] ?? "String" }),
      ),
    };
  },
});

const identityCollisionMessage = computed(() =>
  buildIdentityCollisionMessage(app.model.outputs.identityCollisions, app.model.data.bareSet),
);
const propertyCollisionMessage = computed(() =>
  buildPropertyCollisionMessage(app.model.data.bareSet?.properties),
);
</script>

<template>
  <PlSectionSeparator>Columns to import</PlSectionSeparator>

  <PlAlert
    v-if="identityCollisionMessage"
    type="warn"
    label="Id column is not unique"
    :style="{ width: '100%' }"
  >
    {{ identityCollisionMessage }}
  </PlAlert>
  <PlAlert v-else-if="columnChecksPending" type="info" :style="{ width: '100%' }">
    Validating the selected columns. This can take a moment, please wait...
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
    <PlDropdownMulti
      v-if="isBareSet"
      v-model="acceptedProperties"
      :options="propertyCandidates.map((h) => ({ label: h, value: h }))"
      label="Import as record properties"
    />
  </div>

  <PlAlert
    v-if="propertyCollisionMessage"
    type="warn"
    label="Two headers would become one column"
    :style="{ width: '100%' }"
  >
    {{ propertyCollisionMessage }}
  </PlAlert>

  <!-- Not a column mapping: it chooses how the mapped sequences are numbered, and the region
       boundaries every downstream block reads follow from it. Kept apart from the mapping so it
       does not read as one more column to assign. -->
  <template v-if="isBareSet">
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

<style scoped>
.field-col {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}
</style>
