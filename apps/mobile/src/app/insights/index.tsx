import { EmptyEvent } from "@mai/machines";
import { Domain, NutritionReports, Reporting } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { DateTime, Effect, Match, Schema } from "effect";
import { router, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { createAsyncLogic, setup } from "xstate";

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

const InsightsRouteContext = Schema.Struct({
  message: Schema.NullOr(Schema.String),
  report: Schema.NullOr(NutritionReportRange),
});

const insightsRouteMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(InsightsRouteContext),
    events: {
      retry: Schema.toStandardSchemaV1(EmptyEvent),
    },
  },
  states: {
    Loading: {},
    Failure: {},
    Loaded: {},
    Redirected: {},
  },
  actions: {
    redirectToNewPlan: (params: { readonly dateKey: Domain.DateKey }) => {
      router.replace({
        pathname: "/plans/new",
        params,
      });
    },
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
    message: null,
    report: null,
  }),
  initial: "Loading",
  states: {
    Loading: {
      invoke: {
        src: "loadDefaultRange",
        onDone: ({ event, actions }, enq) =>
          Match.value(event.output).pipe(
            Match.tagsExhaustive({
              Failure: ({ message }) => ({
                target: "Failure",
                context: {
                  message:
                    message ??
                    "Something went wrong while loading your nutrition report.",
                },
              }),
              Loaded: ({ report }) => ({
                target: "Loaded",
                context: {
                  message: null,
                  report,
                },
              }),
              NoPlans: ({ dateKey }) => {
                enq(actions.redirectToNewPlan, { dateKey });

                return { target: "Redirected" };
              },
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
          context: {
            message: null,
            report: null,
          },
        },
      },
    },
    Loaded: {},
    Redirected: {},
  },
});

export default function InsightsScreen() {
  const appRouter = useRouter();
  const [snapshot, , actor] = useMachine(insightsRouteMachine);
  const state = snapshot.context;
  const routeState = snapshot.value;

  if (routeState === "Loading" || routeState === "Redirected") {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading nutrition insights..." />
      </AppScreen>
    );
  }

  if (routeState === "Failure") {
    return (
      <AppScreen contentStyle={styles.centered}>
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
      </AppScreen>
    );
  }

  if (state.report === null) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading nutrition insights..." />
      </AppScreen>
    );
  }

  return (
    <AppScreen
      scroll
      contentStyle={styles.content}
      scrollProps={{
        showsVerticalScrollIndicator: false,
      }}
      topSafeAreaColor={color.primary}
    >
      <InsightsHeader
        onBackToToday={() => {
          appRouter.replace("/");
        }}
      />
      <RangeSummary report={state.report} />
    </AppScreen>
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
            pressed ? styles.headerActionPressed : null,
          ]}
        >
          <ChevronLeft color={color.white} size={31} strokeWidth={2.6} />
        </Pressable>
      }
      title="Nutrition insights"
    />
  );
}

const styles = StyleSheet.create({
  content: {
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
    flex: 1,
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
