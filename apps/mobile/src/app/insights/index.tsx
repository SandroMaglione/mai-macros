import { CompactToggle } from "@/components/ui/compact-toggle";
import { BodyWeightPanel } from "@/components/body-weight/body-weight-panel";
import {
  NutritionTrends,
  type NutritionChartKind,
} from "@/components/nutrition/nutrition-trends";
import { RangeSummary } from "@/components/nutrition/range-summary";
import { AppScreen } from "@/components/ui/app-screen";
import { BottomActionBar } from "@/components/ui/bottom-action-bar";
import { Button } from "@/components/ui/button";
import { InsightRangeSelect } from "@/components/nutrition/insight-range-select";
import type {
  InsightDateRange,
  InsightRangeDayCount,
} from "@mai/machines/insight-range";
import { LoadingView } from "@/components/ui/loading-view";
import { MaiHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { useMachine } from "@/hooks/use-machine";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { InsightsMachineAtoms } from "@/lib/insights-runtime-client";
import {
  InsightTab,
  InsightsViewEvents,
  InsightsViewMachine,
  NutritionInsightsEvents,
  NutritionInsightsMachine,
} from "@/machines/insights-machine";
import { color, radius, spacing, tokens } from "@/theme/tokens";
import { AtomMachine } from "@typeonce/effect-machine/reactivity";
import { Option, Schema } from "effect";
import { router, useRouter } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import {
  Activity,
  ChartColumn,
  ChevronLeft,
  Plus,
  Scale,
  TrendingUp,
} from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

type InsightRangeDayCount = typeof InsightRangeDayCount.Type;

const InsightsSearchParams = Schema.Struct({
  tab: Schema.optionalKey(InsightTab),
});

export default function InsightsScreen() {
  const initialTab = useSchemaLocalSearchParams(InsightsSearchParams).pipe(
    Option.match({
      onNone: () => "nutrition" as const,
      onSome: ({ tab }) => tab ?? "nutrition",
    })
  );
  const [snapshot, send] = useMachine(() =>
    AtomMachine.make(InsightsViewMachine, { initialTab })
  );
  const view = snapshot.value;
  const appRouter = useRouter();

  return (
    <View style={styles.screen}>
      <AppScreen
        scroll
        contentStyle={styles.content}
        safeAreaEdges={["top"]}
        scrollProps={{
          showsVerticalScrollIndicator: false,
        }}
        topSafeAreaColor={color.header}
      >
        <InsightsHeader
          onBackToToday={() => {
            appRouter.replace("/");
          }}
        />
        <View style={styles.reportControls}>
          <View style={styles.rangeControl}>
            <InsightRangeSelect
              compact
              rangeDayCount={view.rangeDayCount}
              dateRange={view.dateRange}
              onSelect={(rangeDayCount, dateRange) => {
                send(
                  InsightsViewEvents.SelectRange({ rangeDayCount, dateRange })
                );
              }}
            />
          </View>
          {view.activeTab === "nutrition" ? (
            <View style={styles.toggleControls}>
              <CompactToggle
                value={view.chartKind}
                onSelect={(chartKind) => {
                  send(InsightsViewEvents.SelectChartKind({ chartKind }));
                }}
                options={[
                  { value: "daily", label: "Daily bars", icon: ChartColumn },
                  { value: "trend", label: "Trend chart", icon: TrendingUp },
                ]}
              />
              <CompactToggle
                value={view.includeEstimates ? "estimates" : "recorded"}
                onSelect={(value) => {
                  if ((value === "estimates") !== view.includeEstimates)
                    send(InsightsViewEvents.ToggleEstimates());
                }}
                options={[
                  {
                    value: "estimates",
                    label: "Include estimates",
                    symbol: "≈",
                  },
                  {
                    value: "recorded",
                    label: "Recorded values only",
                    symbol: "=",
                  },
                ]}
              />
            </View>
          ) : (
            <CompactToggle
              value={view.weightChartKind}
              onSelect={(chartKind) => {
                send(InsightsViewEvents.SelectWeightChartKind({ chartKind }));
              }}
              options={[
                {
                  value: "trend",
                  label: "Show weight trend chart",
                  icon: TrendingUp,
                },
                {
                  value: "change",
                  label: "Show weights compared with the average",
                  icon: ChartColumn,
                },
              ]}
            />
          )}
        </View>
        {view.activeTab === "nutrition" ? (
          <NutritionInsightsPanel
            chartKind={view.chartKind}
            key={`nutrition-${view.rangeDayCount}-${view.dateRange?.startDateKey}-${view.dateRange?.endDateKey}`}
            dateRange={view.dateRange}
            includeEstimates={view.includeEstimates}
            rangeDayCount={view.rangeDayCount}
          />
        ) : (
          <BodyWeightPanel
            chartKind={view.weightChartKind}
            calendarPosition="bottom"
            key={`weight-${view.rangeDayCount}-${view.dateRange?.startDateKey}-${view.dateRange?.endDateKey}`}
            reportDateRange={view.dateRange}
            reportDayCount={view.rangeDayCount}
            showImport
          />
        )}
      </AppScreen>
      <BottomActionBar variant="tab">
        <InsightsBottomTab
          active={view.activeTab === "nutrition"}
          icon={Activity}
          label="Nutrition"
          onPress={() => {
            send(InsightsViewEvents.SelectTab({ tab: "nutrition" }));
          }}
        />
        <InsightsBottomTab
          active={view.activeTab === "weight"}
          icon={Scale}
          label="Weight"
          onPress={() => {
            send(InsightsViewEvents.SelectTab({ tab: "weight" }));
          }}
        />
      </BottomActionBar>
    </View>
  );
}

function NutritionInsightsPanel({
  chartKind,
  dateRange,
  includeEstimates,
  rangeDayCount,
}: {
  readonly chartKind: NutritionChartKind;
  readonly dateRange: InsightDateRange | null;
  readonly includeEstimates: boolean;
  readonly rangeDayCount: InsightRangeDayCount;
}) {
  const [snapshot, send] = useMachine(() =>
    InsightsMachineAtoms.make(NutritionInsightsMachine, {
      dateRange,
      rangeDayCount,
    })
  );
  const state = snapshot.state;

  if (state.path === "Loading") {
    return (
      <View style={styles.centered}>
        <LoadingView message="Loading nutrition insights..." />
      </View>
    );
  }

  if (state.path === "Failure") {
    return (
      <View style={styles.failure}>
        <Notice
          message={state.value.message}
          title="Nutrition insights unavailable"
          tone="warning"
        />
        <Button
          onPress={() => {
            send(NutritionInsightsEvents.Retry());
          }}
          variant="secondary"
        >
          Retry
        </Button>
      </View>
    );
  }

  if (state.path === "NoPlans") {
    return (
      <View style={styles.failure}>
        <Notice
          message={state.value.message}
          title="Nutrition unavailable"
          tone="neutral"
        />
        <Button
          icon={Plus}
          onPress={() => {
            router.push({
              pathname: "/plans/new",
              params: {
                dateKey: state.value.dateKey,
              },
            });
          }}
        >
          Create plan
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.nutritionStack}>
      <NutritionTrends
        chartKind={chartKind}
        includeEstimates={includeEstimates}
        currentReport={state.value.currentReport}
        onSelectDate={(dateKey) => {
          router.push({
            pathname: "/days/[dateKey]",
            params: {
              dateKey,
            },
          });
        }}
      />
      <RangeSummary
        includeEstimates={includeEstimates}
        rangeDayCount={snapshot.value.rangeDayCount}
        report={state.value.currentReport}
      />
    </View>
  );
}

function InsightsBottomTab({
  active,
  icon: Icon,
  label,
  onPress,
}: {
  readonly active: boolean;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.bottomTab,
        active ? styles.bottomTabActive : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <Icon
        color={active ? color.primary : color.actionSheetText}
        size={20}
        strokeWidth={2.8}
      />
      <Text
        style={[
          styles.bottomTabLabel,
          active ? styles.bottomTabLabelActive : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function InsightsHeader({
  onBackToToday,
}: {
  readonly onBackToToday: () => void;
}) {
  return (
    <MaiHeader
      action={
        <Pressable
          accessibilityLabel="Back to today"
          accessibilityRole="button"
          onPress={onBackToToday}
          style={({ pressed }) => [
            styles.headerAction,
            pressed ? styles.pressed : null,
          ]}
        >
          <ChevronLeft color={color.white} size={31} strokeWidth={2.6} />
        </Pressable>
      }
      title="Insights"
    />
  );
}

const styles = StyleSheet.create({
  reportControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  rangeControl: { flex: 1, minWidth: 0, alignItems: "flex-start" },
  toggleControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  screen: {
    flex: 1,
    backgroundColor: color.bg,
  },
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
    backgroundColor: color.bg,
  },
  headerAction: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  centered: {
    minHeight: 260,
    justifyContent: "center",
  },
  failure: {
    gap: spacing.lg,
    paddingVertical: spacing.xl,
  },
  nutritionStack: {
    gap: spacing.xxxl,
  },
  pressed: {
    opacity: 0.82,
  },
  bottomTab: {
    minHeight: 52,
    minWidth: 0,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  bottomTabActive: {
    backgroundColor: color.primarySoft,
  },
  bottomTabLabel: {
    color: color.actionSheetText,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.xs,
  },
  bottomTabLabelActive: {
    color: color.primary,
  },
});
