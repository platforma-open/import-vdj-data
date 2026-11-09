import { createPlDataTableStateV2, DataModelBuilder } from "@platforma-sdk/model";
import { kind } from "@platforma-open/milaboratories.import-vdj.kind";
import type { BlockData, BlockDataV2, LegacyBlockArgs, LegacyUiState } from "./types";

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
}): BlockDataV2 {
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

function renameSampleIdToDatasetId(data: BlockDataV2): BlockDataV2 {
  const fileSource = data.fileSource as FileSourceV1 | undefined;
  if (fileSource === undefined) return data;
  const { sampleId, ...rest } = fileSource;
  return {
    ...data,
    fileSource: {
      ...rest,
      datasetId: fileSource.datasetId ?? sampleId,
    } as BlockDataV2["fileSource"],
  };
}

export const blockDataModel = new DataModelBuilder({ kind })
  .from<BlockDataV2>("v1")
  .upgradeLegacy<LegacyBlockArgs, LegacyUiState>(upgradeLegacyData)
  .migrate<BlockDataV2>("v2", renameSampleIdToDatasetId)
  // The old label mixed the pool dataset's name with the chains, and the pool is out of reach
  // here, so the dataset part cannot be split out. The subtitle shows the chains (or the file)
  // until the block is opened.
  .migrate<BlockData>("v3", ({ defaultBlockLabel: _, ...rest }) => ({
    ...rest,
    subtitleLabel: "",
  }))
  .init(({ params }) => ({
    ...viewStateDefaults(),
    customBlockLabel: params?.customBlockLabel ?? "",
    datasetRef: params?.datasetRef,
    fileSource: params?.fileSource,
    format: params?.format,
    chains: params?.chains ?? DEFAULT_CHAINS,
    customMapping: params?.customMapping,
    primaryCountType: params?.primaryCountType,
    secondaryCountType: params?.secondaryCountType,
    assemblingFeature: params?.assemblingFeature,
    bareSet: params?.bareSet,
  }));
