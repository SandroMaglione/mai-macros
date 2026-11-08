import { Navigation } from "@/machines/services/navigation";
import { Effect, Layer } from "effect";
import { router } from "expo-router";

export const NavigationLayer = Layer.succeed(Navigation, {
  back: Effect.sync(() => {
    router.back();
  }),
  canGoBack: Effect.sync(() => router.canGoBack()),
  push: (href) =>
    Effect.sync(() => {
      router.push(href);
    }),
  replace: (href) =>
    Effect.sync(() => {
      router.replace(href);
    }),
});
