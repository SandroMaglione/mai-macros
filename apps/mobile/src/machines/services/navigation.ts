import { Context, type Effect } from "effect";
import type { Href } from "expo-router";

export class Navigation extends Context.Service<
  Navigation,
  {
    readonly back: Effect.Effect<void>;
    readonly canGoBack: Effect.Effect<boolean>;
    readonly push: (href: Href) => Effect.Effect<void>;
    readonly replace: (href: Href) => Effect.Effect<void>;
  }
>()("Navigation") {}
