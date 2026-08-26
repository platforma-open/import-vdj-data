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
