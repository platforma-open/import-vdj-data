import { createPlDataTableStateV2, DataModelBuilder } from "@platforma-sdk/model";
import { kind } from "@platforma-open/milaboratories.import-vdj.kind";
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

/** `FileSource.sampleId` became `datasetId`. The value mints an axis key, so it must carry over. */
type FileSourceV1 = { sampleId?: string; datasetId?: string } & Record<string, unknown>;

function renameSampleIdToDatasetId(data: BlockData): BlockData {
  const fileSource = data.fileSource as FileSourceV1 | undefined;
  if (fileSource === undefined) return data;
  const { sampleId, ...rest } = fileSource;
  return {
    ...data,
    fileSource: { ...rest, datasetId: fileSource.datasetId ?? sampleId } as BlockData["fileSource"],
  };
}

export const blockDataModel = new DataModelBuilder({ kind })
  .from<BlockData>("v1")
  .upgradeLegacy<LegacyBlockArgs, LegacyUiState>(upgradeLegacyData)
  .migrate<BlockData>("v2", renameSampleIdToDatasetId)
  .init(({ params }) => ({
    ...viewStateDefaults(),
    // Left empty on purpose: the panel derives it from the chosen source, so a
    // value put here could only disagree with what the block is showing.
    defaultBlockLabel: "",
    customBlockLabel: params?.customBlockLabel ?? "",
    datasetRef: params?.datasetRef,
    fileSource: params?.fileSource,
    format: params?.format,
    chains: params?.chains ?? DEFAULT_CHAINS,
    customMapping: params?.customMapping,
    primaryCountType: params?.primaryCountType,
    secondaryCountType: params?.secondaryCountType,
    bareSet: params?.bareSet,
  }));
