import { describe, expect, it } from "@effect/vitest";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect } from "effect";

import {
  InsightRangeEditorEvents,
  InsightRangeEditorMachine,
  InsightRangeEditorStates,
} from "@/machines/insight-range-editor-machine";

describe("InsightRangeEditorMachine", () => {
  it.effect("edits a custom range and closes it", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(InsightRangeEditorMachine, {
        events: [
          InsightRangeEditorEvents.Open({
            end: "2026-11-08",
            start: "2026-10-10",
          }),
          InsightRangeEditorEvents.ChangeStart({ value: "2026-11-10" }),
          InsightRangeEditorEvents.Invalid(),
          InsightRangeEditorEvents.ChangeEnd({ value: "2026-11-12" }),
          InsightRangeEditorEvents.Invalid(),
          InsightRangeEditorEvents.Close(),
        ],
      });

      yield* MachineTest.verify(InsightRangeEditorMachine, trace);
      expect(
        trace.steps.map(({ after }) => [
          InsightRangeEditorStates.matches(after, "Open"),
          {
            end: after.value.end,
            message: after.value.message,
            start: after.value.start,
          },
        ])
      ).toEqual([
        [true, { end: "2026-11-08", message: null, start: "2026-10-10" }],
        [true, { end: "2026-11-08", message: null, start: "2026-11-10" }],
        [
          true,
          {
            end: "2026-11-08",
            message:
              "Enter valid dates as YYYY-MM-DD, with From on or before To.",
            start: "2026-11-10",
          },
        ],
        [true, { end: "2026-11-12", message: null, start: "2026-11-10" }],
        [
          true,
          {
            end: "2026-11-12",
            message:
              "Enter valid dates as YYYY-MM-DD, with From on or before To.",
            start: "2026-11-10",
          },
        ],
        [
          false,
          {
            end: "2026-11-12",
            message:
              "Enter valid dates as YYYY-MM-DD, with From on or before To.",
            start: "2026-11-10",
          },
        ],
      ]);

      const coverage = MachineTest.coverage(InsightRangeEditorMachine, trace);
      expect(coverage.transitions.definitions.missing).toBe(0);
      expect(coverage.states.activation.missing).toBe(0);
    })
  );

  it.effect("reopening resets the draft and clears the message", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(InsightRangeEditorMachine, {
        events: [
          InsightRangeEditorEvents.Open({ end: "b", start: "a" }),
          InsightRangeEditorEvents.Invalid(),
          InsightRangeEditorEvents.Close(),
          InsightRangeEditorEvents.Open({ end: "d", start: "c" }),
        ],
      });

      yield* MachineTest.verify(InsightRangeEditorMachine, trace);
      expect(trace.finalConfiguration).toContain("Open");
      expect(trace.final.value).toMatchObject({
        end: "d",
        message: null,
        start: "c",
      });
    })
  );
});
