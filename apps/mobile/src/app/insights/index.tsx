import { BodyWeightPanel } from "@/components/body-weight/body-weight-panel";
import { NutritionTrends } from "@/components/nutrition/nutrition-trends";
import { RangeSummary } from "@/components/nutrition/range-summary";
import { AppScreen } from "@/components/ui/app-screen";
import { BottomActionBar } from "@/components/ui/bottom-action-bar";
import { Button } from "@/components/ui/button";
import { InputSelect } from "@/components/ui/input-select";
import { LoadingView } from "@/components/ui/loading-view";
import { MaiHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { dateKeyFromDate, shiftDateKey } from "@/lib/date-keys";
import { RuntimeClient } from "@/lib/runtime-client";
import { color, radius, spacing, tokens } from "@/theme/tokens";
import { EmptyEvent } from "@mai/machines";
import { Domain, NutritionReports, Reporting } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { DateTime, Effect, Match, Option, Schema } from "effect";
import { router, useRouter } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import { Activity, ChevronLeft, Plus, Scale } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { createAsyncLogic, setup } from "xstate";

const InsightTab = Schema.Literals(["nutrition", "weight"]);

const InsightRangeDayCount = Schema.Literals([7, 30, 90]);
type InsightRangeDayCount = typeof InsightRangeDayCount.Type;

const InsightsSearchParams = Schema.Struct({
  tab: Schema.optionalKey(InsightTab),
});

const InsightsViewInput = Schema.Struct({
  initialTab: InsightTab,
});

const InsightsViewContext = Schema.Struct({
  activeTab: InsightTab,
  rangeDayCount: InsightRangeDayCount,
});

const insightsViewMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(InsightsViewContext),
    events: {
      selectRange: Schema.toStandardSchemaV1(
        Schema.Struct({
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
    activeTab: input.initialTab,
    rangeDayCount: 30,
  }),
  on: {
    selectRange: ({ event }) => ({
      context: {
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

const NutritionReportEntry = Schema.Struct({
  food: Domain.Food,
  mealEntry: Domain.MealEntry,
  nutrients: Domain.EntryNutrients,
});

const NutritionReportDay = Schema.Struct({
  coverage: NutrientTotals,
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
  rangeDayCount: InsightRangeDayCount,
});

const NutritionInsightsFailureContext = Schema.Struct({
  message: Schema.String,
  rangeDayCount: InsightRangeDayCount,
});

const NutritionInsightsLoadedContext = Schema.Struct({
  currentReport: NutritionReportRange,
  rangeDayCount: InsightRangeDayCount,
});

const NutritionInsightsNoPlansContext = Schema.Struct({
  dateKey: Domain.DateKey,
  message: Schema.String,
  rangeDayCount: InsightRangeDayCount,
});

const LoadNutritionInsightsInput = Schema.Struct({
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
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const today = yield* Schema.decodeEffect(Domain.DateKey)(
              dateKeyFromDate({
                date: yield* DateTime.nowAsDate,
              })
            );
            const currentStartDateKey = yield* Schema.decodeEffect(
              Domain.DateKey
            )(
              shiftDateKey({
                dateKey: today,
                days: -(input.rangeDayCount - 1),
              })
            );
            const reports = yield* NutritionReports.NutritionReports;
            const currentReport = yield* reports.getRange({
              input: {
                endDateKey: today,
                startDateKey: currentStartDateKey,
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
    rangeDayCount: input.rangeDayCount,
  }),
  initial: "Loading",
  states: {
    Loading: {
      invoke: {
        src: "loadRange",
        input: ({ context }) => ({
          rangeDayCount: context.rangeDayCount,
        }),
        onDone: ({ context, event }) =>
          Match.value(event.output).pipe(
            Match.tagsExhaustive({
              Failure: ({ message }) => ({
                target: "Failure" as const,
                context: {
                  message,
                  rangeDayCount: context.rangeDayCount,
                },
              }),
              Loaded: ({ currentReport }) => ({
                target: "Loaded" as const,
                context: {
                  currentReport,
                  rangeDayCount: context.rangeDayCount,
                },
              }),
              NoPlans: ({ dateKey }) => ({
                target: "NoPlans" as const,
                context: {
                  dateKey,
                  message: "Create a meal plan to unlock nutrition insights.",
                  rangeDayCount: context.rangeDayCount,
                },
              }),
            })
          ),
        onError: ({ context }) => ({
          target: "Failure",
          context: {
            message: "Something went wrong while loading nutrition insights.",
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

const rangeSelectOptions = [
  {
    label: "7 days",
    value: "7",
  },
  {
    label: "30 days",
    value: "30",
  },
  {
    label: "90 days",
    value: "90",
  },
] as const;

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
        topSafeAreaColor={color.primary}
      >
        <InsightsHeader
          activeRange={snapshot.context.rangeDayCount}
          onBackToToday={() => {
            appRouter.replace("/");
          }}
          onSelectRange={(rangeDayCount) => {
            actor.trigger.selectRange({ rangeDayCount });
          }}
        />
        {snapshot.context.activeTab === "nutrition" ? (
          <NutritionInsightsPanel
            key={`nutrition-${snapshot.context.rangeDayCount}`}
            rangeDayCount={snapshot.context.rangeDayCount}
          />
        ) : (
          <BodyWeightPanel
            calendarPosition="bottom"
            key={`weight-${snapshot.context.rangeDayCount}`}
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
  rangeDayCount,
}: {
  readonly rangeDayCount: InsightRangeDayCount;
}) {
  const [snapshot, , actor] = useMachine(nutritionInsightsRouteMachine, {
    input: {
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
  activeRange,
  onBackToToday,
  onSelectRange,
}: {
  readonly activeRange: InsightRangeDayCount;
  readonly onBackToToday: () => void;
  readonly onSelectRange: (rangeDayCount: InsightRangeDayCount) => void;
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
      trailing={
        <InputSelect
          onSelect={(value) => {
            onSelectRange(value === "7" ? 7 : value === "30" ? 30 : 90);
          }}
          options={rangeSelectOptions}
          selectedValue={
            activeRange === 7 ? "7" : activeRange === 30 ? "30" : "90"
          }
          title="Report range"
          variant="header"
        />
      }
    />
  );
}

const styles = StyleSheet.create({
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
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xs,
  },
  bottomTabLabelActive: {
    color: color.primary,
  },
});
