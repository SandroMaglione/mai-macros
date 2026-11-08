import { describe, expect, it } from "@effect/vitest";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect } from "effect";

import {
  ChartDateLabelEvents,
  ChartDateLabelMachine,
} from "@/machines/chart-date-label-machine";

describe("ChartDateLabelMachine", () => {
  it.effect("tracks the pressed chart day and clears it on release", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(ChartDateLabelMachine, {
        events: [
          ChartDateLabelEvents.Select({ dayIndex: 20_400 }),
          { _tag: "Select", dayIndex: 20_401 },
          ChartDateLabelEvents.Select({ dayIndex: null }),
        ],
      });

      yield* MachineTest.verify(ChartDateLabelMachine, trace);
      expect(trace.initial.startingState.value.dayIndex).toBeNull();
      expect(trace.steps.map(({ after }) => after.value.dayIndex)).toEqual([
        20_400,
        20_401,
        null,
      ]);

      const coverage = MachineTest.coverage(ChartDateLabelMachine, trace);
      expect(coverage.transitions.definitions.missing).toBe(0);
    })
  );
});
