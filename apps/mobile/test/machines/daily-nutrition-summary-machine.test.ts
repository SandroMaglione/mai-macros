import { describe, expect, it } from "@effect/vitest";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect } from "effect";

import {
  DailyNutritionSummaryEvents,
  DailyNutritionSummaryMachine,
} from "@/machines/daily-nutrition-summary-machine";

describe("DailyNutritionSummaryMachine", () => {
  it.effect("tracks display mode, pinned state, and selected nutrient", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(DailyNutritionSummaryMachine, {
        events: [
          DailyNutritionSummaryEvents.Toggle(),
          DailyNutritionSummaryEvents.SetPinned({ pinned: true }),
          DailyNutritionSummaryEvents.SelectNutrient({
            nutrient: "proteinGrams",
          }),
          DailyNutritionSummaryEvents.Toggle(),
          DailyNutritionSummaryEvents.SetPinned({ pinned: false }),
        ],
      });

      yield* MachineTest.verify(DailyNutritionSummaryMachine, trace);
      expect(trace.initial.startingState.value).toMatchObject({
        mode: "consumed",
        nutrient: "energyKcal",
        pinned: false,
      });
      expect(trace.steps.map(({ after }) => after.value)).toMatchObject([
        { mode: "remaining", nutrient: "energyKcal", pinned: false },
        { mode: "remaining", nutrient: "energyKcal", pinned: true },
        { mode: "remaining", nutrient: "proteinGrams", pinned: true },
        { mode: "consumed", nutrient: "proteinGrams", pinned: true },
        { mode: "consumed", nutrient: "proteinGrams", pinned: false },
      ]);

      const coverage = MachineTest.coverage(
        DailyNutritionSummaryMachine,
        trace
      );
      expect(coverage.transitions.definitions.missing).toBe(0);
    })
  );
});
