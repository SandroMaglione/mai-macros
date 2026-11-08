import { ChartDateLabel } from "@/components/ui/chart-date-label";
import { useChildMachine, useMachine } from "@/hooks/use-machine";
import { InsightsMachineAtoms } from "@/lib/insights-runtime-client";
import {
  BodyWeightCalendarDates,
  BodyWeightEditorChild,
  BodyWeightEditorEvents,
  BodyWeightEditorStates,
  BodyWeightImporterChild,
  BodyWeightImporterEvents,
  BodyWeightImporterStates,
  BodyWeightRouteEvents,
  BodyWeightRouteMachine,
  BodyWeightRouteStates,
  findBodyWeightEntryForDateKey,
  type BodyWeightChartKind,
  type BodyWeightReportRange,
} from "@/machines/body-weight-panel-machine";
import type {
  InsightDateRange,
  InsightRangeDayCount,
} from "@mai/machines/insight-range";
import * as Domain from "@mai/nutrition/domain";
import {
  Circle as SkiaCircle,
  DashPathEffect,
  Rect as SkiaRect,
} from "@shopify/react-native-skia";
import type { AtomMachine } from "@typeonce/effect-machine/reactivity";
import { Array, Option, Schema } from "effect";
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
  ScrollView,
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

import { Button } from "@/components/ui/button";
import { NumberField, TextArea } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { LoadingView } from "@/components/ui/loading-view";
import { Notice } from "@/components/ui/notice";
import { todayDateKey } from "@/lib/date-keys";
import { formatNumber, niceLinearDomain } from "@/lib/format";
import {
  color,
  radius,
  spacing,
  tokens,
  weightCalendarColors,
} from "@/theme/tokens";

const estimateWeightWindowDays = 14;

export type BodyWeightReportDayCount = typeof InsightRangeDayCount.Type;

export function BodyWeightPanel({
  chartKind,
  calendarPosition = "top",
  initialDateKey,
  onSelectDate,
  reportDateRange = null,
  reportDayCount = 90,
  showImport = true,
}: {
  readonly chartKind: BodyWeightChartKind;
  readonly calendarPosition?: "bottom" | "top";
  readonly initialDateKey?: Domain.DateKey;
  readonly onSelectDate?: (dateKey: Domain.DateKey) => void;
  readonly reportDateRange?: InsightDateRange | null;
  readonly reportDayCount?: BodyWeightReportDayCount;
  readonly showImport?: boolean;
}) {
  return Schema.decodeOption(Domain.DateKey)(
    initialDateKey ?? reportDateRange?.endDateKey ?? todayDateKey()
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
          chartKind={chartKind}
          calendarPosition={calendarPosition}
          dateKey={dateKey}
          onSelectDate={onSelectDate}
          reportDateRange={reportDateRange}
          reportDayCount={reportDayCount}
          showImport={showImport}
        />
      ),
    })
  );
}

function BodyWeightRoute({
  chartKind,
  calendarPosition,
  dateKey,
  onSelectDate,
  reportDateRange,
  reportDayCount,
  showImport,
}: {
  readonly chartKind: BodyWeightChartKind;
  readonly calendarPosition: "bottom" | "top";
  readonly dateKey: Domain.DateKey;
  readonly onSelectDate?: (dateKey: Domain.DateKey) => void;
  readonly reportDateRange: InsightDateRange | null;
  readonly reportDayCount: BodyWeightReportDayCount;
  readonly showImport: boolean;
}) {
  const [snapshot, send, machine] = useMachine(() =>
    InsightsMachineAtoms.make(BodyWeightRouteMachine, {
      dateKey,
      reportDateRange,
      reportDayCount,
    })
  );
  const isEditing = BodyWeightRouteStates.matches(snapshot, "Ready.Editing");
  const isImportingForm = BodyWeightRouteStates.matches(
    snapshot,
    "Ready.ImportingForm"
  );
  const route = snapshot.value;
  const disabled =
    isEditing ||
    isImportingForm ||
    BodyWeightRouteStates.matches(snapshot, "Loading") ||
    BodyWeightRouteStates.matches(snapshot, "Ready.LoadingMonth");

  if (
    BodyWeightRouteStates.matches(snapshot, "Loading") &&
    route.report === null
  ) {
    return (
      <View style={styles.centered}>
        <LoadingView message="Loading weight data..." />
      </View>
    );
  }

  if (
    BodyWeightRouteStates.matches(snapshot, "Failed") &&
    route.report === null
  ) {
    return (
      <View style={styles.failureStack}>
        <BodyWeightMonthNavigator
          dateKey={route.dateKey}
          disabled={false}
          onNextMonth={() => {
            send(BodyWeightRouteEvents.NextMonth());
          }}
          onPreviousMonth={() => {
            send(BodyWeightRouteEvents.PreviousMonth());
          }}
        />
        <Notice
          message={route.message ?? "Could not load weight data."}
          title="Weight unavailable"
          tone="danger"
        />
        <Button
          icon={RotateCcw}
          onPress={() => {
            send(BodyWeightRouteEvents.Reload());
          }}
          variant="secondary"
        >
          Retry
        </Button>
      </View>
    );
  }

  if (route.report === null) {
    return (
      <View style={styles.centered}>
        <LoadingView message="Loading weight data..." />
      </View>
    );
  }

  const calendar = (
    <BodyWeightCalendar
      dateKey={route.dateKey}
      disabled={disabled}
      entries={route.monthEntries}
      message={route.message}
      onRetry={() => {
        send(BodyWeightRouteEvents.Reload());
      }}
      onImport={
        showImport
          ? () => {
              send(BodyWeightRouteEvents.OpenImport());
            }
          : undefined
      }
      onNextMonth={() => {
        send(BodyWeightRouteEvents.NextMonth());
      }}
      onPreviousMonth={() => {
        send(BodyWeightRouteEvents.PreviousMonth());
      }}
      onSelectDate={(selectedDateKey) => {
        if (onSelectDate !== undefined) {
          onSelectDate(selectedDateKey);
          return;
        }

        send(
          BodyWeightRouteEvents.SelectDate({
            dateKey: selectedDateKey,
          })
        );
      }}
    />
  );

  return (
    <View style={styles.stack}>
      {calendarPosition === "top" ? calendar : null}
      {isEditing ? (
        <BodyWeightEntryDialog editor={machine.child(BodyWeightEditorChild)} />
      ) : null}
      {isImportingForm ? (
        <BodyWeightImportDialog
          importer={machine.child(BodyWeightImporterChild)}
        />
      ) : null}

      <BodyWeightSummary report={route.report} />
      <BodyWeightTrend chartKind={chartKind} report={route.report} />
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
  message,
  onRetry,
  onImport,
  onNextMonth,
  onPreviousMonth,
  onSelectDate,
}: {
  readonly dateKey: Domain.DateKey;
  readonly disabled: boolean;
  readonly entries: readonly Domain.BodyWeightEntry[];
  readonly message: string | null;
  readonly onRetry: () => void;
  readonly onImport?: () => void;
  readonly onNextMonth: () => void;
  readonly onPreviousMonth: () => void;
  readonly onSelectDate: (dateKey: Domain.DateKey) => void;
}) {
  const calendar = CalendarMonthModel.make({
    dateKey,
    entries,
  });

  const weights = entries.map((entry) => entry.weightKilograms);
  const low = Array.isReadonlyArrayNonEmpty(weights)
    ? Math.min(...weights)
    : null;
  const high = Array.isReadonlyArrayNonEmpty(weights)
    ? Math.max(...weights)
    : null;

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
              {week.map((cell) => {
                const tone =
                  cell.weightKilograms === null || low === null || high === null
                    ? undefined
                    : weightCalendarColors[
                        high === low
                          ? Math.floor(weightCalendarColors.length / 2)
                          : Math.min(
                              weightCalendarColors.length - 1,
                              Math.floor(
                                ((cell.weightKilograms - low) / (high - low)) *
                                  weightCalendarColors.length
                              )
                            )
                      ];
                return (
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
                      tone === undefined
                        ? null
                        : { backgroundColor: tone.backgroundColor },
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
                        tone === undefined ? null : { color: tone.color },
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
                          tone === undefined ? null : { color: tone.color },
                        ]}
                      >
                        {cell.weightLabel}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </View>
      <View style={styles.calendarLegend}>
        {low === null || high === null ? (
          <Text style={styles.calendarLegendText}>No weights this month</Text>
        ) : (
          <>
            <Text style={styles.calendarLegendText}>
              {formatNumber({ maximumFractionDigits: 2, value: low })} kg
            </Text>
            <View style={styles.calendarLegendSwatches}>
              {weightCalendarColors.map((tone) => (
                <View
                  key={tone.backgroundColor}
                  style={[
                    styles.calendarSwatch,
                    { backgroundColor: tone.backgroundColor },
                  ]}
                />
              ))}
            </View>
            <Text style={styles.calendarLegendText}>
              {formatNumber({ maximumFractionDigits: 2, value: high })} kg
            </Text>
          </>
        )}
      </View>
      {message === null ? null : (
        <View style={styles.failureStack}>
          <Notice message={message} tone="danger" />
          <Button disabled={disabled} onPress={onRetry} variant="secondary">
            Retry
          </Button>
        </View>
      )}
    </View>
  );
}

function BodyWeightEntryDialog({
  editor,
}: {
  readonly editor: AtomMachine.ChildMachineAtom<typeof BodyWeightEditorChild>;
}) {
  const [editorSnapshot, send] = useChildMachine(editor);

  if (Option.isNone(editorSnapshot)) {
    return null;
  }

  const snapshot = editorSnapshot.value;
  const dateKey = snapshot.value.dateKey;
  const deleting = BodyWeightEditorStates.matches(snapshot, "Deleting");
  const saving = BodyWeightEditorStates.matches(snapshot, "Saving");
  const disabled = deleting || saving;
  const hasEntry = snapshot.value.selectedEntry !== null;
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    weekday: "long",
  }).format(BodyWeightCalendarDates.dateFromDateKey({ dateKey }));

  return (
    <Modal
      animationType="fade"
      onRequestClose={() => {
        if (!disabled) {
          send(BodyWeightEditorEvents.Close());
        }
      }}
      transparent
      visible
    >
      <Pressable
        accessible={false}
        accessibilityLabel="Close weight editor"
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => {
          send(BodyWeightEditorEvents.Close());
        }}
        style={styles.editorBackdrop}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.editorKeyboardAvoiding}
        >
          <View
            style={[styles.editorDialog, styles.editorDialogContent]}
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
                  send(BodyWeightEditorEvents.Close());
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
            {snapshot.value.message === null ? null : (
              <Notice message={snapshot.value.message} tone="neutral" />
            )}
            <NumberField
              accessibilityLabel="Weight in kilograms"
              autoFocus
              editable={!disabled}
              key={`${dateKey}-open`}
              onChangeText={(value) => {
                send(BodyWeightEditorEvents.ChangeWeight({ value }));
              }}
              placeholder="82.4"
              rightElement={<Text style={styles.unitText}>kg</Text>}
              selectTextOnFocus
              value={snapshot.value.weightInput}
            />
            <View style={styles.editorActions}>
              <Button
                disabled={disabled || !hasEntry}
                icon={Trash2}
                loading={deleting}
                onPress={() => {
                  send(BodyWeightEditorEvents.DeleteWeight());
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
                  send(BodyWeightEditorEvents.Save());
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
  importer,
}: {
  readonly importer: AtomMachine.ChildMachineAtom<
    typeof BodyWeightImporterChild
  >;
}) {
  const [importerSnapshot, send] = useChildMachine(importer);

  if (Option.isNone(importerSnapshot)) {
    return null;
  }

  const snapshot = importerSnapshot.value;
  const importing = BodyWeightImporterStates.matches(snapshot, "Submitting");
  const disabled = importing;
  const canImport = snapshot.value.input.trim().length > 0;

  return (
    <Modal
      animationType="fade"
      onRequestClose={() => {
        if (!disabled) {
          send(BodyWeightImporterEvents.Close());
        }
      }}
      transparent
      visible
    >
      <Pressable
        accessible={false}
        accessibilityLabel="Close weight importer"
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => {
          send(BodyWeightImporterEvents.Close());
        }}
        style={styles.editorBackdrop}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.editorKeyboardAvoiding}
        >
          <View
            style={[styles.editorDialog, styles.editorDialogScrollable]}
            onStartShouldSetResponder={() => true}
          >
            <ScrollView
              contentContainerStyle={styles.editorDialogContent}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              style={styles.editorDialogScroll}
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
                    send(BodyWeightImporterEvents.Close());
                  }}
                  style={({ pressed }) => [
                    styles.editorCloseButton,
                    pressed && !disabled
                      ? styles.editorCloseButtonPressed
                      : null,
                    disabled ? styles.editorCloseButtonDisabled : null,
                  ]}
                >
                  <X color={color.textMuted} size={18} strokeWidth={3} />
                </Pressable>
              </View>
              {snapshot.value.message === null ? null : (
                <Notice message={snapshot.value.message} tone="danger" />
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
                  send(BodyWeightImporterEvents.ChangeImportInput({ value }));
                }}
                placeholder={"26-06-26 77.40\n26-06-23 77.40"}
                scrollEnabled
                value={snapshot.value.input}
              />
              <View style={styles.editorActions}>
                <Button
                  disabled={disabled || !canImport}
                  icon={Upload}
                  loading={importing}
                  onPress={() => {
                    send(BodyWeightImporterEvents.ImportWeights());
                  }}
                  style={styles.editorAction}
                >
                  Import
                </Button>
              </View>
            </ScrollView>
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

function BodyWeightTrend({
  chartKind,
  report,
}: {
  readonly chartKind: BodyWeightChartKind;
  readonly report: BodyWeightReportRange;
}) {
  return (
    <View style={styles.trendBlock}>
      <BodyWeightChart chartKind={chartKind} report={report} />
      <BodyWeightInsights report={report} />
    </View>
  );
}

function BodyWeightChart({
  chartKind,
  report,
}: {
  readonly chartKind: BodyWeightChartKind;
  readonly report: BodyWeightReportRange;
}) {
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
                      color={color.weightTrend}
                      connectMissingData={false}
                      curveType="linear"
                      points={points.trend}
                      strokeCap="round"
                      strokeJoin="round"
                      strokeWidth={3}
                    />
                    <Line
                      color={color.weightAverage}
                      connectMissingData={false}
                      curveType="linear"
                      points={points.stable}
                      strokeCap="round"
                      strokeJoin="round"
                      strokeWidth={2.4}
                    >
                      <DashPathEffect intervals={[8, 5]} />
                    </Line>
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
                      color={color.weightAverage}
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
                      color={color.weightTrend}
                      innerPadding={0.32}
                      points={points.changeDown}
                      roundedCorners={{
                        topLeft: 2,
                        topRight: 2,
                      }}
                    />
                    <Bar
                      chartBounds={chartBounds}
                      color={color.weightAverage}
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
                      color={
                        chartKind === "trend" ? color.weightTrend : color.text
                      }
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
          <ChartDateLabel
            pressState={pressState}
            style={styles.chartDateRange}
            rangeLabel={`${_formatChartDateLabel({ dateKey: chart.startDateKey })} – ${_formatChartDateLabel({ dateKey: chart.endDateKey })}`}
          />
          <View style={styles.chartLegend}>
            {chartKind === "trend" ? (
              <>
                <BodyWeightChartLegendItem
                  color={color.weightTrend}
                  label={`Trend (${progressDayCount}d)`}
                />
                <BodyWeightChartLegendItem
                  color={color.weightAverage}
                  label="Average"
                  dashed
                />
              </>
            ) : (
              <>
                <BodyWeightChartLegendItem
                  color={color.weightTrend}
                  label="Lower"
                />
                <BodyWeightChartLegendItem
                  color={color.weightAverage}
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
  dashed = false,
}: {
  readonly color: string;
  readonly label: string;
  readonly dashed?: boolean;
}) {
  return (
    <View style={styles.chartLegendItem}>
      <View style={styles.chartLegendMark}>
        {dashed ? (
          <>
            <View
              style={[styles.chartLegendDash, { backgroundColor: legendColor }]}
            />
            <View
              style={[styles.chartLegendDash, { backgroundColor: legendColor }]}
            />
          </>
        ) : (
          <View
            style={[styles.chartLegendSolid, { backgroundColor: legendColor }]}
          />
        )}
      </View>
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
  make({
    dateKey,
    entries,
  }: {
    readonly dateKey: Domain.DateKey;
    readonly entries: readonly Domain.BodyWeightEntry[];
  }) {
    const displayedDate = BodyWeightCalendarDates.dateFromDateKey({ dateKey });
    const monthIndex = displayedDate.getMonth();
    const firstOfMonth = new Date(displayedDate.getFullYear(), monthIndex, 1);
    const gridStartDate = new Date(
      displayedDate.getFullYear(),
      monthIndex,
      1 - firstOfMonth.getDay()
    );
    const totalCellCount = 42;
    const today = todayDateKey();
    const cells = globalThis.Array.from(
      { length: totalCellCount },
      (_, index) => {
        const cellDate = new Date(
          gridStartDate.getFullYear(),
          gridStartDate.getMonth(),
          gridStartDate.getDate() + index
        );
        const cellDateKey = BodyWeightCalendarDates.dateKeyFromDate({
          date: cellDate,
          fallbackDateKey: dateKey,
        });
        const isCurrentMonth = cellDate.getMonth() === monthIndex;
        const entry = isCurrentMonth
          ? findBodyWeightEntryForDateKey({
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
          weightKilograms: entry?.weightKilograms ?? null,
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
    const date = BodyWeightCalendarDates.dateFromDateKey({ dateKey });

    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
    }).format(date);
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
  const date = BodyWeightCalendarDates.dateFromDateKey({ dateKey });

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
    fontWeight: tokens.type.weight.semibold,
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
    fontWeight: tokens.type.weight.semibold,
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
  calendarWeightText: {
    color: color.text,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.sm,
    textAlign: "center",
  },
  calendarLegend: {
    minHeight: 20,
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  calendarLegendText: { color: color.textMuted, fontSize: tokens.type.size.xs },
  calendarLegendSwatches: { flexDirection: "row", gap: 3 },
  calendarSwatch: { width: 14, height: 14, borderRadius: 3 },
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
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: color.sheet,
  },
  editorDialogContent: {
    gap: spacing.md,
  },
  editorDialogScrollable: {
    maxHeight: "88%",
  },
  editorDialogScroll: {
    flexShrink: 1,
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
    fontWeight: tokens.type.weight.semibold,
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
    fontWeight: tokens.type.weight.semibold,
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
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.lg,
  },
  metricLabel: {
    color: color.textSubtle,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.semibold,
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
    fontWeight: tokens.type.weight.semibold,
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
    fontWeight: tokens.type.weight.semibold,
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
  chartLegendDash: { width: 5, height: 3, borderRadius: radius.pill },
  chartLegendSolid: { flex: 1, height: 3, borderRadius: radius.pill },
  chartLegendMark: {
    flexDirection: "row",
    justifyContent: "space-between",
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
    fontWeight: tokens.type.weight.semibold,
  },
});
