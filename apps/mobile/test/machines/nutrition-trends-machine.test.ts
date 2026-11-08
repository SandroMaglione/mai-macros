import { describe, expect, it } from "@effect/vitest";
import { Domain } from "@mai/nutrition";
import * as NutritionReports from "@mai/nutrition/services/nutrition-reports";
import { Machine } from "@typeonce/effect-machine";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect, Layer, Option, Schema } from "effect";

import {
  NutritionCalendarEvents,
  NutritionCalendarMachine,
  NutritionCalendarStates,
  NutritionTrendMetricEvents,
  NutritionTrendMetricMachine,
  type NutritionCalendarDay,
  type NutritionCalendarInput,
} from "@/machines/nutrition-trends-machine";

const _plan = Schema.decodeEffect(Domain.Plan)({
  id: "22222222-2222-4222-8222-222222222222",
  name: "Default",
  meals: [{ id: "breakfast", name: "Breakfast", position: 0, createdAt: 100 }],
  proteinTargetGrams: 120,
  carbsTargetGrams: 200,
  fatTargetGrams: 70,
  createdAt: 100,
});

const _existingDay: NutritionCalendarDay = {
  dateKey: Domain.DateKey.make("2026-03-20"),
  hasEntries: true,
  isInsideTargetMargin: false,
  mode: "eating",
};

const _input = ({
  shouldLoad,
}: {
  readonly shouldLoad: boolean;
}): NutritionCalendarInput => ({
  dateKey: Domain.DateKey.make("2026-03-20"),
  days: [_existingDay],
  loadEndDateKey: shouldLoad ? Domain.DateKey.make("2026-03-14") : null,
  loadStartDateKey: shouldLoad ? Domain.DateKey.make("2026-03-01") : null,
  shouldLoad,
});

const _reportsLayer = ({
  requests,
  failures,
}: {
  readonly requests: NutritionReports.GetNutritionReportRangeInput[];
  readonly failures: number;
}) =>
  Layer.mock(NutritionReports.NutritionReports, {
    getRange: ({ input }) =>
      Effect.gen(function* () {
        requests.push(input);

        if (requests.length <= failures) {
          return yield* new NutritionReports.InvalidNutritionReportRange({
            endDateKey: Domain.DateKey.make(input.endDateKey),
            startDateKey: Domain.DateKey.make(input.startDateKey),
          });
        }

        return {
          activePlan: yield* Effect.orDie(_plan),
          days: [],
          endDateKey: Domain.DateKey.make(input.endDateKey),
          startDateKey: Domain.DateKey.make(input.startDateKey),
        };
      }),
  });

describe("NutritionTrendMetricMachine", () => {
  it.effect("selects the charted metric", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(NutritionTrendMetricMachine, {
        events: [
          NutritionTrendMetricEvents.SelectMetric({ nutrientName: "costEur" }),
          NutritionTrendMetricEvents.SelectMetric({
            nutrientName: "waterLiters",
          }),
        ],
      });

      yield* MachineTest.verify(NutritionTrendMetricMachine, trace);
      expect(trace.initial.startingState.value.nutrientName).toBe("energyKcal");
      expect(trace.steps.map(({ after }) => after.value.nutrientName)).toEqual([
        "costEur",
        "waterLiters",
      ]);

      const coverage = MachineTest.coverage(NutritionTrendMetricMachine, trace);
      expect(coverage.transitions.definitions.missing).toBe(0);
    })
  );
});

describe("NutritionCalendarMachine", () => {
  it.effect("starts ready or loading and resets the month on navigation", () =>
    Effect.gen(function* () {
      const ready = yield* MachineTest.run(NutritionCalendarMachine, {
        input: _input({ shouldLoad: false }),
        events: [NutritionCalendarEvents.Retry()],
      });
      const next = yield* MachineTest.run(NutritionCalendarMachine, {
        input: _input({ shouldLoad: false }),
        events: [NutritionCalendarEvents.NextMonth()],
      });
      const previous = yield* MachineTest.run(NutritionCalendarMachine, {
        input: {
          ..._input({ shouldLoad: false }),
          dateKey: Domain.DateKey.make("2026-03-31"),
        },
        events: [NutritionCalendarEvents.PreviousMonth()],
      });
      const loading = yield* MachineTest.run(NutritionCalendarMachine, {
        input: _input({ shouldLoad: true }),
        events: [],
      });
      const traces = [ready, next, previous, loading];

      yield* Effect.forEach(traces, (trace) =>
        MachineTest.verify(NutritionCalendarMachine, trace)
      );
      expect(NutritionCalendarStates.matches(ready.final, "Ready")).toBe(true);
      expect(next.final.value).toMatchObject({
        dateKey: "2026-04-20",
        days: [],
      });
      expect(
        Option.isSome(NutritionCalendarStates.get(next.final, "Loading"))
      ).toBe(true);
      expect(previous.final.value.dateKey).toBe("2026-02-28");
      expect(NutritionCalendarStates.get(loading.final, "Loading")).toEqual(
        Option.some(
          expect.objectContaining({
            loadEndDateKey: "2026-03-14",
            loadStartDateKey: "2026-03-01",
          })
        )
      );

      const coverage = MachineTest.coverage(NutritionCalendarMachine, traces);
      expect(
        coverage.transitions.definitions.misses
          .map(({ source, trigger }) =>
            trigger.type === "event"
              ? `${source} ${trigger.event}`
              : `${source} ${trigger.type}`
          )
          .sort()
      ).toEqual([
        "Failed NextMonth",
        "Failed PreviousMonth",
        "Failed Retry",
        "Loading invoke",
        "Loading invoke",
      ]);
      expect(
        coverage.transitions.branches.misses.filter(
          ({ source }) => source === "Initial"
        )
      ).toEqual([]);
    })
  );

  it.live("loads the missing part of the initial month", () =>
    Effect.gen(function* () {
      const requests: NutritionReports.GetNutritionReportRangeInput[] = [];
      const calendar = yield* Machine.start(
        NutritionCalendarMachine,
        _input({ shouldLoad: true })
      ).pipe(Effect.provide(_reportsLayer({ requests, failures: 0 })));
      const ready = yield* Machine.waitFor(calendar, ({ state }) =>
        NutritionCalendarStates.matches(state, "Ready")
      );

      expect(requests).toEqual([
        { endDateKey: "2026-03-14", startDateKey: "2026-03-01" },
      ]);
      expect(ready.state.value.days).toEqual([_existingDay]);
    }).pipe(Effect.scoped)
  );

  it.live("retries a failed month and loads the full next month", () =>
    Effect.gen(function* () {
      const requests: NutritionReports.GetNutritionReportRangeInput[] = [];
      const calendar = yield* Machine.start(
        NutritionCalendarMachine,
        _input({ shouldLoad: true })
      ).pipe(Effect.provide(_reportsLayer({ requests, failures: 1 })));
      const failed = yield* Machine.waitFor(calendar, ({ state }) =>
        NutritionCalendarStates.matches(state, "Failed")
      );

      expect(
        Option.map(
          NutritionCalendarStates.get(failed.state, "Failed"),
          ({ message }) => message
        )
      ).toEqual(Option.some("Could not load this nutrition month."));

      yield* calendar.send(NutritionCalendarEvents.Retry());
      yield* Machine.waitFor(calendar, ({ state }) =>
        NutritionCalendarStates.matches(state, "Ready")
      );
      yield* calendar.send(NutritionCalendarEvents.NextMonth());
      const nextMonth = yield* Machine.waitFor(
        calendar,
        ({ state }) =>
          requests.length === 3 &&
          NutritionCalendarStates.matches(state, "Ready")
      );

      expect(requests).toEqual([
        { endDateKey: "2026-03-14", startDateKey: "2026-03-01" },
        { endDateKey: "2026-03-14", startDateKey: "2026-03-01" },
        { endDateKey: "2026-04-30", startDateKey: "2026-04-01" },
      ]);
      expect(nextMonth.state.value).toMatchObject({
        dateKey: "2026-04-20",
        days: [],
      });
    }).pipe(Effect.scoped)
  );
});
