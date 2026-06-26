import { Domain, NutritionReports } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { DateTime, Effect, Schema } from "effect";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { assign, fromPromise, setup } from "xstate";

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

type LoadResult =
  | {
      readonly _tag: "Failure";
      readonly message: string;
    }
  | {
      readonly _tag: "Loaded";
      readonly report: NutritionReports.NutritionReportRange;
    }
  | {
      readonly _tag: "NoPlans";
      readonly dateKey: Domain.DateKey;
    };

type InsightsRouter = ReturnType<typeof useRouter>;

const insightsRouteMachine = setup({
  types: {
    context: {} as
      | {
          readonly _tag: "Failure";
          readonly message: string;
          readonly router: InsightsRouter;
        }
      | {
          readonly _tag: "Loaded";
          readonly report: NutritionReports.NutritionReportRange;
          readonly router: InsightsRouter;
        }
      | {
          readonly _tag: "Loading";
          readonly router: InsightsRouter;
        },
    events: {} as {
      readonly type: "retry";
    },
    input: {} as {
      readonly router: InsightsRouter;
    },
  },
  actors: {
    loadDefaultRange: fromPromise(() =>
      RuntimeClient.runPromise(loadDefaultRange())
    ),
  },
}).createMachine({
  context: ({ input }) => ({
    _tag: "Loading" as const,
    router: input.router,
  }),
  initial: "Loading",
  states: {
    Loading: {
      invoke: {
        src: "loadDefaultRange",
        onDone: [
          {
            guard: ({ event }) => event.output._tag === "NoPlans",
            target: "Redirected",
            actions: ({ context, event }) => {
              context.router.replace({
                pathname: "/plans/new",
                params: {
                  dateKey: getNoPlansDateKey({ result: event.output }),
                },
              });
            },
          },
          {
            guard: ({ event }) => event.output._tag === "Failure",
            target: "Failure",
            actions: assign(({ event }) => ({
              _tag: "Failure" as const,
              message: getFailureMessage({ result: event.output }),
            })),
          },
          {
            guard: ({ event }) => event.output._tag === "Loaded",
            target: "Loaded",
            actions: assign(({ event }) => ({
              _tag: "Loaded" as const,
              report: getLoadedReport({ result: event.output }),
            })),
          },
        ],
        onError: {
          target: "Failure",
          actions: assign({
            _tag: "Failure" as const,
            message:
              "Something went wrong while loading your nutrition report.",
          }),
        },
      },
    },
    Failure: {
      on: {
        retry: {
          target: "Loading",
          actions: assign({
            _tag: "Loading" as const,
          }),
        },
      },
    },
    Loaded: {},
    Redirected: {},
  },
});

export default function InsightsScreen() {
  const router = useRouter();
  const [snapshot, send] = useMachine(insightsRouteMachine, {
    input: {
      router,
    },
  });
  const state = snapshot.context;

  if (snapshot.matches("Loading") || snapshot.matches("Redirected")) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading nutrition insights..." />
      </AppScreen>
    );
  }

  if (state._tag === "Failure") {
    return (
      <AppScreen contentStyle={styles.centered}>
        <View style={styles.failure}>
          <Text style={styles.failureTitle}>Insights unavailable</Text>
          <Notice
            message={state.message}
            title="Range summary could not load"
            tone="warning"
          />
          <Button
            onPress={() => {
              send({
                type: "retry",
              });
            }}
            variant="secondary"
          >
            Retry
          </Button>
        </View>
      </AppScreen>
    );
  }

  if (state._tag !== "Loaded") {
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
          router.replace("/");
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

export function getFailureMessage({ result }: { readonly result: LoadResult }) {
  return result._tag === "Failure"
    ? result.message
    : "Something went wrong while loading your nutrition report.";
}

export function getLoadedReport({
  result,
}: {
  readonly result: LoadResult;
}): NutritionReports.NutritionReportRange {
  if (result._tag !== "Loaded") {
    throw new Error("Expected a loaded nutrition report.");
  }

  return result.report;
}

export function getNoPlansDateKey({
  result,
}: {
  readonly result: LoadResult;
}): Domain.DateKey {
  if (result._tag !== "NoPlans") {
    throw new Error("Expected a no-plans nutrition report result.");
  }

  return result.dateKey;
}

export function loadDefaultRange(): Effect.Effect<
  LoadResult,
  never,
  NutritionReports.NutritionReports
> {
  return Effect.gen(function* () {
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
        message: "Something went wrong while loading your nutrition report.",
      })
    )
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
