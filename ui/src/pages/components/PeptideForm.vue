<script setup lang="ts">
import type {
  CountType,
  PeptideMapping,
  PeptideSlot,
} from "@platforma-open/milaboratories.import-vdj.model";
import {
  PEPTIDE_FIELD_LABELS,
  peptideCheckKey,
  peptideMappedColumns,
  peptidePrimarySlot,
  commonHeaders,
} from "@platforma-open/milaboratories.import-vdj.model";
import { plRefsEqual } from "@platforma-sdk/model";
import {
  PlAlert,
  PlBtnSecondary,
  PlDropdown,
  PlSectionSeparator,
  PlTooltip,
} from "@platforma-sdk/ui-vue";
import { computed } from "vue";
import { useApp } from "../../app";
import { countTypeOptions, peptideHeaderAliases } from "../constants";

const app = useApp();

/** What each count field holds, for its tooltip. */
const COUNT_TOOLTIPS: Record<PeptideSlot, string> = {
  uniqueMolecules:
    "Select the column with the number of unique UMIs per peptide (distinct molecules, not reads).",
  reads: "Select the column with the number of sequencing reads per peptide.",
};

/**
 * The primary count type, as for V(D)J custom tables: reads unless UMIs were chosen. Its column is
 * the main abundance; the secondary count, if any, is imported alongside.
 */
const primaryType = computed<CountType>(() => app.model.data.primaryCountType ?? "read");
const primarySlot = computed(() => peptidePrimarySlot(primaryType.value));
const secondaryType = computed<CountType | undefined>(() => {
  const type = app.model.data.secondaryCountType;
  return type !== undefined && type !== primaryType.value ? type : undefined;
});
const secondarySlot = computed(() =>
  secondaryType.value === undefined ? undefined : peptidePrimarySlot(secondaryType.value),
);
const secondaryTypeOptions = computed(() =>
  countTypeOptions.filter((o) => o.value !== primaryType.value),
);

/**
 * The profile output, only once it belongs to the dataset now picked: the output keeps its last
 * value, so right after a switch it still holds the previous dataset's.
 */
const current = computed(() => {
  const found = app.model.outputs.datasetProfile;
  const ref = app.model.data.datasetRef;
  if (found === undefined || ref === undefined) return undefined;
  return plRefsEqual(found.datasetRef, ref) ? found : undefined;
});

/** The first sample file's profile. */
const profile = computed(() => {
  const found = current.value;
  return found === undefined || "failure" in found ? undefined : found;
});

/** Why the dataset's files could not be read, when they couldn't. */
const profileFailure = computed(() => {
  const found = current.value;
  return found !== undefined && "failure" in found ? found.failure : undefined;
});

/** Columns every sample's file has: the only ones offered. */
const common = computed(() => (profile.value ? commonHeaders(profile.value) : []));

const toOptions = (headers: string[]) => headers.map((h) => ({ label: h, value: h }));

const mapping = computed(() => app.model.data.peptide);

/**
 * Columns that read as amino-acid sequences. A nucleotide column passes that test too (A, C, G
 * and T are amino-acid letters), so those are left out.
 */
const detectedAminoAcid = computed(() => {
  const p = profile.value;
  if (p === undefined) return [];
  const nucleotide = p.nucleotide ?? [];
  return p.aminoAcid.filter((h) => !nucleotide.includes(h) && common.value.includes(h));
});

/** Only columns that read as amino acid: the check refuses any other. */
const aminoAcidOptions = computed(() => toOptions(detectedAminoAcid.value));

const nucleotideOptions = computed(() => {
  const p = profile.value;
  if (p === undefined) return [];
  return toOptions(
    (p.nucleotide ?? []).filter((h) => h !== mapping.value?.aminoAcid && common.value.includes(h)),
  );
});

/**
 * Numeric columns other than the sequences, including whole numbers written with thousands
 * separators (typed as text). Decimal columns are offered too; the check refuses them.
 */
const numericOptions = computed(() => {
  const p = profile.value;
  if (p === undefined) return [];
  const sequences = [mapping.value?.aminoAcid, mapping.value?.nucleotide];
  const whole = p.wholeNumber ?? [];
  const numeric = (h: string) =>
    p.types[h] === "Long" || p.types[h] === "Double" || whole.includes(h);
  return toOptions(common.value.filter((h) => !sequences.includes(h) && numeric(h)));
});

/** Called only from user actions, never from a watcher on an output. */
function update(change: (current: PeptideMapping) => PeptideMapping) {
  const current: PeptideMapping = app.model.data.peptide ?? { aminoAcid: "", counts: {} };
  app.model.data.peptide = change(current);
}

function setAminoAcid(header: string | undefined) {
  update((m) => ({ ...m, aminoAcid: header ?? "" }));
}

function setNucleotide(header: string | undefined) {
  update((m) => {
    const next = { ...m };
    if (header) next.nucleotide = header;
    else delete next.nucleotide;
    return next;
  });
}

/** The mapping with only the count columns of the types in use, so nothing hidden is imported. */
function keepCounts(m: PeptideMapping, primary: CountType, secondary: CountType | undefined) {
  const counts: PeptideMapping["counts"] = {};
  for (const type of [primary, secondary]) {
    if (type === undefined) continue;
    const slot = peptidePrimarySlot(type);
    if (m.counts[slot]) counts[slot] = m.counts[slot];
  }
  return { ...m, counts };
}

/** A switched primary type keeps the previous one as the secondary when its column is mapped. */
function setPrimaryType(type: CountType | undefined) {
  const next = type ?? "read";
  const previous = primaryType.value;
  if (next === previous) return;
  const a = app.model.data;
  const secondary = a.peptide?.counts[peptidePrimarySlot(previous)] ? previous : undefined;
  a.primaryCountType = next;
  a.secondaryCountType = secondary;
  if (a.peptide) a.peptide = keepCounts(a.peptide, next, secondary);
}

function setSecondaryType(type: CountType | undefined) {
  const a = app.model.data;
  a.secondaryCountType = type;
  if (a.peptide) a.peptide = keepCounts(a.peptide, primaryType.value, type);
}

function setCount(slot: PeptideSlot, header: string | undefined) {
  update((m) => {
    const counts = { ...m.counts };
    if (header) counts[slot] = header;
    else delete counts[slot];
    return { ...m, counts };
  });
}

/** "peptide_aa" and "Peptide aa" are the same name. */
const normalized = (header: string) => header.toLowerCase().replace(/[\s_.-]+/g, "");

/**
 * Fills each empty field with an offered column whose header is a known name for it, so a field
 * only gets a column its dropdown offers, and no column goes to two fields. A UMI column found
 * makes UMIs the primary count, with reads, if mapped, as the secondary. On click only, so block
 * data is never written from an output.
 */
function suggestColumns() {
  const m = mapping.value ?? { aminoAcid: "", counts: {} };
  const used = new Set(
    [m.aminoAcid, m.nucleotide, ...Object.values(m.counts)].filter((h): h is string => !!h),
  );
  const take = (aliases: readonly string[], options: { value: string }[]) => {
    const byName = new Map(
      options.filter((o) => !used.has(o.value)).map((o) => [normalized(o.value), o.value]),
    );
    const found = aliases.map((a) => byName.get(normalized(a))).find((h) => h !== undefined);
    if (found !== undefined) used.add(found);
    return found;
  };

  const next: PeptideMapping = { ...m, counts: { ...m.counts } };
  if (!next.aminoAcid) {
    next.aminoAcid = take(peptideHeaderAliases.aminoAcid, aminoAcidOptions.value) ?? "";
  }
  if (!next.nucleotide) {
    const found = take(peptideHeaderAliases.nucleotide, nucleotideOptions.value);
    if (found) next.nucleotide = found;
  }
  let umiFound = false;
  for (const slot of ["uniqueMolecules", "reads"] as const) {
    if (next.counts[slot]) continue;
    const found = take(peptideHeaderAliases.counts[slot], numericOptions.value);
    if (!found) continue;
    next.counts[slot] = found;
    if (slot === "uniqueMolecules") umiFound = true;
  }
  const primary: CountType = umiFound ? "umi" : primaryType.value;
  const other: CountType = primary === "umi" ? "read" : "umi";
  const secondary = next.counts[peptidePrimarySlot(other)] ? other : secondaryType.value;
  const a = app.model.data;
  a.primaryCountType = primary;
  a.secondaryCountType = secondary;
  a.peptide = next;
}

/** Mapped headers some sample's file lacks, e.g. a mapping that came with a template. */
const missingHeaders = computed(() => {
  const m = mapping.value;
  if (profile.value === undefined || m === undefined) return [];
  return peptideMappedColumns(m)
    .map((c) => c.header)
    .filter((h) => !common.value.includes(h));
});

/** The check result, if it is for the dataset and mapping now selected. */
const verdict = computed(() => {
  const subject = peptideCheckKey(app.model.data.datasetRef, mapping.value);
  const check = app.model.data.prerunCheck;
  if (subject === undefined || check?.check !== "peptide" || check.subject !== subject) {
    return undefined;
  }
  return check;
});

/**
 * Run stays disabled until the mapping has been checked. This panel doesn't show the message that
 * blocks the run, so it says why here.
 */
const checkPending = computed(
  () =>
    !!mapping.value?.aminoAcid &&
    !!mapping.value.counts[primarySlot.value] &&
    verdict.value === undefined,
);
</script>

<template>
  <PlAlert v-if="profileFailure" type="warn" :style="{ width: '100%' }">
    {{ profileFailure }}
  </PlAlert>

  <PlAlert v-else-if="profile === undefined" type="info" :style="{ width: '100%' }">
    Reading the first sample's file. This can take a moment, please wait...
  </PlAlert>

  <template v-else>
    <PlSectionSeparator>Required columns</PlSectionSeparator>

    <PlTooltip v-if="common.length > 0" class="suggest-columns" position="top">
      <PlBtnSecondary size="small" justify-center @click="suggestColumns"
        >Suggest columns</PlBtnSecondary
      >
      <template #tooltip>
        Fills the empty fields with columns whose names it recognises. Check the choices before
        running.
      </template>
    </PlTooltip>

    <PlAlert
      v-if="detectedAminoAcid.length === 0"
      type="warn"
      label="No amino-acid sequence column found"
      :style="{ width: '100%' }"
    >
      No column of the first sample's file reads as an amino-acid sequence. Peptide tables need one;
      a table with nucleotide sequences only cannot be imported.
    </PlAlert>
    <PlAlert
      v-if="missingHeaders.length > 0"
      type="warn"
      label="Columns not in every sample's file"
      :style="{ width: '100%' }"
    >
      {{ missingHeaders.map((h) => `"${h}"`).join(", ") }}: pick a column all files have.
    </PlAlert>
    <PlAlert
      v-else-if="verdict && verdict.problems.length > 0"
      type="warn"
      label="The files cannot be imported as mapped"
      :style="{ width: '100%' }"
    >
      <div v-for="(problem, i) in verdict.problems" :key="i">{{ problem }}</div>
    </PlAlert>
    <PlAlert v-else-if="checkPending" type="info" :style="{ width: '100%' }">
      Checking the selected columns. This can take a moment, please wait...
    </PlAlert>

    <div class="field-col">
      <PlDropdown
        :model-value="mapping?.aminoAcid || undefined"
        :options="aminoAcidOptions"
        :label="PEPTIDE_FIELD_LABELS.aminoAcid"
        clearable
        required
        @update:model-value="(v: string | undefined) => setAminoAcid(v)"
      >
        <template #tooltip> Select the column with the peptide amino-acid sequence. </template>
      </PlDropdown>
      <PlDropdown
        :model-value="primaryType"
        :options="countTypeOptions"
        label="Primary count type"
        required
        @update:model-value="(v: CountType | undefined) => setPrimaryType(v)"
      >
        <template #tooltip> The count used as the main abundance of each peptide. </template>
      </PlDropdown>
      <PlDropdown
        :model-value="mapping?.counts[primarySlot]"
        :options="numericOptions"
        :label="`${PEPTIDE_FIELD_LABELS.counts[primarySlot]} (primary)`"
        clearable
        required
        @update:model-value="(v: string | undefined) => setCount(primarySlot, v)"
      >
        <template #tooltip>
          {{ COUNT_TOOLTIPS[primarySlot] }} Whole numbers only. Fractions are calculated per sample
          from these counts.
        </template>
      </PlDropdown>
    </div>

    <PlSectionSeparator>Optional columns</PlSectionSeparator>
    <div class="field-col">
      <PlDropdown
        :model-value="mapping?.nucleotide"
        :options="nucleotideOptions"
        :label="PEPTIDE_FIELD_LABELS.nucleotide"
        clearable
        @update:model-value="(v: string | undefined) => setNucleotide(v)"
      >
        <template #tooltip>
          Select the column with the DNA sequence of the peptide, if your table has one. Peptides
          with the same amino-acid sequence but a different DNA sequence are then kept apart.
        </template>
      </PlDropdown>
      <PlDropdown
        :model-value="secondaryType"
        :options="secondaryTypeOptions"
        label="Secondary count type"
        clearable
        @update:model-value="(v: CountType | undefined) => setSecondaryType(v)"
      >
      </PlDropdown>
      <PlDropdown
        v-if="secondarySlot"
        :model-value="mapping?.counts[secondarySlot]"
        :options="numericOptions"
        :label="`${PEPTIDE_FIELD_LABELS.counts[secondarySlot]} (secondary)`"
        clearable
        @update:model-value="(v: string | undefined) => setCount(secondarySlot!, v)"
      >
        <template #tooltip>
          {{ COUNT_TOOLTIPS[secondarySlot] }} Whole numbers only. Fractions are calculated per
          sample from these counts.
        </template>
      </PlDropdown>
    </div>
  </template>
</template>

<style scoped>
/* Sized to its text rather than a full-width row. */
.suggest-columns {
  align-self: flex-start;
  width: fit-content;
}
.field-col {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}
</style>
