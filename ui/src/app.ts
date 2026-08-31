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
 * `BlockData.prerunCheck`: the verdict carries what it is about, so a stale one is ignored rather
 * than applied.
 */
function syncPrerunChecks(model: AppModel) {
  // Both writes are idempotent: every client derives the same verdict from the same output, and
  // the guard means agreeing clients do not write at all.
  const put = (next: NonNullable<AppModel["data"]["prerunCheck"]>) => {
    const current = model.data.prerunCheck;
    if (JSON.stringify(current) === JSON.stringify(next)) return;
    model.data.prerunCheck = next;
  };

  watchEffect(() => {
    const found = model.outputs.identityCollisions;
    if (found === undefined) return;
    put({ check: "columns", subject: found.key, identityCollides: found.values.length > 0 });
  });

  // A copy, not a comparison: `validationResult` states which dataset and format it judged, so
  // there is nothing here to match up and so nothing to get wrong. The args projection does the
  // comparing, against whatever is selected when it runs.
  watchEffect(() => {
    const result = model.outputs.validationResult;
    if (result?.dataset === undefined) return;
    put({ check: "dataset", subject: result.dataset, columnsPresent: result.isValid });
  });

  // A verdict cannot outlive the file or dataset it was reached for. Watching primitives, not the
  // refs, so a server patch swapping the data object does not clear it spuriously. Format is in
  // here because the same dataset answers differently under a different format.
  watch(
    () => [
      model.data.fileSource?.datasetId,
      model.data.datasetRef?.blockId,
      model.data.datasetRef?.name,
      model.data.format,
    ],
    () => {
      model.data.prerunCheck = undefined;
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
