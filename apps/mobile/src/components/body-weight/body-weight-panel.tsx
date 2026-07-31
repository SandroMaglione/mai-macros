import { BodyWeightReports, BodyWeights, Domain } from "@mai/nutrition";
import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-react";
import {
  Circle as SkiaCircle,
  DashPathEffect,
  Rect as SkiaRect,
} from "@shopify/react-native-skia";
import { Machine } from "@typeonce/effect-machine";
import { AtomMachine } from "@typeonce/effect-machine/reactivity";
import { Array, DateTime, Effect, Match, Option, Schema } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import {
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react-native";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Bar,
  CartesianChart,
  Line,
  Scatter,
  useChartPressState,
} from "victory-native";
import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { NumberField, TextArea } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { LoadingView } from "@/components/ui/loading-view";
import { Notice } from "@/components/ui/notice";
import { PagerTabBar } from "@/components/ui/pager-tabs";
import { dateKeyFromDate, shiftDateKey, todayDateKey } from "@/lib/date-keys";
import { formatNumber, niceLinearDomain } from "@/lib/format";
import { MobileAtomRuntime } from "@/lib/runtime-client";
import { color, radius, spacing, tokens } from "@/theme/tokens";

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

type BodyWeightReportRange = typeof BodyWeightReportRange.Type;

const estimateWeightWindowDays = 14;

const BodyWeightReportDayCount = Schema.Literals([7, 30, 90]);

export type BodyWeightReportDayCount = typeof BodyWeightReportDayCount.Type;

const BodyWeightChartKind = Schema.Literals(["trend", "change"]);

const BodyWeightRouteInput = Schema.Struct({
  dateKey: Domain.DateKey,
  reportDayCount: BodyWeightReportDayCount,
});

const BodyWeightEditorInput = Schema.Struct({
  dateKey: Domain.DateKey,
  selectedEntry: Schema.NullOr(Domain.BodyWeightEntry),
});

const BodyWeightEditorData = {
  dateKey: Domain.DateKey,
  message: Schema.NullOr(Schema.String),
  selectedEntry: Schema.NullOr(Domain.BodyWeightEntry),
  weightInput: Schema.String,
} as const;

const BodyWeightImporterData = {
  input: Schema.String,
  message: Schema.NullOr(Schema.String),
} as const;

const BodyWeightReadyData = {
  dateKey: Domain.DateKey,
  monthEntries: Schema.Array(Domain.BodyWeightEntry),
  report: BodyWeightReportRange,
  reportDayCount: BodyWeightReportDayCount,
} as const;

class EditorIdle extends Schema.TaggedClass<EditorIdle>("EditorIdle")(
  "EditorIdle",
  BodyWeightEditorData
) {}
class EditorSaving extends Schema.TaggedClass<EditorSaving>("EditorSaving")(
  "EditorSaving",
  BodyWeightEditorData
) {}
class EditorDeleting extends Schema.TaggedClass<EditorDeleting>(
  "EditorDeleting"
)("EditorDeleting", BodyWeightEditorData) {}
class ChangeEditorWeight extends Schema.TaggedClass<ChangeEditorWeight>(
  "ChangeEditorWeight"
)("ChangeEditorWeight", { value: Schema.String }) {}
class CloseEditor extends Schema.TaggedClass<CloseEditor>("CloseEditor")(
  "CloseEditor",
  {}
) {}
class DeleteEditorWeight extends Schema.TaggedClass<DeleteEditorWeight>(
  "DeleteEditorWeight"
)("DeleteEditorWeight", {}) {}
class SaveEditorWeight extends Schema.TaggedClass<SaveEditorWeight>(
  "SaveEditorWeight"
)("SaveEditorWeight", {}) {}
class EditorWeightSaved extends Schema.TaggedClass<EditorWeightSaved>(
  "EditorWeightSaved"
)("EditorWeightSaved", {}) {}
class EditorValidationFailed extends Schema.TaggedClass<EditorValidationFailed>(
  "EditorValidationFailed"
)("EditorValidationFailed", {}) {}
class EditorSaveFailed extends Schema.TaggedClass<EditorSaveFailed>(
  "EditorSaveFailed"
)("EditorSaveFailed", {}) {}
class EditorWeightDeleted extends Schema.TaggedClass<EditorWeightDeleted>(
  "EditorWeightDeleted"
)("EditorWeightDeleted", {}) {}
class EditorDeleteFailed extends Schema.TaggedClass<EditorDeleteFailed>(
  "EditorDeleteFailed"
)("EditorDeleteFailed", {}) {}
class EditorClosed extends Schema.TaggedClass<EditorClosed>("EditorClosed")(
  "EditorClosed",
  {}
) {}
class EditorSaved extends Schema.TaggedClass<EditorSaved>("EditorSaved")(
  "EditorSaved",
  {}
) {}
class EditorDeleted extends Schema.TaggedClass<EditorDeleted>("EditorDeleted")(
  "EditorDeleted",
  {}
) {}

const BodyWeightEditorStates = Machine.defineStates({
  Deleting: EditorDeleting,
  Idle: EditorIdle,
  Saving: EditorSaving,
});

const bodyWeightEditorMachine = Machine.make({
  states: BodyWeightEditorStates.states,
  events: [
    ChangeEditorWeight,
    CloseEditor,
    DeleteEditorWeight,
    SaveEditorWeight,
    EditorWeightSaved,
    EditorValidationFailed,
    EditorSaveFailed,
    EditorWeightDeleted,
    EditorDeleteFailed,
  ],
  emits: [EditorClosed, EditorSaved, EditorDeleted],
  input: BodyWeightEditorInput,
  initial: ({ dateKey, selectedEntry }) =>
    BodyWeightEditorStates.initial.Idle(
      new EditorIdle({
        dateKey,
        message: null,
        selectedEntry,
        weightInput:
          selectedEntry === null
            ? ""
            : formatNumber({
                maximumFractionDigits: 2,
                minimumFractionDigits: 2,
                value: selectedEntry.weightKilograms,
              }),
      })
    ),
}).handle({
  Idle: {
    on: {
      ChangeEditorWeight: ({ event, state, target }) =>
        target.full.Idle(
          new EditorIdle({ ...state, message: null, weightInput: event.value })
        ),
      CloseEditor: ({ emit, state, target }) =>
        emit(new EditorClosed()).pipe(
          Effect.as(target.full.Idle(new EditorIdle({ ...state })))
        ),
      DeleteEditorWeight: ({ state, target }) =>
        state.selectedEntry === null
          ? undefined
          : target.full.Deleting(
              new EditorDeleting({ ...state, _tag: undefined })
            ),
      SaveEditorWeight: ({ state, target }) =>
        target.full.Saving(new EditorSaving({ ...state, _tag: undefined })),
    },
  },
  Saving: {
    invoke: ({ state }) =>
      Machine.invoke({
        id: "saveBodyWeight",
        src: () =>
          Machine.effect(
            Effect.gen(function* () {
              const bodyWeights = yield* BodyWeights.BodyWeights;
              yield* bodyWeights.save({
                input: {
                  dateKey: state.dateKey,
                  weightKilograms: state.weightInput,
                },
              });
              return new EditorWeightSaved();
            }).pipe(
              Effect.catchTag("SchemaError", () =>
                Effect.succeed(new EditorValidationFailed())
              ),
              Effect.catch(() => Effect.succeed(new EditorSaveFailed()))
            )
          ),
      }),
    on: {
      EditorWeightSaved: ({ emit, state, target }) =>
        emit(new EditorSaved()).pipe(
          Effect.as(
            target.full.Idle(
              new EditorIdle({ ...state, _tag: undefined, message: null })
            )
          )
        ),
      EditorValidationFailed: ({ state, target }) =>
        target.full.Idle(
          new EditorIdle({
            ...state,
            _tag: undefined,
            message: "Enter a positive weight in kilograms.",
          })
        ),
      EditorSaveFailed: ({ state, target }) =>
        target.full.Idle(
          new EditorIdle({
            ...state,
            _tag: undefined,
            message: "Could not save this weight.",
          })
        ),
    },
  },
  Deleting: {
    invoke: ({ state }) =>
      Machine.invoke({
        id: "deleteBodyWeight",
        src: () =>
          Machine.effect(
            Effect.gen(function* () {
              const bodyWeights = yield* BodyWeights.BodyWeights;
              yield* bodyWeights.delete({
                input: { dateKey: state.dateKey },
              });
              return new EditorWeightDeleted();
            }).pipe(
              Effect.catch(() => Effect.succeed(new EditorDeleteFailed()))
            )
          ),
      }),
    on: {
      EditorWeightDeleted: ({ emit, state, target }) =>
        emit(new EditorDeleted()).pipe(
          Effect.as(
            target.full.Idle(
              new EditorIdle({ ...state, _tag: undefined, message: null })
            )
          )
        ),
      EditorDeleteFailed: ({ state, target }) =>
        target.full.Idle(
          new EditorIdle({
            ...state,
            _tag: undefined,
            message: "Could not delete this weight.",
          })
        ),
    },
  },
});

class ImportIdle extends Schema.TaggedClass<ImportIdle>("ImportIdle")(
  "ImportIdle",
  BodyWeightImporterData
) {}
class ImportSubmitting extends Schema.TaggedClass<ImportSubmitting>(
  "ImportSubmitting"
)("ImportSubmitting", BodyWeightImporterData) {}
class ChangeImportInput extends Schema.TaggedClass<ChangeImportInput>(
  "ChangeImportInput"
)("ChangeImportInput", { value: Schema.String }) {}
class CloseImport extends Schema.TaggedClass<CloseImport>("CloseImport")(
  "CloseImport",
  {}
) {}
class SubmitImport extends Schema.TaggedClass<SubmitImport>("SubmitImport")(
  "SubmitImport",
  {}
) {}
class ImportSucceeded extends Schema.TaggedClass<ImportSucceeded>(
  "ImportSucceeded"
)("ImportSucceeded", {}) {}
class ImportValidationFailed extends Schema.TaggedClass<ImportValidationFailed>(
  "ImportValidationFailed"
)("ImportValidationFailed", { message: Schema.String }) {}
class ImportFailed extends Schema.TaggedClass<ImportFailed>("ImportFailed")(
  "ImportFailed",
  {}
) {}
class ImportClosed extends Schema.TaggedClass<ImportClosed>("ImportClosed")(
  "ImportClosed",
  {}
) {}
class WeightsImported extends Schema.TaggedClass<WeightsImported>(
  "WeightsImported"
)("WeightsImported", {}) {}

const BodyWeightImporterStates = Machine.defineStates({
  Idle: ImportIdle,
  Submitting: ImportSubmitting,
});

const bodyWeightImporterMachine = Machine.make({
  states: BodyWeightImporterStates.states,
  events: [
    ChangeImportInput,
    CloseImport,
    SubmitImport,
    ImportSucceeded,
    ImportValidationFailed,
    ImportFailed,
  ],
  emits: [ImportClosed, WeightsImported],
  initial: () =>
    BodyWeightImporterStates.initial.Idle(
      new ImportIdle({ input: "", message: null })
    ),
}).handle({
  Idle: {
    on: {
      ChangeImportInput: ({ event, state, target }) =>
        target.full.Idle(
          new ImportIdle({ ...state, input: event.value, message: null })
        ),
      CloseImport: ({ emit, state, target }) =>
        emit(new ImportClosed()).pipe(
          Effect.as(target.full.Idle(new ImportIdle({ ...state })))
        ),
      SubmitImport: ({ state, target }) =>
        target.full.Submitting(
          new ImportSubmitting({ ...state, _tag: undefined })
        ),
    },
  },
  Submitting: {
    invoke: ({ state }) =>
      Machine.invoke({
        id: "importBodyWeights",
        src: () =>
          Machine.effect(
            Effect.gen(function* () {
              const bodyWeights = yield* BodyWeights.BodyWeights;
              yield* bodyWeights.importBatch({ input: { text: state.input } });
              return new ImportSucceeded();
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
                    () =>
                      `${lineLabel ?? "A line"} should look like 26-06-26 77.40.`
                  ),
                  Match.when(
                    "invalid-weight",
                    () => `${lineLabel ?? "A line"} has an invalid weight.`
                  ),
                  Match.exhaustive
                );
                return Effect.succeed(new ImportValidationFailed({ message }));
              }),
              Effect.catchTag("SchemaError", () =>
                Effect.succeed(
                  new ImportValidationFailed({
                    message: "Paste one date and weight per line.",
                  })
                )
              ),
              Effect.catch(() => Effect.succeed(new ImportFailed()))
            )
          ),
      }),
    on: {
      ImportSucceeded: ({ emit, state, target }) =>
        emit(new WeightsImported()).pipe(
          Effect.as(
            target.full.Idle(
              new ImportIdle({ ...state, _tag: undefined, message: null })
            )
          )
        ),
      ImportValidationFailed: ({ event, state, target }) =>
        target.full.Idle(
          new ImportIdle({
            ...state,
            _tag: undefined,
            message: event.message,
          })
        ),
      ImportFailed: ({ state, target }) =>
        target.full.Idle(
          new ImportIdle({
            ...state,
            _tag: undefined,
            message: "Could not import these weights.",
          })
        ),
    },
  },
});

const BodyWeightEditorChild = Machine.child(
  "bodyWeightEditor",
  bodyWeightEditorMachine
);
const BodyWeightImporterChild = Machine.child(
  "bodyWeightImporter",
  bodyWeightImporterMachine
);

class RouteLoading extends Schema.TaggedClass<RouteLoading>("RouteLoading")(
  "RouteLoading",
  {
    dateKey: Domain.DateKey,
    reportDayCount: BodyWeightReportDayCount,
  }
) {}
class RouteFailed extends Schema.TaggedClass<RouteFailed>("RouteFailed")(
  "RouteFailed",
  {
    dateKey: Domain.DateKey,
    message: Schema.String,
    reportDayCount: BodyWeightReportDayCount,
  }
) {}
class RouteReady extends Schema.TaggedClass<RouteReady>("RouteReady")(
  "RouteReady",
  BodyWeightReadyData
) {}
class RouteClosed extends Schema.TaggedClass<RouteClosed>("RouteClosed")(
  "RouteClosed",
  {}
) {}
class RouteEditing extends Schema.TaggedClass<RouteEditing>("RouteEditing")(
  "RouteEditing",
  {}
) {}
class RouteImporting extends Schema.TaggedClass<RouteImporting>(
  "RouteImporting"
)("RouteImporting", {}) {}
class BodyWeightLoaded extends Schema.TaggedClass<BodyWeightLoaded>(
  "BodyWeightLoaded"
)("BodyWeightLoaded", {
  monthEntries: Schema.Array(Domain.BodyWeightEntry),
  report: BodyWeightReportRange,
}) {}
class BodyWeightLoadFailed extends Schema.TaggedClass<BodyWeightLoadFailed>(
  "BodyWeightLoadFailed"
)("BodyWeightLoadFailed", {}) {}
class NextMonth extends Schema.TaggedClass<NextMonth>("NextMonth")(
  "NextMonth",
  {}
) {}
class PreviousMonth extends Schema.TaggedClass<PreviousMonth>("PreviousMonth")(
  "PreviousMonth",
  {}
) {}
class ReloadBodyWeight extends Schema.TaggedClass<ReloadBodyWeight>(
  "ReloadBodyWeight"
)("ReloadBodyWeight", {}) {}
class OpenImport extends Schema.TaggedClass<OpenImport>("OpenImport")(
  "OpenImport",
  {}
) {}
class SelectBodyWeightDate extends Schema.TaggedClass<SelectBodyWeightDate>(
  "SelectBodyWeightDate"
)("SelectBodyWeightDate", { dateKey: Domain.DateKey }) {}

const BodyWeightRouteStates = Machine.defineStates({
  Failed: RouteFailed,
  Loading: RouteLoading,
  Ready: {
    schema: RouteReady,
    initial: "Closed",
    states: {
      Closed: RouteClosed,
      Editing: RouteEditing,
      Importing: RouteImporting,
    },
  },
});

const bodyWeightRouteMachine = Machine.make({
  id: "bodyWeightRoute",
  states: BodyWeightRouteStates.states,
  events: [
    BodyWeightLoaded,
    BodyWeightLoadFailed,
    NextMonth,
    PreviousMonth,
    ReloadBodyWeight,
    OpenImport,
    SelectBodyWeightDate,
    ...bodyWeightEditorMachine.emits,
    ...bodyWeightImporterMachine.emits,
  ],
  input: BodyWeightRouteInput,
  initial: ({ dateKey, reportDayCount }) =>
    BodyWeightRouteStates.initial.Loading(
      new RouteLoading({ dateKey, reportDayCount })
    ),
}).handle({
  Loading: {
    invoke: ({ state }) =>
      Machine.invoke({
        id: "loadBodyWeight",
        src: () =>
          Machine.effect(
            Effect.gen(function* () {
              const bodyWeights = yield* BodyWeights.BodyWeights;
              const reports = yield* BodyWeightReports.BodyWeightReports;
              const monthRange = CalendarMonthModel.range({
                dateKey: state.dateKey,
              });
              const today = yield* Schema.decodeEffect(Domain.DateKey)(
                dateKeyFromDate({ date: yield* DateTime.nowAsDate })
              );
              const endDateKey = state.dateKey > today ? state.dateKey : today;
              const startDateKey = yield* Schema.decodeEffect(Domain.DateKey)(
                shiftDateKey({
                  dateKey: endDateKey,
                  days: -(state.reportDayCount - 1),
                })
              );
              const monthEntries = yield* bodyWeights.listRange({
                input: monthRange,
              });
              const report = yield* reports.getRange({
                input: { endDateKey, startDateKey },
              });
              return new BodyWeightLoaded({ monthEntries, report });
            }).pipe(
              Effect.catch(() => Effect.succeed(new BodyWeightLoadFailed()))
            )
          ),
      }),
    on: {
      BodyWeightLoaded: ({ event, state, target }) =>
        target.full.Ready(
          new RouteReady({
            dateKey: state.dateKey,
            monthEntries: event.monthEntries,
            report: event.report,
            reportDayCount: state.reportDayCount,
          }),
          (ready) => ready.Closed(new RouteClosed())
        ),
      BodyWeightLoadFailed: ({ state, target }) =>
        target.full.Failed(
          new RouteFailed({
            ...state,
            _tag: undefined,
            message: "Could not load weight data.",
          })
        ),
    },
  },
  Failed: {
    on: {
      NextMonth: ({ state, target }) =>
        target.full.Loading(
          new RouteLoading({
            ...state,
            _tag: undefined,
            dateKey: _shiftMonthDateKey({
              dateKey: state.dateKey,
              months: 1,
            }),
          })
        ),
      PreviousMonth: ({ state, target }) =>
        target.full.Loading(
          new RouteLoading({
            ...state,
            _tag: undefined,
            dateKey: _shiftMonthDateKey({
              dateKey: state.dateKey,
              months: -1,
            }),
          })
        ),
      ReloadBodyWeight: ({ state, target }) =>
        target.full.Loading(
          new RouteLoading({
            dateKey: state.dateKey,
            reportDayCount: state.reportDayCount,
          })
        ),
    },
  },
  Ready: {
    on: {
      NextMonth: ({ state, target }) =>
        target.full.Loading(
          new RouteLoading({
            dateKey: _shiftMonthDateKey({
              dateKey: state.dateKey,
              months: 1,
            }),
            reportDayCount: state.reportDayCount,
          })
        ),
      PreviousMonth: ({ state, target }) =>
        target.full.Loading(
          new RouteLoading({
            dateKey: _shiftMonthDateKey({
              dateKey: state.dateKey,
              months: -1,
            }),
            reportDayCount: state.reportDayCount,
          })
        ),
      ReloadBodyWeight: ({ state, target }) =>
        target.full.Loading(
          new RouteLoading({
            dateKey: state.dateKey,
            reportDayCount: state.reportDayCount,
          })
        ),
    },
    states: {
      Closed: {
        on: {
          OpenImport: ({ parents, target }) =>
            target.full.Ready(new RouteReady({ ...parents.Ready }), (ready) =>
              ready.Importing(new RouteImporting())
            ),
          SelectBodyWeightDate: ({ event, parents, target }) =>
            target.full.Ready(
              new RouteReady({ ...parents.Ready, dateKey: event.dateKey }),
              (ready) => ready.Editing(new RouteEditing())
            ),
        },
      },
      Editing: {
        invoke: ({ parents }) =>
          Machine.invokeMachine({
            child: BodyWeightEditorChild,
            input: {
              dateKey: parents.Ready.dateKey,
              selectedEntry: _findEntryForDateKey({
                dateKey: parents.Ready.dateKey,
                entries: parents.Ready.monthEntries,
              }),
            },
          }),
        on: {
          EditorClosed: ({ parents, target }) =>
            target.full.Ready(new RouteReady({ ...parents.Ready }), (ready) =>
              ready.Closed(new RouteClosed())
            ),
          EditorDeleted: ({ parents, target }) =>
            target.full.Loading(
              new RouteLoading({
                dateKey: parents.Ready.dateKey,
                reportDayCount: parents.Ready.reportDayCount,
              })
            ),
          EditorSaved: ({ parents, target }) =>
            target.full.Loading(
              new RouteLoading({
                dateKey: parents.Ready.dateKey,
                reportDayCount: parents.Ready.reportDayCount,
              })
            ),
        },
      },
      Importing: {
        invoke: Machine.invokeMachine({ child: BodyWeightImporterChild }),
        on: {
          ImportClosed: ({ parents, target }) =>
            target.full.Ready(new RouteReady({ ...parents.Ready }), (ready) =>
              ready.Closed(new RouteClosed())
            ),
          WeightsImported: ({ parents, target }) =>
            target.full.Loading(
              new RouteLoading({
                dateKey: parents.Ready.dateKey,
                reportDayCount: parents.Ready.reportDayCount,
              })
            ),
        },
      },
    },
  },
});

export function BodyWeightPanel({
  calendarPosition = "top",
  initialDateKey,
  onSelectDate,
  reportDayCount = 90,
  showImport = true,
}: {
  readonly calendarPosition?: "bottom" | "top";
  readonly initialDateKey?: Domain.DateKey;
  readonly onSelectDate?: (dateKey: Domain.DateKey) => void;
  readonly reportDayCount?: BodyWeightReportDayCount;
  readonly showImport?: boolean;
}) {
  return Schema.decodeOption(Domain.DateKey)(
    initialDateKey ?? todayDateKey()
  ).pipe(
    Option.match({
      onNone: () => (
        <View style={styles.centered}>
          <Notice
            message="Could not create a valid date for today."
            title="Weight unavailable"
            tone="danger"
          />
        </View>
      ),
      onSome: (dateKey) => (
        <BodyWeightRoute
          calendarPosition={calendarPosition}
          dateKey={dateKey}
          onSelectDate={onSelectDate}
          reportDayCount={reportDayCount}
          showImport={showImport}
        />
      ),
    })
  );
}

function BodyWeightRoute({
  calendarPosition,
  dateKey,
  onSelectDate,
  reportDayCount,
  showImport,
}: {
  readonly calendarPosition: "bottom" | "top";
  readonly dateKey: Domain.DateKey;
  readonly onSelectDate?: (dateKey: Domain.DateKey) => void;
  readonly reportDayCount: BodyWeightReportDayCount;
  readonly showImport: boolean;
}) {
  const routeAtom = useMemo(
    () =>
      AtomMachine.make(MobileAtomRuntime, bodyWeightRouteMachine, {
        dateKey,
        reportDayCount,
      }),
    [dateKey, reportDayCount]
  );
  const editorAtom = useMemo(
    () => routeAtom.child(BodyWeightEditorChild),
    [routeAtom]
  );
  const importerAtom = useMemo(
    () => routeAtom.child(BodyWeightImporterChild),
    [routeAtom]
  );
  const stateResult = useAtomValue(routeAtom.state);
  const send = useAtomSet(routeAtom.send);

  if (AsyncResult.isInitial(stateResult)) {
    return (
      <View style={styles.centered}>
        <LoadingView message="Loading weight data..." />
      </View>
    );
  }

  if (AsyncResult.isFailure(stateResult)) {
    return (
      <View style={styles.centered}>
        <Notice
          message="Could not start the weight state machine."
          title="Weight unavailable"
          tone="danger"
        />
      </View>
    );
  }

  const state = stateResult.value;
  const failed = BodyWeightRouteStates.get(state, "Failed").pipe(
    Option.getOrNull
  );

  if (failed !== null) {
    return (
      <View style={styles.failureStack}>
        <BodyWeightMonthNavigator
          dateKey={failed.dateKey}
          disabled={false}
          onNextMonth={() => {
            send(new NextMonth());
          }}
          onPreviousMonth={() => {
            send(new PreviousMonth());
          }}
        />
        <Notice
          message={failed.message}
          title="Weight unavailable"
          tone="danger"
        />
        <Button
          icon={RotateCcw}
          onPress={() => {
            send(new ReloadBodyWeight());
          }}
          variant="secondary"
        >
          Retry
        </Button>
      </View>
    );
  }

  if (BodyWeightRouteStates.matches(state, "Loading")) {
    return (
      <View style={styles.centered}>
        <LoadingView message="Loading weight data..." />
      </View>
    );
  }

  const ready = BodyWeightRouteStates.get(state, "Ready").pipe(
    Option.getOrNull
  );

  if (ready === null) {
    return null;
  }

  const isEditing = BodyWeightRouteStates.matches(state, "Ready.Editing");
  const isImporting = BodyWeightRouteStates.matches(state, "Ready.Importing");
  const disabled = isEditing || isImporting;
  const calendar = (
    <BodyWeightCalendar
      dateKey={ready.dateKey}
      disabled={disabled}
      entries={ready.monthEntries}
      onImport={
        showImport
          ? () => {
              send(new OpenImport());
            }
          : undefined
      }
      onNextMonth={() => {
        send(new NextMonth());
      }}
      onPreviousMonth={() => {
        send(new PreviousMonth());
      }}
      onSelectDate={(selectedDateKey) => {
        if (onSelectDate !== undefined) {
          onSelectDate(selectedDateKey);
          return;
        }

        send(new SelectBodyWeightDate({ dateKey: selectedDateKey }));
      }}
    />
  );

  return (
    <View style={styles.stack}>
      {calendarPosition === "top" ? calendar : null}
      {isEditing ? <BodyWeightEntryDialog machineAtom={editorAtom} /> : null}
      {isImporting ? (
        <BodyWeightImportDialog machineAtom={importerAtom} />
      ) : null}

      <BodyWeightSummary report={ready.report} />
      <BodyWeightTrend report={ready.report} />
      {calendarPosition === "bottom" ? calendar : null}
    </View>
  );
}

function BodyWeightMonthNavigator({
  dateKey,
  disabled,
  onImport,
  onNextMonth,
  onPreviousMonth,
}: {
  readonly dateKey: Domain.DateKey;
  readonly disabled: boolean;
  readonly onImport?: () => void;
  readonly onNextMonth: () => void;
  readonly onPreviousMonth: () => void;
}) {
  const label = CalendarMonthModel.monthLabel({
    dateKey,
  });

  return (
    <View style={styles.monthNavigator}>
      <View style={styles.monthLabel}>
        {onImport === undefined ? null : (
          <IconButton
            accessibilityLabel="Import weights"
            disabled={disabled}
            icon={Upload}
            iconColor={color.textMuted}
            iconSize={17}
            onPress={onImport}
            strokeWidth={2.3}
            style={styles.monthImportButton}
          />
        )}
        <Text numberOfLines={1} style={styles.monthText}>
          {label}
        </Text>
      </View>
      <View style={styles.monthControls}>
        <IconButton
          accessibilityLabel="Previous weight month"
          disabled={disabled}
          icon={ChevronLeft}
          onPress={onPreviousMonth}
        />
        <IconButton
          accessibilityLabel="Next weight month"
          disabled={disabled}
          icon={ChevronRight}
          onPress={onNextMonth}
        />
      </View>
    </View>
  );
}

function BodyWeightCalendar({
  dateKey,
  disabled,
  entries,
  onImport,
  onNextMonth,
  onPreviousMonth,
  onSelectDate,
}: {
  readonly dateKey: Domain.DateKey;
  readonly disabled: boolean;
  readonly entries: readonly Domain.BodyWeightEntry[];
  readonly onImport?: () => void;
  readonly onNextMonth: () => void;
  readonly onPreviousMonth: () => void;
  readonly onSelectDate: (dateKey: Domain.DateKey) => void;
}) {
  const calendar = CalendarMonthModel.make({
    dateKey,
    entries,
  });

  return (
    <View style={styles.calendarStack}>
      <BodyWeightMonthNavigator
        dateKey={dateKey}
        disabled={disabled}
        onImport={onImport}
        onNextMonth={onNextMonth}
        onPreviousMonth={onPreviousMonth}
      />
      <View style={styles.calendarBody}>
        <View style={styles.weekdayRow}>
          {CalendarWeekdays.map((weekday) => (
            <Text key={weekday} style={styles.weekdayText}>
              {weekday}
            </Text>
          ))}
        </View>
        <View style={styles.calendarGrid}>
          {calendar.weeks.map((week, weekIndex) => (
            <View key={`week-${weekIndex}`} style={styles.calendarWeekRow}>
              {week.map((cell) => (
                <Pressable
                  accessibilityLabel={cell.accessibilityLabel}
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: disabled || !cell.isCurrentMonth,
                    selected: cell.isSelected,
                  }}
                  disabled={disabled || !cell.isCurrentMonth}
                  key={cell.dateKey}
                  onPress={() => {
                    onSelectDate(cell.dateKey);
                  }}
                  style={({ pressed }) => [
                    styles.calendarCell,
                    !cell.isCurrentMonth ? styles.calendarCellOutside : null,
                    cell.isToday ? styles.calendarCellToday : null,
                    cell.isSelected ? styles.calendarCellSelected : null,
                    pressed ? styles.calendarCellPressed : null,
                  ]}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.calendarDayText,
                      !cell.isCurrentMonth
                        ? styles.calendarDayTextOutside
                        : null,
                      cell.isSelected ? styles.calendarDayTextSelected : null,
                    ]}
                  >
                    {cell.dayLabel}
                  </Text>
                  {cell.weightLabel === null ? null : (
                    <Text
                      adjustsFontSizeToFit
                      numberOfLines={1}
                      style={[
                        styles.calendarWeightText,
                        cell.isSelected
                          ? styles.calendarWeightTextSelected
                          : null,
                      ]}
                    >
                      {cell.weightLabel}
                    </Text>
                  )}
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function BodyWeightEntryDialog({
  machineAtom,
}: {
  readonly machineAtom: AtomMachine.ChildMachineAtom<
    typeof BodyWeightEditorChild,
    unknown
  >;
}) {
  const stateResult = useAtomValue(machineAtom.state);
  const send = useAtomSet(machineAtom.send);

  if (!AsyncResult.isSuccess(stateResult) || Option.isNone(stateResult.value)) {
    return null;
  }

  const state = stateResult.value.value;
  const data = Option.firstSomeOf([
    BodyWeightEditorStates.get(state, "Idle"),
    BodyWeightEditorStates.get(state, "Saving"),
    BodyWeightEditorStates.get(state, "Deleting"),
  ]).pipe(Option.getOrNull);

  if (data === null) {
    return null;
  }

  const dateKey = data.dateKey;
  const deleting = BodyWeightEditorStates.matches(state, "Deleting");
  const saving = BodyWeightEditorStates.matches(state, "Saving");
  const disabled = deleting || saving;
  const hasEntry = data.selectedEntry !== null;
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    weekday: "long",
  }).format(CalendarMonthModel.dateFromDateKey({ dateKey }));

  return (
    <Modal
      animationType="fade"
      onRequestClose={() => {
        if (!disabled) {
          send(new CloseEditor());
        }
      }}
      transparent
      visible
    >
      <Pressable
        accessibilityLabel="Close weight editor"
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => {
          send(new CloseEditor());
        }}
        style={styles.editorBackdrop}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.editorKeyboardAvoiding}
        >
          <View
            style={styles.editorDialog}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.editorHeader}>
              <View style={styles.editorTitleCopy}>
                <Text style={styles.editorTitle}>{dateLabel}</Text>
              </View>
              <Pressable
                accessibilityLabel="Close weight editor"
                accessibilityRole="button"
                disabled={disabled}
                onPress={() => {
                  send(new CloseEditor());
                }}
                style={({ pressed }) => [
                  styles.editorCloseButton,
                  pressed && !disabled ? styles.editorCloseButtonPressed : null,
                  disabled ? styles.editorCloseButtonDisabled : null,
                ]}
              >
                <X color={color.textMuted} size={18} strokeWidth={3} />
              </Pressable>
            </View>
            {data.message === null ? null : (
              <Notice message={data.message} tone="neutral" />
            )}
            <NumberField
              accessibilityLabel="Weight in kilograms"
              autoFocus
              editable={!disabled}
              key={`${dateKey}-open`}
              onChangeText={(value) => {
                send(new ChangeEditorWeight({ value }));
              }}
              placeholder="82.4"
              rightElement={<Text style={styles.unitText}>kg</Text>}
              selectTextOnFocus
              value={data.weightInput}
            />
            <View style={styles.editorActions}>
              <Button
                disabled={disabled || !hasEntry}
                icon={Trash2}
                loading={deleting}
                onPress={() => {
                  send(new DeleteEditorWeight());
                }}
                style={styles.editorAction}
                variant="danger"
              >
                Delete
              </Button>
              <Button
                disabled={disabled}
                icon={Save}
                loading={saving}
                onPress={() => {
                  send(new SaveEditorWeight());
                }}
                style={styles.editorAction}
              >
                {hasEntry ? "Update" : "Save"}
              </Button>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function BodyWeightImportDialog({
  machineAtom,
}: {
  readonly machineAtom: AtomMachine.ChildMachineAtom<
    typeof BodyWeightImporterChild,
    unknown
  >;
}) {
  const stateResult = useAtomValue(machineAtom.state);
  const send = useAtomSet(machineAtom.send);

  if (!AsyncResult.isSuccess(stateResult) || Option.isNone(stateResult.value)) {
    return null;
  }

  const state = stateResult.value.value;
  const data = Option.firstSomeOf([
    BodyWeightImporterStates.get(state, "Idle"),
    BodyWeightImporterStates.get(state, "Submitting"),
  ]).pipe(Option.getOrNull);

  if (data === null) {
    return null;
  }

  const importing = BodyWeightImporterStates.matches(state, "Submitting");
  const disabled = importing;
  const canImport = data.input.trim().length > 0;

  return (
    <Modal
      animationType="fade"
      onRequestClose={() => {
        if (!disabled) {
          send(new CloseImport());
        }
      }}
      transparent
      visible
    >
      <Pressable
        accessibilityLabel="Close weight importer"
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => {
          send(new CloseImport());
        }}
        style={styles.editorBackdrop}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.editorKeyboardAvoiding}
        >
          <View
            style={styles.editorDialog}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.editorHeader}>
              <View style={styles.editorTitleCopy}>
                <Text style={styles.editorTitle}>Import weights</Text>
              </View>
              <Pressable
                accessibilityLabel="Close weight importer"
                accessibilityRole="button"
                disabled={disabled}
                onPress={() => {
                  send(new CloseImport());
                }}
                style={({ pressed }) => [
                  styles.editorCloseButton,
                  pressed && !disabled ? styles.editorCloseButtonPressed : null,
                  disabled ? styles.editorCloseButtonDisabled : null,
                ]}
              >
                <X color={color.textMuted} size={18} strokeWidth={3} />
              </Pressable>
            </View>
            {data.message === null ? null : (
              <Notice message={data.message} tone="danger" />
            )}
            <TextArea
              accessibilityLabel="Weight import rows"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              editable={!disabled}
              helperText="Use one date and weight per line."
              inputStyle={styles.importTextAreaInput}
              key="weight-import-open"
              onChangeText={(value) => {
                send(new ChangeImportInput({ value }));
              }}
              placeholder={"26-06-26 77.40\n26-06-23 77.40"}
              scrollEnabled
              value={data.input}
            />
            <View style={styles.editorActions}>
              <Button
                disabled={disabled || !canImport}
                icon={Upload}
                loading={importing}
                onPress={() => {
                  send(new SubmitImport());
                }}
                style={styles.editorAction}
              >
                Import
              </Button>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function BodyWeightSummary({
  report,
}: {
  readonly report: BodyWeightReportRange;
}) {
  const latestEntry = report.latestEntry;
  const latestWeight = latestEntry?.weightKilograms ?? null;
  const weightedWeight = report.weightedWeightKilograms;
  const firstTrendPoint = report.trendPoints[0];
  const latestTrendPoint = report.trendPoints.at(-1);
  const progressDayCount = _reportTrendDayCount({ report });
  const latestWeightLabel =
    latestEntry === null || latestEntry.dateKey === report.endDateKey
      ? "Today"
      : _formatChartDateLabel({ dateKey: latestEntry.dateKey });
  const trendChange =
    firstTrendPoint === undefined || latestTrendPoint === undefined
      ? null
      : latestTrendPoint.weightKilograms - firstTrendPoint.weightKilograms;

  return (
    <View style={styles.metricGrid}>
      <BodyWeightMetric
        label={latestWeightLabel}
        value={
          latestWeight === null
            ? "-"
            : _formatKilograms({
                value: latestWeight,
              })
        }
      />
      <BodyWeightMetric
        label={_formatLastDaysLabel({
          dayCount: progressDayCount,
        })}
        value={
          trendChange === null
            ? "-"
            : `${trendChange >= 0 ? "+" : "-"}${_formatKilograms({
                value: Math.abs(trendChange),
              })}`
        }
      />
      <BodyWeightMetric
        label={_formatLastDaysLabel({
          dayCount: estimateWeightWindowDays,
          suffix: "avg",
        })}
        value={
          weightedWeight === null
            ? "-"
            : _formatKilograms({
                value: weightedWeight,
              })
        }
      />
    </View>
  );
}

function BodyWeightMetric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <View style={styles.metric}>
      <Text numberOfLines={1} style={styles.metricValue}>
        {value}
      </Text>
      <Text numberOfLines={1} style={styles.metricLabel}>
        {label}
      </Text>
    </View>
  );
}

const bodyWeightChartTabs = [
  {
    accessibilityLabel: "Show weight trend chart",
    key: "trend",
    label: "Trend",
  },
  {
    accessibilityLabel: "Show weights compared with the average",
    key: "change",
    label: "Vs average",
  },
];

function BodyWeightTrend({
  report,
}: {
  readonly report: BodyWeightReportRange;
}) {
  return (
    <View style={styles.trendBlock}>
      <BodyWeightChart report={report} />
      <BodyWeightInsights report={report} />
    </View>
  );
}

function BodyWeightChart({
  report,
}: {
  readonly report: BodyWeightReportRange;
}) {
  const chartKindAtom = useMemo(
    () => Atom.make<typeof BodyWeightChartKind.Type>("trend"),
    []
  );
  const [chartKind, setChartKind] = useAtom(chartKindAtom);
  const chart = BodyWeightChartDataModel.make({ report });
  const { state: pressState, isActive: isPressActive } = useChartPressState({
    x: 0,
    y: {
      change: 0,
      changeDown: 0,
      changeUp: 0,
      estimate: 0,
      normalRaw: 0,
      outlierRaw: 0,
      stable: 0,
      trend: 0,
    },
  });
  const activeDomain =
    chartKind === "trend" ? chart.trendDomain : chart.changeDomain;
  const activeDomainRange = activeDomain[1] - activeDomain[0];
  const scaleValueOffset =
    chartKind === "change" && chart.averageReference !== null
      ? chart.averageReference.value
      : 0;
  const scaleSteps = [0.25, 0.5, 0.75].map((ratio) => ({
    displayValue:
      activeDomain[0] + activeDomainRange * ratio + scaleValueOffset,
    ratio,
    top: 10 + (1 - ratio) * 212 - 6,
    value: activeDomain[0] + activeDomainRange * ratio,
  }));
  const maximumScaleLabel = formatNumber({
    maximumFractionDigits: 1,
    value: activeDomain[1] + scaleValueOffset,
  });
  const minimumScaleLabel = formatNumber({
    maximumFractionDigits: 1,
    value: activeDomain[0] + scaleValueOffset,
  });

  if (!Array.isReadonlyArrayNonEmpty(report.entries)) {
    return (
      <View>
        <Text style={styles.emptyText}>No weight entries recorded.</Text>
      </View>
    );
  }

  const progressDayCount = _reportTrendDayCount({ report });

  return (
    <View style={styles.chartSection}>
      <PagerTabBar
        activeIndex={chartKind === "trend" ? 0 : 1}
        onActiveIndexChange={(index) => {
          setChartKind(index === 0 ? "trend" : "change");
        }}
        tabs={bodyWeightChartTabs}
      />
      <View
        accessibilityLabel={`Weight ${chartKind === "trend" ? "trend" : "values compared with the weighted average"} from ${_formatChartDateLabel({ dateKey: chart.startDateKey })} to ${_formatChartDateLabel({ dateKey: chart.endDateKey })}. Touch and drag across the chart for daily values.`}
        accessible
        style={styles.chartShell}
      >
        <View style={styles.chartCanvas}>
          <CartesianChart
            chartPressConfig={{
              pan: {
                activateAfterLongPress: 80,
                failOffsetY: [-12, 12],
              },
            }}
            chartPressState={pressState}
            data={chart.data}
            domain={{
              y: chartKind === "trend" ? chart.trendDomain : chart.changeDomain,
            }}
            domainPadding={{ left: 10, right: 10 }}
            frame={{
              lineColor: color.divider,
              lineWidth: { bottom: 0, left: 0, right: 0, top: 0 },
            }}
            padding={{ bottom: 10, left: 58, right: 8, top: 10 }}
            xKey="dayIndex"
            yKeys={[
              "change",
              "changeDown",
              "changeUp",
              "estimate",
              "normalRaw",
              "outlierRaw",
              "stable",
              "trend",
            ]}
          >
            {({ chartBounds, points, yScale }) => (
              <>
                <SkiaRect
                  color={color.divider}
                  height={1}
                  opacity={0.9}
                  width={chartBounds.right - chartBounds.left}
                  x={chartBounds.left}
                  y={chartBounds.top}
                />
                {scaleSteps.map((step) => (
                  <SkiaRect
                    color={color.divider}
                    height={1}
                    key={step.value}
                    opacity={0.9}
                    width={chartBounds.right - chartBounds.left}
                    x={chartBounds.left}
                    y={
                      chartBounds.top +
                      (1 - step.ratio) * (chartBounds.bottom - chartBounds.top)
                    }
                  />
                ))}
                <SkiaRect
                  color={color.divider}
                  height={1}
                  opacity={0.9}
                  width={chartBounds.right - chartBounds.left}
                  x={chartBounds.left}
                  y={chartBounds.bottom - 1}
                />
                {chartKind === "trend" ? (
                  <>
                    <Line
                      color={color.primary}
                      connectMissingData={false}
                      curveType="linear"
                      points={points.trend}
                      strokeCap="round"
                      strokeJoin="round"
                      strokeWidth={3}
                    />
                    <Line
                      color={color.nutritionEnergy}
                      connectMissingData={false}
                      curveType="linear"
                      points={points.stable}
                      strokeCap="round"
                      strokeJoin="round"
                      strokeWidth={2.4}
                    />
                    <Scatter
                      color={color.textMuted}
                      opacity={0.56}
                      points={points.normalRaw}
                      radius={2.8}
                    />
                    <Scatter
                      color={color.warningText}
                      opacity={0.78}
                      points={points.outlierRaw}
                      radius={3.8}
                    />
                    <Line
                      color={color.nutritionEnergy}
                      connectMissingData={false}
                      opacity={0.62}
                      points={points.estimate}
                      strokeCap="round"
                      strokeWidth={1.2}
                    >
                      <DashPathEffect intervals={[3, 5]} />
                    </Line>
                  </>
                ) : (
                  <>
                    <SkiaRect
                      color={color.textMuted}
                      height={1}
                      opacity={0.5}
                      width={chartBounds.right - chartBounds.left}
                      x={chartBounds.left}
                      y={yScale(0)}
                    />
                    <Bar
                      chartBounds={chartBounds}
                      color={color.primary}
                      innerPadding={0.32}
                      points={points.changeDown}
                      roundedCorners={{
                        topLeft: 2,
                        topRight: 2,
                      }}
                    />
                    <Bar
                      chartBounds={chartBounds}
                      color={color.nutritionEnergy}
                      innerPadding={0.32}
                      points={points.changeUp}
                      roundedCorners={{
                        topLeft: 2,
                        topRight: 2,
                      }}
                    />
                  </>
                )}
                {isPressActive ? (
                  <>
                    <SkiaRect
                      color={color.textMuted}
                      height={chartBounds.bottom - chartBounds.top}
                      opacity={0.42}
                      width={1}
                      x={pressState.x.position}
                      y={chartBounds.top}
                    />
                    <SkiaCircle
                      color={chartKind === "trend" ? color.primary : color.text}
                      cx={pressState.x.position}
                      cy={
                        chartKind === "trend"
                          ? pressState.y.trend.position
                          : pressState.y.change.position
                      }
                      r={4.5}
                    />
                  </>
                ) : null}
              </>
            )}
          </CartesianChart>
          <View pointerEvents="none" style={styles.chartPlotOverlay}>
            <Text numberOfLines={1} style={styles.chartScaleMaximum}>
              {maximumScaleLabel}
            </Text>
            <Text numberOfLines={1} style={styles.chartScaleMinimum}>
              {minimumScaleLabel}
            </Text>
            {scaleSteps.map((step) => (
              <Text
                key={step.value}
                numberOfLines={1}
                style={[styles.chartScaleStep, { top: step.top }]}
              >
                {formatNumber({
                  maximumFractionDigits: 1,
                  value: step.displayValue,
                })}
              </Text>
            ))}
          </View>
        </View>
        <View style={styles.chartFooter}>
          <Text style={styles.chartDateRange}>
            {_formatChartDateLabel({ dateKey: chart.startDateKey })}
            {" – "}
            {_formatChartDateLabel({ dateKey: chart.endDateKey })}
          </Text>
          <View style={styles.chartLegend}>
            {chartKind === "trend" ? (
              <>
                <BodyWeightChartLegendItem
                  color={color.primary}
                  label={`Trend (${progressDayCount}d)`}
                />
                <BodyWeightChartLegendItem
                  color={color.nutritionEnergy}
                  label="Average"
                />
              </>
            ) : (
              <>
                <BodyWeightChartLegendItem
                  color={color.primary}
                  label="Lower"
                />
                <BodyWeightChartLegendItem
                  color={color.nutritionEnergy}
                  label="Higher"
                />
              </>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

function BodyWeightChartLegendItem({
  color: legendColor,
  label,
}: {
  readonly color: string;
  readonly label: string;
}) {
  return (
    <View style={styles.chartLegendItem}>
      <View
        style={[styles.chartLegendMark, { backgroundColor: legendColor }]}
      />
      <Text numberOfLines={1} style={styles.chartLegendLabel}>
        {label}
      </Text>
    </View>
  );
}

function BodyWeightInsights({
  report,
}: {
  readonly report: BodyWeightReportRange;
}) {
  return (
    <View style={styles.insightsBlock}>
      {!Array.isReadonlyArrayNonEmpty(report.insights) ? (
        <Text style={styles.emptyText}>More entries will surface trends.</Text>
      ) : (
        <View style={styles.insightList}>
          {report.insights.map((insight) => (
            <View key={insight.id} style={styles.insight}>
              <Text style={styles.insightText}>
                {insight.parts.map((part, index) => (
                  <Text
                    key={`${insight.id}-${index}`}
                    style={
                      part.tone === "highlight"
                        ? styles.insightHighlightText
                        : undefined
                    }
                  >
                    {part.text}
                  </Text>
                ))}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const CalendarWeekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CalendarMonthModel = {
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
  make({
    dateKey,
    entries,
  }: {
    readonly dateKey: Domain.DateKey;
    readonly entries: readonly Domain.BodyWeightEntry[];
  }) {
    const displayedDate = CalendarMonthModel.dateFromDateKey({ dateKey });
    const monthIndex = displayedDate.getMonth();
    const firstOfMonth = new Date(displayedDate.getFullYear(), monthIndex, 1);
    const lastOfMonth = new Date(
      displayedDate.getFullYear(),
      monthIndex + 1,
      0
    );
    const gridStartDate = new Date(
      displayedDate.getFullYear(),
      monthIndex,
      1 - firstOfMonth.getDay()
    );
    const totalCellCount =
      firstOfMonth.getDay() + lastOfMonth.getDate() + 6 - lastOfMonth.getDay();
    const today = todayDateKey();
    const cells = globalThis.Array.from(
      { length: totalCellCount },
      (_, index) => {
        const cellDate = new Date(
          gridStartDate.getFullYear(),
          gridStartDate.getMonth(),
          gridStartDate.getDate() + index
        );
        const cellDateKey = CalendarMonthModel.dateKeyFromDate({
          date: cellDate,
          fallbackDateKey: dateKey,
        });
        const isCurrentMonth = cellDate.getMonth() === monthIndex;
        const entry = isCurrentMonth
          ? _findEntryForDateKey({
              dateKey: cellDateKey,
              entries,
            })
          : null;
        const weightLabel =
          entry === null
            ? null
            : formatNumber({
                maximumFractionDigits: 2,
                minimumFractionDigits: 2,
                value: entry.weightKilograms,
              });
        const fullDateLabel = new Intl.DateTimeFormat("en-US", {
          day: "numeric",
          month: "long",
          weekday: "long",
          year: "numeric",
        }).format(cellDate);
        const accessibilityLabel =
          weightLabel === null
            ? `${fullDateLabel}, no weight`
            : `${fullDateLabel}, ${weightLabel} kg`;

        return {
          accessibilityLabel,
          dateKey: cellDateKey,
          dayLabel: String(cellDate.getDate()),
          isCurrentMonth,
          isSelected: cellDateKey === dateKey,
          isToday: cellDateKey === today,
          weightLabel,
        };
      }
    );

    return {
      weeks: globalThis.Array.from({ length: totalCellCount / 7 }, (_, index) =>
        cells.slice(index * 7, index * 7 + 7)
      ),
    };
  },
  monthLabel({ dateKey }: { readonly dateKey: Domain.DateKey }) {
    const date = CalendarMonthModel.dateFromDateKey({ dateKey });

    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
    }).format(date);
  },
  range({ dateKey }: { readonly dateKey: Domain.DateKey }) {
    const date = CalendarMonthModel.dateFromDateKey({ dateKey });
    const startDate = new Date(date.getFullYear(), date.getMonth(), 1);
    const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    return {
      endDateKey: CalendarMonthModel.dateKeyFromDate({
        date: endDate,
        fallbackDateKey: dateKey,
      }),
      startDateKey: CalendarMonthModel.dateKeyFromDate({
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
    const date = CalendarMonthModel.dateFromDateKey({ dateKey });
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

    return CalendarMonthModel.dateKeyFromDate({
      date: targetDate,
      fallbackDateKey: dateKey,
    });
  },
};

const BodyWeightChartDataModel = {
  make({ report }: { readonly report: BodyWeightReportRange }) {
    const dateKeys = [
      ...report.entries.map((entry) => entry.dateKey),
      ...report.trendPoints.map((point) => point.dateKey),
      ...report.stableTrendPoints.map((point) => point.dateKey),
    ]
      .filter((dateKey, index, values) => values.indexOf(dateKey) === index)
      .sort();
    const startDateKey = dateKeys[0] ?? report.startDateKey;
    const endDateKey = dateKeys.at(-1) ?? report.endDateKey;
    const latestStableTrendPoint = report.stableTrendPoints.at(-1) ?? null;
    const averageReference =
      report.weightedWeightKilograms === null
        ? latestStableTrendPoint === null
          ? null
          : {
              value: latestStableTrendPoint.weightKilograms,
            }
        : {
            value: report.weightedWeightKilograms,
          };
    const data = dateKeys.map((dateKey) => {
      const entry = report.entries.find(
        (candidate) => candidate.dateKey === dateKey
      );
      const trendPoint = report.trendPoints.find(
        (candidate) => candidate.dateKey === dateKey
      );
      const stablePoint = report.stableTrendPoints.find(
        (candidate) => candidate.dateKey === dateKey
      );
      const isOutlier = report.outliers.some(
        (outlier) => outlier.entry.dateKey === dateKey
      );
      const trend = trendPoint?.weightKilograms ?? null;
      const stable = stablePoint?.weightKilograms ?? null;
      const displayedWeight = entry?.weightKilograms ?? trend;
      const comparisonWeight = entry?.weightKilograms ?? null;
      const change =
        comparisonWeight === null || averageReference === null
          ? null
          : comparisonWeight - averageReference.value;
      const stableLabel =
        stable === null
          ? "No rolling average"
          : `avg ${_formatKilograms({ value: stable })}`;

      return {
        change,
        changeDown: change !== null && change < 0 ? change : null,
        changeTooltip:
          change === null
            ? "No average comparison"
            : `${_formatKilograms({ value: comparisonWeight ?? 0 })} · ${change === 0 ? "at" : change > 0 ? "above" : "below"} average`,
        changeUp: change !== null && change >= 0 ? change : null,
        dateKey,
        dayIndex: _dateKeyToDayIndex({ dateKey }),
        estimate: report.weightedWeightKilograms,
        normalRaw:
          entry === undefined || isOutlier ? null : entry.weightKilograms,
        outlierRaw:
          entry === undefined || !isOutlier ? null : entry.weightKilograms,
        stable,
        tooltipPrimary:
          displayedWeight === null
            ? _formatChartDateLabel({ dateKey })
            : `${_formatChartDateLabel({ dateKey })} · ${_formatKilograms({ value: displayedWeight })}${isOutlier ? " · outlier" : ""}`,
        trend,
        trendTooltip:
          trend === null
            ? stableLabel
            : `Trend ${_formatKilograms({ value: trend })} · ${stableLabel}`,
      };
    });
    const allWeights = [
      ...report.entries.map((entry) => entry.weightKilograms),
      ...report.trendPoints.map((point) => point.weightKilograms),
      ...report.stableTrendPoints.map((point) => point.weightKilograms),
      ...(report.weightedWeightKilograms === null
        ? []
        : [report.weightedWeightKilograms]),
    ];
    const minimumWeight = Array.isReadonlyArrayNonEmpty(allWeights)
      ? Math.min(...allWeights)
      : 0;
    const maximumWeight = Array.isReadonlyArrayNonEmpty(allWeights)
      ? Math.max(...allWeights)
      : 0;
    const trendPadding = Math.max(0.5, (maximumWeight - minimumWeight) * 0.15);
    const changes = data.map((point) => point.change ?? 0);
    const minimumChange = Math.min(0, ...changes);
    const maximumChange = Math.max(0, ...changes);
    const changeRange = maximumChange - minimumChange;
    const changePadding = Math.max(0.1, changeRange * 0.12);
    const rawChangeDomain: [number, number] =
      changeRange === 0
        ? [-0.25, 0.25]
        : [minimumChange - changePadding, maximumChange + changePadding];
    const changeDomain = niceLinearDomain({ domain: rawChangeDomain });
    const trendDomain = niceLinearDomain({
      domain: [minimumWeight - trendPadding, maximumWeight + trendPadding],
    });

    return {
      averageReference,
      changeDomain,
      data,
      endDateKey,
      startDateKey,
      trendDomain,
    };
  },
};

function _shiftMonthDateKey({
  dateKey,
  months,
}: {
  readonly dateKey: Domain.DateKey;
  readonly months: number;
}) {
  return CalendarMonthModel.shiftDateKey({
    dateKey,
    months,
  });
}

function _findEntryForDateKey({
  dateKey,
  entries,
}: {
  readonly dateKey: Domain.DateKey;
  readonly entries: readonly Domain.BodyWeightEntry[];
}) {
  return entries.find((entry) => entry.dateKey === dateKey) ?? null;
}

function _dateKeyToDayIndex({ dateKey }: { readonly dateKey: Domain.DateKey }) {
  const [yearString, monthString, dayString] = dateKey.split("-");
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);

  return Math.floor(Date.UTC(year, month - 1, day, 12) / 86_400_000);
}

function _reportTrendDayCount({
  report,
}: {
  readonly report: BodyWeightReportRange;
}) {
  const startDateKey = report.trendPoints[0]?.dateKey ?? report.startDateKey;
  const endDateKey = report.trendPoints.at(-1)?.dateKey ?? report.endDateKey;

  return Math.max(
    1,
    _dateKeyToDayIndex({ dateKey: endDateKey }) -
      _dateKeyToDayIndex({ dateKey: startDateKey }) +
      1
  );
}

function _formatLastDaysLabel({
  dayCount,
  suffix,
}: {
  readonly dayCount: number;
  readonly suffix?: string;
}) {
  return `Last ${dayCount}d${suffix === undefined ? "" : ` ${suffix}`}`;
}

function _formatKilograms({ value }: { readonly value: number }) {
  return `${formatNumber({
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    value,
  })} kg`;
}

function _formatChartDateLabel({
  dateKey,
}: {
  readonly dateKey: Domain.DateKey;
}) {
  const date = CalendarMonthModel.dateFromDateKey({ dateKey });

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
  }).format(date);
}

const styles = StyleSheet.create({
  centered: {
    minHeight: 220,
    justifyContent: "center",
  },
  failureStack: {
    gap: spacing.lg,
  },
  stack: {
    gap: spacing.xxxl,
  },
  monthNavigator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  monthLabel: {
    minWidth: 0,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: spacing.lg,
  },
  monthImportButton: {
    borderColor: color.sheetBorder,
    backgroundColor: color.field,
  },
  monthText: {
    minWidth: 0,
    flexShrink: 1,
    color: color.text,
    fontSize: tokens.type.size.lg,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.lg,
  },
  monthControls: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  calendarStack: {
    gap: spacing.xl,
  },
  calendarBody: {
    gap: spacing.xs,
  },
  weekdayRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  weekdayText: {
    minWidth: 0,
    flex: 1,
    color: color.textSubtle,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xs,
    textAlign: "center",
    textTransform: "uppercase",
  },
  calendarGrid: {
    gap: spacing.xs,
  },
  calendarWeekRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  calendarCell: {
    minWidth: 0,
    flex: 1,
    aspectRatio: 1,
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.xs,
    padding: spacing.sm,
    backgroundColor: color.field,
  },
  calendarCellOutside: {
    backgroundColor: color.bg,
    opacity: 0.48,
  },
  calendarCellToday: {
    borderColor: color.warningBorder,
  },
  calendarCellSelected: {
    borderColor: color.primary,
    backgroundColor: color.primarySoft,
  },
  calendarCellPressed: {
    opacity: 0.82,
  },
  calendarDayText: {
    color: color.textSubtle,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.xs,
  },
  calendarDayTextOutside: {
    color: color.textSubtle,
  },
  calendarDayTextSelected: {
    color: color.textMuted,
  },
  calendarWeightText: {
    color: color.text,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.sm,
    textAlign: "center",
  },
  calendarWeightTextSelected: {
    color: color.primaryHover,
  },
  editorBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: color.overlay,
  },
  editorKeyboardAvoiding: {
    width: "100%",
  },
  editorDialog: {
    gap: spacing.md,
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: color.sheet,
  },
  editorHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  editorTitleCopy: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xs,
  },
  editorTitle: {
    color: color.text,
    fontSize: tokens.type.size.lg,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.lg,
  },
  editorCloseButton: {
    width: 28,
    height: 28,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  editorCloseButtonPressed: {
    opacity: 0.86,
  },
  editorCloseButtonDisabled: {
    opacity: 0.5,
  },
  editorActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  editorAction: {
    minWidth: 0,
    flex: 1,
  },
  importTextAreaInput: {
    maxHeight: 180,
  },
  unitText: {
    color: color.textMuted,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.md,
  },
  metricGrid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  metric: {
    minWidth: 0,
    flex: 1,
    alignItems: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: color.surface,
  },
  metricValue: {
    color: color.text,
    fontSize: tokens.type.size.lg,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.lg,
  },
  metricLabel: {
    color: color.textSubtle,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xs,
    textTransform: "uppercase",
  },
  trendBlock: {
    gap: spacing.xxxl,
  },
  chartSection: {
    gap: spacing.xl,
  },
  chartShell: {
    gap: spacing.xxxl,
    paddingVertical: spacing.md,
  },
  chartCanvas: {
    position: "relative",
    height: 232,
  },
  chartPlotOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  chartScaleMaximum: {
    position: "absolute",
    top: 4,
    left: 2,
    width: 42,
    color: color.textMuted,
    fontSize: 10,
    fontWeight: tokens.type.weight.black,
    lineHeight: 12,
    textAlign: "right",
  },
  chartScaleMinimum: {
    position: "absolute",
    bottom: 4,
    left: 2,
    width: 42,
    color: color.textMuted,
    fontSize: 10,
    fontWeight: tokens.type.weight.black,
    lineHeight: 12,
    textAlign: "right",
  },
  chartScaleStep: {
    position: "absolute",
    left: 2,
    width: 42,
    color: color.textMuted,
    fontSize: 10,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: 12,
    textAlign: "right",
  },
  chartFooter: {
    minWidth: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  chartDateRange: {
    minWidth: 0,
    flexShrink: 1,
    color: color.textSubtle,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.xs,
  },
  chartLegend: {
    minWidth: 0,
    flexShrink: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  chartLegendItem: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  chartLegendMark: {
    width: 14,
    height: 3,
    flexShrink: 0,
    borderRadius: radius.pill,
  },
  chartLegendLabel: {
    color: color.textSubtle,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.xs,
  },
  emptyText: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.md,
  },
  insightsBlock: {
    gap: spacing.sm,
  },
  insightList: {
    borderTopWidth: 1,
    borderTopColor: color.sheetBorder,
  },
  insight: {
    borderBottomWidth: 1,
    borderBottomColor: color.sheetBorder,
    paddingVertical: spacing.sm,
  },
  insightText: {
    color: color.text,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.md,
  },
  insightHighlightText: {
    color: color.warningText,
    fontWeight: tokens.type.weight.black,
  },
});
