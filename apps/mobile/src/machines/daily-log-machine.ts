import { MealComparisons } from "@mai/nutrition";
import * as Domain from "@mai/nutrition/domain";
import * as DailyLogs from "@mai/nutrition/services/daily-logs";
import * as Foods from "@mai/nutrition/services/foods";
import * as MealEntries from "@mai/nutrition/services/meal-entries";
import * as NutritionReports from "@mai/nutrition/services/nutrition-reports";
import { Machine } from "@typeonce/effect-machine";
import { Array, Effect, Match, Schema } from "effect";

import { shiftDateKey, todayDateKey } from "../lib/date-keys.ts";
import { Navigation } from "./services/navigation.ts";

const OpenedDay = Schema.TaggedStruct("OpenedDay", {
  dailyLog: Domain.DailyLog,
  plans: Schema.Array(Domain.Plan),
  selectedPlan: Domain.Plan,
});

const UnrecordedDay = Schema.TaggedStruct("UnrecordedDay", {
  dateKey: Domain.DateKey,
  plans: Schema.Array(Domain.Plan),
  selectedPlan: Domain.Plan,
});

export const RecordedDailyLogViewData = Schema.TaggedStruct("RecordedDay", {
  day: OpenedDay,
  foods: Schema.Array(Domain.Food),
  mealEntries: Schema.Array(Domain.MealEntry),
  comparisons: Schema.Array(MealComparisons.Baseline),
});

export type RecordedDailyLogViewData = typeof RecordedDailyLogViewData.Type;

export const UnrecordedDailyLogViewData = Schema.TaggedStruct("UnrecordedDay", {
  day: UnrecordedDay,
});

export type UnrecordedDailyLogViewData = typeof UnrecordedDailyLogViewData.Type;

export const DailyLogViewData = Schema.Union([
  RecordedDailyLogViewData,
  UnrecordedDailyLogViewData,
]);

export type DailyLogViewData = typeof DailyLogViewData.Type;

const DayNotice = Schema.NullOr(Schema.String);

export const DailyLogRouteStates = Machine.state({
  fields: { dateKey: Domain.DateKey },
  states: {
    Loading: {},
    Failed: { fields: { message: Schema.String } },
    Redirected: { fields: { dateKey: Domain.DateKey } },
    Recorded: {
      fields: { data: RecordedDailyLogViewData, message: DayNotice },
      states: {
        Ready: {},
        Deleting: {},
        UpdatingMode: { fields: { mode: Domain.DailyLogMode } },
        UpdatingWater: {
          fields: { waterServings: Schema.NullOr(Domain.WaterServingCount) },
        },
      },
    },
    Unrecorded: {
      fields: { data: UnrecordedDailyLogViewData, message: DayNotice },
      states: {
        Ready: {},
        Creating: {},
      },
    },
  },
});

export const DailyLogRouteEvents = Machine.events({
  CreateDay: {},
  DeleteDay: {},
  Reload: {},
  SelectPlan: { plan: Domain.Plan },
  SetDayMode: { mode: Domain.DailyLogMode },
  SetWaterServings: {
    waterServings: Schema.NullOr(Domain.WaterServingCount),
  },
});

export const DailyLogRouteMachine = Machine.make({
  id: "DailyLogRoute",
  root: DailyLogRouteStates,
  events: DailyLogRouteEvents,
  input: Schema.Struct({ dateKey: Domain.DateKey }),
  effects: {
    loadDailyLog: (dateKey: Domain.DateKey) =>
      Effect.gen(function* () {
        const dailyLogs = yield* DailyLogs.DailyLogs;
        const foodsService = yield* Foods.Foods;
        const mealEntriesService = yield* MealEntries.MealEntries;
        const day = yield* dateKey === todayDateKey()
          ? dailyLogs.openOrCreate({ input: { dateKey } })
          : dailyLogs.open({ input: { dateKey } });

        if (day._tag === "UnrecordedDay") {
          return {
            _tag: "Unrecorded" as const,
            data: { _tag: "UnrecordedDay" as const, day },
          };
        }

        const mealEntries = yield* mealEntriesService.listForDay({
          input: {
            dateKey: day.dailyLog.dateKey,
          },
        });
        const foods = yield* foodsService.getMany({
          input: {
            foodIds: Domain.mealEntryFoodIds(mealEntries),
          },
        });

        const reports = yield* NutritionReports.NutritionReports;
        const report = yield* reports.getRange({
          input: {
            startDateKey: shiftDateKey({
              dateKey,
              days: -MealComparisons.LOOKBACK_DAYS,
            }),
            endDateKey: shiftDateKey({ dateKey, days: -1 }),
          },
        });
        const comparisons = MealComparisons.buildBaselines({
          report,
          dateKey,
          planId: day.selectedPlan.id,
        });

        return {
          _tag: "Recorded" as const,
          data: {
            _tag: "RecordedDay" as const,
            day,
            foods,
            mealEntries,
            comparisons,
          },
        };
      }).pipe(
        Effect.catchTag("NoMealPlans", ({ dateKey: noPlanDateKey }) =>
          Effect.succeed({
            _tag: "NoMealPlans" as const,
            dateKey: noPlanDateKey,
          })
        )
      ),
    createDailyLog: (input: {
      readonly dateKey: Domain.DateKey;
      readonly planId: Domain.PlanId;
    }) =>
      Effect.gen(function* () {
        const dailyLogs = yield* DailyLogs.DailyLogs;
        const day = yield* dailyLogs.create({ input });

        return {
          _tag: "RecordedDay" as const,
          day,
          foods: [],
          mealEntries: [],
          comparisons: [],
        };
      }),
    deleteDailyLog: (dateKey: Domain.DateKey) =>
      Effect.gen(function* () {
        const dailyLogs = yield* DailyLogs.DailyLogs;
        const removedDay = yield* dailyLogs.remove({ input: { dateKey } });

        return {
          _tag: "UnrecordedDay" as const,
          day: removedDay.day,
        };
      }),
    setDailyLogMode: (input: {
      readonly dateKey: Domain.DateKey;
      readonly mode: Domain.DailyLogMode;
    }) =>
      Effect.gen(function* () {
        const dailyLogs = yield* DailyLogs.DailyLogs;
        const changedDay = yield* dailyLogs.setMode({ input });

        return changedDay.dailyLog;
      }),
    setWaterServings: (input: {
      readonly dateKey: Domain.DateKey;
      readonly waterServings: Domain.WaterServingCount | null;
    }) =>
      Effect.gen(function* () {
        const dailyLogs = yield* DailyLogs.DailyLogs;
        const changedDay = yield* dailyLogs.setWaterServings({ input });

        return changedDay.dailyLog;
      }),
    redirectToNewPlan: (dateKey: Domain.DateKey) =>
      Effect.gen(function* () {
        const navigation = yield* Navigation;

        yield* navigation.replace({
          pathname: "/plans/new",
          params: { dateKey },
        });
      }),
  },
  branches: {
    loaded: {
      noMealPlans: { target: "Redirected", title: "No meal plans" },
      recorded: { target: "Recorded", title: "Recorded day" },
      unrecorded: { target: "Unrecorded", title: "Unrecorded day" },
    },
  },
}).handle({
  root: ({ input }) => ({ dateKey: input.dateKey }),
  initial: { target: "Loading" },
  states: {
    Loading: {
      invoke: {
        src: "loadDailyLog",
        input: ({ root }) => root.dateKey,
        onDone: {
          branches: "loaded",
          resolve: ({ output, select }) =>
            Match.value(output).pipe(
              Match.tagsExhaustive({
                NoMealPlans: ({ dateKey }) =>
                  select.noMealPlans({ data: { dateKey } }),
                Recorded: ({ data }) =>
                  select.recorded({ data: { data, message: null } }),
                Unrecorded: ({ data }) =>
                  select.unrecorded({ data: { data, message: null } }),
              })
            ),
        },
        onFailure: {
          target: "Failed",
          data: ({ error }) => ({ message: error.message }),
        },
      },
    },
    Failed: {
      on: { Reload: { target: "Loading" } },
    },
    Redirected: {
      invoke: {
        src: "redirectToNewPlan",
        input: ({ state }) => state.dateKey,
        onDone: { none: true },
      },
    },
    Recorded: {
      initial: { target: "Recorded.Ready" },
      states: {
        Ready: {
          on: {
            DeleteDay: {
              guard: ({ ancestors }) =>
                !Array.isReadonlyArrayNonEmpty(
                  ancestors.Recorded.data.mealEntries
                ) &&
                ancestors.Recorded.data.day.dailyLog.waterServings === null,
              target: "Recorded.Deleting",
              update: "Recorded",
              data: ({ ancestors }) => ({
                target: undefined,
                update: { ...ancestors.Recorded, message: null },
              }),
            },
            Reload: { target: "Loading" },
            SetDayMode: {
              target: "Recorded.UpdatingMode",
              update: "Recorded",
              data: ({ ancestors, event }) => ({
                target: { mode: event.mode },
                update: { ...ancestors.Recorded, message: null },
              }),
            },
            SetWaterServings: {
              target: "Recorded.UpdatingWater",
              update: "Recorded",
              data: ({ ancestors, event }) => ({
                target: { waterServings: event.waterServings },
                update: { ...ancestors.Recorded, message: null },
              }),
            },
          },
        },
        Deleting: {
          invoke: {
            src: "deleteDailyLog",
            input: ({ ancestors }) =>
              ancestors.Recorded.data.day.dailyLog.dateKey,
            onDone: {
              target: "Unrecorded",
              data: ({ output }) => ({ data: output, message: null }),
            },
            onFailure: {
              target: "Recorded.Ready",
              update: "Recorded",
              data: ({ ancestors }) => ({
                target: undefined,
                update: {
                  ...ancestors.Recorded,
                  message: "Could not delete this day. Please try again.",
                },
              }),
            },
          },
        },
        UpdatingMode: {
          invoke: {
            src: "setDailyLogMode",
            input: ({ ancestors, state }) => ({
              dateKey: ancestors.Recorded.data.day.dailyLog.dateKey,
              mode: state.mode,
            }),
            onDone: {
              target: "Recorded.Ready",
              update: "Recorded",
              data: ({ ancestors, output }) => ({
                target: undefined,
                update: {
                  data: {
                    ...ancestors.Recorded.data,
                    day: { ...ancestors.Recorded.data.day, dailyLog: output },
                  },
                  message: null,
                },
              }),
            },
            onFailure: {
              target: "Recorded.Ready",
              update: "Recorded",
              data: ({ ancestors }) => ({
                target: undefined,
                update: {
                  ...ancestors.Recorded,
                  message: "Could not change this day mode. Please try again.",
                },
              }),
            },
          },
        },
        UpdatingWater: {
          invoke: {
            src: "setWaterServings",
            input: ({ ancestors, state }) => ({
              dateKey: ancestors.Recorded.data.day.dailyLog.dateKey,
              waterServings: state.waterServings,
            }),
            onDone: {
              target: "Recorded.Ready",
              update: "Recorded",
              data: ({ ancestors, output }) => ({
                target: undefined,
                update: {
                  data: {
                    ...ancestors.Recorded.data,
                    day: { ...ancestors.Recorded.data.day, dailyLog: output },
                  },
                  message: null,
                },
              }),
            },
            onFailure: {
              target: "Recorded.Ready",
              update: "Recorded",
              data: ({ ancestors }) => ({
                target: undefined,
                update: {
                  ...ancestors.Recorded,
                  message: "Could not update daily water. Please try again.",
                },
              }),
            },
          },
        },
      },
    },
    Unrecorded: {
      initial: { target: "Unrecorded.Ready" },
      states: {
        Ready: {
          on: {
            CreateDay: { target: "Unrecorded.Creating" },
            Reload: { target: "Loading" },
            SelectPlan: {
              update: "Unrecorded",
              data: ({ ancestors, event }) => ({
                data: {
                  _tag: "UnrecordedDay" as const,
                  day: {
                    _tag: "UnrecordedDay" as const,
                    dateKey: ancestors.Unrecorded.data.day.dateKey,
                    plans: ancestors.Unrecorded.data.day.plans,
                    selectedPlan: event.plan,
                  },
                },
                message: null,
              }),
            },
          },
        },
        Creating: {
          invoke: {
            src: "createDailyLog",
            input: ({ ancestors }) => ({
              dateKey: ancestors.Unrecorded.data.day.dateKey,
              planId: ancestors.Unrecorded.data.day.selectedPlan.id,
            }),
            onDone: {
              target: "Recorded",
              data: ({ output }) => ({ data: output, message: null }),
            },
            onFailure: {
              target: "Unrecorded.Ready",
              update: "Unrecorded",
              data: ({ ancestors }) => ({
                target: undefined,
                update: {
                  ...ancestors.Unrecorded,
                  message: "Could not create this day. Please try again.",
                },
              }),
            },
          },
        },
      },
    },
  },
});

export const WaterTrackerDisclosureStates = Machine.state({
  states: { Collapsed: {}, Expanded: {} },
});

export const WaterTrackerDisclosureEvents = Machine.events({ Toggle: {} });

export const WaterTrackerDisclosureMachine = Machine.make({
  id: "WaterTrackerDisclosure",
  root: WaterTrackerDisclosureStates,
  events: WaterTrackerDisclosureEvents,
}).handle({
  initial: { target: "Collapsed" },
  states: {
    Collapsed: { on: { Toggle: { target: "Expanded" } } },
    Expanded: { on: { Toggle: { target: "Collapsed" } } },
  },
});
