import { describe, expect, it } from "@effect/vitest";
import { Domain, Foods, MealEntries, Store } from "@mai/nutrition";
import * as DailyLogs from "@mai/nutrition/services/daily-logs";
import { Machine } from "@typeonce/effect-machine";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect, Layer, Option, Schema } from "effect";
import type { Href } from "expo-router";

import {
  MacroDetailsRouteEvents,
  MacroDetailsRouteMachine,
  MacroDetailsRouteStates,
  MacroDetailsSelectionEvents,
  MacroDetailsSelectionMachine,
} from "@/machines/macro-details-machine";
import { Navigation } from "@/machines/services/navigation";

const _dateKey = Domain.DateKey.make("2026-01-15");

const _fixtures = Effect.gen(function* () {
  const plan = yield* Schema.decodeEffect(Domain.Plan)({
    id: "22222222-2222-4222-8222-222222222222",
    name: "Default",
    meals: [
      { id: "breakfast", name: "Breakfast", position: 0, createdAt: 100 },
    ],
    proteinTargetGrams: 120,
    carbsTargetGrams: 200,
    fatTargetGrams: 70,
    createdAt: 100,
  });
  const dailyLog = yield* Schema.decodeEffect(Domain.DailyLog)({
    dateKey: _dateKey,
    planId: plan.id,
    createdAt: 100,
    updatedAt: 100,
  });

  return { dailyLog, plan };
}).pipe(Effect.orDie);

const _servicesLayer = ({
  day,
  replaced,
}: {
  readonly day: Effect.Effect<
    DailyLogs.Day,
    DailyLogs.NoMealPlans | Store.NutritionStoreError
  >;
  readonly replaced: Href[];
}) =>
  Layer.mergeAll(
    Layer.mock(DailyLogs.DailyLogs, { open: () => day }),
    Layer.mock(Foods.Foods, { getMany: () => Effect.succeed([]) }),
    Layer.mock(MealEntries.MealEntries, {
      listForDay: () => Effect.succeed([]),
    }),
    Layer.mock(Navigation, {
      replace: (href) => Effect.sync(() => replaced.push(href)),
    })
  );

const _openedDay = Effect.map(
  _fixtures,
  ({ dailyLog, plan }) =>
    new DailyLogs.OpenedDay({ dailyLog, plans: [plan], selectedPlan: plan })
);

describe("MacroDetailsRouteMachine", () => {
  it.effect("starts by loading the requested scope", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(MacroDetailsRouteMachine, {
        input: { dateKey: _dateKey, meal: undefined },
        events: [MacroDetailsRouteEvents.Reload()],
      });

      yield* MachineTest.verify(MacroDetailsRouteMachine, trace);
      expect(MacroDetailsRouteStates.matches(trace.final, "Loading")).toBe(
        true
      );

      const coverage = MachineTest.coverage(MacroDetailsRouteMachine, trace);
      expect(
        coverage.transitions.definitions.misses
          .map(({ source, trigger }) =>
            trigger.type === "invoke"
              ? `${source} ${trigger.id} ${trigger.outcome}`
              : `${source} ${trigger.type === "event" ? trigger.event : trigger.type}`
          )
          .sort()
      ).toEqual([
        "Failed Reload",
        "Loading loadMacroDetails done",
        "Loading loadMacroDetails failure",
        "Ready Reload",
        "Redirected redirectToNewPlan done",
      ]);
    })
  );

  it.live("loads the details of a meal", () =>
    Effect.gen(function* () {
      const route = yield* Machine.start(MacroDetailsRouteMachine, {
        dateKey: _dateKey,
        meal: Domain.MealId.make("breakfast"),
      });
      const ready = yield* Machine.waitFor(route, ({ state }) =>
        MacroDetailsRouteStates.matches(state, "Ready")
      );

      expect(
        Option.map(
          MacroDetailsRouteStates.get(ready.state, "Ready"),
          ({ data }) => ({ dateKey: data.dateKey, scope: data.scope })
        )
      ).toEqual(
        Option.some({
          dateKey: _dateKey,
          scope: { _tag: "Meal", meal: "breakfast" },
        })
      );

      yield* route.send(MacroDetailsRouteEvents.Reload());
      yield* Machine.waitFor(route, ({ state }) =>
        MacroDetailsRouteStates.matches(state, "Ready")
      );
    }).pipe(
      Effect.provide(_servicesLayer({ day: _openedDay, replaced: [] })),
      Effect.scoped
    )
  );

  it.live("rejects a meal that is not part of the day plan", () =>
    Effect.gen(function* () {
      const route = yield* Machine.start(MacroDetailsRouteMachine, {
        dateKey: _dateKey,
        meal: Domain.MealId.make("dinner"),
      });
      const failed = yield* Machine.waitFor(route, ({ state }) =>
        MacroDetailsRouteStates.matches(state, "Failed")
      );

      expect(
        Option.map(
          MacroDetailsRouteStates.get(failed.state, "Failed"),
          ({ message }) => message
        )
      ).toEqual(Option.some("Could not find this meal."));
    }).pipe(
      Effect.provide(_servicesLayer({ day: _openedDay, replaced: [] })),
      Effect.scoped
    )
  );

  it.live("asks to create an unrecorded day first", () =>
    Effect.gen(function* () {
      const route = yield* Machine.start(MacroDetailsRouteMachine, {
        dateKey: _dateKey,
        meal: undefined,
      });
      const failed = yield* Machine.waitFor(route, ({ state }) =>
        MacroDetailsRouteStates.matches(state, "Failed")
      );

      expect(
        Option.map(
          MacroDetailsRouteStates.get(failed.state, "Failed"),
          ({ message }) => message
        )
      ).toEqual(Option.some("Create this day before viewing details."));
    }).pipe(
      Effect.provide(
        _servicesLayer({
          day: Effect.map(
            _fixtures,
            ({ plan }) =>
              new DailyLogs.UnrecordedDay({
                dateKey: _dateKey,
                plans: [plan],
                selectedPlan: plan,
              })
          ),
          replaced: [],
        })
      ),
      Effect.scoped
    )
  );

  it.live("redirects to plan creation when there are no meal plans", () => {
    const replaced: Href[] = [];

    return Effect.gen(function* () {
      const route = yield* Machine.start(MacroDetailsRouteMachine, {
        dateKey: _dateKey,
        meal: undefined,
      });

      yield* Machine.waitFor(
        route,
        ({ state }) =>
          replaced.length === 1 &&
          MacroDetailsRouteStates.matches(state, "Redirected")
      );

      expect(replaced).toEqual([
        { pathname: "/plans/new", params: { dateKey: _dateKey } },
      ]);
    }).pipe(
      Effect.provide(
        _servicesLayer({
          day: Effect.fail(new DailyLogs.NoMealPlans({ dateKey: _dateKey })),
          replaced,
        })
      ),
      Effect.scoped
    );
  });

  it.live("shows a retryable failure when details cannot load", () =>
    Effect.gen(function* () {
      const route = yield* Machine.start(MacroDetailsRouteMachine, {
        dateKey: _dateKey,
        meal: undefined,
      });
      const failed = yield* Machine.waitFor(route, ({ state }) =>
        MacroDetailsRouteStates.matches(state, "Failed")
      );

      expect(
        Option.map(
          MacroDetailsRouteStates.get(failed.state, "Failed"),
          ({ message }) => message
        )
      ).toEqual(Option.some("Could not load nutrition details."));

      yield* route.send(MacroDetailsRouteEvents.Reload());
      yield* Machine.waitFor(route, ({ state }) =>
        MacroDetailsRouteStates.matches(state, "Failed")
      );
    }).pipe(
      Effect.provide(
        _servicesLayer({
          day: Effect.fail(
            new Store.NutritionStoreError({ cause: "database unavailable" })
          ),
          replaced: [],
        })
      ),
      Effect.scoped
    )
  );
});

describe("MacroDetailsSelectionMachine", () => {
  it.effect("toggles the selected metric and estimates", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(MacroDetailsSelectionMachine, {
        events: [
          MacroDetailsSelectionEvents.SelectMetric({ metricName: "fatGrams" }),
          MacroDetailsSelectionEvents.SelectMetric({
            metricName: "foodCostEur",
          }),
          MacroDetailsSelectionEvents.SelectMetric({
            metricName: "foodCostEur",
          }),
          MacroDetailsSelectionEvents.ToggleEstimates(),
          MacroDetailsSelectionEvents.SelectMetric({
            metricName: "foodWeightGrams",
          }),
          MacroDetailsSelectionEvents.ClearSelection(),
        ],
      });

      yield* MachineTest.verify(MacroDetailsSelectionMachine, trace);
      expect(trace.initial.startingState.value).toMatchObject({
        includeEstimates: true,
        selectedMetricName: null,
      });
      expect(trace.steps.map(({ after }) => after.value)).toMatchObject([
        { includeEstimates: true, selectedMetricName: "fatGrams" },
        { includeEstimates: true, selectedMetricName: "foodCostEur" },
        { includeEstimates: true, selectedMetricName: null },
        { includeEstimates: false, selectedMetricName: null },
        { includeEstimates: false, selectedMetricName: "foodWeightGrams" },
        { includeEstimates: false, selectedMetricName: null },
      ]);

      const coverage = MachineTest.coverage(
        MacroDetailsSelectionMachine,
        trace
      );
      expect(coverage.transitions.definitions.missing).toBe(0);
    })
  );
});
