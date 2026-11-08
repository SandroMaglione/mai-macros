import {
  InsightDateRange,
  InsightRangeDayCount,
} from "@mai/machines/insight-range";
import * as Domain from "@mai/nutrition/domain";
import * as BodyWeightReports from "@mai/nutrition/services/body-weight-reports";
import * as BodyWeights from "@mai/nutrition/services/body-weights";
import { Machine } from "@typeonce/effect-machine";
import { DateTime, Effect, Match, Option, Schema } from "effect";

import { dateKeyFromDate, shiftDateKey } from "../lib/date-keys.ts";
import { formatNumber } from "../lib/format.ts";

const BodyWeightReportPoint = Schema.Struct({
  dateKey: Domain.DateKey,
  weightKilograms: Schema.Number,
});

const BodyWeightReportOutlier = Schema.Struct({
  entry: Domain.BodyWeightEntry,
  residualKilograms: Schema.Number,
});

const BodyWeightReportInsightPart = Schema.Struct({
  text: Schema.String,
  tone: Schema.Literals(["default", "highlight"]),
});

const BodyWeightReportInsight = Schema.Struct({
  id: Schema.String,
  parts: Schema.Array(BodyWeightReportInsightPart),
  text: Schema.String,
  tone: Schema.Literals(["neutral", "positive", "warning"]),
});

const BodyWeightReportRange = Schema.Struct({
  cleanedEntries: Schema.Array(Domain.BodyWeightEntry),
  endDateKey: Domain.DateKey,
  entries: Schema.Array(Domain.BodyWeightEntry),
  insights: Schema.Array(BodyWeightReportInsight),
  latestEntry: Schema.NullOr(Domain.BodyWeightEntry),
  outliers: Schema.Array(BodyWeightReportOutlier),
  stableTrendPoints: Schema.Array(BodyWeightReportPoint),
  startDateKey: Domain.DateKey,
  trendPoints: Schema.Array(BodyWeightReportPoint),
  weightedWeightKilograms: Schema.NullOr(Schema.Number),
});

export type BodyWeightReportRange = typeof BodyWeightReportRange.Type;

export const BodyWeightChartKind = Schema.Literals(["trend", "change"]);

export type BodyWeightChartKind = typeof BodyWeightChartKind.Type;

export const BodyWeightCalendarDates = {
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
    const date = BodyWeightCalendarDates.dateFromDateKey({ dateKey });
    const startDate = new Date(date.getFullYear(), date.getMonth(), 1);
    const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    return {
      endDateKey: BodyWeightCalendarDates.dateKeyFromDate({
        date: endDate,
        fallbackDateKey: dateKey,
      }),
      startDateKey: BodyWeightCalendarDates.dateKeyFromDate({
        date: startDate,
        fallbackDateKey: dateKey,
      }),
    };
  },
  shiftDateKey({
    dateKey,
    months,
  }: {
    readonly dateKey: Domain.DateKey;
    readonly months: number;
  }) {
    const date = BodyWeightCalendarDates.dateFromDateKey({ dateKey });
    const targetMonthIndex = date.getMonth() + months;
    const targetMonthEndDate = new Date(
      date.getFullYear(),
      targetMonthIndex + 1,
      0
    );
    const targetDate = new Date(
      date.getFullYear(),
      targetMonthIndex,
      Math.min(date.getDate(), targetMonthEndDate.getDate())
    );

    return BodyWeightCalendarDates.dateKeyFromDate({
      date: targetDate,
      fallbackDateKey: dateKey,
    });
  },
};

export function findBodyWeightEntryForDateKey({
  dateKey,
  entries,
}: {
  readonly dateKey: Domain.DateKey;
  readonly entries: readonly Domain.BodyWeightEntry[];
}) {
  return entries.find((entry) => entry.dateKey === dateKey) ?? null;
}

export const BodyWeightRouteChildEvents = Machine.events({
  EditorClosed: {},
  EditorDeleted: {},
  EditorSaved: {},
  ImportClosed: {},
  WeightsImported: {},
});

export const BodyWeightEditorStates = Machine.state({
  fields: {
    dateKey: Domain.DateKey,
    message: Schema.NullOr(Schema.String),
    selectedEntry: Schema.NullOr(Domain.BodyWeightEntry),
    weightInput: Schema.String,
  },
  states: { Deleting: {}, Idle: {}, Saving: {} },
});

export const BodyWeightEditorEvents = Machine.events({
  ChangeWeight: { value: Schema.String },
  Close: {},
  DeleteWeight: {},
  Save: {},
});

export const BodyWeightEditorMachine = Machine.make({
  id: "BodyWeightEditor",
  root: BodyWeightEditorStates,
  events: BodyWeightEditorEvents,
  input: Schema.Struct({
    dateKey: Domain.DateKey,
    selectedEntry: Schema.NullOr(Domain.BodyWeightEntry),
  }),
  parent: Machine.optionalParent(BodyWeightRouteChildEvents),
  effects: {
    deleteBodyWeight: (dateKey: Domain.DateKey) =>
      Effect.gen(function* () {
        const bodyWeights = yield* BodyWeights.BodyWeights;

        yield* bodyWeights.delete({ input: { dateKey } });
      }),
    saveBodyWeight: (input: {
      readonly dateKey: Domain.DateKey;
      readonly weightInput: string;
    }) =>
      Effect.gen(function* () {
        const bodyWeights = yield* BodyWeights.BodyWeights;

        yield* bodyWeights.save({
          input: {
            dateKey: input.dateKey,
            weightKilograms: input.weightInput,
          },
        });

        return { _tag: "Saved" as const };
      }).pipe(
        Effect.catchTag("SchemaError", () =>
          Effect.succeed({ _tag: "ValidationFailure" as const })
        )
      ),
  },
  branches: {
    deleted: { idle: { target: "Idle" } },
    saved: { idle: { target: "Idle", update: "root" } },
  },
}).handle({
  root: ({ input }) => ({
    dateKey: input.dateKey,
    message: null,
    selectedEntry: input.selectedEntry,
    weightInput:
      input.selectedEntry === null
        ? ""
        : formatNumber({
            maximumFractionDigits: 2,
            minimumFractionDigits: 2,
            value: input.selectedEntry.weightKilograms,
          }),
  }),
  initial: { target: "Idle" },
  states: {
    Idle: {
      on: {
        ChangeWeight: {
          update: "root",
          data: ({ root, event }) => ({
            ...root,
            message: null,
            weightInput: event.value,
          }),
        },
        Close: {
          none: true,
          resolve: ({ parent }, enqueue) => {
            if (parent !== undefined) {
              enqueue.sendTo(parent, BodyWeightRouteChildEvents.EditorClosed());
            }
          },
        },
        DeleteWeight: {
          target: "Deleting",
          guard: ({ root }) => root.selectedEntry !== null,
        },
        Save: { target: "Saving" },
      },
    },
    Saving: {
      invoke: {
        src: "saveBodyWeight",
        input: ({ root }) => ({
          dateKey: root.dateKey,
          weightInput: root.weightInput,
        }),
        onDone: {
          branches: "saved",
          resolve: ({ output, root, parent, select }, enqueue) => {
            if (output._tag === "ValidationFailure") {
              return select.idle({
                update: {
                  data: {
                    ...root,
                    message: "Enter a positive weight in kilograms.",
                  },
                },
              });
            }

            if (parent !== undefined) {
              enqueue.sendTo(parent, BodyWeightRouteChildEvents.EditorSaved());
            }

            return select.idle({
              update: { data: { ...root, message: null } },
            });
          },
        },
        onFailure: {
          target: "Idle",
          update: "root",
          data: ({ root }) => ({
            target: undefined,
            update: { ...root, message: "Could not save this weight." },
          }),
        },
      },
    },
    Deleting: {
      invoke: {
        src: "deleteBodyWeight",
        input: ({ root }) => root.dateKey,
        onDone: {
          branches: "deleted",
          resolve: ({ parent, select }, enqueue) => {
            if (parent !== undefined) {
              enqueue.sendTo(
                parent,
                BodyWeightRouteChildEvents.EditorDeleted()
              );
            }

            return select.idle();
          },
        },
        onFailure: {
          target: "Idle",
          update: "root",
          data: ({ root }) => ({
            target: undefined,
            update: { ...root, message: "Could not delete this weight." },
          }),
        },
      },
    },
  },
});

export const BodyWeightEditorChild = Machine.child(
  "bodyWeightEditor",
  BodyWeightEditorMachine
);

export const BodyWeightImporterStates = Machine.state({
  fields: {
    input: Schema.String,
    message: Schema.NullOr(Schema.String),
  },
  states: { Idle: {}, Submitting: {} },
});

export const BodyWeightImporterEvents = Machine.events({
  ChangeImportInput: { value: Schema.String },
  Close: {},
  ImportWeights: {},
});

export const BodyWeightImporterMachine = Machine.make({
  id: "BodyWeightImporter",
  root: BodyWeightImporterStates,
  events: BodyWeightImporterEvents,
  parent: Machine.optionalParent(BodyWeightRouteChildEvents),
  effects: {
    importBodyWeights: (text: string) =>
      Effect.gen(function* () {
        const bodyWeights = yield* BodyWeights.BodyWeights;

        yield* bodyWeights.importBatch({ input: { text } });

        return { _tag: "Imported" as const };
      }).pipe(
        Effect.catchTag("InvalidBodyWeightBatchImport", (error) => {
          const lineLabel =
            error.lineNumber === null ? null : `Line ${error.lineNumber}`;
          const message = Match.value(error.reason).pipe(
            Match.when(
              "empty-input",
              () => "Paste at least one weight to import."
            ),
            Match.when(
              "invalid-date",
              () => `${lineLabel ?? "A line"} has an invalid date.`
            ),
            Match.when(
              "invalid-line",
              () => `${lineLabel ?? "A line"} should look like 26-06-26 77.40.`
            ),
            Match.when(
              "invalid-weight",
              () => `${lineLabel ?? "A line"} has an invalid weight.`
            ),
            Match.exhaustive
          );

          return Effect.succeed({
            _tag: "ValidationFailure" as const,
            message,
          });
        }),
        Effect.catchTag("SchemaError", () =>
          Effect.succeed({
            _tag: "ValidationFailure" as const,
            message: "Paste one date and weight per line.",
          })
        )
      ),
  },
  branches: {
    imported: { idle: { target: "Idle", update: "root" } },
  },
}).handle({
  root: () => ({ input: "", message: null }),
  initial: { target: "Idle" },
  states: {
    Idle: {
      on: {
        ChangeImportInput: {
          update: "root",
          data: ({ event }) => ({ input: event.value, message: null }),
        },
        Close: {
          none: true,
          resolve: ({ parent }, enqueue) => {
            if (parent !== undefined) {
              enqueue.sendTo(parent, BodyWeightRouteChildEvents.ImportClosed());
            }
          },
        },
        ImportWeights: { target: "Submitting" },
      },
    },
    Submitting: {
      invoke: {
        src: "importBodyWeights",
        input: ({ root }) => root.input,
        onDone: {
          branches: "imported",
          resolve: ({ output, root, parent, select }, enqueue) => {
            if (output._tag === "ValidationFailure") {
              return select.idle({
                update: { data: { ...root, message: output.message } },
              });
            }

            if (parent !== undefined) {
              enqueue.sendTo(
                parent,
                BodyWeightRouteChildEvents.WeightsImported()
              );
            }

            return select.idle({
              update: { data: { ...root, message: null } },
            });
          },
        },
        onFailure: {
          target: "Idle",
          update: "root",
          data: ({ root }) => ({
            target: undefined,
            update: { ...root, message: "Could not import these weights." },
          }),
        },
      },
    },
  },
});

export const BodyWeightImporterChild = Machine.child(
  "bodyWeightImporter",
  BodyWeightImporterMachine
);

const BodyWeightRouteInput = Schema.Struct({
  dateKey: Domain.DateKey,
  reportDateRange: Schema.NullOr(InsightDateRange),
  reportDayCount: InsightRangeDayCount,
});

const BodyWeightRouteFields = Schema.Struct({
  ...BodyWeightRouteInput.fields,
  message: Schema.NullOr(Schema.String),
  monthEntries: Schema.Array(Domain.BodyWeightEntry),
  report: Schema.NullOr(BodyWeightReportRange),
});

type BodyWeightRouteFields = typeof BodyWeightRouteFields.Type;

export const BodyWeightRouteStates = Machine.state({
  fields: BodyWeightRouteFields.fields,
  states: {
    Failed: {},
    Loading: {},
    Ready: {
      states: {
        Closed: {},
        Editing: {},
        ImportingForm: {},
        LoadingMonth: {},
      },
    },
  },
});

export const BodyWeightRouteEvents = Machine.events({
  NextMonth: {},
  OpenImport: {},
  PreviousMonth: {},
  Reload: {},
  SelectDate: { dateKey: Domain.DateKey },
});

function _clearMessage({ root }: { readonly root: BodyWeightRouteFields }) {
  return { target: undefined, update: { ...root, message: null } };
}

function _shiftMonth({
  months,
  root,
}: {
  readonly months: number;
  readonly root: BodyWeightRouteFields;
}) {
  return {
    target: undefined,
    update: {
      ...root,
      dateKey: BodyWeightCalendarDates.shiftDateKey({
        dateKey: root.dateKey,
        months,
      }),
      message: null,
      monthEntries: [],
    },
  };
}

export const BodyWeightRouteMachine = Machine.make({
  id: "BodyWeightRoute",
  root: BodyWeightRouteStates,
  events: Machine.eventsFromSchemas(
    BodyWeightRouteEvents,
    BodyWeightRouteChildEvents
  ),
  input: BodyWeightRouteInput,
  children: {
    bodyWeightEditor: BodyWeightEditorChild,
    bodyWeightImporter: BodyWeightImporterChild,
  },
  effects: {
    loadBodyWeight: (input: typeof BodyWeightRouteInput.Type) =>
      Effect.gen(function* () {
        const bodyWeights = yield* BodyWeights.BodyWeights;
        const reports = yield* BodyWeightReports.BodyWeightReports;
        const monthRange = BodyWeightCalendarDates.range({
          dateKey: input.dateKey,
        });
        const today = yield* Schema.decodeEffect(Domain.DateKey)(
          dateKeyFromDate({ date: yield* DateTime.nowAsDate })
        );
        const endDateKey =
          input.reportDateRange?.endDateKey ??
          (input.dateKey > today ? input.dateKey : today);
        const startDateKey =
          input.reportDateRange?.startDateKey ??
          (yield* Schema.decodeEffect(Domain.DateKey)(
            shiftDateKey({
              dateKey: endDateKey,
              days: -(input.reportDayCount - 1),
            })
          ));
        const monthEntries = yield* bodyWeights.listRange({
          input: monthRange,
        });
        const report = yield* reports.getRange({
          input: { endDateKey, startDateKey },
        });

        return { monthEntries, report };
      }),
    loadMonth: (dateKey: Domain.DateKey) =>
      Effect.gen(function* () {
        const bodyWeights = yield* BodyWeights.BodyWeights;

        return yield* bodyWeights.listRange({
          input: BodyWeightCalendarDates.range({ dateKey }),
        });
      }),
  },
}).handle({
  root: ({ input }) => ({
    dateKey: input.dateKey,
    message: null,
    monthEntries: [],
    report: null,
    reportDateRange: input.reportDateRange,
    reportDayCount: input.reportDayCount,
  }),
  initial: { target: "Loading" },
  states: {
    Loading: {
      invoke: {
        src: "loadBodyWeight",
        input: ({ root }) => ({
          dateKey: root.dateKey,
          reportDateRange: root.reportDateRange,
          reportDayCount: root.reportDayCount,
        }),
        onDone: {
          target: "Ready",
          update: "root",
          data: ({ output, root }) => ({
            target: undefined,
            update: {
              ...root,
              monthEntries: output.monthEntries,
              report: output.report,
            },
          }),
        },
        onFailure: {
          target: "Failed",
          update: "root",
          data: ({ root }) => ({
            target: undefined,
            update: { ...root, message: "Could not load weight data." },
          }),
        },
      },
    },
    Failed: {
      on: {
        NextMonth: {
          target: "Loading",
          update: "root",
          data: ({ root }) => _shiftMonth({ months: 1, root }),
        },
        PreviousMonth: {
          target: "Loading",
          update: "root",
          data: ({ root }) => _shiftMonth({ months: -1, root }),
        },
        Reload: { target: "Loading", update: "root", data: _clearMessage },
      },
    },
    Ready: {
      initial: { target: "Ready.Closed" },
      on: {
        NextMonth: {
          target: "Ready.LoadingMonth",
          update: "root",
          data: ({ root }) => _shiftMonth({ months: 1, root }),
        },
        PreviousMonth: {
          target: "Ready.LoadingMonth",
          update: "root",
          data: ({ root }) => _shiftMonth({ months: -1, root }),
        },
        Reload: { target: "Loading", update: "root", data: _clearMessage },
      },
      states: {
        LoadingMonth: {
          invoke: {
            src: "loadMonth",
            input: ({ root }) => root.dateKey,
            onDone: {
              target: "Ready.Closed",
              update: "root",
              data: ({ output, root }) => ({
                target: undefined,
                update: { ...root, message: null, monthEntries: output },
              }),
            },
            onFailure: {
              target: "Ready.Closed",
              update: "root",
              data: ({ root }) => ({
                target: undefined,
                update: {
                  ...root,
                  message: "Could not load this month's weights. Try again.",
                },
              }),
            },
          },
        },
        Closed: {
          on: {
            OpenImport: {
              target: "Ready.ImportingForm",
              update: "root",
              data: _clearMessage,
            },
            SelectDate: {
              target: "Ready.Editing",
              update: "root",
              data: ({ event, root }) => ({
                target: undefined,
                update: { ...root, dateKey: event.dateKey, message: null },
              }),
            },
          },
        },
        Editing: {
          invoke: {
            src: "bodyWeightEditor",
            input: ({ root }) => ({
              dateKey: root.dateKey,
              selectedEntry: findBodyWeightEntryForDateKey({
                dateKey: root.dateKey,
                entries: root.monthEntries,
              }),
            }),
          },
          on: {
            EditorClosed: {
              target: "Ready.Closed",
              update: "root",
              data: _clearMessage,
            },
            EditorDeleted: {
              target: "Loading",
              update: "root",
              data: _clearMessage,
            },
            EditorSaved: {
              target: "Loading",
              update: "root",
              data: _clearMessage,
            },
          },
        },
        ImportingForm: {
          invoke: { src: "bodyWeightImporter" },
          on: {
            ImportClosed: {
              target: "Ready.Closed",
              update: "root",
              data: _clearMessage,
            },
            WeightsImported: {
              target: "Loading",
              update: "root",
              data: _clearMessage,
            },
          },
        },
      },
    },
  },
});
