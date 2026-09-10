import { Context, Effect, Layer } from "effect";
import type { Href } from "expo-router";

export class Router extends Context.Service<
  Router,
  { readonly replace: (href: Href) => Effect.Effect<void> }
>()("@mai/mobile/Router") {
  static readonly layerExpo = Layer.succeed(Router, {
    replace: (href) =>
      Effect.gen(function* () {
        const { router } = yield* Effect.promise(() => import("expo-router"));
        router.replace(href);
      }),
  });
}
