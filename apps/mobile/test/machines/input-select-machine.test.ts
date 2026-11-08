import { describe, expect, it } from "@effect/vitest";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect } from "effect";

import {
  InputSelectDialogEvents,
  InputSelectDialogMachine,
  InputSelectDialogStates,
} from "@/machines/input-select-machine";

describe("InputSelectDialogMachine", () => {
  it.effect("opens and closes the option dialog", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(InputSelectDialogMachine, {
        events: [
          InputSelectDialogEvents.Close(),
          InputSelectDialogEvents.Open(),
          InputSelectDialogEvents.Open(),
          InputSelectDialogEvents.Close(),
        ],
      });

      yield* MachineTest.verify(InputSelectDialogMachine, trace);
      expect(
        trace.steps.map(({ after }) =>
          InputSelectDialogStates.matches(after, "Open")
        )
      ).toEqual([false, true, true, false]);

      const coverage = MachineTest.coverage(InputSelectDialogMachine, trace);
      expect(coverage.transitions.definitions.missing).toBe(0);
      expect(coverage.states.activation.missing).toBe(0);
    })
  );
});
