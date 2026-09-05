import { CompactToggle } from "@/components/ui/compact-toggle";
import {
  BodyWeightPanel,
  BodyWeightChartKind,
} from "@/components/body-weight/body-weight-panel";
import {
  NutritionTrends,
  NutritionChartKind,
} from "@/components/nutrition/nutrition-trends";
import { RangeSummary } from "@/components/nutrition/range-summary";
import { AppScreen } from "@/components/ui/app-screen";
import { BottomActionBar } from "@/components/ui/bottom-action-bar";
import { Button } from "@/components/ui/button";
import { InsightRangeSelect } from "@/components/nutrition/insight-range-select";
import {
  InsightDateRange,
  InsightRangeDayCount,
} from "@mai/machines/insight-range";
import { LoadingView } from "@/components/ui/loading-view";
import { MaiHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { dateKeyFromDate, shiftDateKey } from "@/lib/date-keys";
import { InsightsRuntimeClient } from "@/lib/insights-runtime-client";
import { color, radius, spacing, tokens } from "@/theme/tokens";
import { EmptyEvent } from "@mai/machines/schemas";
import * as Domain from "@mai/nutrition/domain";
import * as Reporting from "@mai/nutrition/reporting";
import * as NutritionReports from "@mai/nutrition/services/nutrition-reports";
import { useMachine } from "@xstate/react";
import { DateTime, Effect, Match, Option, Schema } from "effect";
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
import { createAsyncLogic, setup } from "xstate";

const InsightTab = Schema.Literals(["nutrition", "weight"]);

type InsightRangeDayCount = typeof InsightRangeDayCount.Type;

const InsightsSearchParams = Schema.Struct({
  tab: Schema.optionalKey(InsightTab),
});

const InsightsViewInput = Schema.Struct({
  initialTab: InsightTab,
});

const InsightsViewContext = Schema.Struct({
  chartKind: NutritionChartKind,
  weightChartKind: BodyWeightChartKind,
  includeEstimates: Schema.Boolean,
  activeTab: InsightTab,
  dateRange: Schema.NullOr(InsightDateRange),
  rangeDayCount: InsightRangeDayCount,
});

const insightsViewMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(InsightsViewContext),
    events: {
      selectChartKind: Schema.toStandardSchemaV1(
        Schema.Struct({ chartKind: NutritionChartKind })
      ),
      selectWeightChartKind: Schema.toStandardSchemaV1(
        Schema.Struct({ chartKind: BodyWeightChartKind })
      ),
      toggleEstimates: Schema.toStandardSchemaV1(EmptyEvent),
      selectRange: Schema.toStandardSchemaV1(
        Schema.Struct({
          dateRange: Schema.NullOr(InsightDateRange),
          rangeDayCount: InsightRangeDayCount,
        })
      ),
      selectTab: Schema.toStandardSchemaV1(
        Schema.Struct({
          tab: InsightTab,
        })
      ),
    },
    input: Schema.toStandardSchemaV1(InsightsViewInput),
  },
}).createMachine({
  context: ({ input }) => ({
    chartKind: "daily",
    weightChartKind: "trend",
    activeTab: input.initialTab,
    rangeDayCount: 30,
    dateRange: null,
    includeEstimates: true,
  }),
  on: {
    selectChartKind: ({ event }) => ({
      context: { chartKind: event.chartKind },
    }),
    selectWeightChartKind: ({ event }) => ({
      context: { weightChartKind: event.chartKind },
    }),
    toggleEstimates: ({ context }) => ({
      context: { includeEstimates: !context.includeEstimates },
    }),
    selectRange: ({ event }) => ({
      context: {
        dateRange: event.dateRange,
        rangeDayCount: event.rangeDayCount,
      },
    }),
    selectTab: ({ event }) => ({
      context: {
        activeTab: event.tab,
      },
    }),
  },
});

const NutrientName = Schema.Literals(Reporting.NutrientNames);

const NutrientTotals = Schema.Struct({
  carbsGrams: Schema.Number,
  energyKcal: Schema.Number,
  fatGrams: Schema.Number,
  fiberGrams: Schema.Number,
  proteinGrams: Schema.Number,
  saltGrams: Schema.Number,
  saturatedFatGrams: Schema.Number,
  sugarGrams: Schema.Number,
});

const NutrientTargetStatus = Schema.Struct({
  amount: Schema.Number,
  deltaFromTarget: Schema.Number,
  lowerBound: Schema.UndefinedOr(Schema.Number),
  nutrientName: NutrientName,
  percentOfTarget: Schema.NullOr(Schema.Number),
  semantics: Schema.Literals(["maximum", "minimum", "range"]),
  status: Schema.Literals(["above", "below", "inside"]),
  upperBound: Schema.UndefinedOr(Schema.Number),
  value: Schema.Number,
});

const NutritionReportEntry = Schema.Union([
  Schema.Struct({
    cost: Schema.NullOr(
      Schema.Struct({ costMinor: Schema.Number, currency: Domain.CurrencyCode })
    ),
    food: Domain.Food,
    mealEntry: Domain.CatalogMealEntry,
    nutrients: Domain.EntryNutrients,
  }),
  Schema.Struct({
    cost: Schema.Null,
    food: Schema.Null,
    mealEntry: Domain.OneOffMealEntry,
    nutrients: Schema.Struct({
      energyKcal: Schema.optional(Schema.Number),
      proteinGrams: Schema.optional(Schema.Number),
      carbsGrams: Schema.optional(Schema.Number),
      fatGrams: Schema.optional(Schema.Number),
      fiberGrams: Schema.optional(Schema.Number),
      sugarGrams: Schema.optional(Schema.Number),
      saturatedFatGrams: Schema.optional(Schema.Number),
      saltGrams: Schema.optional(Schema.Number),
    }),
  }),
]);

const NutritionReportDay = Schema.Struct({
  costTotals: Schema.Struct({
    costMinorByCurrency: Schema.Struct({
      EUR: Schema.Number,
      JPY: Schema.Number,
      NZD: Schema.Number,
      USD: Schema.Number,
    }),
    entriesCount: Schema.Number,
    resolvedEntriesCount: Schema.Number,
  }),
  coverage: NutrientTotals,
  nutrition: Schema.Struct({
    recorded: NutrientTotals,
    estimated: NutrientTotals,
    missing: NutrientTotals,
    estimatedCoverage: NutrientTotals,
    coverage: NutrientTotals,
    totals: NutrientTotals,
    entriesCount: Schema.Number,
  }),
  dailyLog: Domain.DailyLog,
  dateKey: Domain.DateKey,
  entries: Schema.Array(NutritionReportEntry),
  isInsideExpectedPlanRange: Schema.Boolean,
  mealEntries: Schema.Array(Domain.MealEntry),
  plan: Domain.Plan,
  targetStatuses: Schema.Array(NutrientTargetStatus),
  totals: NutrientTotals,
});

const NutritionReportRange = Schema.Struct({
  activePlan: Domain.Plan,
  days: Schema.Array(NutritionReportDay),
  endDateKey: Domain.DateKey,
  startDateKey: Domain.DateKey,
});

const NutritionInsightsInput = Schema.Struct({
  dateRange: Schema.NullOr(InsightDateRange),
  rangeDayCount: InsightRangeDayCount,
});

const NutritionInsightsFailureContext = Schema.Struct({
  message: Schema.String,
  dateRange: Schema.NullOr(InsightDateRange),
  rangeDayCount: InsightRangeDayCount,
});

const NutritionInsightsLoadedContext = Schema.Struct({
  currentReport: NutritionReportRange,
  dateRange: Schema.NullOr(InsightDateRange),
  rangeDayCount: InsightRangeDayCount,
});

const NutritionInsightsNoPlansContext = Schema.Struct({
  dateKey: Domain.DateKey,
  message: Schema.String,
  dateRange: Schema.NullOr(InsightDateRange),
  rangeDayCount: InsightRangeDayCount,
});

const LoadNutritionInsightsInput = Schema.Struct({
  dateRange: Schema.NullOr(InsightDateRange),
  rangeDayCount: InsightRangeDayCount,
});

const nutritionInsightsRouteMachine = setup({
  schemas: {
    events: {
      retry: Schema.toStandardSchemaV1(EmptyEvent),
    },
    input: Schema.toStandardSchemaV1(NutritionInsightsInput),
  },
  states: {
    Failure: {
      schemas: {
        context: Schema.toStandardSchemaV1(NutritionInsightsFailureContext),
      },
    },
    Loaded: {
      schemas: {
        context: Schema.toStandardSchemaV1(NutritionInsightsLoadedContext),
      },
    },
    Loading: {},
    NoPlans: {
      schemas: {
        context: Schema.toStandardSchemaV1(NutritionInsightsNoPlansContext),
      },
    },
  },
  actorSources: {
    loadRange: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(LoadNutritionInsightsInput),
      },
      run: ({ input }) =>
        InsightsRuntimeClient.runPromise(
          Effect.gen(function* () {
            const today = yield* Schema.decodeEffect(Domain.DateKey)(
              dateKeyFromDate({
                date: yield* DateTime.nowAsDate,
              })
            );
            const currentStartDateKey =
              input.dateRange?.startDateKey ??
              (yield* Schema.decodeEffect(Domain.DateKey)(
                shiftDateKey({
                  dateKey: today,
                  days: -(input.rangeDayCount - 1),
                })
              ));
            const reports = yield* NutritionReports.NutritionReports;
            const currentReport = yield* reports.getRange({
              input: {
                endDateKey: input.dateRange?.endDateKey ?? today,
                startDateKey:
                  input.dateRange?.startDateKey ?? currentStartDateKey,
              },
            });

            return {
              _tag: "Loaded" as const,
              currentReport,
            };
          }).pipe(
            Effect.catchTag("NoNutritionReportPlans", () =>
              Effect.gen(function* () {
                const today = yield* Schema.decodeEffect(Domain.DateKey)(
                  dateKeyFromDate({
                    date: yield* DateTime.nowAsDate,
                  })
                );

                return {
                  _tag: "NoPlans" as const,
                  dateKey: today,
                };
              })
            ),
            Effect.catchTags({
              InvalidNutritionReportRange: () =>
                Effect.succeed({
                  _tag: "Failure" as const,
                  message: "The selected nutrition range is invalid.",
                }),
              SchemaError: () =>
                Effect.succeed({
                  _tag: "Failure" as const,
                  message: "The selected date range could not be validated.",
                }),
            }),
            Effect.catch(() =>
              Effect.succeed({
                _tag: "Failure" as const,
                message:
                  "Something went wrong while loading nutrition insights.",
              })
            )
          )
        ),
    }),
  },
}).createMachine({
  context: ({ input }) => ({
    currentReport: null,
    dateKey: null,
    message: null,
    dateRange: input.dateRange,
    rangeDayCount: input.rangeDayCount,
  }),
  initial: "Loading",
  states: {
    Loading: {
      invoke: {
        src: "loadRange",
        input: ({ context }) => ({
          dateRange: context.dateRange,
          rangeDayCount: context.rangeDayCount,
        }),
        onDone: ({ context, event }) =>
          Match.value(event.output).pipe(
            Match.tagsExhaustive({
              Failure: ({ message }) => ({
                target: "Failure" as const,
                context: {
                  message,
                  dateRange: context.dateRange,
                  rangeDayCount: context.rangeDayCount,
                },
              }),
              Loaded: ({ currentReport }) => ({
                target: "Loaded" as const,
                context: {
                  currentReport,
                  dateRange: context.dateRange,
                  rangeDayCount: context.rangeDayCount,
                },
              }),
              NoPlans: ({ dateKey }) => ({
                target: "NoPlans" as const,
                context: {
                  dateKey,
                  message: "Create a meal plan to unlock nutrition insights.",
                  dateRange: context.dateRange,
                  rangeDayCount: context.rangeDayCount,
                },
              }),
            })
          ),
        onError: ({ context }) => ({
          target: "Failure",
          context: {
            message: "Something went wrong while loading nutrition insights.",
            dateRange: context.dateRange,
            rangeDayCount: context.rangeDayCount,
          },
        }),
      },
    },
    Failure: {
      on: {
        retry: {
          target: "Loading",
        },
      },
    },
    Loaded: {},
    NoPlans: {},
  },
});

export default function InsightsScreen() {
  const initialTab = useSchemaLocalSearchParams(InsightsSearchParams).pipe(
    Option.match({
      onNone: () => "nutrition" as const,
      onSome: ({ tab }) => tab ?? "nutrition",
    })
  );
  const [snapshot, , actor] = useMachine(insightsViewMachine, {
    input: {
      initialTab,
    },
  });
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
              rangeDayCount={snapshot.context.rangeDayCount}
              dateRange={snapshot.context.dateRange}
              onSelect={(rangeDayCount, dateRange) =>
                actor.trigger.selectRange({ rangeDayCount, dateRange })
              }
            />
          </View>
          {snapshot.context.activeTab === "nutrition" ? (
            <View style={styles.toggleControls}>
              <CompactToggle
                value={snapshot.context.chartKind}
                onSelect={(chartKind) =>
                  actor.trigger.selectChartKind({ chartKind })
                }
                options={[
                  { value: "daily", label: "Daily bars", icon: ChartColumn },
                  { value: "trend", label: "Trend chart", icon: TrendingUp },
                ]}
              />
              <CompactToggle
                value={
                  snapshot.context.includeEstimates ? "estimates" : "recorded"
                }
                onSelect={(value) => {
                  if (
                    (value === "estimates") !==
                    snapshot.context.includeEstimates
                  )
                    actor.trigger.toggleEstimates();
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
              value={snapshot.context.weightChartKind}
              onSelect={(chartKind) =>
                actor.trigger.selectWeightChartKind({ chartKind })
              }
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
        {snapshot.context.activeTab === "nutrition" ? (
          <NutritionInsightsPanel
            chartKind={snapshot.context.chartKind}
            key={`nutrition-${snapshot.context.rangeDayCount}-${snapshot.context.dateRange?.startDateKey}-${snapshot.context.dateRange?.endDateKey}`}
            dateRange={snapshot.context.dateRange}
            includeEstimates={snapshot.context.includeEstimates}
            rangeDayCount={snapshot.context.rangeDayCount}
          />
        ) : (
          <BodyWeightPanel
            chartKind={snapshot.context.weightChartKind}
            calendarPosition="bottom"
            key={`weight-${snapshot.context.rangeDayCount}-${snapshot.context.dateRange?.startDateKey}-${snapshot.context.dateRange?.endDateKey}`}
            reportDateRange={snapshot.context.dateRange}
            reportDayCount={snapshot.context.rangeDayCount}
            showImport
          />
        )}
      </AppScreen>
      <BottomActionBar variant="tab">
        <InsightsBottomTab
          active={snapshot.context.activeTab === "nutrition"}
          icon={Activity}
          label="Nutrition"
          onPress={() => {
            actor.trigger.selectTab({ tab: "nutrition" });
          }}
        />
        <InsightsBottomTab
          active={snapshot.context.activeTab === "weight"}
          icon={Scale}
          label="Weight"
          onPress={() => {
            actor.trigger.selectTab({ tab: "weight" });
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
  const [snapshot, , actor] = useMachine(nutritionInsightsRouteMachine, {
    input: {
      dateRange,
      rangeDayCount,
    },
  });

  if (snapshot.matches("Loading")) {
    return (
      <View style={styles.centered}>
        <LoadingView message="Loading nutrition insights..." />
      </View>
    );
  }

  if (snapshot.matches("Failure")) {
    return (
      <View style={styles.failure}>
        <Notice
          message={snapshot.context.message}
          title="Nutrition insights unavailable"
          tone="warning"
        />
        <Button onPress={actor.trigger.retry} variant="secondary">
          Retry
        </Button>
      </View>
    );
  }

  if (snapshot.matches("NoPlans")) {
    return (
      <View style={styles.failure}>
        <Notice
          message={snapshot.context.message}
          title="Nutrition unavailable"
          tone="neutral"
        />
        <Button
          icon={Plus}
          onPress={() => {
            router.push({
              pathname: "/plans/new",
              params: {
                dateKey: snapshot.context.dateKey,
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
        currentReport={snapshot.context.currentReport}
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
        rangeDayCount={snapshot.context.rangeDayCount}
        report={snapshot.context.currentReport}
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
