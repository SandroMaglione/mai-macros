import { makeLocalDataResetMachine } from "@mai/machines/local-data";

import { RuntimeClient } from "../runtime-client.ts";

export {
  LocalDataResetConfirmationText,
  type LocalDataResetActorRef,
  type LocalDataResetEvent,
  type LocalDataResetSnapshot,
} from "@mai/machines/local-data";

export const localDataResetMachine = makeLocalDataResetMachine({
  restartApp: () => {
    globalThis.location.reload();
  },
  runtime: RuntimeClient,
});
