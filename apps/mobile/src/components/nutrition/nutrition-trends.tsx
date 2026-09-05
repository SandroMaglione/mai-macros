import { ChartDateLabel } from "@/components/ui/chart-date-label";
import * as Reporting from "@mai/nutrition/reporting";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { LoadingView } from "@/components/ui/loading-view";
import { Notice } from "@/components/ui/notice";
import { dateKeyFromDate, todayDateKey } from "@/lib/date-keys";
import { formatNumber, niceLinearDomain } from "@/lib/format";
import { InsightsRuntimeClient } from "@/lib/insights-runtime-client";
import {
  color,
  estimatedNutrientOpacity,
  radius,
  shadow,
  spacing,
  tokens,
} from "@/theme/tokens";
import { EmptyEvent } from "@mai/machines/schemas";
import * as Domain from "@mai/nutrition/domain";
import * as NutritionReports from "@mai/nutrition/services/nutrition-reports";
import {
  Circle as SkiaCircle,
  DashPathEffect,
  Rect as SkiaRect,
} from "@shopify/react-native-skia";
import { useMachine } from "@xstate/react";
import { Array, Effect, Option, Schema } from "effect";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  StackedBar,
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
  "costEur",
  "waterLiters",
]);

type NutritionTrendMetric = typeof NutritionTrendMetric.Type;

export const NutritionChartKind = Schema.Literals(["daily", "trend"]);
export type NutritionChartKind = typeof NutritionChartKind.Type;

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
  mode: Domain.DailyLogMode,
});

const NutritionCalendarInput = Schema.Struct({
  dateKey: Domain.DateKey,
  days: Schema.Array(NutritionCalendarDay),
  loadEndDateKey: Schema.NullOr(Domain.DateKey),
  loadStartDateKey: Schema.NullOr(Domain.DateKey),
  shouldLoad: Schema.Boolean,
});

const NutritionCalendarContext = Schema.Struct({
  dateKey: Domain.DateKey,
  days: Schema.Array(NutritionCalendarDay),
  loadEndDateKey: Schema.NullOr(Domain.DateKey),
  loadStartDateKey: Schema.NullOr(Domain.DateKey),
  message: Schema.NullOr(Schema.String),
  shouldLoad: Schema.Boolean,
});

const LoadNutritionCalendarInput = Schema.Struct({
  dateKey: Domain.DateKey,
  days: Schema.Array(NutritionCalendarDay),
  loadEndDateKey: Schema.NullOr(Domain.DateKey),
  loadStartDateKey: Schema.NullOr(Domain.DateKey),
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
    Initial: {},
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
        InsightsRuntimeClient.runPromise(
          Effect.gen(function* () {
            const reports = yield* NutritionReports.NutritionReports;
            const range =
              input.loadStartDateKey === null || input.loadEndDateKey === null
                ? CalendarMonthModel.range({
                    dateKey: input.dateKey,
                  })
                : {
                    endDateKey: input.loadEndDateKey,
                    startDateKey: input.loadStartDateKey,
                  };
            const report = yield* reports.getRange({
              input: range,
            });

            return {
              days: [...input.days, ..._calendarDaysFromReport({ report })],
            };
          })
        ),
    }),
  },
}).createMachine({
  context: ({ input }) => ({
    dateKey: input.dateKey,
    days: input.days,
    loadEndDateKey: input.loadEndDateKey,
    loadStartDateKey: input.loadStartDateKey,
    message: null,
    shouldLoad: input.shouldLoad,
  }),
  initial: "Initial",
  states: {
    Initial: {
      always: ({ context }) => ({
        target: context.shouldLoad ? "Loading" : "Ready",
      }),
    },
    Loading: {
      invoke: {
        src: "loadMonth",
        input: ({ context }) => ({
          dateKey: context.dateKey,
          days: context.days,
          loadEndDateKey: context.loadEndDateKey,
          loadStartDateKey: context.loadStartDateKey,
        }),
        onDone: ({ event }) => ({
          target: "Ready",
          context: {
            days: event.output.days,
            loadEndDateKey: null,
            loadStartDateKey: null,
            message: null,
            shouldLoad: false,
          },
        }),
        onError: {
          target: "Failed",
          context: {
            message: "Could not load this nutrition month.",
            shouldLoad: false,
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
            shouldLoad: true,
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
  "costEur",
  "waterLiters",
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
  costEur: "Food cost",
  waterLiters: "Water",
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
  costEur: "Cost",
  waterLiters: "Water",
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
  costEur: color.safeText,
  waterLiters: color.water,
} satisfies Record<NutritionTrendMetric, string>;

export function NutritionTrends({
  chartKind,
  includeEstimates,
  currentReport,
  onSelectDate,
}: {
  readonly includeEstimates: boolean;
  readonly chartKind: NutritionChartKind;
  readonly currentReport: NutritionReports.NutritionReportRange;
  readonly onSelectDate: (dateKey: Domain.DateKey) => void;
}) {
  const initialCalendar = useMemo(
    () =>
      CalendarMonthModel.initialLoad({
        dateKey: currentReport.endDateKey,
        report: currentReport,
      }),
    [currentReport]
  );

  return (
    <View style={styles.root}>
      <NutritionTrendChart
        chartKind={chartKind}
        report={currentReport}
        includeEstimates={includeEstimates}
      />
      <NutritionCalendar
        initialDays={initialCalendar.days}
        initialDateKey={currentReport.endDateKey}
        loadEndDateKey={initialCalendar.loadEndDateKey}
        loadStartDateKey={initialCalendar.loadStartDateKey}
        shouldLoadInitialMonth={initialCalendar.shouldLoad}
        onSelectDate={onSelectDate}
      />
    </View>
  );
}

function NutritionTrendChart({
  chartKind,
  includeEstimates,
  report,
}: {
  readonly includeEstimates: boolean;
  readonly chartKind: NutritionChartKind;
  readonly report: NutritionReports.NutritionReportRange;
}) {
  const [snapshot, , actor] = useMachine(nutritionTrendMetricMachine);
  const nutrientName = snapshot.context.nutrientName;
  const isWaterMetric = nutrientName === "waterLiters";
  const chart = useMemo(
    () =>
      NutritionChartDataModel.make({
        includeEstimates,
        nutrientName,
        report,
      }),
    [includeEstimates, nutrientName, report]
  );
  const unit =
    nutrientName === "energyKcal"
      ? "kcal"
      : nutrientName === "costEur"
        ? "€"
        : isWaterMetric
          ? "L"
          : "g";
  const unitLabel =
    nutrientName === "energyKcal"
      ? "Kilocalories"
      : nutrientName === "costEur"
        ? "Euros"
        : isWaterMetric
          ? "Liters"
          : "Grams";
  const { state: pressState, isActive: isPressActive } = useChartPressState({
    x: 0,
    y: {
      actual: 0,
      recordedActual: 0,
      estimatedActual: 0,
      average: 0,
      fastingActual: 0,
      notRecordedActual: 0,
      target: 0,
    },
  });
  const scaleSteps = [0.25, 0.5, 0.75].map((ratio) => ({
    top: 10 + (1 - ratio) * 212 - 6,
    value: chart.maximumValue * ratio,
  }));

  return (
    <View style={styles.chartSection}>
      {!chart.hasRecordedValues ? (
        <Text style={styles.emptyText}>
          {isWaterMetric
            ? "Record daily water to display this trend."
            : "Record nutrition days to display this trend."}
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
              yKeys={[
                "actual",
                "recordedActual",
                "estimatedActual",
                "average",
                "fastingActual",
                "notRecordedActual",
                "target",
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
                      <Scatter
                        color={color.safeBorder}
                        points={points.fastingActual}
                        radius={4}
                      />
                      <Scatter
                        color={color.notRecordedText}
                        points={points.notRecordedActual}
                        radius={4}
                      />
                    </>
                  ) : (
                    <StackedBar
                      chartBounds={chartBounds}
                      innerPadding={0.32}
                      points={[points.recordedActual, points.estimatedActual]}
                      barOptions={({ seriesIndex, datumIndex, isTop }) => ({
                        color:
                          !isWaterMetric &&
                          chart.data[datumIndex]?.mode === "fasting"
                            ? color.safeBorder
                            : !isWaterMetric &&
                                chart.data[datumIndex]?.mode === "not-recorded"
                              ? color.notRecordedText
                              : metricColors[nutrientName],
                        opacity:
                          seriesIndex === 1 ? estimatedNutrientOpacity : 1,
                        roundedCorners: {
                          topLeft: isTop ? 3 : 0,
                          topRight: isTop ? 3 : 0,
                        },
                      })}
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
            <ChartDateLabel
              pressState={pressState}
              style={styles.chartDateRange}
              rangeLabel={`${_formatShortDate({ dateKey: report.startDateKey })} – ${_formatShortDate({ dateKey: report.endDateKey })}`}
            />
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
              {isWaterMetric ? null : (
                <>
                  <ChartLegendItem color={color.textMuted} label="Target" />
                  <ChartLegendItem color={color.safeBorder} label="Fasting" />
                  <ChartLegendItem
                    color={color.notRecordedText}
                    label="Not recorded"
                  />
                </>
              )}
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
                      backgroundColor: color.surfaceRaised,
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
                    backgroundColor: metricColor,
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
  initialDays,
  initialDateKey,
  loadEndDateKey,
  loadStartDateKey,
  onSelectDate,
  shouldLoadInitialMonth,
}: {
  readonly initialDays: readonly (typeof NutritionCalendarDay.Type)[];
  readonly initialDateKey: Domain.DateKey;
  readonly loadEndDateKey: Domain.DateKey | null;
  readonly loadStartDateKey: Domain.DateKey | null;
  readonly onSelectDate: (dateKey: Domain.DateKey) => void;
  readonly shouldLoadInitialMonth: boolean;
}) {
  const [snapshot, , actor] = useMachine(nutritionCalendarMachine, {
    input: {
      dateKey: initialDateKey,
      days: initialDays,
      loadEndDateKey,
      loadStartDateKey,
      shouldLoad: shouldLoadInitialMonth,
    },
  });
  const calendar = useMemo(
    () =>
      CalendarMonthModel.make({
        dateKey: snapshot.context.dateKey,
        days: snapshot.context.days,
      }),
    [snapshot.context.dateKey, snapshot.context.days]
  );

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
            <CalendarLegendItem label="Fasting day" status="fasting" />
            <CalendarLegendItem label="Not recorded" status="notRecorded" />
          </View>
        </View>
      )}
    </View>
  );
}

type CalendarStatus =
  | "empty"
  | "fasting"
  | "inside"
  | "none"
  | "notRecorded"
  | "outside";

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
  fasting: {
    backgroundColor: color.safeText,
  },
  inside: {
    backgroundColor: color.successText,
  },
  notRecorded: {
    backgroundColor: color.notRecordedText,
  },
  outside: {
    backgroundColor: color.warningText,
  },
}) satisfies Record<Exclude<CalendarStatus, "none">, object>;

const CalendarWeekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const calendarAccessibilityDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "long",
  weekday: "long",
  year: "numeric",
});
const calendarMonthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});
const chartShortDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
});
const euroChartValueFormatter = new Intl.NumberFormat(undefined, {
  currency: "EUR",
  maximumFractionDigits: 2,
  style: "currency",
});

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
    const daysByDateKey: Record<
      string,
      typeof NutritionCalendarDay.Type | undefined
    > = Object.fromEntries(days.map((day) => [day.dateKey, day]));
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
        const day = daysByDateKey[cellDateKey];
        const status: CalendarStatus =
          !isCurrentMonth || day === undefined
            ? "none"
            : day.mode === "fasting"
              ? "fasting"
              : day.mode === "not-recorded"
                ? "notRecorded"
                : !day.hasEntries
                  ? "empty"
                  : day.isInsideTargetMargin
                    ? "inside"
                    : "outside";
        const fullDateLabel =
          calendarAccessibilityDateFormatter.format(cellDate);
        const statusLabel = {
          empty: "empty nutrition log",
          fasting: "fasting day, excluded from nutrition averages and insights",
          inside: "inside nutrition targets",
          none: "no nutrition log",
          notRecorded:
            "not recorded day, excluded from nutrition averages and insights",
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
    return calendarMonthFormatter.format(
      CalendarMonthModel.dateFromDateKey({ dateKey })
    );
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
  initialLoad({
    dateKey,
    report,
  }: {
    readonly dateKey: Domain.DateKey;
    readonly report: NutritionReports.NutritionReportRange;
  }) {
    const monthRange = CalendarMonthModel.range({ dateKey });
    const today = todayDateKey();
    const neededEndDateKey =
      monthRange.endDateKey < today ? monthRange.endDateKey : today;
    const reportCoversMonthEnd = report.endDateKey >= neededEndDateKey;
    const days = _calendarDaysFromReport({ report });

    if (
      report.startDateKey <= monthRange.startDateKey &&
      reportCoversMonthEnd
    ) {
      return {
        days,
        loadEndDateKey: null,
        loadStartDateKey: null,
        shouldLoad: false,
      };
    }

    if (report.startDateKey > monthRange.startDateKey && reportCoversMonthEnd) {
      const reportStartDate = CalendarMonthModel.dateFromDateKey({
        dateKey: report.startDateKey,
      });
      const loadEndDateKey = CalendarMonthModel.dateKeyFromDate({
        date: new Date(
          reportStartDate.getFullYear(),
          reportStartDate.getMonth(),
          reportStartDate.getDate() - 1
        ),
        fallbackDateKey: monthRange.startDateKey,
      });

      return {
        days,
        loadEndDateKey,
        loadStartDateKey: monthRange.startDateKey,
        shouldLoad: true,
      };
    }

    return {
      days: [],
      loadEndDateKey: null,
      loadStartDateKey: null,
      shouldLoad: true,
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
    includeEstimates,
    nutrientName,
    report,
  }: {
    readonly includeEstimates: boolean;
    readonly nutrientName: NutritionTrendMetric;
    readonly report: NutritionReports.NutritionReportRange;
  }) {
    const unit =
      nutrientName === "energyKcal"
        ? "kcal"
        : nutrientName === "costEur"
          ? "€"
          : nutrientName === "waterLiters"
            ? "L"
            : "g";
    const dayValues = report.days.map((day) => {
      const [yearString, monthString, dayString] = day.dateKey.split("-");

      return {
        rawActual:
          nutrientName === "costEur"
            ? day.costTotals.costMinorByCurrency.EUR / 100
            : nutrientName === "waterLiters"
              ? day.dailyLog.waterServings === null
                ? null
                : day.dailyLog.waterServings / 4
              : day.nutrition.coverage[nutrientName] === 0 &&
                  Array.isReadonlyArrayNonEmpty(day.entries)
                ? null
                : includeEstimates
                  ? day.nutrition.totals[nutrientName]
                  : day.nutrition.recorded[nutrientName],
        day,
        dayIndex: Math.floor(
          Date.UTC(
            Number(yearString),
            Number(monthString) - 1,
            Number(dayString),
            12
          ) / 86_400_000
        ),
      };
    });
    let windowStart = 0;
    let windowTotal = 0;
    let windowDayCount = 0;
    const data = dayValues.map(({ rawActual, day, dayIndex }) => {
      const mode = day.dailyLog.mode;
      const isWaterMetric = nutrientName === "waterLiters";
      const isCounted =
        rawActual !== null && (isWaterMetric || mode === "eating");

      if (isCounted && rawActual !== null) {
        windowTotal += rawActual;
        windowDayCount += 1;
      }

      while (true) {
        const firstWindowDay = dayValues[windowStart];

        if (
          firstWindowDay === undefined ||
          dayIndex - firstWindowDay.dayIndex <= 6
        ) {
          break;
        }

        if (
          firstWindowDay.rawActual !== null &&
          (isWaterMetric || firstWindowDay.day.dailyLog.mode === "eating")
        ) {
          windowTotal -= firstWindowDay.rawActual;
          windowDayCount -= 1;
        }
        windowStart += 1;
      }

      const actual = rawActual;
      const average =
        !isCounted || windowDayCount === 0
          ? null
          : windowTotal / windowDayCount;
      const targetStatus =
        nutrientName === "costEur" || isWaterMetric || !isCounted
          ? undefined
          : day.targetStatuses.find(
              (status) => status.nutrientName === nutrientName
            );
      const target =
        nutrientName === "costEur" || isWaterMetric
          ? (targetStatus?.amount ?? null)
          : (Reporting.getPlanNutrientTargetAmount({
              plan: day.plan,
              nutrientName,
            }) ?? null);
      const targetLabel =
        target === null
          ? "No target"
          : `target ${_formatNutritionChartValue({ unit, value: target })}`;

      const qualityLabel =
        nutrientName === "costEur" || isWaterMetric
          ? ""
          : ` · ${formatNumber({ value: day.nutrition.recorded[nutrientName], maximumFractionDigits: 1 })} + ≈ ${formatNumber({ value: day.nutrition.estimated[nutrientName], maximumFractionDigits: 1 })}${day.nutrition.missing[nutrientName] > 0 ? ` · — ×${day.nutrition.missing[nutrientName]}` : ""}`;
      return {
        actual,
        recordedActual:
          rawActual === null
            ? null
            : nutrientName === "costEur" || isWaterMetric
              ? rawActual
              : day.nutrition.recorded[nutrientName],
        estimatedActual:
          rawActual === null
            ? null
            : nutrientName === "costEur" || isWaterMetric || !includeEstimates
              ? 0
              : day.nutrition.estimated[nutrientName],
        mode,
        average,
        dateKey: day.dateKey,
        dayIndex,
        fastingActual: !isWaterMetric && mode === "fasting" ? rawActual : null,
        notRecordedActual:
          !isWaterMetric && mode === "not-recorded" ? rawActual : null,
        target,
        targetSemantics: targetStatus?.semantics ?? null,
        tooltipPrimary:
          rawActual === null
            ? `${_formatShortDate({ dateKey: day.dateKey })} · —${qualityLabel}`
            : !isWaterMetric && mode === "fasting"
              ? `${_formatShortDate({ dateKey: day.dateKey })} · Fasting day`
              : !isWaterMetric && mode === "not-recorded"
                ? `${_formatShortDate({ dateKey: day.dateKey })} · Not recorded`
                : `${_formatShortDate({ dateKey: day.dateKey })} · ${_formatNutritionChartValue({ unit, value: rawActual })}${qualityLabel}`,
        tooltipSecondary:
          average === null
            ? "Excluded from averages"
            : `7d ${_formatNutritionChartValue({ unit, value: average })} · ${targetLabel}`,
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
      hasRecordedValues: data.some((point) => point.actual !== null),
      maximumValue,
      targetReference,
    };
  },
};

function _formatNutritionChartValue({
  unit,
  value,
}: {
  readonly unit: "€" | "g" | "kcal" | "L";
  readonly value: number;
}) {
  return unit === "€"
    ? euroChartValueFormatter.format(value)
    : `${formatNumber({
        maximumFractionDigits: unit === "kcal" ? 0 : unit === "L" ? 2 : 1,
        value,
      })} ${unit}`;
}

function _formatNutritionChartAxisValue({
  unit,
  value,
}: {
  readonly unit: "€" | "g" | "kcal" | "L";
  readonly value: number;
}) {
  return unit === "kcal" && value >= 1000
    ? `${formatNumber({
        maximumFractionDigits: value % 1000 === 0 ? 0 : 1,
        value: value / 1000,
      })}k`
    : unit === "€"
      ? `€${formatNumber({ maximumFractionDigits: 1, value })}`
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
    loadEndDateKey: null,
    loadStartDateKey: null,
    message: null,
    shouldLoad: true,
  };
}

function _calendarDaysFromReport({
  report,
}: {
  readonly report: NutritionReports.NutritionReportRange;
}): readonly (typeof NutritionCalendarDay.Type)[] {
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
}

function _formatShortDate({ dateKey }: { readonly dateKey: Domain.DateKey }) {
  return chartShortDateFormatter.format(
    CalendarMonthModel.dateFromDateKey({ dateKey })
  );
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
    minHeight: 44,
    minWidth: "22%",
    flexGrow: 1,
    flexBasis: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.sm,
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
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.xs,
  },
  metricSelectorLabelSelected: {
    color: color.text,
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
    fontWeight: tokens.type.weight.semibold,
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
    fontWeight: tokens.type.weight.semibold,
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
    fontWeight: tokens.type.weight.semibold,
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
    fontWeight: tokens.type.weight.semibold,
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
    fontWeight: tokens.type.weight.semibold,
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
