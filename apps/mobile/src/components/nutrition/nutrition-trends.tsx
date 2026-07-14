import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { LoadingView } from "@/components/ui/loading-view";
import { Notice } from "@/components/ui/notice";
import { PagerTabBar } from "@/components/ui/pager-tabs";
import { dateKeyFromDate, todayDateKey } from "@/lib/date-keys";
import { formatNumber, niceLinearDomain } from "@/lib/format";
import { RuntimeClient } from "@/lib/runtime-client";
import { color, radius, shadow, spacing, tokens } from "@/theme/tokens";
import { EmptyEvent } from "@mai/machines";
import { Domain, NutritionReports } from "@mai/nutrition";
import {
  Circle as SkiaCircle,
  DashPathEffect,
  Rect as SkiaRect,
} from "@shopify/react-native-skia";
import { useMachine } from "@xstate/react";
import { Array, Effect, Option, Schema } from "effect";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  Bar,
  CartesianChart,
  Line,
  Scatter,
  useChartPressState,
} from "victory-native";
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

const NutritionChartKind = Schema.Literals(["trend", "daily"]);

const NutritionTrendMetricContext = Schema.Struct({
  chartKind: NutritionChartKind,
  nutrientName: NutritionTrendMetric,
});

const nutritionTrendMetricMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(NutritionTrendMetricContext),
    events: {
      selectChartKind: Schema.toStandardSchemaV1(
        Schema.Struct({
          chartKind: NutritionChartKind,
        })
      ),
      selectMetric: Schema.toStandardSchemaV1(
        Schema.Struct({
          nutrientName: NutritionTrendMetric,
        })
      ),
    },
  },
}).createMachine({
  context: {
    chartKind: "trend",
    nutrientName: "energyKcal",
  },
  on: {
    selectChartKind: ({ event }) => ({
      context: {
        chartKind: event.chartKind,
      },
    }),
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

const nutritionChartTabs = [
  {
    accessibilityLabel: "Show nutrition trend chart",
    key: "trend",
    label: "Trend",
  },
  {
    accessibilityLabel: "Show daily nutrition bar chart",
    key: "daily",
    label: "Daily",
  },
] as const;

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
  const chartKind = snapshot.context.chartKind;
  const nutrientName = snapshot.context.nutrientName;
  const chart = NutritionChartDataModel.make({
    nutrientName,
    report,
  });
  const unit = nutrientName === "energyKcal" ? "kcal" : "g";
  const unitLabel = nutrientName === "energyKcal" ? "Kilocalories" : "Grams";
  const { state: pressState, isActive: isPressActive } = useChartPressState({
    x: 0,
    y: {
      actual: 0,
      average: 0,
      target: 0,
    },
  });
  const scaleSteps = [0.25, 0.5, 0.75].map((ratio) => ({
    top: 10 + (1 - ratio) * 212 - 6,
    value: chart.maximumValue * ratio,
  }));

  return (
    <View style={styles.chartSection}>
      <PagerTabBar
        activeIndex={chartKind === "trend" ? 0 : 1}
        onActiveIndexChange={(index) => {
          actor.trigger.selectChartKind({
            chartKind: index === 0 ? "trend" : "daily",
          });
        }}
        tabs={nutritionChartTabs}
      />
      {!Array.isReadonlyArrayNonEmpty(chart.data) ? (
        <Text style={styles.emptyText}>
          Record nutrition days to display this trend.
        </Text>
      ) : (
        <View
          accessibilityLabel={`${metricLabels[nutrientName]} ${chartKind === "trend" ? "trend" : "daily bars"} from ${_formatShortDate({ dateKey: report.startDateKey })} to ${_formatShortDate({ dateKey: report.endDateKey })}. Touch and drag across the chart for daily values.`}
          accessible
          style={styles.chartShell}
        >
          <View style={styles.chartReferenceSummary}>
            <Text style={styles.chartReferenceUnit}>{unitLabel}</Text>
            {chart.targetReference === null ? null : (
              <Text style={styles.chartTargetReferenceSummary}>
                {chart.targetReference.label}
              </Text>
            )}
          </View>
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
              domain={{ y: [0, chart.maximumValue] }}
              domainPadding={{ left: 10, right: 10 }}
              frame={{
                lineColor: color.divider,
                lineWidth: { bottom: 0, left: 0, right: 0, top: 0 },
              }}
              padding={{ bottom: 10, left: 44, right: 24, top: 10 }}
              xKey="dayIndex"
              yKeys={["actual", "average", "target"]}
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
                      y={yScale(step.value)}
                    />
                  ))}
                  {chartKind === "trend" ? (
                    <>
                      <Line
                        color={metricColors[nutrientName]}
                        connectMissingData={false}
                        curveType="natural"
                        points={points.average}
                        strokeCap="round"
                        strokeJoin="round"
                        strokeWidth={3}
                      />
                      <Scatter
                        color={metricColors[nutrientName]}
                        opacity={0.52}
                        points={points.actual}
                        radius={3}
                      />
                    </>
                  ) : (
                    <Bar
                      chartBounds={chartBounds}
                      color={metricColors[nutrientName]}
                      innerPadding={0.32}
                      points={points.actual}
                      roundedCorners={{ topLeft: 3, topRight: 3 }}
                    />
                  )}
                  <Line
                    color={color.textMuted}
                    connectMissingData={false}
                    opacity={0.72}
                    points={points.target}
                    strokeCap="round"
                    strokeWidth={1.4}
                  >
                    <DashPathEffect intervals={[4, 5]} />
                  </Line>
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
                        color={metricColors[nutrientName]}
                        cx={pressState.x.position}
                        cy={pressState.y.actual.position}
                        r={4.5}
                      />
                    </>
                  ) : null}
                </>
              )}
            </CartesianChart>
            <View pointerEvents="none" style={styles.chartPlotOverlay}>
              <Text numberOfLines={1} style={styles.chartScaleMaximum}>
                {_formatNutritionChartAxisValue({
                  unit,
                  value: chart.maximumValue,
                })}
              </Text>
              {scaleSteps.map((step) => (
                <Text
                  key={step.value}
                  numberOfLines={1}
                  style={[styles.chartScaleStep, { top: step.top }]}
                >
                  {_formatNutritionChartAxisValue({ unit, value: step.value })}
                </Text>
              ))}
            </View>
          </View>
          <View style={styles.chartFooter}>
            <Text style={styles.chartDateRange}>
              {_formatShortDate({ dateKey: report.startDateKey })}
              {" – "}
              {_formatShortDate({ dateKey: report.endDateKey })}
            </Text>
            <View style={styles.chartLegend}>
              {chartKind === "trend" ? (
                <ChartLegendItem
                  color={metricColors[nutrientName]}
                  label="7d avg"
                />
              ) : (
                <ChartLegendItem
                  color={metricColors[nutrientName]}
                  label={unit}
                />
              )}
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

const NutritionChartDataModel = {
  make({
    nutrientName,
    report,
  }: {
    readonly nutrientName: NutritionTrendMetric;
    readonly report: NutritionReports.NutritionReportRange;
  }) {
    const unit = nutrientName === "energyKcal" ? "kcal" : "g";
    const data = report.days.map((day) => {
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
      const targetStatus = day.targetStatuses.find(
        (status) => status.nutrientName === nutrientName
      );
      const target = targetStatus?.amount ?? null;
      const actual = day.totals[nutrientName];
      const targetLabel =
        target === null
          ? "No target"
          : `target ${_formatNutritionChartValue({ unit, value: target })}`;

      return {
        actual,
        average,
        dateKey: day.dateKey,
        dayIndex: referenceIndex,
        target,
        targetSemantics: targetStatus?.semantics ?? null,
        tooltipPrimary: `${_formatShortDate({ dateKey: day.dateKey })} · ${_formatNutritionChartValue({ unit, value: actual })}`,
        tooltipSecondary: `7d ${_formatNutritionChartValue({ unit, value: average })} · ${targetLabel}`,
      };
    });
    const rawMaximumValue =
      Math.max(
        1,
        ...data.flatMap((point) =>
          [point.actual, point.average, point.target].filter(
            (value): value is number => value !== null
          )
        )
      ) * 1.08;
    const [, maximumValue] = niceLinearDomain({
      domain: [0, rawMaximumValue],
    });
    const referencePoint = Array.findLast(
      data,
      (point) => point.target !== null
    ).pipe(Option.getOrNull);
    const targetReference =
      referencePoint?.target === null || referencePoint?.target === undefined
        ? null
        : {
            label: `${referencePoint.targetSemantics === "maximum" ? "Limit" : "Target"} ${_formatNutritionChartValue({ unit, value: referencePoint.target })}`,
            value: referencePoint.target,
          };
    return {
      data,
      maximumValue,
      targetReference,
    };
  },
};

function _formatNutritionChartValue({
  unit,
  value,
}: {
  readonly unit: "g" | "kcal";
  readonly value: number;
}) {
  return `${formatNumber({
    maximumFractionDigits: unit === "kcal" ? 0 : 1,
    value,
  })} ${unit}`;
}

function _formatNutritionChartAxisValue({
  unit,
  value,
}: {
  readonly unit: "g" | "kcal";
  readonly value: number;
}) {
  return unit === "kcal" && value >= 1000
    ? `${formatNumber({
        maximumFractionDigits: value % 1000 === 0 ? 0 : 1,
        value: value / 1000,
      })}k`
    : formatNumber({
        maximumFractionDigits: unit === "kcal" ? 0 : 1,
        value,
      });
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
    gap: spacing.xl,
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
    paddingTop: spacing.xl,
    backgroundColor: color.surface,
    ...shadow.card,
  },
  chartCanvas: {
    position: "relative",
    height: 232,
  },
  chartReferenceSummary: {
    minWidth: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
    paddingBottom: 36,
  },
  chartReferenceUnit: {
    marginRight: "auto",
    color: color.textMuted,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.xs,
  },
  chartTargetReferenceSummary: {
    color: color.text,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xs,
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
    width: 32,
    color: color.textMuted,
    fontSize: 10,
    fontWeight: tokens.type.weight.black,
    lineHeight: 12,
    textAlign: "right",
  },
  chartScaleStep: {
    position: "absolute",
    left: 2,
    width: 32,
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
    borderTopWidth: 1,
    borderTopColor: color.sheetBorder,
    marginTop: spacing.xxxl,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.lg,
  },
  chartDateRange: {
    flexShrink: 1,
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
