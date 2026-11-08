import {
  InsightDateRange,
  InsightRangeDayCount,
} from "@mai/machines/insight-range";
import * as Domain from "@mai/nutrition/domain";
import * as Reporting from "@mai/nutrition/reporting";
import * as NutritionReports from "@mai/nutrition/services/nutrition-reports";
import { Machine } from "@typeonce/effect-machine";
import { DateTime, Effect, Match, Schema } from "effect";

import { dateKeyFromDate, shiftDateKey } from "../lib/date-keys.ts";
import { BodyWeightChartKind } from "./body-weight-panel-machine.ts";

export const InsightTab = Schema.Literals(["nutrition", "weight"]);

export type InsightTab = typeof InsightTab.Type;

const NutritionChartKind = Schema.Literals(["daily", "trend"]);

export const InsightsViewStates = Machine.state({
  fields: {
    activeTab: InsightTab,
    chartKind: NutritionChartKind,
    dateRange: Schema.NullOr(InsightDateRange),
    includeEstimates: Schema.Boolean,
    rangeDayCount: InsightRangeDayCount,
    weightChartKind: BodyWeightChartKind,
  },
});

export const InsightsViewEvents = Machine.events({
  SelectChartKind: { chartKind: NutritionChartKind },
  SelectRange: {
    dateRange: Schema.NullOr(InsightDateRange),
    rangeDayCount: InsightRangeDayCount,
  },
  SelectTab: { tab: InsightTab },
  SelectWeightChartKind: { chartKind: BodyWeightChartKind },
  ToggleEstimates: {},
});

export const InsightsViewMachine = Machine.make({
  id: "InsightsView",
  root: InsightsViewStates,
  events: InsightsViewEvents,
  input: Schema.Struct({ initialTab: InsightTab }),
}).handle({
  root: ({ input }) => ({
    activeTab: input.initialTab,
    chartKind: "daily",
    dateRange: null,
    includeEstimates: true,
    rangeDayCount: 30,
    weightChartKind: "trend",
  }),
  on: {
    SelectChartKind: {
      update: "root",
      data: ({ root, event }) => ({ ...root, chartKind: event.chartKind }),
    },
    SelectRange: {
      update: "root",
      data: ({ root, event }) => ({
        ...root,
        dateRange: event.dateRange,
        rangeDayCount: event.rangeDayCount,
      }),
    },
    SelectTab: {
      update: "root",
      data: ({ root, event }) => ({ ...root, activeTab: event.tab }),
    },
    SelectWeightChartKind: {
      update: "root",
      data: ({ root, event }) => ({
        ...root,
        weightChartKind: event.chartKind,
      }),
    },
    ToggleEstimates: {
      update: "root",
      data: ({ root }) => ({
        ...root,
        includeEstimates: !root.includeEstimates,
      }),
    },
  },
});

const NutrientName = Schema.Literals(Reporting.NutrientNames);

const NutrientTotals = Schema.Struct({
  carbsGrams: Schema.Number,
  energyKcal: Schema.Number,
  fatGrams: Schema.Number,
  fiberGrams: Schema.Number,
  proteinGrams: Schema.Number,
  saltGrams: Schema.Number,
  saturatedFatGrams: Schema.Number,
  sugarGrams: Schema.Number,
});

const NutrientTargetStatus = Schema.Struct({
  amount: Schema.Number,
  deltaFromTarget: Schema.Number,
  lowerBound: Schema.UndefinedOr(Schema.Number),
  nutrientName: NutrientName,
  percentOfTarget: Schema.NullOr(Schema.Number),
  semantics: Domain.NutrientTargetSemantics,
  status: Schema.Literals(["above", "below", "inside"]),
  upperBound: Schema.UndefinedOr(Schema.Number),
  value: Schema.Number,
});

const NutritionReportEntry = Schema.Union([
  Schema.Struct({
    cost: Schema.NullOr(
      Schema.Struct({ costMinor: Schema.Number, currency: Domain.CurrencyCode })
    ),
    food: Domain.Food,
    mealEntry: Domain.CatalogMealEntry,
    nutrients: Domain.EntryNutrients,
  }),
  Schema.Struct({
    cost: Schema.Null,
    food: Schema.Null,
    mealEntry: Domain.OneOffMealEntry,
    nutrients: Schema.Struct({
      energyKcal: Schema.optional(Schema.Number),
      proteinGrams: Schema.optional(Schema.Number),
      carbsGrams: Schema.optional(Schema.Number),
      fatGrams: Schema.optional(Schema.Number),
      fiberGrams: Schema.optional(Schema.Number),
      sugarGrams: Schema.optional(Schema.Number),
      saturatedFatGrams: Schema.optional(Schema.Number),
      saltGrams: Schema.optional(Schema.Number),
    }),
  }),
]);

const NutritionReportDay = Schema.Struct({
  costTotals: Schema.Struct({
    costMinorByCurrency: Schema.Struct({
      EUR: Schema.Number,
      JPY: Schema.Number,
      NZD: Schema.Number,
      USD: Schema.Number,
    }),
    entriesCount: Schema.Number,
    resolvedEntriesCount: Schema.Number,
  }),
  coverage: NutrientTotals,
  nutrition: Schema.Struct({
    recorded: NutrientTotals,
    estimated: NutrientTotals,
    missing: NutrientTotals,
    estimatedCoverage: NutrientTotals,
    coverage: NutrientTotals,
    totals: NutrientTotals,
    entriesCount: Schema.Number,
  }),
  dailyLog: Domain.DailyLog,
  dateKey: Domain.DateKey,
  entries: Schema.Array(NutritionReportEntry),
  isInsideExpectedPlanRange: Schema.Boolean,
  mealEntries: Schema.Array(Domain.MealEntry),
  plan: Domain.Plan,
  targetStatuses: Schema.Array(NutrientTargetStatus),
  totals: NutrientTotals,
});

const NutritionReportRange = Schema.Struct({
  activePlan: Domain.Plan,
  days: Schema.Array(NutritionReportDay),
  endDateKey: Domain.DateKey,
  startDateKey: Domain.DateKey,
});

const NutritionInsightsInput = Schema.Struct({
  dateRange: Schema.NullOr(InsightDateRange),
  rangeDayCount: InsightRangeDayCount,
});

const _todayDateKey = Effect.gen(function* () {
  return yield* Schema.decodeEffect(Domain.DateKey)(
    dateKeyFromDate({ date: yield* DateTime.nowAsDate })
  );
});

export const NutritionInsightsStates = Machine.state({
  fields: NutritionInsightsInput.fields,
  states: {
    Failure: { fields: { message: Schema.String } },
    Loaded: { fields: { currentReport: NutritionReportRange } },
    Loading: {},
    NoPlans: { fields: { dateKey: Domain.DateKey, message: Schema.String } },
  },
});

export const NutritionInsightsEvents = Machine.events({ Retry: {} });

export const NutritionInsightsMachine = Machine.make({
  id: "NutritionInsights",
  root: NutritionInsightsStates,
  events: NutritionInsightsEvents,
  input: NutritionInsightsInput,
  effects: {
    loadRange: (input: typeof NutritionInsightsInput.Type) =>
      Effect.gen(function* () {
        const today = yield* _todayDateKey;
        const currentStartDateKey =
          input.dateRange?.startDateKey ??
          (yield* Schema.decodeEffect(Domain.DateKey)(
            shiftDateKey({
              dateKey: today,
              days: -(input.rangeDayCount - 1),
            })
          ));
        const reports = yield* NutritionReports.NutritionReports;
        const currentReport = yield* reports.getRange({
          input: {
            endDateKey: input.dateRange?.endDateKey ?? today,
            startDateKey: input.dateRange?.startDateKey ?? currentStartDateKey,
          },
        });

        return { _tag: "Loaded" as const, currentReport };
      }).pipe(
        Effect.catchTag("NoNutritionReportPlans", () =>
          Effect.map(_todayDateKey, (dateKey) => ({
            _tag: "NoPlans" as const,
            dateKey,
          }))
        ),
        Effect.catchTags({
          InvalidNutritionReportRange: () =>
            Effect.succeed({
              _tag: "Failure" as const,
              message: "The selected nutrition range is invalid.",
            }),
          SchemaError: () =>
            Effect.succeed({
              _tag: "Failure" as const,
              message: "The selected date range could not be validated.",
            }),
        }),
        Effect.catch(() =>
          Effect.succeed({
            _tag: "Failure" as const,
            message: "Something went wrong while loading nutrition insights.",
          })
        )
      ),
  },
  branches: {
    loaded: {
      failure: { target: "Failure" },
      loaded: { target: "Loaded" },
      noPlans: { target: "NoPlans" },
    },
  },
}).handle({
  root: ({ input }) => ({
    dateRange: input.dateRange,
    rangeDayCount: input.rangeDayCount,
  }),
  initial: { target: "Loading" },
  states: {
    Loading: {
      invoke: {
        src: "loadRange",
        input: ({ root }) => root,
        onDone: {
          branches: "loaded",
          resolve: ({ output, select }) =>
            Match.value(output).pipe(
              Match.tagsExhaustive({
                Failure: ({ message }) => select.failure({ data: { message } }),
                Loaded: ({ currentReport }) =>
                  select.loaded({ data: { currentReport } }),
                NoPlans: ({ dateKey }) =>
                  select.noPlans({
                    data: {
                      dateKey,
                      message:
                        "Create a meal plan to unlock nutrition insights.",
                    },
                  }),
              })
            ),
        },
      },
    },
    Failure: { on: { Retry: { target: "Loading" } } },
    Loaded: {},
    NoPlans: {},
  },
});
