import { Context, type Stream } from "effect";

export class AppActivity extends Context.Service<
  AppActivity,
  { readonly activations: Stream.Stream<void> }
>()("AppActivity") {}
