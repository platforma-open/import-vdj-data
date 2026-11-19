import { liveCheck, platforma } from "@platforma-open/milaboratories.import-vdj.model";
import { plRefsEqual } from "@platforma-sdk/model";
import { defineAppV3 } from "@platforma-sdk/ui-vue";
import canonicalize from "canonicalize";
import { computed, watch, watchEffect } from "vue";
import MainPage from "./pages/MainPage.vue";

export const sdkPlugin = defineAppV3(platforma, (app) => {
  syncPrerunChecks(app.model);
  syncSubtitleLabel(app.model);

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
 * Carry prerun's verdicts into `data` so the model's run check can refuse the run on them. An
 * output written back into state a derivation reads — the hairpin — kept safe by the contract on
 * `BlockData.prerunCheck`: the verdict carries what it is about, so a stale one is ignored rather
 * than applied.
 */
function syncPrerunChecks(model: AppModel) {
  // Every write is idempotent: every client derives the same verdict from the same output, and
  // the guard means agreeing clients do not write at all. Compared canonically: stored data comes
  // back with its keys sorted.
  const put = (next: NonNullable<AppModel["data"]["prerunCheck"]>) => {
    const current = model.data.prerunCheck;
    if (canonicalize(current) === canonicalize(next)) return;
    model.data.prerunCheck = next;
  };

  // One check is live at a time: the one the model's `liveCheck` names, which is the one its run
  // check reads.
  watchEffect(() => {
    const check = liveCheck(model.data);
    if (check === "columns") {
      const found = model.outputs.identityCollisions;
      if (found === undefined) return;
      put({ check: "columns", subject: found.key, identityCollides: found.values.length > 0 });
    } else if (check === "peptide") {
      const found = model.outputs.peptideCheck;
      if (found === undefined) return;
      put({ check: "peptide", subject: found.key, problems: found.problems });
    } else {
      const result = model.outputs.validationResult;
      if (result?.dataset === undefined) return;
      put({ check: "dataset", subject: result.dataset, columnsPresent: result.isValid });
    }
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

/**
 * Keep the picked pool dataset's label in `subtitleLabel`. The file door has no pool dataset, so
 * it gets "" there; the model adds the file name and the chains to the subtitle itself.
 */
function syncSubtitleLabel(model: AppModel) {
  // undefined while the picked dataset is not among the options yet.
  const subtitleLabel = computed<string | undefined>(() => {
    const datasetRef = model.data.datasetRef;
    if (!datasetRef) return "";
    return model.outputs.datasetOptions?.find((o) => plRefsEqual(o.ref, datasetRef))?.label;
  });

  watch(
    subtitleLabel,
    (label) => {
      if (label !== undefined && label !== model.data.subtitleLabel)
        model.data.subtitleLabel = label;
    },
    { immediate: true },
  );
}

// Make sure labels are initialized
const unwatch = watch(sdkPlugin, ({ loaded }) => {
  if (!loaded) return;
  const app = useApp();
  app.model.data.customBlockLabel ??= "";
  unwatch();
});
