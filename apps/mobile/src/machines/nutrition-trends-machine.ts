import * as Domain from "@mai/nutrition/domain";
import * as NutritionReports from "@mai/nutrition/services/nutrition-reports";
import { Machine } from "@typeonce/effect-machine";
import { Array, Effect, Option, Schema } from "effect";

import { dateKeyFromDate } from "../lib/date-keys.ts";
import { isInsideNutritionTargetMargin } from "../lib/nutrition-target-trend.ts";

export const NutritionTrendMetric = Schema.Literals([
  "energyKcal",
  "proteinGrams",
  "carbsGrams",
  "fatGrams",
  "fiberGrams",
  "sugarGrams",
  "saturatedFatGrams",
  "saltGrams",
  "costEur",
  "waterLiters",
]);

export type NutritionTrendMetric = typeof NutritionTrendMetric.Type;

export const NutritionTrendMetricStates = Machine.state({
  fields: { nutrientName: NutritionTrendMetric },
});

export const NutritionTrendMetricEvents = Machine.events({
  SelectMetric: { nutrientName: NutritionTrendMetric },
});

export const NutritionTrendMetricMachine = Machine.make({
  id: "NutritionTrendMetric",
  root: NutritionTrendMetricStates,
  events: NutritionTrendMetricEvents,
}).handle({
  root: { nutrientName: "energyKcal" },
  on: {
    SelectMetric: {
      update: "root",
      data: ({ event }) => ({ nutrientName: event.nutrientName }),
    },
  },
});

export const NutritionCalendarDay = Schema.Struct({
  dateKey: Domain.DateKey,
  hasEntries: Schema.Boolean,
  isInsideTargetMargin: Schema.Boolean,
  mode: Domain.DailyLogMode,
});

export type NutritionCalendarDay = typeof NutritionCalendarDay.Type;

export const NutritionCalendarMonth = {
  dateFromDateKey({ dateKey }: { readonly dateKey: Domain.DateKey }) {
    const [yearString, monthString, dayString] = dateKey.split("-");

    return new Date(
      Number(yearString),
      Number(monthString) - 1,
      Number(dayString)
    );
  },
  dateKeyFromDate({
    date,
    fallbackDateKey,
  }: {
    readonly date: Date;
    readonly fallbackDateKey: Domain.DateKey;
  }) {
    return Schema.decodeOption(Domain.DateKey)(dateKeyFromDate({ date })).pipe(
      Option.getOrElse(() => fallbackDateKey)
    );
  },
  range({ dateKey }: { readonly dateKey: Domain.DateKey }) {
    const date = NutritionCalendarMonth.dateFromDateKey({ dateKey });

    return {
      endDateKey: NutritionCalendarMonth.dateKeyFromDate({
        date: new Date(date.getFullYear(), date.getMonth() + 1, 0),
        fallbackDateKey: dateKey,
      }),
      startDateKey: NutritionCalendarMonth.dateKeyFromDate({
        date: new Date(date.getFullYear(), date.getMonth(), 1),
        fallbackDateKey: dateKey,
      }),
    };
  },
  shift({
    dateKey,
    months,
  }: {
    readonly dateKey: Domain.DateKey;
    readonly months: number;
  }) {
    const date = NutritionCalendarMonth.dateFromDateKey({ dateKey });
    const targetMonth = date.getMonth() + months;
    const targetMonthEnd = new Date(date.getFullYear(), targetMonth + 1, 0);

    return NutritionCalendarMonth.dateKeyFromDate({
      date: new Date(
        date.getFullYear(),
        targetMonth,
        Math.min(date.getDate(), targetMonthEnd.getDate())
      ),
      fallbackDateKey: dateKey,
    });
  },
  daysFromReport({
    report,
  }: {
    readonly report: NutritionReports.NutritionReportRange;
  }): readonly NutritionCalendarDay[] {
    return report.days.map((day) => ({
      dateKey: day.dateKey,
      hasEntries: Array.isReadonlyArrayNonEmpty(day.entries),
      isInsideTargetMargin:
        day.isInsideExpectedPlanRange &&
        Array.isReadonlyArrayNonEmpty(day.targetStatuses) &&
        day.targetStatuses.every((status) =>
          isInsideNutritionTargetMargin({
            actual: status.value,
            semantics: status.semantics,
            target: status.amount,
          })
        ),
      mode: day.dailyLog.mode,
    }));
  },
};

const NutritionCalendarLoadRange = {
  loadEndDateKey: Schema.NullOr(Domain.DateKey),
  loadStartDateKey: Schema.NullOr(Domain.DateKey),
};

export const NutritionCalendarInput = Schema.Struct({
  dateKey: Domain.DateKey,
  days: Schema.Array(NutritionCalendarDay),
  ...NutritionCalendarLoadRange,
  shouldLoad: Schema.Boolean,
});

export type NutritionCalendarInput = typeof NutritionCalendarInput.Type;

export const NutritionCalendarStates = Machine.state({
  fields: {
    dateKey: Domain.DateKey,
    days: Schema.Array(NutritionCalendarDay),
  },
  states: {
    Initial: {
      fields: { ...NutritionCalendarLoadRange, shouldLoad: Schema.Boolean },
    },
    Loading: { fields: NutritionCalendarLoadRange },
    Ready: {},
    Failed: {
      fields: { ...NutritionCalendarLoadRange, message: Schema.String },
    },
  },
});

export const NutritionCalendarEvents = Machine.events({
  NextMonth: {},
  PreviousMonth: {},
  Retry: {},
});

const _monthNavigation = ({
  root,
  months,
}: {
  readonly root: {
    readonly dateKey: Domain.DateKey;
    readonly days: readonly NutritionCalendarDay[];
  };
  readonly months: number;
}) => ({
  target: { loadEndDateKey: null, loadStartDateKey: null },
  update: {
    dateKey: NutritionCalendarMonth.shift({ dateKey: root.dateKey, months }),
    days: [],
  },
});

export const NutritionCalendarMachine = Machine.make({
  id: "NutritionCalendar",
  root: NutritionCalendarStates,
  events: NutritionCalendarEvents,
  input: NutritionCalendarInput,
  effects: {
    loadMonth: ({
      dateKey,
      days,
      loadEndDateKey,
      loadStartDateKey,
    }: {
      readonly dateKey: Domain.DateKey;
      readonly days: readonly NutritionCalendarDay[];
      readonly loadEndDateKey: Domain.DateKey | null;
      readonly loadStartDateKey: Domain.DateKey | null;
    }) =>
      Effect.gen(function* () {
        const reports = yield* NutritionReports.NutritionReports;
        const report = yield* reports.getRange({
          input:
            loadStartDateKey === null || loadEndDateKey === null
              ? NutritionCalendarMonth.range({ dateKey })
              : { endDateKey: loadEndDateKey, startDateKey: loadStartDateKey },
        });

        return [...days, ...NutritionCalendarMonth.daysFromReport({ report })];
      }),
  },
  branches: {
    initialLoad: {
      load: { target: "Loading", title: "Month data missing" },
      ready: { target: "Ready", title: "Month data provided" },
    },
  },
}).handle({
  root: ({ input }) => ({ dateKey: input.dateKey, days: input.days }),
  initial: {
    target: "Initial",
    data: ({ input }) => ({
      loadEndDateKey: input.loadEndDateKey,
      loadStartDateKey: input.loadStartDateKey,
      shouldLoad: input.shouldLoad,
    }),
  },
  states: {
    Initial: {
      always: {
        branches: "initialLoad",
        resolve: ({ state, select }) =>
          state.shouldLoad
            ? select.load({
                data: {
                  loadEndDateKey: state.loadEndDateKey,
                  loadStartDateKey: state.loadStartDateKey,
                },
              })
            : select.ready(),
      },
    },
    Loading: {
      invoke: {
        src: "loadMonth",
        input: ({ root, state }) => ({
          dateKey: root.dateKey,
          days: root.days,
          loadEndDateKey: state.loadEndDateKey,
          loadStartDateKey: state.loadStartDateKey,
        }),
        onDone: {
          target: "Ready",
          update: "root",
          data: ({ root, output }) => ({
            target: undefined,
            update: { ...root, days: output },
          }),
        },
        onFailure: {
          target: "Failed",
          data: ({ state }) => ({
            loadEndDateKey: state.loadEndDateKey,
            loadStartDateKey: state.loadStartDateKey,
            message: "Could not load this nutrition month.",
          }),
        },
      },
    },
    Ready: {
      on: {
        NextMonth: {
          target: "Loading",
          update: "root",
          data: ({ root }) => _monthNavigation({ root, months: 1 }),
        },
        PreviousMonth: {
          target: "Loading",
          update: "root",
          data: ({ root }) => _monthNavigation({ root, months: -1 }),
        },
      },
    },
    Failed: {
      on: {
        NextMonth: {
          target: "Loading",
          update: "root",
          data: ({ root }) => _monthNavigation({ root, months: 1 }),
        },
        PreviousMonth: {
          target: "Loading",
          update: "root",
          data: ({ root }) => _monthNavigation({ root, months: -1 }),
        },
        Retry: {
          target: "Loading",
          data: ({ state }) => ({
            loadEndDateKey: state.loadEndDateKey,
            loadStartDateKey: state.loadStartDateKey,
          }),
        },
      },
    },
  },
});
