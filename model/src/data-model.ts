import { createPlDataTableStateV2, DataModelBuilder } from "@platforma-sdk/model";
import type { BlockData, LegacyBlockArgs, LegacyUiState } from "./types";

/** The six chains a fresh block offers. Unchanged from V1's `withArgs` default. */
const DEFAULT_CHAINS = ["IGHeavy", "IGLight", "TCRAlpha", "TCRBeta", "TCRDelta", "TCRGamma"];

/**
 * View-state defaults, shared by the fresh-project initialiser and the legacy upgrade.
 *
 * The upgrade needs them because V1's `uiState` fields are all optional on disk: a project
 * saved before a flag was introduced simply has no value for it, and an undefined boolean
 * reaching `argsValid` used to read as false by accident. Making the defaults explicit here
 * means the V3 data is complete whatever shape the project was saved in.
 */
const viewStateDefaults = () => ({
  tableState: createPlDataTableStateV2(),
  settingsOpen: true,
  qiagenColumnsPresent: false,
  immunoSeqColumnsPresent: false,
  mixcrColumnsPresent: false,
  crColumnsPresent: false,
  airrColumnsPresent: false,
});

/**
 * V1 kept the scientist's edits in two buckets — `args` and `uiState`. V3 keeps them in one,
 * and derives what the workflow sees. This upgrade runs once per project, the first time a
 * project saved under V1 is opened.
 *
 * The mapping is field-for-field: nothing is reshaped, because nothing in V1's shape was bent
 * to dodge the stale gate. What changes is where the fields *go afterwards* — the labels and
 * the secondary count type stop being projected into args, which is the whole point of the
 * migration for this block. See `index.ts`.
 *
 * V1's `loadFromFile` is dropped rather than carried: the panel now derives which door it is
 * showing from whether a file is loaded, so a stored flag could only disagree with the data.
 */
export function upgradeLegacyData({
  args,
  uiState,
}: {
  args?: LegacyBlockArgs;
  uiState?: LegacyUiState;
}): BlockData {
  return {
    ...viewStateDefaults(),
    ...(uiState ?? {}),

    defaultBlockLabel: args?.defaultBlockLabel ?? "",
    customBlockLabel: args?.customBlockLabel ?? "",
    datasetRef: args?.datasetRef,
    fileSource: args?.fileSource,
    format: args?.format,
    chains: args?.chains ?? DEFAULT_CHAINS,
    customMapping: args?.customMapping,
    primaryCountType: args?.primaryCountType,
    secondaryCountType: args?.secondaryCountType,
    bareSet: args?.bareSet,
  };
}

export const blockDataModel = new DataModelBuilder()
  .from<BlockData>("v1")
  .upgradeLegacy<LegacyBlockArgs, LegacyUiState>(upgradeLegacyData)
  .init(() => ({
    ...viewStateDefaults(),
    defaultBlockLabel: "",
    customBlockLabel: "",
    chains: DEFAULT_CHAINS,
  }));
