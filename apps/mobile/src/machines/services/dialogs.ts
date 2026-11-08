import { Context, type Effect } from "effect";

export class Dialogs extends Context.Service<
  Dialogs,
  {
    readonly alert: (options: {
      readonly message: string;
      readonly title: string;
    }) => Effect.Effect<void>;
  }
>()("Dialogs") {}
