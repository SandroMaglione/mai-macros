import { describe, expect, it } from "@effect/vitest";
import {
  Domain,
  Foods,
  MealComparisons,
  MealEntries,
  Store,
} from "@mai/nutrition";
import * as DailyLogs from "@mai/nutrition/services/daily-logs";
import * as NutritionReports from "@mai/nutrition/services/nutrition-reports";
import { Machine } from "@typeonce/effect-machine";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect, Layer, Option, Schema } from "effect";
import type { Href } from "expo-router";

import {
  DailyLogRouteEvents,
  DailyLogRouteMachine,
  DailyLogRouteStates,
  WaterTrackerDisclosureEvents,
  WaterTrackerDisclosureMachine,
  WaterTrackerDisclosureStates,
} from "@/machines/daily-log-machine";
import { Navigation } from "@/machines/services/navigation";

const _dateKey = Domain.DateKey.make("2026-01-15");

const _plan = ({ id, name }: { readonly id: string; readonly name: string }) =>
  Schema.decodeEffect(Domain.Plan)({
    id,
    name,
    meals: [
      { id: "breakfast", name: "Breakfast", position: 0, createdAt: 100 },
    ],
    proteinTargetGrams: 120,
    carbsTargetGrams: 200,
    fatTargetGrams: 70,
    createdAt: 100,
  }).pipe(Effect.orDie);

const _fixtures = Effect.gen(function* () {
  const plan = yield* _plan({
    id: "22222222-2222-4222-8222-222222222222",
    name: "Default",
  });
  const otherPlan = yield* _plan({
    id: "33333333-3333-4333-8333-333333333333",
    name: "Training",
  });
  const dailyLog = yield* Schema.decodeEffect(Domain.DailyLog)({
    dateKey: _dateKey,
    planId: plan.id,
    createdAt: 100,
    updatedAt: 100,
  }).pipe(Effect.orDie);

  return {
    dailyLog,
    openedDay: new DailyLogs.OpenedDay({
      dailyLog,
      plans: [plan, otherPlan],
      selectedPlan: plan,
    }),
    otherPlan,
    plan,
    unrecordedDay: new DailyLogs.UnrecordedDay({
      dateKey: _dateKey,
      plans: [plan, otherPlan],
      selectedPlan: plan,
    }),
  };
});

type _Calls = {
  readonly create: DailyLogs.ChangeDayPlanInput[];
  readonly open: DailyLogs.OpenDayInput[];
  readonly remove: DailyLogs.RemoveDayInput[];
  readonly replace: Href[];
  readonly reports: NutritionReports.GetNutritionReportRangeInput[];
  readonly setMode: DailyLogs.SetDayModeInput[];
  readonly setWaterServings: DailyLogs.SetWaterServingsInput[];
};

const _calls = (): _Calls => ({
  create: [],
  open: [],
  remove: [],
  replace: [],
  reports: [],
  setMode: [],
  setWaterServings: [],
});

const _servicesLayer = ({
  calls,
  open,
  failCreate = false,
  failSetMode = false,
}: {
  readonly calls: _Calls;
  readonly open: (
    attempt: number
  ) => Effect.Effect<
    DailyLogs.Day,
    DailyLogs.NoMealPlans | Store.NutritionStoreError
  >;
  readonly failCreate?: boolean;
  readonly failSetMode?: boolean;
}) =>
  Layer.mergeAll(
    Layer.mock(DailyLogs.DailyLogs, {
      open: ({ input }) => {
        calls.open.push(input);

        return open(calls.open.length);
      },
      create: ({ input }) =>
        Effect.gen(function* () {
          calls.create.push(input);

          if (failCreate) {
            return yield* new Store.NutritionStoreError({ cause: "locked" });
          }

          const { dailyLog, openedDay, otherPlan } = yield* _fixtures;

          return new DailyLogs.OpenedDay({
            dailyLog: new Domain.DailyLog({
              ...dailyLog,
              planId: otherPlan.id,
            }),
            plans: openedDay.plans,
            selectedPlan: otherPlan,
          });
        }),
      remove: ({ input }) =>
        Effect.gen(function* () {
          calls.remove.push(input);
          const { dailyLog, unrecordedDay } = yield* _fixtures;

          return new DailyLogs.RemovedDay({ dailyLog, day: unrecordedDay });
        }),
      setMode: ({ input }) =>
        Effect.gen(function* () {
          calls.setMode.push(input);

          if (failSetMode) {
            return yield* new Store.NutritionStoreError({ cause: "locked" });
          }

          const { dailyLog } = yield* _fixtures;

          return new DailyLogs.ChangedDayMode({
            dailyLog: new Domain.DailyLog({ ...dailyLog, mode: input.mode }),
          });
        }),
      setWaterServings: ({ input }) =>
        Effect.gen(function* () {
          calls.setWaterServings.push(input);
          const { dailyLog } = yield* _fixtures;
          const waterServings =
            input.waterServings === null
              ? null
              : Domain.WaterServingCount.make(input.waterServings);

          return new DailyLogs.ChangedWaterServings({
            dailyLog: new Domain.DailyLog({ ...dailyLog, waterServings }),
          });
        }),
    }),
    Layer.mock(Foods.Foods, { getMany: () => Effect.succeed([]) }),
    Layer.mock(MealEntries.MealEntries, {
      listForDay: () => Effect.succeed([]),
    }),
    Layer.mock(NutritionReports.NutritionReports, {
      getRange: ({ input }) =>
        Effect.gen(function* () {
          calls.reports.push(input);
          const { plan } = yield* _fixtures;

          return {
            activePlan: plan,
            days: [],
            endDateKey: Domain.DateKey.make(input.endDateKey),
            startDateKey: Domain.DateKey.make(input.startDateKey),
          };
        }),
    }),
    Layer.mock(Navigation, {
      replace: (href) => Effect.sync(() => calls.replace.push(href)),
    })
  );

describe("DailyLogRouteMachine", () => {
  it.effect("starts by loading the requested day", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(DailyLogRouteMachine, {
        input: { dateKey: _dateKey },
        events: [DailyLogRouteEvents.Reload(), DailyLogRouteEvents.CreateDay()],
      });

      yield* MachineTest.verify(DailyLogRouteMachine, trace);
      expect(DailyLogRouteStates.matches(trace.final, "Loading")).toBe(true);

      const coverage = MachineTest.coverage(DailyLogRouteMachine, trace);
      expect(coverage.transitions.definitions.hit).toBe(0);
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
        "Loading loadDailyLog done",
        "Loading loadDailyLog failure",
        "Recorded.Deleting deleteDailyLog done",
        "Recorded.Deleting deleteDailyLog failure",
        "Recorded.Ready DeleteDay",
        "Recorded.Ready Reload",
        "Recorded.Ready SetDayMode",
        "Recorded.Ready SetWaterServings",
        "Recorded.UpdatingMode setDailyLogMode done",
        "Recorded.UpdatingMode setDailyLogMode failure",
        "Recorded.UpdatingWater setWaterServings done",
        "Recorded.UpdatingWater setWaterServings failure",
        "Redirected redirectToNewPlan done",
        "Unrecorded.Creating createDailyLog done",
        "Unrecorded.Creating createDailyLog failure",
        "Unrecorded.Ready CreateDay",
        "Unrecorded.Ready Reload",
        "Unrecorded.Ready SelectPlan",
      ]);
    })
  );

  it.live(
    "creates an unrecorded day with the selected plan, then deletes it",
    () => {
      const calls = _calls();

      return Effect.gen(function* () {
        const { otherPlan } = yield* _fixtures;
        const route = yield* Machine.start(DailyLogRouteMachine, {
          dateKey: _dateKey,
        });
        yield* Machine.waitFor(route, ({ state }) =>
          DailyLogRouteStates.matches(state, "Unrecorded.Ready")
        );

        yield* route.send(DailyLogRouteEvents.SelectPlan({ plan: otherPlan }));
        const selected = yield* Machine.waitFor(route, ({ state }) =>
          Option.exists(
            DailyLogRouteStates.get(state, "Unrecorded"),
            ({ data }) => data.day.selectedPlan.id === otherPlan.id
          )
        );

        expect(
          DailyLogRouteStates.matches(selected.state, "Unrecorded.Ready")
        ).toBe(true);

        yield* route.send(DailyLogRouteEvents.CreateDay());
        const recorded = yield* Machine.waitFor(route, ({ state }) =>
          DailyLogRouteStates.matches(state, "Recorded.Ready")
        );

        expect(calls.create).toEqual([
          { dateKey: _dateKey, planId: otherPlan.id },
        ]);
        expect(
          Option.map(
            DailyLogRouteStates.get(recorded.state, "Recorded"),
            ({ data, message }) => ({
              comparisons: data.comparisons,
              foods: data.foods,
              mealEntries: data.mealEntries,
              message,
              planId: data.day.selectedPlan.id,
            })
          )
        ).toEqual(
          Option.some({
            comparisons: [],
            foods: [],
            mealEntries: [],
            message: null,
            planId: otherPlan.id,
          })
        );
        expect(
          yield* Machine.can(
            DailyLogRouteMachine,
            recorded.state,
            DailyLogRouteEvents.DeleteDay()
          )
        ).toBe(true);

        yield* route.send(DailyLogRouteEvents.DeleteDay());
        yield* Machine.waitFor(route, ({ state }) =>
          DailyLogRouteStates.matches(state, "Unrecorded.Ready")
        );

        expect(calls.remove).toEqual([{ dateKey: _dateKey }]);
      }).pipe(
        Effect.provide(
          _servicesLayer({
            calls,
            open: () =>
              Effect.map(_fixtures, ({ unrecordedDay }) => unrecordedDay),
          })
        ),
        Effect.scoped
      );
    }
  );

  it.live(
    "loads a recorded day with meal comparisons from the lookback range",
    () => {
      const calls = _calls();

      return Effect.gen(function* () {
        const route = yield* Machine.start(DailyLogRouteMachine, {
          dateKey: _dateKey,
        });
        yield* Machine.waitFor(route, ({ state }) =>
          DailyLogRouteStates.matches(state, "Recorded.Ready")
        );

        expect(calls.open).toEqual([{ dateKey: _dateKey }]);
        expect(calls.reports).toEqual([
          {
            startDateKey: `2026-01-${String(15 - MealComparisons.LOOKBACK_DAYS).padStart(2, "0")}`,
            endDateKey: "2026-01-14",
          },
        ]);
      }).pipe(
        Effect.provide(
          _servicesLayer({
            calls,
            open: () => Effect.map(_fixtures, ({ openedDay }) => openedDay),
          })
        ),
        Effect.scoped
      );
    }
  );

  it.live("updates water and keeps the day once water is recorded", () => {
    const calls = _calls();

    return Effect.gen(function* () {
      const route = yield* Machine.start(DailyLogRouteMachine, {
        dateKey: _dateKey,
      });
      yield* Machine.waitFor(route, ({ state }) =>
        DailyLogRouteStates.matches(state, "Recorded.Ready")
      );

      yield* route.send(
        DailyLogRouteEvents.SetWaterServings({
          waterServings: Domain.WaterServingCount.make(4),
        })
      );
      const updated = yield* Machine.waitFor(
        route,
        ({ state }) =>
          calls.setWaterServings.length === 1 &&
          DailyLogRouteStates.matches(state, "Recorded.Ready")
      );

      expect(calls.setWaterServings).toEqual([
        { dateKey: _dateKey, waterServings: 4 },
      ]);
      expect(
        Option.map(
          DailyLogRouteStates.get(updated.state, "Recorded"),
          ({ data }) => data.day.dailyLog.waterServings
        )
      ).toEqual(Option.some(4));
      expect(
        yield* Machine.can(
          DailyLogRouteMachine,
          updated.state,
          DailyLogRouteEvents.DeleteDay()
        )
      ).toBe(false);
    }).pipe(
      Effect.provide(
        _servicesLayer({
          calls,
          open: () => Effect.map(_fixtures, ({ openedDay }) => openedDay),
        })
      ),
      Effect.scoped
    );
  });

  it.live("keeps the day and reports a failed mode change", () => {
    const calls = _calls();

    return Effect.gen(function* () {
      const route = yield* Machine.start(DailyLogRouteMachine, {
        dateKey: _dateKey,
      });
      yield* Machine.waitFor(route, ({ state }) =>
        DailyLogRouteStates.matches(state, "Recorded.Ready")
      );

      yield* route.send(DailyLogRouteEvents.SetDayMode({ mode: "fasting" }));
      const failed = yield* Machine.waitFor(
        route,
        ({ state }) =>
          calls.setMode.length === 1 &&
          DailyLogRouteStates.matches(state, "Recorded.Ready")
      );

      expect(calls.setMode).toEqual([{ dateKey: _dateKey, mode: "fasting" }]);
      expect(
        Option.map(
          DailyLogRouteStates.get(failed.state, "Recorded"),
          ({ data, message }) => ({ mode: data.day.dailyLog.mode, message })
        )
      ).toEqual(
        Option.some({
          message: "Could not change this day mode. Please try again.",
          mode: "eating",
        })
      );
    }).pipe(
      Effect.provide(
        _servicesLayer({
          calls,
          failSetMode: true,
          open: () => Effect.map(_fixtures, ({ openedDay }) => openedDay),
        })
      ),
      Effect.scoped
    );
  });

  it.live("changes the day mode", () => {
    const calls = _calls();

    return Effect.gen(function* () {
      const route = yield* Machine.start(DailyLogRouteMachine, {
        dateKey: _dateKey,
      });
      yield* Machine.waitFor(route, ({ state }) =>
        DailyLogRouteStates.matches(state, "Recorded.Ready")
      );

      yield* route.send(DailyLogRouteEvents.SetDayMode({ mode: "fasting" }));
      const changed = yield* Machine.waitFor(
        route,
        ({ state }) =>
          calls.setMode.length === 1 &&
          DailyLogRouteStates.matches(state, "Recorded.Ready")
      );

      expect(
        Option.map(
          DailyLogRouteStates.get(changed.state, "Recorded"),
          ({ data }) => data.day.dailyLog.mode
        )
      ).toEqual(Option.some("fasting"));
    }).pipe(
      Effect.provide(
        _servicesLayer({
          calls,
          open: () => Effect.map(_fixtures, ({ openedDay }) => openedDay),
        })
      ),
      Effect.scoped
    );
  });

  it.live("reports a failed day creation", () => {
    const calls = _calls();

    return Effect.gen(function* () {
      const route = yield* Machine.start(DailyLogRouteMachine, {
        dateKey: _dateKey,
      });
      yield* Machine.waitFor(route, ({ state }) =>
        DailyLogRouteStates.matches(state, "Unrecorded.Ready")
      );

      yield* route.send(DailyLogRouteEvents.CreateDay());
      const failed = yield* Machine.waitFor(
        route,
        ({ state }) =>
          calls.create.length === 1 &&
          DailyLogRouteStates.matches(state, "Unrecorded.Ready")
      );

      expect(
        Option.map(
          DailyLogRouteStates.get(failed.state, "Unrecorded"),
          ({ message }) => message
        )
      ).toEqual(Option.some("Could not create this day. Please try again."));
    }).pipe(
      Effect.provide(
        _servicesLayer({
          calls,
          failCreate: true,
          open: () =>
            Effect.map(_fixtures, ({ unrecordedDay }) => unrecordedDay),
        })
      ),
      Effect.scoped
    );
  });

  it.live("redirects to plan creation when there are no meal plans", () => {
    const calls = _calls();

    return Effect.gen(function* () {
      const route = yield* Machine.start(DailyLogRouteMachine, {
        dateKey: _dateKey,
      });
      yield* Machine.waitFor(
        route,
        ({ state }) =>
          calls.replace.length === 1 &&
          DailyLogRouteStates.matches(state, "Redirected")
      );

      expect(calls.replace).toEqual([
        { pathname: "/plans/new", params: { dateKey: _dateKey } },
      ]);
    }).pipe(
      Effect.provide(
        _servicesLayer({
          calls,
          open: () =>
            Effect.fail(new DailyLogs.NoMealPlans({ dateKey: _dateKey })),
        })
      ),
      Effect.scoped
    );
  });

  it.live("shows a load failure and reloads the day", () => {
    const calls = _calls();
    const failure = new Store.NutritionStoreError({ cause: "unavailable" });

    return Effect.gen(function* () {
      const route = yield* Machine.start(DailyLogRouteMachine, {
        dateKey: _dateKey,
      });
      const failed = yield* Machine.waitFor(route, ({ state }) =>
        DailyLogRouteStates.matches(state, "Failed")
      );

      expect(
        Option.map(
          DailyLogRouteStates.get(failed.state, "Failed"),
          ({ message }) => message
        )
      ).toEqual(Option.some(failure.message));

      yield* route.send(DailyLogRouteEvents.Reload());
      yield* Machine.waitFor(route, ({ state }) =>
        DailyLogRouteStates.matches(state, "Recorded.Ready")
      );

      expect(calls.open.length).toBe(2);
    }).pipe(
      Effect.provide(
        _servicesLayer({
          calls,
          open: (attempt) =>
            attempt === 1
              ? Effect.fail(failure)
              : Effect.map(_fixtures, ({ openedDay }) => openedDay),
        })
      ),
      Effect.scoped
    );
  });
});

describe("WaterTrackerDisclosureMachine", () => {
  it.effect("toggles the water controls", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(WaterTrackerDisclosureMachine, {
        events: [
          WaterTrackerDisclosureEvents.Toggle(),
          WaterTrackerDisclosureEvents.Toggle(),
        ],
      });

      yield* MachineTest.verify(WaterTrackerDisclosureMachine, trace);
      expect(
        trace.steps.map(({ after }) =>
          WaterTrackerDisclosureStates.matches(after, "Expanded")
        )
      ).toEqual([true, false]);

      const coverage = MachineTest.coverage(
        WaterTrackerDisclosureMachine,
        trace
      );
      expect(coverage.transitions.definitions.missing).toBe(0);
      expect(coverage.states.activation.missing).toBe(0);
    })
  );
});
