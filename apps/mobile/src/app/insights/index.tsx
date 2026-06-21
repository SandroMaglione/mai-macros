import { DateKey } from "@mai/nutrition";
import { NutritionReports } from "@mai/nutrition/services/nutrition-reports";
import { useMachine } from "@xstate/react";
import { DateTime, Effect, Schema } from "effect";
import { useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { assign, fromPromise, setup } from "xstate";

import { RangeSummary } from "@/components/nutrition/range-summary";
import { AppScreen, Button, LoadingView, Notice } from "@/components/ui";
import { dateKeyFromDate, shiftDateKey } from "@/lib/date-keys";
import { RuntimeClient } from "@/lib/runtime-client";
import { color, spacing, type } from "@/theme/tokens";

import type { NutritionReportRange } from "@mai/nutrition/services/nutrition-reports";

type LoadResult =
  | {
      readonly _tag: "Failure";
      readonly message: string;
    }
  | {
      readonly _tag: "Loaded";
      readonly report: NutritionReportRange;
    }
  | {
      readonly _tag: "NoPlans";
      readonly dateKey: DateKey;
    };

type InsightsRouter = ReturnType<typeof useRouter>;

type InsightsRouteContext =
  | {
      readonly _tag: "Failure";
      readonly message: string;
      readonly router: InsightsRouter;
    }
  | {
      readonly _tag: "Loaded";
      readonly report: NutritionReportRange;
      readonly router: InsightsRouter;
    }
  | {
      readonly _tag: "Loading";
      readonly router: InsightsRouter;
    };

const insightsRouteMachine = setup({
  types: {
    context: {} as InsightsRouteContext,
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
    >
      <RangeSummary report={state.report} />
    </AppScreen>
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
}): NutritionReportRange {
  if (result._tag !== "Loaded") {
    throw new Error("Expected a loaded nutrition report.");
  }

  return result.report;
}

export function getNoPlansDateKey({
  result,
}: {
  readonly result: LoadResult;
}): DateKey {
  if (result._tag !== "NoPlans") {
    throw new Error("Expected a no-plans nutrition report result.");
  }

  return result.dateKey;
}

export function loadDefaultRange(): Effect.Effect<
  LoadResult,
  never,
  NutritionReports
> {
  return Effect.gen(function* () {
    const today = yield* Schema.decodeEffect(DateKey)(
      dateKeyFromDate({
        date: yield* DateTime.nowAsDate,
      })
    );
    const startDateKey = yield* Schema.decodeEffect(DateKey)(
      shiftDateKey({
        dateKey: today,
        days: -6,
      })
    );
    const reports = yield* NutritionReports;
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
        const today = yield* Schema.decodeEffect(DateKey)(
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
    fontSize: type.size.xl,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xl,
  },
});
