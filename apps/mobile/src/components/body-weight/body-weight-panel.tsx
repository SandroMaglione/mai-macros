import { EmptyEvent } from "@mai/machines";
import { BodyWeightReports, BodyWeights, Domain } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { Array, DateTime, Effect, Match, Option, Schema } from "effect";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { createAsyncLogic, setup } from "xstate";

import {
  Button,
  IconButton,
  LoadingView,
  Notice,
  NumberField,
  SectionCard,
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

const BodyWeightReportInsight = Schema.Struct({
  id: Schema.String,
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
  startDateKey: Domain.DateKey,
  trendPoints: Schema.Array(BodyWeightReportPoint),
});

type BodyWeightReportRange = typeof BodyWeightReportRange.Type;

const BodyWeightRouteInput = Schema.Struct({
  dateKey: Domain.DateKey,
});

const LoadBodyWeightInput = Schema.Struct({
  dateKey: Domain.DateKey,
});

const LoadBodyWeightOutput = Schema.Struct({
  report: BodyWeightReportRange,
  selectedEntry: Schema.NullOr(Domain.BodyWeightEntry),
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

const BodyWeightRouteContext = Schema.Struct({
  dateKey: Domain.DateKey,
  message: Schema.NullOr(Schema.String),
  report: Schema.NullOr(BodyWeightReportRange),
  selectedEntry: Schema.NullOr(Domain.BodyWeightEntry),
  weightInput: Schema.String,
});

const bodyWeightRouteMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(BodyWeightRouteContext),
    events: {
      changeWeight: Schema.toStandardSchemaV1(
        Schema.Struct({
          value: Schema.String,
        })
      ),
      deleteWeight: Schema.toStandardSchemaV1(EmptyEvent),
      nextDay: Schema.toStandardSchemaV1(EmptyEvent),
      previousDay: Schema.toStandardSchemaV1(EmptyEvent),
      reload: Schema.toStandardSchemaV1(EmptyEvent),
      save: Schema.toStandardSchemaV1(EmptyEvent),
    },
    input: Schema.toStandardSchemaV1(BodyWeightRouteInput),
  },
  states: {
    Deleting: {},
    Failed: {},
    Loading: {},
    Ready: {},
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
            const selectedEntry = yield* bodyWeights.findByDate({
              input: {
                dateKey: input.dateKey,
              },
            });
            const report = yield* reports.getRange({
              input: {
                endDateKey,
                startDateKey,
              },
            });

            return {
              report,
              selectedEntry,
            };
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
    report: null,
    selectedEntry: null,
    weightInput: "",
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
            report: event.output.report,
            selectedEntry: event.output.selectedEntry,
            weightInput:
              event.output.selectedEntry === null
                ? ""
                : formatNumber({
                    maximumFractionDigits: 2,
                    value: event.output.selectedEntry.weightKilograms,
                  }),
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
        nextDay: ({ context }) => ({
          target: "Loading",
          context: _dateNavigationContext({
            context,
            days: 1,
          }),
        }),
        previousDay: ({ context }) => ({
          target: "Loading",
          context: _dateNavigationContext({
            context,
            days: -1,
          }),
        }),
        reload: {
          target: "Loading",
        },
      },
    },
    Ready: {
      on: {
        changeWeight: ({ event }) => ({
          context: {
            message: null,
            weightInput: event.value,
          },
        }),
        deleteWeight: ({ context }) =>
          context.selectedEntry === null
            ? undefined
            : {
                target: "Deleting",
              },
        nextDay: ({ context }) => ({
          target: "Loading",
          context: _dateNavigationContext({
            context,
            days: 1,
          }),
        }),
        previousDay: ({ context }) => ({
          target: "Loading",
          context: _dateNavigationContext({
            context,
            days: -1,
          }),
        }),
        reload: {
          target: "Loading",
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
        onDone: ({ event }) =>
          Match.value(event.output).pipe(
            Match.tagsExhaustive({
              Saved: () => ({
                target: "Loading" as const,
                context: {
                  message: "Weight saved.",
                },
              }),
              ValidationFailure: () => ({
                target: "Ready" as const,
                context: {
                  message: "Enter a positive weight in kilograms.",
                },
              }),
            })
          ),
        onError: {
          target: "Ready",
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
        onDone: {
          target: "Loading",
          context: {
            message: "Weight deleted.",
          },
        },
        onError: {
          target: "Ready",
          context: {
            message: "Could not delete this weight.",
          },
        },
      },
    },
  },
});

export function BodyWeightPanel() {
  return Schema.decodeOption(Domain.DateKey)(todayDateKey()).pipe(
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
  const routeState = snapshot.value;
  const disabled = routeState === "Saving" || routeState === "Deleting";

  if (routeState === "Loading") {
    return (
      <View style={styles.centered}>
        <LoadingView message="Loading weight data..." />
      </View>
    );
  }

  if (routeState === "Failed") {
    return (
      <View style={styles.stack}>
        <BodyWeightDateNavigator
          dateKey={snapshot.context.dateKey}
          disabled={false}
          onNextDay={() => {
            actor.trigger.nextDay();
          }}
          onPreviousDay={() => {
            actor.trigger.previousDay();
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
      <BodyWeightDateNavigator
        dateKey={snapshot.context.dateKey}
        disabled={disabled}
        onNextDay={() => {
          actor.trigger.nextDay();
        }}
        onPreviousDay={() => {
          actor.trigger.previousDay();
        }}
      />

      {snapshot.context.message === null ? null : (
        <Notice message={snapshot.context.message} tone="neutral" />
      )}

      <BodyWeightEntryCard
        disabled={disabled}
        hasEntry={snapshot.context.selectedEntry !== null}
        onChangeWeight={(value) => {
          actor.trigger.changeWeight({ value });
        }}
        onDelete={() => {
          actor.trigger.deleteWeight();
        }}
        onSave={() => {
          actor.trigger.save();
        }}
        value={snapshot.context.weightInput}
      />

      <BodyWeightSummary report={snapshot.context.report} />
      <BodyWeightChart report={snapshot.context.report} />
      <BodyWeightInsights report={snapshot.context.report} />
    </View>
  );
}

function BodyWeightDateNavigator({
  dateKey,
  disabled,
  onNextDay,
  onPreviousDay,
}: {
  readonly dateKey: Domain.DateKey;
  readonly disabled: boolean;
  readonly onNextDay: () => void;
  readonly onPreviousDay: () => void;
}) {
  const displayedDateValue = new Date(`${dateKey}T00:00:00`);
  const today = todayDateKey();
  const label =
    dateKey === today
      ? "Today"
      : new Intl.DateTimeFormat("en-US", {
          day: "numeric",
          month: "short",
        }).format(displayedDateValue);
  const eyebrow = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
  }).format(displayedDateValue);

  return (
    <View style={styles.dateNavigator}>
      <IconButton
        accessibilityLabel="Previous weight date"
        disabled={disabled}
        icon={ChevronLeft}
        onPress={onPreviousDay}
      />
      <View style={styles.dateLabel}>
        <Calendar color={color.primary} size={18} strokeWidth={2.8} />
        <View style={styles.dateCopy}>
          <Text style={styles.dateEyebrow}>{eyebrow}</Text>
          <Text style={styles.dateText}>{label}</Text>
        </View>
      </View>
      <IconButton
        accessibilityLabel="Next weight date"
        disabled={disabled}
        icon={ChevronRight}
        onPress={onNextDay}
      />
    </View>
  );
}

function BodyWeightEntryCard({
  disabled,
  hasEntry,
  onChangeWeight,
  onDelete,
  onSave,
  value,
}: {
  readonly disabled: boolean;
  readonly hasEntry: boolean;
  readonly onChangeWeight: (value: string) => void;
  readonly onDelete: () => void;
  readonly onSave: () => void;
  readonly value: string;
}) {
  return (
    <SectionCard title="Weight">
      <View style={styles.entryForm}>
        <NumberField
          editable={!disabled}
          label="Kilograms"
          onChangeText={onChangeWeight}
          placeholder="82.4"
          rightElement={<Text style={styles.unitText}>kg</Text>}
          value={value}
        />
        <View style={styles.entryActions}>
          <Button
            disabled={disabled}
            icon={Save}
            loading={disabled}
            onPress={onSave}
            style={styles.entryAction}
          >
            Save
          </Button>
          {hasEntry ? (
            <Button
              disabled={disabled}
              icon={Trash2}
              onPress={onDelete}
              style={styles.entryAction}
              variant="danger"
            >
              Delete
            </Button>
          ) : null}
        </View>
      </View>
    </SectionCard>
  );
}

function BodyWeightSummary({
  report,
}: {
  readonly report: BodyWeightReportRange;
}) {
  const latestWeight = report.latestEntry?.weightKilograms ?? null;
  const firstTrendPoint = report.trendPoints[0];
  const latestTrendPoint = report.trendPoints.at(-1);
  const trendChange =
    firstTrendPoint === undefined || latestTrendPoint === undefined
      ? null
      : latestTrendPoint.weightKilograms - firstTrendPoint.weightKilograms;

  return (
    <View style={styles.metricGrid}>
      <BodyWeightMetric
        label="Latest"
        value={
          latestWeight === null
            ? "-"
            : _formatKilograms({
                value: latestWeight,
              })
        }
      />
      <BodyWeightMetric
        label="Trend"
        value={
          trendChange === null
            ? "-"
            : `${trendChange >= 0 ? "+" : "-"}${_formatKilograms({
                value: Math.abs(trendChange),
              })}`
        }
      />
      <BodyWeightMetric label="Entries" value={String(report.entries.length)} />
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

function BodyWeightChart({
  report,
}: {
  readonly report: BodyWeightReportRange;
}) {
  if (!Array.isReadonlyArrayNonEmpty(report.entries)) {
    return (
      <SectionCard title="Trend">
        <Text style={styles.emptyText}>No weight entries recorded.</Text>
      </SectionCard>
    );
  }

  const chart = ChartModel.make({ report });

  return (
    <SectionCard title="Trend">
      <View style={styles.chartShell}>
        <Svg height={190} viewBox="0 0 320 190" width="100%">
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
          {chart.rawPoints.map((point) => (
            <Circle
              cx={point.x}
              cy={point.y}
              fill={point.isOutlier ? color.warningText : color.text}
              key={point.dateKey}
              opacity={point.isOutlier ? 0.82 : 0.94}
              r={point.isOutlier ? 4.8 : 3.7}
            />
          ))}
        </Svg>
        <View style={styles.chartLabels}>
          <Text style={styles.chartLabel}>{report.startDateKey}</Text>
          <Text style={styles.chartLabel}>{report.endDateKey}</Text>
        </View>
      </View>
    </SectionCard>
  );
}

function BodyWeightInsights({
  report,
}: {
  readonly report: BodyWeightReportRange;
}) {
  return (
    <SectionCard title="Insights">
      {!Array.isReadonlyArrayNonEmpty(report.insights) ? (
        <Text style={styles.emptyText}>More entries will surface trends.</Text>
      ) : (
        <View style={styles.insightList}>
          {report.insights.map((insight) => (
            <View
              key={insight.id}
              style={[
                styles.insight,
                insight.tone === "positive"
                  ? styles.insightPositive
                  : insight.tone === "warning"
                    ? styles.insightWarning
                    : null,
              ]}
            >
              <Text style={styles.insightText}>{insight.text}</Text>
            </View>
          ))}
        </View>
      )}
    </SectionCard>
  );
}

const ChartModel = {
  make({ report }: { readonly report: BodyWeightReportRange }) {
    const width = 320;
    const height = 190;
    const paddingTop = 14;
    const paddingRight = 10;
    const paddingBottom = 20;
    const paddingLeft = 10;
    const allWeights = [
      ...report.entries.map((entry) => entry.weightKilograms),
      ...report.trendPoints.map((point) => point.weightKilograms),
    ];
    const minimumWeight = Math.min(...allWeights);
    const maximumWeight = Math.max(...allWeights);
    const weightRange = Math.max(1, maximumWeight - minimumWeight);
    const minimumDay = _dateKeyToDayIndex({ dateKey: report.startDateKey });
    const maximumDay = _dateKeyToDayIndex({ dateKey: report.endDateKey });
    const dayRange = Math.max(1, maximumDay - minimumDay);
    const xForDateKey = ({ dateKey }: { readonly dateKey: Domain.DateKey }) =>
      paddingLeft +
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

    return {
      height,
      paddingBottom,
      paddingLeft,
      paddingRight,
      paddingTop,
      rawPoints,
      trendPath,
      width,
    };
  },
};

function _dateNavigationContext({
  context,
  days,
}: {
  readonly context: typeof BodyWeightRouteContext.Type;
  readonly days: number;
}) {
  const nextDateKey = Schema.decodeOption(Domain.DateKey)(
    shiftDateKey({
      dateKey: context.dateKey,
      days,
    })
  ).pipe(Option.getOrElse(() => context.dateKey));

  return {
    dateKey: nextDateKey,
    message: null,
    report: null,
    selectedEntry: null,
    weightInput: "",
  };
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
    maximumFractionDigits: value < 10 ? 1 : 0,
    value,
  })} kg`;
}

const styles = StyleSheet.create({
  centered: {
    minHeight: 220,
    justifyContent: "center",
  },
  stack: {
    gap: spacing.lg,
  },
  dateNavigator: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  dateLabel: {
    minWidth: 0,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: color.surface,
  },
  dateCopy: {
    minWidth: 0,
    alignItems: "center",
  },
  dateEyebrow: {
    color: color.textSubtle,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xs,
    textTransform: "uppercase",
  },
  dateText: {
    color: color.text,
    fontSize: tokens.type.size.lg,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.lg,
  },
  entryForm: {
    gap: spacing.lg,
  },
  unitText: {
    color: color.textMuted,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.md,
  },
  entryActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  entryAction: {
    minWidth: 0,
    flex: 1,
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
  chartShell: {
    gap: spacing.xs,
  },
  chartLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  chartLabel: {
    color: color.textSubtle,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.xs,
  },
  emptyText: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.sm,
  },
  insightList: {
    gap: spacing.sm,
  },
  insight: {
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: color.field,
  },
  insightPositive: {
    borderColor: color.successBorder,
    backgroundColor: color.successBg,
  },
  insightWarning: {
    borderColor: color.warningBorder,
    backgroundColor: color.warningBg,
  },
  insightText: {
    color: color.text,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.sm,
  },
});
