import { AppActivity } from "@/machines/services/app-activity";
import { Effect, Layer, Queue, Stream } from "effect";
import { AppState } from "react-native";

export const AppActivityLayer = Layer.succeed(AppActivity, {
  activations: Stream.callback<void>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() =>
        AppState.addEventListener("change", (state) => {
          if (state === "active") {
            Queue.offerUnsafe(queue, undefined);
          }
        })
      ),
      (subscription) =>
        Effect.sync(() => {
          subscription.remove();
        })
    )
  ),
});
