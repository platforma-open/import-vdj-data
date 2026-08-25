import { platforma } from "@platforma-open/milaboratories.import-vdj.model";
import { defineAppV3 } from "@platforma-sdk/ui-vue";
import MainPage from "./pages/MainPage.vue";
import { watch, watchEffect } from "vue";

export const sdkPlugin = defineAppV3(platforma, (app) => {
  syncPrerunChecks(app.model);

  return {
    // Main run only: this loader covers the whole block, and prerun re-runs while the settings
    // panel is being edited. The file scan is announced inside the panel instead.
    progress: () => app.model.outputs.isRunning,
    routes: {
      "/": () => MainPage,
    },
  };
});

export const useApp = sdkPlugin.useApp;

type AppModel = ReturnType<typeof useApp>["model"];

/**
 * Carry prerun's verdicts into `data` so the args projection can refuse the run on them.
 *
 * This is the hairpin — an output written back into the state a derivation reads — and it is here
 * because nothing else can be: args sees only `data`, and no user gesture can establish whether a
 * column the scientist just picked repeats. The contract that keeps it safe is stated on
 * `BlockData.prerunChecks`; both halves below are that contract.
 */
function syncPrerunChecks(model: AppModel) {
  // Idempotent by construction: every client derives the same verdict from the same output, and
  // the equality guard means agreeing clients do not write at all.
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

  // A verdict cannot outlive the file or dataset it was reached for — the same column name in a
  // different file is a different column, and one that repeated there may be sound here. Watching
  // the primitives rather than the refs so a server patch swapping the data object does not clear
  // it spuriously.
  watch(
    () => [
      model.data.fileSource?.sampleId,
      model.data.datasetRef?.blockId,
      model.data.datasetRef?.name,
    ],
    () => {
      model.data.prerunChecks = undefined;
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
