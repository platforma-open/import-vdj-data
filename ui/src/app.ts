import { platforma } from "@platforma-open/milaboratories.import-vdj.model";
import { defineAppV3 } from "@platforma-sdk/ui-vue";
import MainPage from "./pages/MainPage.vue";
import { watch } from "vue";

export const sdkPlugin = defineAppV3(platforma, (app) => {
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

// Make sure labels are initialized
const unwatch = watch(sdkPlugin, ({ loaded }) => {
  if (!loaded) return;
  const app = useApp();
  app.model.data.customBlockLabel ??= "";
  app.model.data.defaultBlockLabel ??= "Select Dataset";
  unwatch();
});
