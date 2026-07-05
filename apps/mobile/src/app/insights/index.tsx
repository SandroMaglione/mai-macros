import { BodyWeightPanel } from "@/components/body-weight/body-weight-panel";
import { RangeSummary } from "@/components/nutrition/range-summary";
import {
  AppScreen,
  Button,
  LoadingView,
  MaiHeader,
  Notice,
  PagerTabBar,
} from "@/components/ui";
import { dateKeyFromDate, shiftDateKey, todayDateKey } from "@/lib/date-keys";
import { RuntimeClient } from "@/lib/runtime-client";
import { color, spacing, tokens } from "@/theme/tokens";
import { EmptyEvent } from "@mai/machines";
import { Domain, NutritionReports, Reporting } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { DateTime, Effect, Match, Schema } from "effect";
import { router, useRouter } from "expo-router";
import { ChevronLeft, Plus } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { createAsyncLogic, setup } from "xstate";

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

const StatsTab = Schema.Literals(["nutrition", "weight"]);

type StatsTab = typeof StatsTab.Type;

const LoadDefaultRangeResult = Schema.Union([
  Schema.TaggedStruct("Loaded", {
    report: NutritionReportRange,
  }),
  Schema.TaggedStruct("NoPlans", {
    dateKey: Domain.DateKey,
  }),
  Schema.TaggedStruct("Failure", {
    message: Schema.String,
  }),
]);

const NutritionInsightsRouteContext = Schema.Struct({
  dateKey: Schema.NullOr(Domain.DateKey),
  message: Schema.NullOr(Schema.String),
  report: Schema.NullOr(NutritionReportRange),
});

const nutritionInsightsRouteMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(NutritionInsightsRouteContext),
    events: {
      retry: Schema.toStandardSchemaV1(EmptyEvent),
    },
  },
  states: {
    Failure: {},
    Loaded: {},
    Loading: {},
  },
  actorSources: {
    loadDefaultRange: createAsyncLogic({
      schemas: {
        output: Schema.toStandardSchemaV1(LoadDefaultRangeResult),
      },
      run: () =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const today = yield* Schema.decodeEffect(Domain.DateKey)(
              dateKeyFromDate({
                date: yield* DateTime.nowAsDate,
              })
            );
            const startDateKey = yield* Schema.decodeEffect(Domain.DateKey)(
              shiftDateKey({
                dateKey: today,
                days: -6,
              })
            );
            const reports = yield* NutritionReports.NutritionReports;
            const report = yield* reports.getRange({
              input: {
                endDateKey: today,
                startDateKey,
              },
            });

            return {
              _tag: "Loaded" as const,
              report,
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
                  message: "The default 7-day range is invalid. Please retry.",
                }),
              SchemaError: () =>
                Effect.succeed({
                  _tag: "Failure" as const,
                  message: "The default date range could not be validated.",
                }),
            }),
            Effect.catch(() =>
              Effect.succeed({
                _tag: "Failure" as const,
                message:
                  "Something went wrong while loading your nutrition report.",
              })
            )
          )
        ),
    }),
  },
}).createMachine({
  context: () => ({
    dateKey: null,
    message: null,
    report: null,
  }),
  initial: "Loading",
  states: {
    Loading: {
      invoke: {
        src: "loadDefaultRange",
        onDone: ({ event }) =>
          Match.value(event.output).pipe(
            Match.tagsExhaustive({
              Failure: ({ message }) => ({
                target: "Failure",
                context: {
                  dateKey: null,
                  message:
                    message ??
                    "Something went wrong while loading your nutrition report.",
                  report: null,
                },
              }),
              Loaded: ({ report }) => ({
                target: "Loaded",
                context: {
                  dateKey: report.endDateKey,
                  message: null,
                  report,
                },
              }),
              NoPlans: ({ dateKey }) => ({
                target: "Loaded",
                context: {
                  dateKey,
                  message: "Create a meal plan to unlock nutrition insights.",
                  report: null,
                },
              }),
            })
          ),
        onError: {
          target: "Failure",
          context: {
            dateKey: null,
            message:
              "Something went wrong while loading your nutrition report.",
            report: null,
          },
        },
      },
    },
    Failure: {
      on: {
        retry: {
          target: "Loading",
          context: {
            dateKey: null,
            message: null,
            report: null,
          },
        },
      },
    },
    Loaded: {},
  },
});

const statsTabMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(
      Schema.Struct({
        activeTab: StatsTab,
      })
    ),
    events: {
      selectTab: Schema.toStandardSchemaV1(
        Schema.Struct({
          tab: StatsTab,
        })
      ),
    },
  },
  states: {
    Ready: {},
  },
}).createMachine({
  context: () => ({
    activeTab: "nutrition" as const,
  }),
  initial: "Ready",
  states: {
    Ready: {
      on: {
        selectTab: ({ event }) => ({
          context: {
            activeTab: event.tab,
          },
        }),
      },
    },
  },
});

const statsTabs = [
  {
    accessibilityLabel: "Nutrition stats tab",
    key: "nutrition",
    label: "Nutrition",
  },
  {
    accessibilityLabel: "Weight stats tab",
    key: "weight",
    label: "Weight",
  },
] as const satisfies readonly {
  readonly accessibilityLabel: string;
  readonly key: StatsTab;
  readonly label: string;
}[];

export default function InsightsScreen() {
  const appRouter = useRouter();
  const [snapshot, , actor] = useMachine(statsTabMachine);
  const activeTab = snapshot.context.activeTab;
  const activeIndex = Math.max(
    0,
    statsTabs.findIndex((tab) => tab.key === activeTab)
  );

  return (
    <AppScreen
      scroll
      contentStyle={styles.content}
      scrollProps={{
        showsVerticalScrollIndicator: false,
      }}
      topSafeAreaColor={color.primary}
    >
      <StatsHeader
        onBackToToday={() => {
          appRouter.replace("/");
        }}
      />
      <PagerTabBar
        activeIndex={activeIndex}
        onActiveIndexChange={(index) => {
          const tab = statsTabs[index];

          if (tab !== undefined) {
            actor.trigger.selectTab({ tab: tab.key });
          }
        }}
        tabs={statsTabs}
      />
      {activeTab === "nutrition" ? (
        <NutritionInsightsPanel />
      ) : (
        <BodyWeightPanel />
      )}
    </AppScreen>
  );
}

function NutritionInsightsPanel() {
  const [snapshot, , actor] = useMachine(nutritionInsightsRouteMachine);
  const state = snapshot.context;
  const routeState = snapshot.value;

  if (routeState === "Loading") {
    return (
      <View style={styles.centered}>
        <LoadingView message="Loading nutrition insights..." />
      </View>
    );
  }

  if (routeState === "Failure") {
    return (
      <View style={styles.failure}>
        <Text style={styles.failureTitle}>Insights unavailable</Text>
        <Notice
          message={
            state.message ??
            "Something went wrong while loading your nutrition report."
          }
          title="Range summary could not load"
          tone="warning"
        />
        <Button
          onPress={() => {
            actor.trigger.retry();
          }}
          variant="secondary"
        >
          Retry
        </Button>
      </View>
    );
  }

  if (state.report === null) {
    return (
      <View style={styles.failure}>
        <Notice
          message={
            state.message ?? "Create a meal plan to unlock nutrition insights."
          }
          title="Nutrition unavailable"
          tone="neutral"
        />
        <Button
          icon={Plus}
          onPress={() => {
            router.push({
              pathname: "/plans/new",
              params: {
                dateKey: state.dateKey ?? todayDateKey(),
              },
            });
          }}
        >
          Create plan
        </Button>
      </View>
    );
  }

  return <RangeSummary report={state.report} />;
}

function StatsHeader({
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
            pressed ? styles.headerActionPressed : null,
          ]}
        >
          <ChevronLeft color={color.white} size={31} strokeWidth={2.6} />
        </Pressable>
      }
      title="Stats"
    />
  );
}

const styles = StyleSheet.create({
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
    borderRadius: 999,
  },
  headerActionPressed: {
    opacity: 0.82,
  },
  centered: {
    minHeight: 220,
    justifyContent: "center",
  },
  failure: {
    gap: spacing.lg,
  },
  failureTitle: {
    color: color.text,
    fontSize: tokens.type.size.xl,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xl,
  },
});
