import { RangeSummary } from "@/components/nutrition/range-summary";
import {
  AppScreen,
  Button,
  LoadingView,
  MaiHeader,
  Notice,
} from "@/components/ui";
import { dateKeyFromDate, shiftDateKey } from "@/lib/date-keys";
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

const NutritionInsightsFailureContext = Schema.Struct({
  message: Schema.String,
});

const NutritionInsightsLoadedContext = Schema.Struct({
  report: NutritionReportRange,
});

const NutritionInsightsNoPlansContext = Schema.Struct({
  dateKey: Domain.DateKey,
  message: Schema.String,
});

const nutritionInsightsRouteMachine = setup({
  schemas: {
    events: {
      retry: Schema.toStandardSchemaV1(EmptyEvent),
    },
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
    loadDefaultRange: createAsyncLogic({
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
                target: "Failure" as const,
                context: {
                  message,
                },
              }),
              Loaded: ({ report }) => ({
                target: "Loaded" as const,
                context: {
                  report,
                },
              }),
              NoPlans: ({ dateKey }) => ({
                target: "NoPlans" as const,
                context: {
                  dateKey,
                  message: "Create a meal plan to unlock nutrition insights.",
                },
              }),
            })
          ),
        onError: {
          target: "Failure",
          context: {
            message:
              "Something went wrong while loading your nutrition report.",
          },
        },
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
  },
});

export default function InsightsScreen() {
  const appRouter = useRouter();

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
      <NutritionInsightsPanel />
    </AppScreen>
  );
}

function NutritionInsightsPanel() {
  const [snapshot, , actor] = useMachine(nutritionInsightsRouteMachine);

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
        <Text style={styles.failureTitle}>Insights unavailable</Text>
        <Notice
          message={snapshot.context.message}
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

  return <RangeSummary report={snapshot.context.report} />;
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
