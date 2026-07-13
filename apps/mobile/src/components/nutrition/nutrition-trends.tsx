import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { LoadingView } from "@/components/ui/loading-view";
import { Notice } from "@/components/ui/notice";
import { dateKeyFromDate, todayDateKey } from "@/lib/date-keys";
import { formatNumber } from "@/lib/format";
import { RuntimeClient } from "@/lib/runtime-client";
import { color, radius, shadow, spacing, tokens } from "@/theme/tokens";
import { EmptyEvent } from "@mai/machines";
import { Domain, NutritionReports, Reporting } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { Array, Effect, Option, Schema } from "effect";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";
import { createAsyncLogic, setup } from "xstate";

import { isInsideNutritionTargetMargin } from "@/lib/nutrition-target-trend";

const NutritionTrendMetric = Schema.Literals([
  "energyKcal",
  "proteinGrams",
  "carbsGrams",
  "fatGrams",
  "fiberGrams",
  "sugarGrams",
  "saturatedFatGrams",
  "saltGrams",
]);

type NutritionTrendMetric = typeof NutritionTrendMetric.Type;

const NutritionTrendMetricContext = Schema.Struct({
  nutrientName: NutritionTrendMetric,
});

const nutritionTrendMetricMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(NutritionTrendMetricContext),
    events: {
      selectMetric: Schema.toStandardSchemaV1(
        Schema.Struct({
          nutrientName: NutritionTrendMetric,
        })
      ),
    },
  },
}).createMachine({
  context: {
    nutrientName: "energyKcal",
  },
  on: {
    selectMetric: ({ event }) => ({
      context: {
        nutrientName: event.nutrientName,
      },
    }),
  },
});

const NutritionCalendarDay = Schema.Struct({
  dateKey: Domain.DateKey,
  hasEntries: Schema.Boolean,
  isInsideTargetMargin: Schema.Boolean,
});

const NutritionCalendarInput = Schema.Struct({
  dateKey: Domain.DateKey,
});

const NutritionCalendarContext = Schema.Struct({
  dateKey: Domain.DateKey,
  days: Schema.Array(NutritionCalendarDay),
  message: Schema.NullOr(Schema.String),
});

const LoadNutritionCalendarInput = Schema.Struct({
  dateKey: Domain.DateKey,
});

const LoadNutritionCalendarOutput = Schema.Struct({
  days: Schema.Array(NutritionCalendarDay),
});

const nutritionCalendarMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(NutritionCalendarContext),
    events: {
      nextMonth: Schema.toStandardSchemaV1(EmptyEvent),
      previousMonth: Schema.toStandardSchemaV1(EmptyEvent),
      retry: Schema.toStandardSchemaV1(EmptyEvent),
    },
    input: Schema.toStandardSchemaV1(NutritionCalendarInput),
  },
  states: {
    Failed: {},
    Loading: {},
    Ready: {},
  },
  actorSources: {
    loadMonth: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(LoadNutritionCalendarInput),
        output: Schema.toStandardSchemaV1(LoadNutritionCalendarOutput),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const reports = yield* NutritionReports.NutritionReports;
            const range = CalendarMonthModel.range({
              dateKey: input.dateKey,
            });
            const report = yield* reports.getRange({
              input: range,
            });

            return {
              days: report.days.map((day) => ({
                dateKey: day.dateKey,
                hasEntries: Array.isReadonlyArrayNonEmpty(day.entries),
                isInsideTargetMargin:
                  Array.isReadonlyArrayNonEmpty(day.targetStatuses) &&
                  day.targetStatuses.every((status) =>
                    isInsideNutritionTargetMargin({
                      actual: status.value,
                      semantics: status.semantics,
                      target: status.amount,
                    })
                  ),
              })),
            };
          })
        ),
    }),
  },
}).createMachine({
  context: ({ input }) => ({
    dateKey: input.dateKey,
    days: [],
    message: null,
  }),
  initial: "Loading",
  states: {
    Loading: {
      invoke: {
        src: "loadMonth",
        input: ({ context }) => ({
          dateKey: context.dateKey,
        }),
        onDone: ({ event }) => ({
          target: "Ready",
          context: {
            days: event.output.days,
            message: null,
          },
        }),
        onError: {
          target: "Failed",
          context: {
            message: "Could not load this nutrition month.",
          },
        },
      },
    },
    Ready: {
      on: {
        nextMonth: ({ context }) => ({
          target: "Loading",
          context: _calendarNavigationContext({
            context,
            months: 1,
          }),
        }),
        previousMonth: ({ context }) => ({
          target: "Loading",
          context: _calendarNavigationContext({
            context,
            months: -1,
          }),
        }),
      },
    },
    Failed: {
      on: {
        nextMonth: ({ context }) => ({
          target: "Loading",
          context: _calendarNavigationContext({
            context,
            months: 1,
          }),
        }),
        previousMonth: ({ context }) => ({
          target: "Loading",
          context: _calendarNavigationContext({
            context,
            months: -1,
          }),
        }),
        retry: {
          target: "Loading",
          context: {
            message: null,
          },
        },
      },
    },
  },
});

const trendMetrics = [
  "energyKcal",
  "proteinGrams",
  "carbsGrams",
  "fatGrams",
  "fiberGrams",
  "sugarGrams",
  "saturatedFatGrams",
  "saltGrams",
] as const satisfies readonly NutritionTrendMetric[];

const metricLabels = {
  carbsGrams: "Carbs",
  energyKcal: "Calories",
  fatGrams: "Fat",
  fiberGrams: "Fiber",
  proteinGrams: "Protein",
  saltGrams: "Salt",
  saturatedFatGrams: "Saturated fat",
  sugarGrams: "Sugar",
} satisfies Record<NutritionTrendMetric, string>;

const metricAbbreviations = {
  carbsGrams: "Carb",
  energyKcal: "Cal",
  fatGrams: "Fat",
  fiberGrams: "Fib",
  proteinGrams: "Pro",
  saltGrams: "Salt",
  saturatedFatGrams: "Sat",
  sugarGrams: "Sug",
} satisfies Record<NutritionTrendMetric, string>;

const metricColors = {
  carbsGrams: color.nutritionCarbs,
  energyKcal: color.nutritionEnergy,
  fatGrams: color.nutritionFat,
  fiberGrams: color.nutritionFiber,
  proteinGrams: color.nutritionProtein,
  saltGrams: color.nutritionSalt,
  saturatedFatGrams: color.warningText,
  sugarGrams: color.nutritionSugar,
} satisfies Record<NutritionTrendMetric, string>;

export function NutritionTrends({
  currentReport,
  onSelectDate,
}: {
  readonly currentReport: NutritionReports.NutritionReportRange;
  readonly onSelectDate: (dateKey: Domain.DateKey) => void;
}) {
  return (
    <View style={styles.root}>
      <NutritionTrendChart report={currentReport} />
      <NutritionCalendar
        initialDateKey={currentReport.endDateKey}
        onSelectDate={onSelectDate}
      />
    </View>
  );
}

function NutritionTrendChart({
  report,
}: {
  readonly report: NutritionReports.NutritionReportRange;
}) {
  const [snapshot, , actor] = useMachine(nutritionTrendMetricMachine);
  const nutrientName = snapshot.context.nutrientName;
  const chart = NutritionChartModel.make({
    nutrientName,
    report,
  });
  const unit = nutrientName === "energyKcal" ? "kcal" : "g";

  return (
    <View style={styles.chartSection}>
      {!Array.isReadonlyArrayNonEmpty(chart.rawPoints) ? (
        <Text style={styles.emptyText}>
          Record nutrition days to display this trend.
        </Text>
      ) : (
        <View style={styles.chartShell}>
          <Svg height={208} viewBox="0 0 320 208" width="100%">
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
            <SvgText
              fill={color.textSubtle}
              fontSize={9}
              textAnchor="end"
              x={chart.paddingLeft - 5}
              y={chart.paddingTop + 3}
            >
              {`${formatNumber({
                maximumFractionDigits: 0,
                value: chart.maximumValue,
              })} ${unit}`}
            </SvgText>
            {chart.targetPath === "" ? null : (
              <Path
                d={chart.targetPath}
                fill="none"
                opacity={0.72}
                stroke={color.textMuted}
                strokeDasharray={[4, 5]}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.4}
              />
            )}
            {chart.averagePath === "" ? null : (
              <Path
                d={chart.averagePath}
                fill="none"
                stroke={metricColors[nutrientName]}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
              />
            )}
            {chart.rawPoints.map((point) => (
              <Circle
                cx={point.x}
                cy={point.y}
                fill={metricColors[nutrientName]}
                key={point.dateKey}
                opacity={0.52}
                r={3}
              />
            ))}
          </Svg>
          <View style={styles.chartFooter}>
            <Text style={styles.chartDateRange}>
              {_formatShortDate({ dateKey: report.startDateKey })}
              {" – "}
              {_formatShortDate({ dateKey: report.endDateKey })}
            </Text>
            <View style={styles.chartLegend}>
              <ChartLegendItem
                color={metricColors[nutrientName]}
                label="7d avg"
              />
              <ChartLegendItem color={color.textMuted} label="Target" />
            </View>
          </View>
        </View>
      )}
      <View accessibilityRole="tablist" style={styles.metricSelector}>
        {trendMetrics.map((metric) => {
          const selected = nutrientName === metric;
          const metricColor = metricColors[metric];

          return (
            <Pressable
              accessibilityLabel={metricLabels[metric]}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={metric}
              onPress={() => {
                actor.trigger.selectMetric({
                  nutrientName: metric,
                });
              }}
              style={({ pressed }) => [
                styles.metricSelectorButton,
                selected
                  ? {
                      backgroundColor: metricColor,
                      borderColor: metricColor,
                    }
                  : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <View
                style={[
                  styles.metricSelectorDot,
                  {
                    backgroundColor: selected ? color.bg : metricColor,
                  },
                ]}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.metricSelectorLabel,
                  selected ? styles.metricSelectorLabelSelected : null,
                ]}
              >
                {metricAbbreviations[metric]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ChartLegendItem({
  color: legendColor,
  label,
}: {
  readonly color: string;
  readonly label: string;
}) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendMark, { backgroundColor: legendColor }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

function NutritionCalendar({
  initialDateKey,
  onSelectDate,
}: {
  readonly initialDateKey: Domain.DateKey;
  readonly onSelectDate: (dateKey: Domain.DateKey) => void;
}) {
  const [snapshot, , actor] = useMachine(nutritionCalendarMachine, {
    input: {
      dateKey: initialDateKey,
    },
  });
  const calendar = CalendarMonthModel.make({
    dateKey: snapshot.context.dateKey,
    days: snapshot.context.days,
  });

  return (
    <View style={styles.calendarSection}>
      <View style={styles.monthNavigator}>
        <Text style={styles.monthLabel}>
          {CalendarMonthModel.monthLabel({
            dateKey: snapshot.context.dateKey,
          })}
        </Text>
        <View style={styles.monthControls}>
          <IconButton
            accessibilityLabel="Previous nutrition month"
            disabled={snapshot.matches("Loading")}
            icon={ChevronLeft}
            onPress={actor.trigger.previousMonth}
          />
          <IconButton
            accessibilityLabel="Next nutrition month"
            disabled={snapshot.matches("Loading")}
            icon={ChevronRight}
            onPress={actor.trigger.nextMonth}
          />
        </View>
      </View>
      {snapshot.matches("Loading") ? (
        <View style={styles.calendarLoading}>
          <LoadingView message="Loading nutrition month..." />
        </View>
      ) : snapshot.matches("Failed") ? (
        <View style={styles.calendarFailure}>
          <Notice
            message={
              snapshot.context.message ?? "Could not load this nutrition month."
            }
            tone="warning"
          />
          <Button onPress={actor.trigger.retry} variant="secondary">
            Retry month
          </Button>
        </View>
      ) : (
        <View style={styles.calendarBody}>
          <View style={styles.weekdayRow}>
            {CalendarWeekdays.map((weekday) => (
              <Text key={weekday} style={styles.weekdayLabel}>
                {weekday}
              </Text>
            ))}
          </View>
          <View style={styles.calendarGrid}>
            {calendar.weeks.map((week, weekIndex) => (
              <View key={`nutrition-week-${weekIndex}`} style={styles.weekRow}>
                {week.map((cell) => (
                  <Pressable
                    accessibilityLabel={cell.accessibilityLabel}
                    accessibilityRole="button"
                    disabled={!cell.isCurrentMonth}
                    key={cell.dateKey}
                    onPress={() => {
                      onSelectDate(cell.dateKey);
                    }}
                    style={({ pressed }) => [
                      styles.calendarCell,
                      !cell.isCurrentMonth ? styles.calendarCellOutside : null,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.calendarDay,
                        !cell.isCurrentMonth ? styles.calendarDayOutside : null,
                        cell.isFuture
                          ? styles.calendarDayFuture
                          : cell.isCurrentMonth && cell.status === "none"
                            ? styles.calendarDayUnrecorded
                            : null,
                        cell.isToday ? styles.calendarDayToday : null,
                      ]}
                    >
                      {cell.dayLabel}
                    </Text>
                    {cell.status === "none" ? null : (
                      <View
                        style={[
                          styles.calendarStatus,
                          calendarStatusStyles[cell.status],
                        ]}
                      />
                    )}
                  </Pressable>
                ))}
              </View>
            ))}
          </View>
          <View style={styles.calendarLegend}>
            <CalendarLegendItem label="Inside targets" status="inside" />
            <CalendarLegendItem label="Outside targets" status="outside" />
            <CalendarLegendItem label="Empty day" status="empty" />
          </View>
        </View>
      )}
    </View>
  );
}

type CalendarStatus = "empty" | "inside" | "none" | "outside";

function CalendarLegendItem({
  label,
  status,
}: {
  readonly label: string;
  readonly status: Exclude<CalendarStatus, "none">;
}) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.calendarStatus, calendarStatusStyles[status]]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const calendarStatusStyles = StyleSheet.create({
  empty: {
    backgroundColor: color.textSubtle,
  },
  inside: {
    backgroundColor: color.successText,
  },
  outside: {
    backgroundColor: color.warningText,
  },
}) satisfies Record<Exclude<CalendarStatus, "none">, object>;

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
    days,
  }: {
    readonly dateKey: Domain.DateKey;
    readonly days: readonly (typeof NutritionCalendarDay.Type)[];
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
        const isFuture = isCurrentMonth && cellDateKey > today;
        const day = days.find((candidate) => candidate.dateKey === cellDateKey);
        const status: CalendarStatus =
          !isCurrentMonth || day === undefined
            ? "none"
            : !day.hasEntries
              ? "empty"
              : day.isInsideTargetMargin
                ? "inside"
                : "outside";
        const fullDateLabel = new Intl.DateTimeFormat("en-US", {
          day: "numeric",
          month: "long",
          weekday: "long",
          year: "numeric",
        }).format(cellDate);
        const statusLabel = {
          empty: "empty nutrition log",
          inside: "inside nutrition targets",
          none: "no nutrition log",
          outside: "outside nutrition targets",
        } satisfies Record<CalendarStatus, string>;

        const accessibilityStatus =
          isFuture && status === "none" ? "future date" : statusLabel[status];

        return {
          accessibilityLabel: `${fullDateLabel}, ${accessibilityStatus}`,
          dateKey: cellDateKey,
          dayLabel: String(cellDate.getDate()),
          isCurrentMonth,
          isFuture,
          isToday: cellDateKey === today,
          status,
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
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
    }).format(CalendarMonthModel.dateFromDateKey({ dateKey }));
  },
  range({ dateKey }: { readonly dateKey: Domain.DateKey }) {
    const date = CalendarMonthModel.dateFromDateKey({ dateKey });

    return {
      endDateKey: CalendarMonthModel.dateKeyFromDate({
        date: new Date(date.getFullYear(), date.getMonth() + 1, 0),
        fallbackDateKey: dateKey,
      }),
      startDateKey: CalendarMonthModel.dateKeyFromDate({
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
    const date = CalendarMonthModel.dateFromDateKey({ dateKey });
    const targetMonth = date.getMonth() + months;
    const targetMonthEnd = new Date(date.getFullYear(), targetMonth + 1, 0);

    return CalendarMonthModel.dateKeyFromDate({
      date: new Date(
        date.getFullYear(),
        targetMonth,
        Math.min(date.getDate(), targetMonthEnd.getDate())
      ),
      fallbackDateKey: dateKey,
    });
  },
};

const NutritionChartModel = {
  make({
    nutrientName,
    report,
  }: {
    readonly nutrientName: NutritionTrendMetric;
    readonly report: NutritionReports.NutritionReportRange;
  }) {
    const width = 320;
    const height = 208;
    const paddingLeft = 42;
    const paddingRight = 12;
    const paddingTop = 18;
    const paddingBottom = 30;
    const startDayIndex = _dateKeyToDayIndex({
      dateKey: report.startDateKey,
    });
    const endDayIndex = _dateKeyToDayIndex({
      dateKey: report.endDateKey,
    });
    const daySpan = Math.max(1, endDayIndex - startDayIndex);
    const rawValues = report.days.map((day) => day.totals[nutrientName]);
    const targetValues = report.days.flatMap((day) => {
      const target = Reporting.getPlanNutrientTargetAmount({
        nutrientName,
        plan: day.plan,
      });

      return target === undefined ? [] : [target];
    });
    const maximumValue = Math.max(1, ...rawValues, ...targetValues);
    const xForDateKey = ({ dateKey }: { readonly dateKey: Domain.DateKey }) =>
      paddingLeft +
      ((_dateKeyToDayIndex({ dateKey }) - startDayIndex) / daySpan) *
        (width - paddingLeft - paddingRight);
    const yForValue = ({ value }: { readonly value: number }) =>
      paddingTop +
      (1 - value / maximumValue) * (height - paddingTop - paddingBottom);
    const rawPoints = report.days.map((day) => ({
      dateKey: day.dateKey,
      x: xForDateKey({ dateKey: day.dateKey }),
      y: yForValue({ value: day.totals[nutrientName] }),
    }));
    const averagePoints = report.days.map((day) => {
      const referenceIndex = _dateKeyToDayIndex({ dateKey: day.dateKey });
      const days = report.days.filter((candidate) => {
        const candidateIndex = _dateKeyToDayIndex({
          dateKey: candidate.dateKey,
        });
        const distance = referenceIndex - candidateIndex;

        return distance >= 0 && distance <= 6;
      });
      const average = !Array.isReadonlyArrayNonEmpty(days)
        ? 0
        : days.reduce(
            (total, candidate) => total + candidate.totals[nutrientName],
            0
          ) / days.length;

      return {
        dateKey: day.dateKey,
        value: average,
      };
    });
    const targetPoints = report.days.flatMap((day) => {
      const target = Reporting.getPlanNutrientTargetAmount({
        nutrientName,
        plan: day.plan,
      });

      return target === undefined
        ? []
        : [
            {
              dateKey: day.dateKey,
              value: target,
            },
          ];
    });

    return {
      averagePath: _chartPath({
        points: averagePoints,
        xForDateKey,
        yForValue,
      }),
      height,
      maximumValue,
      paddingBottom,
      paddingLeft,
      paddingRight,
      paddingTop,
      rawPoints,
      targetPath: _chartPath({
        points: targetPoints,
        xForDateKey,
        yForValue,
      }),
      width,
    };
  },
};

function _chartPath({
  points,
  xForDateKey,
  yForValue,
}: {
  readonly points: readonly {
    readonly dateKey: Domain.DateKey;
    readonly value: number;
  }[];
  readonly xForDateKey: (input: { readonly dateKey: Domain.DateKey }) => number;
  readonly yForValue: (input: { readonly value: number }) => number;
}) {
  return points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${xForDateKey({
          dateKey: point.dateKey,
        }).toFixed(2)} ${yForValue({ value: point.value }).toFixed(2)}`
    )
    .join(" ");
}

function _calendarNavigationContext({
  context,
  months,
}: {
  readonly context: typeof NutritionCalendarContext.Type;
  readonly months: number;
}) {
  return {
    dateKey: CalendarMonthModel.shift({
      dateKey: context.dateKey,
      months,
    }),
    days: [],
    message: null,
  };
}

function _dateKeyToDayIndex({ dateKey }: { readonly dateKey: Domain.DateKey }) {
  const [yearString, monthString, dayString] = dateKey.split("-");

  return Math.floor(
    Date.UTC(
      Number(yearString),
      Number(monthString) - 1,
      Number(dayString),
      12
    ) / 86_400_000
  );
}

function _formatShortDate({ dateKey }: { readonly dateKey: Domain.DateKey }) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
  }).format(CalendarMonthModel.dateFromDateKey({ dateKey }));
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.xxxl,
  },
  chartSection: {
    gap: spacing.md,
  },
  metricSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  metricSelectorButton: {
    minWidth: "22%",
    flexGrow: 1,
    flexBasis: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
    backgroundColor: color.surface,
  },
  metricSelectorDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
  metricSelectorLabel: {
    color: color.textMuted,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xs,
  },
  metricSelectorLabelSelected: {
    color: color.bg,
  },
  chartShell: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.md,
    paddingTop: spacing.sm,
    backgroundColor: color.surface,
    ...shadow.card,
  },
  chartFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: color.sheetBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chartDateRange: {
    color: color.textMuted,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.xs,
  },
  chartLegend: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  legendMark: {
    width: 14,
    height: 3,
    borderRadius: radius.pill,
  },
  legendLabel: {
    color: color.textMuted,
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
  calendarSection: {
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  monthNavigator: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  monthLabel: {
    color: color.text,
    fontSize: tokens.type.size.lg,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.lg,
  },
  monthControls: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  calendarLoading: {
    minHeight: 220,
    justifyContent: "center",
  },
  calendarFailure: {
    gap: spacing.md,
  },
  calendarBody: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    ...shadow.card,
  },
  weekdayRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: color.sheetBorder,
  },
  weekdayLabel: {
    minWidth: 0,
    flex: 1,
    paddingVertical: spacing.sm,
    color: color.textMuted,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xs,
    textAlign: "center",
  },
  calendarGrid: {
    padding: spacing.xs,
  },
  weekRow: {
    flexDirection: "row",
  },
  calendarCell: {
    minWidth: 0,
    minHeight: 48,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: radius.sm,
  },
  calendarCellOutside: {
    opacity: 0.25,
  },
  calendarDay: {
    color: color.text,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.sm,
  },
  calendarDayOutside: {
    color: color.textSubtle,
  },
  calendarDayUnrecorded: {
    opacity: 0.38,
  },
  calendarDayFuture: {
    color: color.textSubtle,
    fontWeight: tokens.type.weight.semibold,
    opacity: 0.68,
  },
  calendarDayToday: {
    color: color.primary,
  },
  calendarStatus: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
  },
  calendarLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: color.sheetBorder,
    padding: spacing.md,
  },
  pressed: {
    opacity: 0.82,
  },
});
