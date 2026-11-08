import { describe, expect, it } from "@effect/vitest";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect } from "effect";

import {
  CostCoverageDialogEvents,
  CostCoverageDialogMachine,
  CostCoverageDialogStates,
  RangeSummaryListEvents,
  RangeSummaryListMachine,
  RangeSummaryListStates,
} from "@/machines/range-summary-machine";

describe("RangeSummaryListMachine", () => {
  it.effect("expands and collapses a preview list", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(RangeSummaryListMachine, {
        events: [
          RangeSummaryListEvents.Collapse(),
          RangeSummaryListEvents.Expand(),
          RangeSummaryListEvents.Expand(),
          RangeSummaryListEvents.Collapse(),
        ],
      });

      yield* MachineTest.verify(RangeSummaryListMachine, trace);
      expect(
        trace.steps.map(({ after }) =>
          RangeSummaryListStates.matches(after, "Expanded")
        )
      ).toEqual([false, true, true, false]);

      const coverage = MachineTest.coverage(RangeSummaryListMachine, trace);
      expect(coverage.transitions.definitions.missing).toBe(0);
      expect(coverage.states.activation.missing).toBe(0);
    })
  );
});

describe("CostCoverageDialogMachine", () => {
  it.effect("opens and closes the cost coverage dialog", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(CostCoverageDialogMachine, {
        events: [
          CostCoverageDialogEvents.Open(),
          CostCoverageDialogEvents.Close(),
        ],
      });

      yield* MachineTest.verify(CostCoverageDialogMachine, trace);
      expect(
        trace.steps.map(({ after }) =>
          CostCoverageDialogStates.matches(after, "Open")
        )
      ).toEqual([true, false]);

      const coverage = MachineTest.coverage(CostCoverageDialogMachine, trace);
      expect(coverage.transitions.definitions.missing).toBe(0);
      expect(coverage.states.activation.missing).toBe(0);
    })
  );
});
