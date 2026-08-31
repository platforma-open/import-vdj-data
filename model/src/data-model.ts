import { createPlDataTableStateV2, DataModelBuilder } from "@platforma-sdk/model";
import type { BlockData, LegacyBlockArgs, LegacyUiState } from "./types";

/** The six chains a fresh block offers. Unchanged from V1's `withArgs` default. */
const DEFAULT_CHAINS = ["IGHeavy", "IGLight", "TCRAlpha", "TCRBeta", "TCRDelta", "TCRGamma"];

/** View-state defaults, shared by the fresh-project initialiser and the legacy upgrade. */
const viewStateDefaults = () => ({
  tableState: createPlDataTableStateV2(),
  settingsOpen: true,
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

/**
 * `FileSource.sampleId` became `datasetId` — the same value under a name that says what it is.
 *
 * Load-bearing, not cosmetic: the value mints the `pl7.app/sampleId` axis key for the direct-file
 * door, so a project that reached v2 without it would key its records on `undefined` and lose
 * every join a downstream block had made. v1 shipped in block 1.8.1, so such projects exist.
 */
type FileSourceV1 = { sampleId?: string; datasetId?: string } & Record<string, unknown>;

function renameSampleIdToDatasetId(data: BlockData): BlockData {
  const fileSource = data.fileSource as FileSourceV1 | undefined;
  if (fileSource === undefined) return data;
  const { sampleId, ...rest } = fileSource;
  return {
    ...data,
    // `datasetId ?? sampleId`, not the other way round: a project saved after the rename already
    // carries the new key, and must not have it overwritten by a stale one left beside it.
    fileSource: { ...rest, datasetId: fileSource.datasetId ?? sampleId } as BlockData["fileSource"],
  };
}

export const blockDataModel = new DataModelBuilder()
  .from<BlockData>("v1")
  .upgradeLegacy<LegacyBlockArgs, LegacyUiState>(upgradeLegacyData)
  .migrate<BlockData>("v2", renameSampleIdToDatasetId)
  .init(() => ({
    ...viewStateDefaults(),
    defaultBlockLabel: "",
    customBlockLabel: "",
    chains: DEFAULT_CHAINS,
  }));
