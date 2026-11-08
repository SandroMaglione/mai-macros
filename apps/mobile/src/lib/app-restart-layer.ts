import { LocalDataResetMachine } from "@mai/machines";
import { Effect, Layer } from "effect";
import { router } from "expo-router";

export const AppRestartLayer = Layer.succeed(LocalDataResetMachine.AppRestart, {
  restart: Effect.sync(() => {
    if (router.canDismiss()) {
      router.dismissAll();
    }

    router.replace("/");
  }),
});
