import { describe, expect, it } from "@effect/vitest";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect } from "effect";

import {
  NutrientBreakdownEvents,
  NutrientBreakdownMachine,
} from "@/machines/nutrient-breakdown-machine";

describe("NutrientBreakdownMachine", () => {
  it.effect("toggles estimates and the full nutrient list independently", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(NutrientBreakdownMachine, {
        events: [
          NutrientBreakdownEvents.ToggleEstimates(),
          NutrientBreakdownEvents.ToggleExpanded(),
          NutrientBreakdownEvents.ToggleEstimates(),
        ],
      });

      yield* MachineTest.verify(NutrientBreakdownMachine, trace);
      expect(trace.initial.startingState.value).toMatchObject({
        expanded: false,
        includeEstimates: true,
      });
      expect(trace.steps.map(({ after }) => after.value)).toMatchObject([
        { expanded: false, includeEstimates: false },
        { expanded: true, includeEstimates: false },
        { expanded: true, includeEstimates: true },
      ]);

      const coverage = MachineTest.coverage(NutrientBreakdownMachine, trace);
      expect(coverage.transitions.definitions.missing).toBe(0);
    })
  );
});
