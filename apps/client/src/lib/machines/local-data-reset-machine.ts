import { LocalDataResetMachine } from "@mai/machines";

import { RuntimeClient } from "../runtime-client.ts";

export const localDataResetMachine =
  LocalDataResetMachine.makeLocalDataResetMachine({
    restartApp: () => {
      globalThis.location.reload();
    },
    runtime: RuntimeClient,
  });
