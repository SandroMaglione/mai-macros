import { EmptyEvent } from "@mai/machines";
import { BodyWeightReports, BodyWeights, Domain } from "@mai/nutrition";
import { useMachine, useSelector } from "@xstate/react";
import { Array, DateTime, Effect, Match, Option, Schema } from "effect";
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
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";
import { Actor, createAsyncLogic, setup, type ActorRefFromLogic } from "xstate";

import {
  Button,
  IconButton,
  LoadingView,
  Notice,
  NumberField,
  TextArea,
} from "@/components/ui";
import { dateKeyFromDate, shiftDateKey, todayDateKey } from "@/lib/date-keys";
import { formatNumber } from "@/lib/format";
import { RuntimeClient } from "@/lib/runtime-client";
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

const BodyWeightRouteInput = Schema.Struct({
  dateKey: Domain.DateKey,
});

const LoadBodyWeightInput = Schema.Struct({
  dateKey: Domain.DateKey,
});

const LoadBodyWeightOutput = Schema.Struct({
  monthEntries: Schema.Array(Domain.BodyWeightEntry),
  report: BodyWeightReportRange,
});

const SaveBodyWeightInput = Schema.Struct({
  dateKey: Domain.DateKey,
  weightInput: Schema.String,
});

const SaveBodyWeightOutput = Schema.Union([
  Schema.TaggedStruct("Saved", {}),
  Schema.TaggedStruct("ValidationFailure", {}),
]);

const DeleteBodyWeightInput = Schema.Struct({
  dateKey: Domain.DateKey,
});

const BodyWeightEditorInput = Schema.Struct({
  dateKey: Domain.DateKey,
  selectedEntry: Schema.NullOr(Domain.BodyWeightEntry),
});

const ImportBodyWeightsInput = Schema.Struct({
  value: Schema.String,
});

const ImportBodyWeightsOutput = Schema.Union([
  Schema.TaggedStruct("Imported", {}),
  Schema.TaggedStruct("ValidationFailure", {
    message: Schema.String,
  }),
]);

const BodyWeightEditorContext = Schema.Struct({
  dateKey: Domain.DateKey,
  message: Schema.NullOr(Schema.String),
  selectedEntry: Schema.NullOr(Domain.BodyWeightEntry),
  weightInput: Schema.String,
});

const BodyWeightImporterContext = Schema.Struct({
  input: Schema.String,
  message: Schema.NullOr(Schema.String),
});

const BodyWeightRouteContext = Schema.Struct({
  dateKey: Domain.DateKey,
  message: Schema.NullOr(Schema.String),
  monthEntries: Schema.Array(Domain.BodyWeightEntry),
  report: Schema.NullOr(BodyWeightReportRange),
});

type BodyWeightRouteChildEvent =
  | {
      readonly type: "editorClosed";
    }
  | {
      readonly type: "editorDeleted";
    }
  | {
      readonly type: "editorSaved";
    }
  | {
      readonly type: "importClosed";
    }
  | {
      readonly type: "weightsImported";
    };

const bodyWeightEditorMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(BodyWeightEditorContext),
    events: {
      changeWeight: Schema.toStandardSchemaV1(
        Schema.Struct({
          value: Schema.String,
        })
      ),
      close: Schema.toStandardSchemaV1(EmptyEvent),
      deleteWeight: Schema.toStandardSchemaV1(EmptyEvent),
      save: Schema.toStandardSchemaV1(EmptyEvent),
    },
    input: Schema.toStandardSchemaV1(BodyWeightEditorInput),
  },
  states: {
    Deleting: {},
    Idle: {},
    Saving: {},
  },
  actorSources: {
    deleteBodyWeight: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(DeleteBodyWeightInput),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const bodyWeights = yield* BodyWeights.BodyWeights;

            yield* bodyWeights.delete({
              input: {
                dateKey: input.dateKey,
              },
            });
          })
        ),
    }),
    saveBodyWeight: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(SaveBodyWeightInput),
        output: Schema.toStandardSchemaV1(SaveBodyWeightOutput),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const bodyWeights = yield* BodyWeights.BodyWeights;

            yield* bodyWeights.save({
              input: {
                dateKey: input.dateKey,
                weightKilograms: input.weightInput,
              },
            });

            return {
              _tag: "Saved" as const,
            };
          }).pipe(
            Effect.catchTag("SchemaError", () =>
              Effect.succeed({
                _tag: "ValidationFailure" as const,
              })
            )
          )
        ),
    }),
  },
}).createMachine({
  context: ({ input }) => ({
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
  initial: "Idle",
  states: {
    Idle: {
      on: {
        changeWeight: ({ event }) => ({
          context: {
            message: null,
            weightInput: event.value,
          },
        }),
        close: ({ parent }, enq) => {
          if (parent !== undefined) {
            enq.sendTo(parent, {
              type: "editorClosed",
            } satisfies BodyWeightRouteChildEvent);
          }

          return {};
        },
        deleteWeight: ({ context }) =>
          context.selectedEntry === null
            ? undefined
            : {
                target: "Deleting" as const,
              },
        save: {
          target: "Saving",
        },
      },
    },
    Saving: {
      invoke: {
        src: "saveBodyWeight",
        input: ({ context }) => ({
          dateKey: context.dateKey,
          weightInput: context.weightInput,
        }),
        onDone: ({ event, parent }, enq) =>
          Match.value(event.output).pipe(
            Match.tagsExhaustive({
              Saved: () => {
                if (parent !== undefined) {
                  enq.sendTo(parent, {
                    type: "editorSaved",
                  } satisfies BodyWeightRouteChildEvent);
                }

                return {
                  target: "Idle" as const,
                  context: {
                    message: null,
                  },
                };
              },
              ValidationFailure: () => ({
                target: "Idle" as const,
                context: {
                  message: "Enter a positive weight in kilograms.",
                },
              }),
            })
          ),
        onError: {
          target: "Idle",
          context: {
            message: "Could not save this weight.",
          },
        },
      },
    },
    Deleting: {
      invoke: {
        src: "deleteBodyWeight",
        input: ({ context }) => ({
          dateKey: context.dateKey,
        }),
        onDone: ({ parent }, enq) => {
          if (parent !== undefined) {
            enq.sendTo(parent, {
              type: "editorDeleted",
            } satisfies BodyWeightRouteChildEvent);
          }

          return {
            target: "Idle" as const,
          };
        },
        onError: {
          target: "Idle",
          context: {
            message: "Could not delete this weight.",
          },
        },
      },
    },
  },
});

const bodyWeightImporterMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(BodyWeightImporterContext),
    events: {
      changeImportInput: Schema.toStandardSchemaV1(
        Schema.Struct({
          value: Schema.String,
        })
      ),
      close: Schema.toStandardSchemaV1(EmptyEvent),
      importWeights: Schema.toStandardSchemaV1(EmptyEvent),
    },
  },
  states: {
    Idle: {},
    Submitting: {},
  },
  actorSources: {
    importBodyWeights: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(ImportBodyWeightsInput),
        output: Schema.toStandardSchemaV1(ImportBodyWeightsOutput),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const bodyWeights = yield* BodyWeights.BodyWeights;

            yield* bodyWeights.importBatch({
              input: {
                text: input.value,
              },
            });

            return {
              _tag: "Imported" as const,
            };
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
          )
        ),
    }),
  },
}).createMachine({
  context: {
    input: "",
    message: null,
  },
  initial: "Idle",
  states: {
    Idle: {
      on: {
        changeImportInput: ({ event }) => ({
          context: {
            input: event.value,
            message: null,
          },
        }),
        close: ({ parent }, enq) => {
          if (parent !== undefined) {
            enq.sendTo(parent, {
              type: "importClosed",
            } satisfies BodyWeightRouteChildEvent);
          }

          return {};
        },
        importWeights: {
          target: "Submitting",
        },
      },
    },
    Submitting: {
      invoke: {
        src: "importBodyWeights",
        input: ({ context }) => ({
          value: context.input,
        }),
        onDone: ({ event, parent }, enq) =>
          Match.value(event.output).pipe(
            Match.tagsExhaustive({
              Imported: () => {
                if (parent !== undefined) {
                  enq.sendTo(parent, {
                    type: "weightsImported",
                  } satisfies BodyWeightRouteChildEvent);
                }

                return {
                  target: "Idle" as const,
                  context: {
                    message: null,
                  },
                };
              },
              ValidationFailure: ({ message }) => ({
                target: "Idle" as const,
                context: {
                  message,
                },
              }),
            })
          ),
        onError: {
          target: "Idle",
          context: {
            message: "Could not import these weights.",
          },
        },
      },
    },
  },
});

const BodyWeightEditorActor = Schema.declare<
  ActorRefFromLogic<typeof bodyWeightEditorMachine>
>(
  (value): value is ActorRefFromLogic<typeof bodyWeightEditorMachine> =>
    value instanceof Actor && value.logic === bodyWeightEditorMachine,
  {
    expected: "BodyWeightEditorActor",
  }
);

const BodyWeightImporterActor = Schema.declare<
  ActorRefFromLogic<typeof bodyWeightImporterMachine>
>(
  (value): value is ActorRefFromLogic<typeof bodyWeightImporterMachine> =>
    value instanceof Actor && value.logic === bodyWeightImporterMachine,
  {
    expected: "BodyWeightImporterActor",
  }
);

const bodyWeightRouteMachine = setup({
  schemas: {
    children: {
      bodyWeightEditor: Schema.toStandardSchemaV1(BodyWeightEditorActor),
      bodyWeightImporter: Schema.toStandardSchemaV1(BodyWeightImporterActor),
    },
    context: Schema.toStandardSchemaV1(BodyWeightRouteContext),
    events: {
      editorClosed: Schema.toStandardSchemaV1(EmptyEvent),
      editorDeleted: Schema.toStandardSchemaV1(EmptyEvent),
      editorSaved: Schema.toStandardSchemaV1(EmptyEvent),
      importClosed: Schema.toStandardSchemaV1(EmptyEvent),
      nextMonth: Schema.toStandardSchemaV1(EmptyEvent),
      openImport: Schema.toStandardSchemaV1(EmptyEvent),
      previousMonth: Schema.toStandardSchemaV1(EmptyEvent),
      reload: Schema.toStandardSchemaV1(EmptyEvent),
      selectDate: Schema.toStandardSchemaV1(
        Schema.Struct({
          dateKey: Domain.DateKey,
        })
      ),
      weightsImported: Schema.toStandardSchemaV1(EmptyEvent),
    },
    input: Schema.toStandardSchemaV1(BodyWeightRouteInput),
  },
  states: {
    Failed: {},
    Loading: {},
    Ready: {},
  },
  actorSources: {
    bodyWeightEditor: bodyWeightEditorMachine,
    bodyWeightImporter: bodyWeightImporterMachine,
    loadBodyWeight: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(LoadBodyWeightInput),
        output: Schema.toStandardSchemaV1(LoadBodyWeightOutput),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const bodyWeights = yield* BodyWeights.BodyWeights;
            const reports = yield* BodyWeightReports.BodyWeightReports;
            const monthRange = CalendarMonthModel.range({
              dateKey: input.dateKey,
            });
            const today = yield* Schema.decodeEffect(Domain.DateKey)(
              dateKeyFromDate({
                date: yield* DateTime.nowAsDate,
              })
            );
            const endDateKey = input.dateKey > today ? input.dateKey : today;
            const startDateKey = yield* Schema.decodeEffect(Domain.DateKey)(
              shiftDateKey({
                dateKey: endDateKey,
                days: -89,
              })
            );
            const monthEntries = yield* bodyWeights.listRange({
              input: monthRange,
            });
            const report = yield* reports.getRange({
              input: {
                endDateKey,
                startDateKey,
              },
            });

            return {
              monthEntries,
              report,
            };
          })
        ),
    }),
  },
}).createMachine({
  id: "bodyWeightRoute",
  context: ({ input }) => ({
    dateKey: input.dateKey,
    message: null,
    monthEntries: [],
    report: null,
  }),
  initial: "Loading",
  states: {
    Loading: {
      invoke: {
        src: "loadBodyWeight",
        input: ({ context }) => ({
          dateKey: context.dateKey,
        }),
        onDone: ({ context, event }) => ({
          target: "Ready",
          context: {
            message: context.message,
            monthEntries: event.output.monthEntries,
            report: event.output.report,
          },
        }),
        onError: {
          target: "Failed",
          context: {
            message: "Could not load weight data.",
          },
        },
      },
    },
    Failed: {
      on: {
        nextMonth: ({ context }) => ({
          target: "Loading",
          context: _monthNavigationContext({
            context,
            months: 1,
          }),
        }),
        previousMonth: ({ context }) => ({
          target: "Loading",
          context: _monthNavigationContext({
            context,
            months: -1,
          }),
        }),
        reload: {
          target: "Loading",
          context: {
            message: null,
          },
        },
      },
    },
    Ready: {
      initial: "Closed",
      on: {
        nextMonth: ({ context }) => ({
          target: "#bodyWeightRoute.Loading",
          context: _monthNavigationContext({
            context,
            months: 1,
          }),
        }),
        previousMonth: ({ context }) => ({
          target: "#bodyWeightRoute.Loading",
          context: _monthNavigationContext({
            context,
            months: -1,
          }),
        }),
        reload: {
          target: "#bodyWeightRoute.Loading",
          context: {
            message: null,
          },
        },
      },
      states: {
        Closed: {
          on: {
            openImport: {
              target: "ImportingForm",
              context: {
                message: null,
              },
            },
            selectDate: ({ event }) => ({
              target: "Editing",
              context: {
                dateKey: event.dateKey,
                message: null,
              },
            }),
          },
        },
        Editing: {
          invoke: {
            id: "bodyWeightEditor",
            src: "bodyWeightEditor",
            input: ({ context }) => ({
              dateKey: context.dateKey,
              selectedEntry: _findEntryForDateKey({
                dateKey: context.dateKey,
                entries: context.monthEntries,
              }),
            }),
          },
          on: {
            editorClosed: {
              target: "Closed",
              context: {
                message: null,
              },
            },
            editorDeleted: {
              target: "#bodyWeightRoute.Loading",
              context: {
                message: "Weight deleted.",
              },
            },
            editorSaved: {
              target: "#bodyWeightRoute.Loading",
              context: {
                message: null,
              },
            },
          },
        },
        ImportingForm: {
          invoke: {
            id: "bodyWeightImporter",
            src: "bodyWeightImporter",
          },
          on: {
            importClosed: {
              target: "Closed",
              context: {
                message: null,
              },
            },
            weightsImported: {
              target: "#bodyWeightRoute.Loading",
              context: {
                message: null,
              },
            },
          },
        },
      },
    },
  },
});

export function BodyWeightPanel({
  initialDateKey,
}: {
  readonly initialDateKey?: Domain.DateKey;
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
      onSome: (dateKey) => <BodyWeightRoute dateKey={dateKey} />,
    })
  );
}

function BodyWeightRoute({ dateKey }: { readonly dateKey: Domain.DateKey }) {
  const [snapshot, , actor] = useMachine(bodyWeightRouteMachine, {
    input: {
      dateKey,
    },
  });
  const isEditing = snapshot.matches("Ready.Editing");
  const isImportingForm = snapshot.matches("Ready.ImportingForm");
  const editorActor = isEditing
    ? snapshot.children.bodyWeightEditor
    : undefined;
  const importerActor = isImportingForm
    ? snapshot.children.bodyWeightImporter
    : undefined;
  const disabled = isEditing || isImportingForm || snapshot.matches("Loading");

  if (snapshot.matches("Loading")) {
    return (
      <View style={styles.centered}>
        <LoadingView message="Loading weight data..." />
      </View>
    );
  }

  if (snapshot.matches("Failed")) {
    return (
      <View style={styles.stack}>
        <BodyWeightMonthNavigator
          dateKey={snapshot.context.dateKey}
          disabled={false}
          onNextMonth={() => {
            actor.trigger.nextMonth();
          }}
          onPreviousMonth={() => {
            actor.trigger.previousMonth();
          }}
        />
        <Notice
          message={snapshot.context.message ?? "Could not load weight data."}
          title="Weight unavailable"
          tone="danger"
        />
        <Button
          icon={RotateCcw}
          onPress={() => {
            actor.trigger.reload();
          }}
          variant="secondary"
        >
          Retry
        </Button>
      </View>
    );
  }

  if (snapshot.context.report === null) {
    return (
      <View style={styles.centered}>
        <LoadingView message="Loading weight data..." />
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      {snapshot.context.message === null ||
      isEditing ||
      isImportingForm ? null : (
        <Notice message={snapshot.context.message} tone="neutral" />
      )}

      <BodyWeightCalendar
        dateKey={snapshot.context.dateKey}
        disabled={disabled}
        entries={snapshot.context.monthEntries}
        onImport={() => {
          actor.trigger.openImport();
        }}
        onNextMonth={() => {
          actor.trigger.nextMonth();
        }}
        onPreviousMonth={() => {
          actor.trigger.previousMonth();
        }}
        onSelectDate={(selectedDateKey) => {
          actor.trigger.selectDate({
            dateKey: selectedDateKey,
          });
        }}
      />
      {editorActor === undefined ? null : (
        <BodyWeightEntryDialog actor={editorActor} />
      )}
      {importerActor === undefined ? null : (
        <BodyWeightImportDialog actor={importerActor} />
      )}

      <BodyWeightSummary report={snapshot.context.report} />
      <BodyWeightTrend report={snapshot.context.report} />
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
  readonly onImport: () => void;
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
  actor,
}: {
  readonly actor: ActorRefFromLogic<typeof bodyWeightEditorMachine>;
}) {
  const snapshot = useSelector(actor, (snapshot) => snapshot);
  const dateKey = snapshot.context.dateKey;
  const deleting = snapshot.matches("Deleting");
  const disabled = deleting || snapshot.matches("Saving");
  const hasEntry = snapshot.context.selectedEntry !== null;
  const saving = snapshot.matches("Saving");
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
          actor.send({
            type: "close",
          });
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
          actor.send({
            type: "close",
          });
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
                  actor.send({
                    type: "close",
                  });
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
            {snapshot.context.message === null ? null : (
              <Notice message={snapshot.context.message} tone="neutral" />
            )}
            <NumberField
              accessibilityLabel="Weight in kilograms"
              autoFocus
              editable={!disabled}
              key={`${dateKey}-open`}
              onChangeText={(value) => {
                actor.send({
                  type: "changeWeight",
                  value,
                });
              }}
              placeholder="82.4"
              rightElement={<Text style={styles.unitText}>kg</Text>}
              selectTextOnFocus
              value={snapshot.context.weightInput}
            />
            <View style={styles.editorActions}>
              <Button
                disabled={disabled || !hasEntry}
                icon={Trash2}
                loading={deleting}
                onPress={() => {
                  actor.send({
                    type: "deleteWeight",
                  });
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
                  actor.send({
                    type: "save",
                  });
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
  actor,
}: {
  readonly actor: ActorRefFromLogic<typeof bodyWeightImporterMachine>;
}) {
  const snapshot = useSelector(actor, (snapshot) => snapshot);
  const importing = snapshot.matches("Submitting");
  const disabled = importing;
  const canImport = snapshot.context.input.trim().length > 0;

  return (
    <Modal
      animationType="fade"
      onRequestClose={() => {
        if (!disabled) {
          actor.send({
            type: "close",
          });
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
          actor.send({
            type: "close",
          });
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
                  actor.send({
                    type: "close",
                  });
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
            {snapshot.context.message === null ? null : (
              <Notice message={snapshot.context.message} tone="danger" />
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
                actor.send({
                  type: "changeImportInput",
                  value,
                });
              }}
              placeholder={"26-06-26 77.40\n26-06-23 77.40"}
              scrollEnabled
              value={snapshot.context.input}
            />
            <View style={styles.editorActions}>
              <Button
                disabled={disabled || !canImport}
                icon={Upload}
                loading={importing}
                onPress={() => {
                  actor.send({
                    type: "importWeights",
                  });
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
  const latestWeight = report.latestEntry?.weightKilograms ?? null;
  const weightedWeight = report.weightedWeightKilograms;
  const firstTrendPoint = report.trendPoints[0];
  const latestTrendPoint = report.trendPoints.at(-1);
  const trendChange =
    firstTrendPoint === undefined || latestTrendPoint === undefined
      ? null
      : latestTrendPoint.weightKilograms - firstTrendPoint.weightKilograms;

  return (
    <View style={styles.metricGrid}>
      <BodyWeightMetric
        label="Current"
        value={
          latestWeight === null
            ? "-"
            : _formatKilograms({
                value: latestWeight,
              })
        }
      />
      <BodyWeightMetric
        label="Progress"
        value={
          trendChange === null
            ? "-"
            : `${trendChange >= 0 ? "+" : "-"}${_formatKilograms({
                value: Math.abs(trendChange),
              })}`
        }
      />
      <BodyWeightMetric
        label="Estimate"
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
  if (!Array.isReadonlyArrayNonEmpty(report.entries)) {
    return (
      <View>
        <Text style={styles.emptyText}>No weight entries recorded.</Text>
      </View>
    );
  }

  const chart = ChartModel.make({ report });

  return (
    <View>
      <View style={styles.chartShell}>
        <Svg
          height={190}
          style={styles.chartSvg}
          viewBox="0 0 320 190"
          width="100%"
        >
          <Line
            stroke={color.divider}
            strokeWidth={1}
            x1={chart.paddingLeft}
            x2={chart.width - chart.paddingRight}
            y1={chart.height - chart.paddingBottom}
            y2={chart.height - chart.paddingBottom}
          />
          <Line
            stroke={color.divider}
            strokeWidth={1}
            x1={chart.paddingLeft}
            x2={chart.paddingLeft}
            y1={chart.paddingTop}
            y2={chart.height - chart.paddingBottom}
          />
          {chart.estimateGuide === null ? null : (
            <G>
              <Line
                opacity={0.62}
                stroke={color.nutritionEnergy}
                strokeDasharray={[3, 5]}
                strokeLinecap="round"
                strokeWidth={1.2}
                x1={chart.paddingLeft}
                x2={chart.width - chart.paddingRight}
                y1={chart.estimateGuide.y}
                y2={chart.estimateGuide.y}
              />
              <SvgText
                alignmentBaseline="middle"
                fill={color.textMuted}
                fontSize={10}
                fontWeight={tokens.type.weight.black}
                textAnchor="end"
                x={chart.paddingLeft - 5}
                y={chart.estimateGuide.y}
              >
                {chart.estimateGuide.label}
              </SvgText>
            </G>
          )}
          {chart.trendPath === "" ? null : (
            <Path
              d={chart.trendPath}
              fill="none"
              stroke={color.primary}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
            />
          )}
          {chart.stableTrendPath === "" ? null : (
            <Path
              d={chart.stableTrendPath}
              fill="none"
              stroke={color.nutritionEnergy}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.4}
            />
          )}
          {chart.rawPoints.map((point) => (
            <Circle
              cx={point.x}
              cy={point.y}
              fill={point.isOutlier ? color.warningText : color.textMuted}
              key={point.dateKey}
              opacity={point.isOutlier ? 0.68 : 0.56}
              r={point.isOutlier ? 3.8 : 2.8}
            />
          ))}
        </Svg>
        <View style={styles.chartFooter}>
          <Text numberOfLines={1} style={styles.chartDateRange}>
            {_formatChartDateLabel({ dateKey: chart.startDateKey })}
            {" - "}
            {_formatChartDateLabel({ dateKey: chart.endDateKey })}
          </Text>
          <View style={styles.chartLegend}>
            <View style={styles.chartLegendItem}>
              <View style={[styles.chartLegendMark, styles.chartLegendTrend]} />
              <Text numberOfLines={1} style={styles.chartLegendLabel}>
                Progress
              </Text>
            </View>
            <View style={styles.chartLegendItem}>
              <View
                style={[styles.chartLegendMark, styles.chartLegendStable]}
              />
              <Text numberOfLines={1} style={styles.chartLegendLabel}>
                Estimate
              </Text>
            </View>
          </View>
        </View>
      </View>
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

const ChartModel = {
  make({ report }: { readonly report: BodyWeightReportRange }) {
    const width = 320;
    const height = 190;
    const paddingTop = 14;
    const paddingRight = 2;
    const paddingBottom = 20;
    const paddingLeft = 10;
    const allWeights = [
      ...report.entries.map((entry) => entry.weightKilograms),
      ...report.trendPoints.map((point) => point.weightKilograms),
      ...report.stableTrendPoints.map((point) => point.weightKilograms),
      ...(report.weightedWeightKilograms === null
        ? []
        : [report.weightedWeightKilograms]),
    ];
    const dateKeys = [
      ...report.entries.map((entry) => entry.dateKey),
      ...report.trendPoints.map((point) => point.dateKey),
      ...report.stableTrendPoints.map((point) => point.dateKey),
    ].sort();
    const startDateKey = dateKeys[0] ?? report.startDateKey;
    const endDateKey = dateKeys.at(-1) ?? report.endDateKey;
    const minimumWeight = Math.min(...allWeights);
    const maximumWeight = Math.max(...allWeights);
    const weightRange = Math.max(1, maximumWeight - minimumWeight);
    const minimumDay = _dateKeyToDayIndex({ dateKey: startDateKey });
    const maximumDay = _dateKeyToDayIndex({ dateKey: endDateKey });
    const dayRange = Math.max(1, maximumDay - minimumDay);
    const xForDateKey = ({ dateKey }: { readonly dateKey: Domain.DateKey }) =>
      minimumDay === maximumDay
        ? width / 2
        : paddingLeft +
          ((_dateKeyToDayIndex({ dateKey }) - minimumDay) / dayRange) *
            (width - paddingLeft - paddingRight);
    const yForWeight = ({
      weightKilograms,
    }: {
      readonly weightKilograms: number;
    }) =>
      paddingTop +
      ((maximumWeight - weightKilograms) / weightRange) *
        (height - paddingTop - paddingBottom);
    const outlierDateKeys = report.outliers.map(
      (outlier) => outlier.entry.dateKey
    );
    const rawPoints = report.entries.map((entry) => ({
      dateKey: entry.dateKey,
      isOutlier: outlierDateKeys.includes(entry.dateKey),
      x: xForDateKey({ dateKey: entry.dateKey }),
      y: yForWeight({ weightKilograms: entry.weightKilograms }),
    }));
    const trendPath = report.trendPoints
      .map((point, index) => {
        const x = xForDateKey({ dateKey: point.dateKey });
        const y = yForWeight({ weightKilograms: point.weightKilograms });

        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
    const stableTrendPath = report.stableTrendPoints
      .map((point, index) => {
        const x = xForDateKey({ dateKey: point.dateKey });
        const y = yForWeight({ weightKilograms: point.weightKilograms });

        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
    const estimateGuide =
      report.weightedWeightKilograms === null
        ? null
        : (() => {
            const y = yForWeight({
              weightKilograms: report.weightedWeightKilograms,
            });

            return {
              label: _formatKilograms({
                value: report.weightedWeightKilograms,
              }),
              y,
            };
          })();

    return {
      estimateGuide,
      height,
      paddingBottom,
      paddingLeft,
      paddingRight,
      paddingTop,
      rawPoints,
      endDateKey,
      stableTrendPath,
      startDateKey,
      trendPath,
      width,
    };
  },
};

function _monthNavigationContext({
  context,
  months,
}: {
  readonly context: typeof BodyWeightRouteContext.Type;
  readonly months: number;
}) {
  const nextDateKey = CalendarMonthModel.shiftDateKey({
    dateKey: context.dateKey,
    months,
  });

  return {
    dateKey: nextDateKey,
    message: null,
    monthEntries: [],
    report: null,
  };
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
  stack: {
    gap: spacing.lg,
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
    gap: spacing.md,
    marginTop: spacing.md,
  },
  chartShell: {
    gap: spacing.sm,
  },
  chartSvg: {
    overflow: "visible",
  },
  chartFooter: {
    minWidth: 0,
    flexDirection: "row",
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
    flexShrink: 0,
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
  chartLegendTrend: {
    backgroundColor: color.primary,
  },
  chartLegendStable: {
    backgroundColor: color.nutritionEnergy,
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
