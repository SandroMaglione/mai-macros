import { describe, expect, it } from "@effect/vitest";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect } from "effect";

import {
  DisclosureCardEvents,
  DisclosureCardMachine,
  DisclosureCardStates,
} from "@/machines/disclosure-card-machine";

describe("DisclosureCardMachine", () => {
  it.effect("toggles between collapsed and expanded", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(DisclosureCardMachine, {
        events: [DisclosureCardEvents.Toggle(), DisclosureCardEvents.Toggle()],
      });

      yield* MachineTest.verify(DisclosureCardMachine, trace);
      expect(
        trace.steps.map(({ after }) =>
          DisclosureCardStates.matches(after, "Expanded")
        )
      ).toEqual([true, false]);

      const coverage = MachineTest.coverage(DisclosureCardMachine, trace);
      expect(coverage.transitions.definitions.missing).toBe(0);
      expect(coverage.states.activation.missing).toBe(0);
    })
  );
});
