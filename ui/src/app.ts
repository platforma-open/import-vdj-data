import { platforma } from "@platforma-open/milaboratories.import-vdj.model";
import { defineAppV3 } from "@platforma-sdk/ui-vue";
import MainPage from "./pages/MainPage.vue";
import { watch, watchEffect } from "vue";

export const sdkPlugin = defineAppV3(platforma, (app) => {
  syncPrerunChecks(app.model);

  return {
    // Main run only: the loader covers the whole block, and prerun re-runs while the settings
    // panel is being edited. Prerun waits are announced inside the panel instead.
    progress: () => app.model.outputs.isRunning,
    routes: {
      "/": () => MainPage,
    },
  };
});

export const useApp = sdkPlugin.useApp;

type AppModel = ReturnType<typeof useApp>["model"];

/**
 * Carry prerun's verdicts into `data` so the args projection can refuse the run on them. An output
 * written back into state a derivation reads — the hairpin — kept safe by the contract on
 * `BlockData.prerunChecks`, which the two halves below are.
 */
function syncPrerunChecks(model: AppModel) {
  // Idempotent: every client derives the same verdict from the same output, and the guard means
  // agreeing clients do not write at all.
  watchEffect(() => {
    const found = model.outputs.identityCollisions;
    if (found === undefined) return;
    const next = { columns: found.key, identityCollides: found.values.length > 0 };
    const current = model.data.prerunChecks;
    if (current?.columns === next.columns && current.identityCollides === next.identityCollides) {
      return;
    }
    model.data.prerunChecks = next;
  });

  // The dataset door's verdict. A copy, not a comparison: `validationResult` states which dataset
  // and format it judged, so there is nothing here to match up and so nothing to get wrong. The
  // args projection does the comparing, against whatever is selected when it runs.
  watchEffect(() => {
    const result = model.outputs.validationResult;
    if (result?.dataset === undefined) return;
    const next = { dataset: result.dataset, columnsPresent: result.isValid };
    const current = model.data.prerunDatasetCheck;
    if (current?.dataset === next.dataset && current.columnsPresent === next.columnsPresent) return;
    model.data.prerunDatasetCheck = next;
  });

  // A verdict cannot outlive the file or dataset it was reached for. Watching primitives, not the
  // refs, so a server patch swapping the data object does not clear it spuriously. Format is in
  // here for the dataset check: the same dataset answers differently under a different format.
  watch(
    () => [
      model.data.fileSource?.datasetId,
      model.data.datasetRef?.blockId,
      model.data.datasetRef?.name,
      model.data.format,
    ],
    () => {
      model.data.prerunChecks = undefined;
      model.data.prerunDatasetCheck = undefined;
    },
  );
}

// Make sure labels are initialized
const unwatch = watch(sdkPlugin, ({ loaded }) => {
  if (!loaded) return;
  const app = useApp();
  app.model.data.customBlockLabel ??= "";
  app.model.data.defaultBlockLabel ??= "Select Dataset";
  unwatch();
});
