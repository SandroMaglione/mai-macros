import * as BodyWeightReports from "@mai/nutrition/services/body-weight-reports";
import * as NutritionReports from "@mai/nutrition/services/nutrition-reports";
import { Effect, Layer } from "effect";
import type { ManagedRuntime as ManagedRuntimeType } from "effect/ManagedRuntime";

import { RuntimeClient } from "./runtime-client.ts";

const InsightsServicesLayer = Layer.mergeAll(
  BodyWeightReports.BodyWeightReports.layer,
  NutritionReports.NutritionReports.layer
);

export const InsightsRuntimeClient = {
  runPromise: <A, E>(
    effect: Effect.Effect<
      A,
      E,
      | BodyWeightReports.BodyWeightReports
      | NutritionReports.NutritionReports
      | ManagedRuntimeType.Services<typeof RuntimeClient>
    >
  ) =>
    RuntimeClient.runPromise(
      effect.pipe(Effect.provide(InsightsServicesLayer))
    ),
};
