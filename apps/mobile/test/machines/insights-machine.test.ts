import { describe, expect, it } from "@effect/vitest";
import { InsightDateRange } from "@mai/machines/insight-range";
import * as Domain from "@mai/nutrition/domain";
import * as NutritionReports from "@mai/nutrition/services/nutrition-reports";
import { Machine } from "@typeonce/effect-machine";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect, Layer, Option, Ref, Schema } from "effect";

import { shiftDateKey } from "@/lib/date-keys";
import {
  InsightsViewEvents,
  InsightsViewMachine,
  NutritionInsightsEvents,
  NutritionInsightsMachine,
  NutritionInsightsStates,
} from "@/machines/insights-machine";

const _plan = Schema.decodeEffect(Domain.Plan)({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Default",
  meals: [{ id: "breakfast", name: "Breakfast", position: 0, createdAt: 100 }],
  proteinTargetGrams: 100,
  carbsTargetGrams: 200,
  fatTargetGrams: 60,
  createdAt: 100,
});

const _dateRange = Schema.decodeEffect(InsightDateRange)({
  endDateKey: "2026-11-07",
  startDateKey: "2026-11-01",
});

const _report = ({
  input,
}: {
  readonly input: NutritionReports.GetNutritionReportRangeInput;
}) =>
  Effect.map(Effect.orDie(_plan), (activePlan) => ({
    activePlan,
    days: [],
    endDateKey: Domain.DateKey.make(input.endDateKey),
    startDateKey: Domain.DateKey.make(input.startDateKey),
  }));

describe("InsightsViewMachine", () => {
  it.effect("selects tabs, charts, estimates and report ranges", () =>
    Effect.gen(function* () {
      const dateRange = yield* _dateRange;
      const trace = yield* MachineTest.run(InsightsViewMachine, {
        input: { initialTab: "weight" },
        events: [
          InsightsViewEvents.SelectTab({ tab: "nutrition" }),
          InsightsViewEvents.SelectChartKind({ chartKind: "trend" }),
          InsightsViewEvents.ToggleEstimates(),
          InsightsViewEvents.SelectWeightChartKind({ chartKind: "change" }),
          InsightsViewEvents.SelectRange({ dateRange, rangeDayCount: 7 }),
          InsightsViewEvents.ToggleEstimates(),
        ],
      });

      yield* MachineTest.verify(InsightsViewMachine, trace);
      expect(trace.initial.startingState.value).toMatchObject({
        activeTab: "weight",
        chartKind: "daily",
        dateRange: null,
        includeEstimates: true,
        rangeDayCount: 30,
        weightChartKind: "trend",
      });
      expect(
        trace.steps.map(({ after }) => after.value.includeEstimates)
      ).toEqual([true, true, false, false, false, true]);
      expect(trace.final.value).toMatchObject({
        activeTab: "nutrition",
        chartKind: "trend",
        dateRange,
        includeEstimates: true,
        rangeDayCount: 7,
        weightChartKind: "change",
      });

      const coverage = MachineTest.coverage(InsightsViewMachine, trace);
      expect(coverage.transitions.definitions.missing).toBe(0);
    })
  );
});

describe("NutritionInsightsMachine", () => {
  it.effect("waits for the report before accepting retry", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(NutritionInsightsMachine, {
        input: { dateRange: null, rangeDayCount: 30 },
        events: [NutritionInsightsEvents.Retry()],
      });

      yield* MachineTest.verify(NutritionInsightsMachine, trace);
      expect(trace.finalConfiguration).toContain("Loading");
      expect(
        MachineTest.coverage(
          NutritionInsightsMachine,
          trace
        ).transitions.definitions.misses.map(({ source, trigger }) =>
          trigger.type === "invoke"
            ? `${source}:${trigger.id}.${trigger.outcome}`
            : `${source}:${trigger.type === "event" ? trigger.event : trigger.type}`
        )
      ).toEqual(["Failure:Retry", "Loading:loadRange.done"]);
    })
  );

  it.live("loads the selected custom range", () =>
    Effect.gen(function* () {
      const dateRange = yield* _dateRange;
      const requested: NutritionReports.GetNutritionReportRangeInput[] = [];
      const machine = yield* Machine.start(NutritionInsightsMachine, {
        dateRange,
        rangeDayCount: 7,
      }).pipe(
        Effect.provide(
          Layer.mock(NutritionReports.NutritionReports, {
            getRange: ({ input }) =>
              Effect.andThen(
                Effect.sync(() => requested.push(input)),
                _report({ input })
              ),
          })
        )
      );
      const loaded = yield* Machine.waitFor(machine, ({ state }) =>
        NutritionInsightsStates.matches(state, "Loaded")
      );

      expect(requested).toEqual([
        { endDateKey: "2026-11-07", startDateKey: "2026-11-01" },
      ]);
      expect(
        Option.map(
          NutritionInsightsStates.get(loaded.state, "Loaded"),
          ({ currentReport }) => [
            currentReport.startDateKey,
            currentReport.endDateKey,
          ]
        )
      ).toEqual(Option.some(["2026-11-01", "2026-11-07"]));
    }).pipe(Effect.scoped)
  );

  it.live("loads the trailing day count ending today", () =>
    Effect.gen(function* () {
      const requested: NutritionReports.GetNutritionReportRangeInput[] = [];
      const machine = yield* Machine.start(NutritionInsightsMachine, {
        dateRange: null,
        rangeDayCount: 7,
      }).pipe(
        Effect.provide(
          Layer.mock(NutritionReports.NutritionReports, {
            getRange: ({ input }) =>
              Effect.andThen(
                Effect.sync(() => requested.push(input)),
                _report({ input })
              ),
          })
        )
      );

      yield* Machine.waitFor(machine, ({ state }) =>
        NutritionInsightsStates.matches(state, "Loaded")
      );

      expect(
        requested.map(
          ({ endDateKey, startDateKey }) =>
            shiftDateKey({ dateKey: endDateKey, days: -6 }) === startDateKey
        )
      ).toEqual([true]);
    }).pipe(Effect.scoped)
  );

  it.live("asks for a meal plan when no plans exist", () =>
    Effect.gen(function* () {
      const machine = yield* Machine.start(NutritionInsightsMachine, {
        dateRange: null,
        rangeDayCount: 30,
      }).pipe(
        Effect.provide(
          Layer.mock(NutritionReports.NutritionReports, {
            getRange: () =>
              Effect.fail(new NutritionReports.NoNutritionReportPlans()),
          })
        )
      );
      const noPlans = yield* Machine.waitFor(machine, ({ state }) =>
        NutritionInsightsStates.matches(state, "NoPlans")
      );

      expect(
        Option.map(
          NutritionInsightsStates.get(noPlans.state, "NoPlans"),
          ({ message }) => message
        )
      ).toEqual(
        Option.some("Create a meal plan to unlock nutrition insights.")
      );
    }).pipe(Effect.scoped)
  );

  it.live("shows a failure for an invalid range and retries it", () =>
    Effect.gen(function* () {
      const dateRange = yield* _dateRange;
      const attempts = yield* Ref.make(0);
      const machine = yield* Machine.start(NutritionInsightsMachine, {
        dateRange,
        rangeDayCount: 7,
      }).pipe(
        Effect.provide(
          Layer.mock(NutritionReports.NutritionReports, {
            getRange: ({ input }) =>
              Effect.flatMap(
                Ref.getAndUpdate(attempts, (count) => count + 1),
                (count) =>
                  count === 0
                    ? Effect.fail(
                        new NutritionReports.InvalidNutritionReportRange({
                          endDateKey: dateRange.endDateKey,
                          startDateKey: dateRange.startDateKey,
                        })
                      )
                    : _report({ input })
              ),
          })
        )
      );
      const failure = yield* Machine.waitFor(machine, ({ state }) =>
        NutritionInsightsStates.matches(state, "Failure")
      );

      expect(
        Option.map(
          NutritionInsightsStates.get(failure.state, "Failure"),
          ({ message }) => message
        )
      ).toEqual(Option.some("The selected nutrition range is invalid."));

      yield* machine.send(NutritionInsightsEvents.Retry());
      yield* Machine.waitFor(machine, ({ state }) =>
        NutritionInsightsStates.matches(state, "Loaded")
      );
      expect(yield* Ref.get(attempts)).toBe(2);
    }).pipe(Effect.scoped)
  );
});
