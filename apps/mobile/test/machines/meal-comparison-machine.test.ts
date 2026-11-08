import { describe, expect, it } from "@effect/vitest";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect } from "effect";

import {
  MealComparisonEvents,
  MealComparisonMachine,
  MealComparisonStates,
} from "@/machines/meal-comparison-machine";

describe("MealComparisonMachine", () => {
  it.effect("toggles the comparison details", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(MealComparisonMachine, {
        events: [MealComparisonEvents.Toggle(), MealComparisonEvents.Toggle()],
      });

      yield* MachineTest.verify(MealComparisonMachine, trace);
      expect(
        MealComparisonStates.matches(trace.initial.startingState, "Collapsed")
      ).toBe(true);
      expect(
        trace.steps.map(({ after }) =>
          MealComparisonStates.matches(after, "Expanded")
        )
      ).toEqual([true, false]);

      const coverage = MachineTest.coverage(MealComparisonMachine, trace);
      expect(coverage.transitions.definitions.missing).toBe(0);
      expect(coverage.states.activation.missing).toBe(0);
    })
  );
});
