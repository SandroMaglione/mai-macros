import {
  AppHeader,
  AppScreen,
  BottomActionBar,
  Button,
  IconButton,
  LoadingOverlay,
  LoadingView,
  Notice,
  PagerTabs,
  SectionCard,
} from "@/components/ui";
import { todayDateKey } from "@/lib/date-keys";
import { formatNumber } from "@/lib/format";
import { RuntimeClient } from "@/lib/runtime-client";
import { color, radius, shadow, spacing, type } from "@/theme/tokens";
import { calculatePlanEnergyKcal, DateKey, type Plan } from "@mai/nutrition";
import { DailyLogs, type OpenedDay } from "@mai/nutrition/services/daily-logs";
import { useMachine } from "@xstate/react";
import { Effect, Schema } from "effect";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft, Pencil, Plus } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { assertEvent, assign, fromPromise, setup } from "xstate";

type PlansDay = Pick<OpenedDay, "dailyLog" | "plans" | "selectedPlan">;

type PlansRouteData = {
  readonly dateKey: DateKey;
  readonly day: PlansDay;
};

type PlansRouteLoadResult =
  | {
      readonly _tag: "InvalidRoute";
    }
  | {
      readonly _tag: "NoMealPlans";
      readonly dateKey: DateKey;
    }
  | {
      readonly _tag: "Ready";
      readonly data: PlansRouteData;
    };

type PlansTabIndex = 0 | 1;

type PlansRouteEvent =
  | {
      readonly index: PlansTabIndex;
      readonly type: "selectTab";
    }
  | {
      readonly plan: Plan;
      readonly type: "changePlan";
    };

const plansRouteMachine = setup({
  types: {
    context: {} as {
      readonly activeTab: PlansTabIndex;
      readonly data: PlansRouteData | null;
      readonly dateKeyParam: string | undefined;
      readonly notice: string | null;
      readonly redirectDateKey: DateKey | null;
    },
    events: {} as PlansRouteEvent,
    input: {} as {
      readonly dateKeyParam: string | undefined;
    },
  },
  actors: {
    changePlan: fromPromise<
      PlansDay,
      {
        readonly dateKey: DateKey;
        readonly planId: Plan["id"];
      }
    >(({ input }) =>
      RuntimeClient.runPromise(
        Effect.gen(function* () {
          const dailyLogs = yield* DailyLogs;

          return yield* dailyLogs.changePlan({
            input: {
              dateKey: input.dateKey,
              planId: input.planId,
            },
          });
        })
      )
    ),
    loadRouteData: fromPromise<PlansRouteLoadResult, string | undefined>(
      ({ input }) =>
        RuntimeClient.runPromise(
          loadPlansRouteData({
            dateKeyParam: input,
          })
        )
    ),
  },
}).createMachine({
  context: ({ input }) => ({
    activeTab: 0,
    data: null,
    dateKeyParam: input.dateKeyParam,
    notice: null,
    redirectDateKey: null,
  }),
  initial: "Loading",
  states: {
    Loading: {
      invoke: {
        src: "loadRouteData",
        input: ({ context }) => context.dateKeyParam,
        onDone: [
          {
            guard: ({ event }) => event.output._tag === "InvalidRoute",
            target: "InvalidRoute",
          },
          {
            guard: ({ event }) => event.output._tag === "NoMealPlans",
            target: "NoMealPlans",
            actions: assign(({ event }) => ({
              data: null,
              redirectDateKey:
                event.output._tag === "NoMealPlans"
                  ? event.output.dateKey
                  : null,
            })),
          },
          {
            guard: ({ event }) => event.output._tag === "Ready",
            target: "Ready",
            actions: assign(({ event }) => ({
              data: event.output._tag === "Ready" ? event.output.data : null,
            })),
          },
        ],
        onError: {
          target: "InvalidRoute",
        },
      },
    },
    Ready: {
      on: {
        changePlan: {
          target: "ChangingPlan",
          actions: assign({
            notice: null,
          }),
        },
        selectTab: {
          actions: assign(({ event }) => {
            assertEvent(event, "selectTab");

            return {
              activeTab: event.index,
            };
          }),
        },
      },
    },
    ChangingPlan: {
      invoke: {
        src: "changePlan",
        input: ({ context, event }) => {
          assertEvent(event, "changePlan");

          if (context.data === null) {
            throw new Error("Cannot change plans before the route loads.");
          }

          return {
            dateKey: context.data.dateKey,
            planId: event.plan.id,
          };
        },
        onDone: {
          target: "Ready",
          actions: assign(({ context, event }) => {
            if (context.data === null) {
              return {
                notice: "Plan changed.",
              };
            }

            return {
              data: {
                ...context.data,
                day: event.output,
              },
              notice: "Plan changed.",
            };
          }),
        },
        onError: {
          target: "Ready",
          actions: assign({
            notice: "Could not change plan. Please try again.",
          }),
        },
      },
    },
    InvalidRoute: {
      entry: () => {
        router.replace("/");
      },
    },
    NoMealPlans: {
      entry: ({ context }) => {
        router.replace({
          pathname: "/plans/new",
          params: {
            dateKey: context.redirectDateKey ?? todayDateKey(),
          },
        });
      },
    },
  },
});

export default function PlansScreen() {
  const params = useLocalSearchParams<{
    readonly dateKey?: string | string[];
  }>();
  const [snapshot, send] = useMachine(plansRouteMachine, {
    input: {
      dateKeyParam: globalThis.Array.isArray(params.dateKey)
        ? params.dateKey[0]
        : params.dateKey,
    },
  });

  if (
    snapshot.matches("Loading") ||
    snapshot.matches("InvalidRoute") ||
    snapshot.matches("NoMealPlans")
  ) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading plans" />
      </AppScreen>
    );
  }

  if (snapshot.context.data === null) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading plans" />
      </AppScreen>
    );
  }

  return (
    <ReadyPlansScreen
      activeTab={snapshot.context.activeTab}
      data={snapshot.context.data}
      disabled={snapshot.matches("ChangingPlan")}
      notice={snapshot.context.notice}
      onChangePlan={(plan) => {
        send({
          plan,
          type: "changePlan",
        });
      }}
      onSelectTab={(index) => {
        send({
          index: index === 0 ? 0 : 1,
          type: "selectTab",
        });
      }}
    />
  );
}

function ReadyPlansScreen({
  activeTab,
  data,
  disabled,
  notice,
  onChangePlan,
  onSelectTab,
}: {
  readonly activeTab: PlansTabIndex;
  readonly data: PlansRouteData;
  readonly disabled: boolean;
  readonly notice: string | null;
  readonly onChangePlan: (plan: Plan) => void;
  readonly onSelectTab: (index: number) => void;
}) {
  const selectedPlan = data.day.selectedPlan;

  return (
    <View style={styles.screen}>
      <AppScreen contentStyle={styles.content} safeAreaEdges={["top"]}>
        <AppHeader
          embedded
          leading={
            <IconButton
              accessibilityLabel="Back to day"
              icon={ChevronLeft}
              onPress={() => {
                router.replace({
                  pathname: "/days/[dateKey]",
                  params: {
                    dateKey: data.dateKey,
                  },
                });
              }}
              variant="ghost"
            />
          }
          shadow
          subtitle={data.dateKey}
          title="Plans"
        />

        {notice === null ? null : (
          <Notice
            message={notice}
            style={styles.notice}
            tone={notice === "Plan changed." ? "success" : "danger"}
          />
        )}

        <PagerTabs
          activeIndex={activeTab}
          onActiveIndexChange={onSelectTab}
          tabs={[
            {
              accessibilityLabel: "Select active plan",
              content: (
                <PlanSelectTab
                  disabled={disabled}
                  onChangePlan={onChangePlan}
                  plans={data.day.plans}
                  selectedPlanId={selectedPlan.id}
                />
              ),
              key: "select",
              label: "Select",
            },
            {
              accessibilityLabel: "Manage plans",
              content: <PlanManageTab plan={selectedPlan} />,
              key: "manage",
              label: "Manage",
            },
          ]}
        />
      </AppScreen>

      <BottomActionBar>
        <Button
          disabled={disabled}
          icon={Pencil}
          onPress={() => {
            router.push({
              pathname: "/plans/[planId]/edit",
              params: {
                dateKey: data.dateKey,
                planId: selectedPlan.id,
              },
            });
          }}
          style={styles.footerButton}
          variant="secondary"
        >
          Edit plan
        </Button>
        <Button
          disabled={disabled}
          icon={Plus}
          onPress={() => {
            router.push({
              pathname: "/plans/new",
              params: {
                dateKey: data.dateKey,
              },
            });
          }}
          style={styles.footerButton}
        >
          New plan
        </Button>
      </BottomActionBar>

      <LoadingOverlay message="Changing plan" visible={disabled} />
    </View>
  );
}

function PlanSelectTab({
  disabled,
  onChangePlan,
  plans,
  selectedPlanId,
}: {
  readonly disabled: boolean;
  readonly onChangePlan: (plan: Plan) => void;
  readonly plans: readonly Plan[];
  readonly selectedPlanId: Plan["id"];
}) {
  return (
    <ScrollView
      alwaysBounceVertical={false}
      contentContainerStyle={styles.tabScrollContent}
      keyboardShouldPersistTaps="handled"
      style={styles.tabScroll}
    >
      {plans.map((plan) => {
        const isSelected = plan.id === selectedPlanId;

        return (
          <PlanRow
            disabled={disabled || isSelected}
            isSelected={isSelected}
            key={plan.id}
            onPress={() => {
              onChangePlan(plan);
            }}
            plan={plan}
          />
        );
      })}
    </ScrollView>
  );
}

function PlanManageTab({ plan }: { readonly plan: Plan }) {
  return (
    <ScrollView
      alwaysBounceVertical={false}
      contentContainerStyle={styles.tabScrollContent}
      style={styles.tabScroll}
    >
      <SectionCard style={styles.card} subtitle="Active" title={plan.name}>
        <PlanMetrics plan={plan} />
      </SectionCard>
    </ScrollView>
  );
}

function PlanRow({
  disabled,
  isSelected,
  onPress,
  plan,
}: {
  readonly disabled: boolean;
  readonly isSelected: boolean;
  readonly onPress: () => void;
  readonly plan: Plan;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.planRow,
        isSelected ? styles.planRowSelected : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.planCopy}>
        <Text numberOfLines={1} style={styles.planName}>
          {plan.name}
        </Text>
        <Text numberOfLines={1} style={styles.planMacroLine}>
          {_formatPlanNumber({
            value: calculatePlanEnergyKcal({ plan }),
          })}{" "}
          kcal | C{" "}
          {_formatPlanNumber({
            value: plan.carbsTargetGrams,
          })}
          g | P{" "}
          {_formatPlanNumber({
            value: plan.proteinTargetGrams,
          })}
          g | F {_formatPlanNumber({ value: plan.fatTargetGrams })}g
        </Text>
      </View>
      {isSelected ? <Text style={styles.activeBadge}>Active</Text> : null}
    </Pressable>
  );
}

function PlanMetrics({ plan }: { readonly plan: Plan }) {
  return (
    <View style={styles.metricGrid}>
      <PlanMetric
        colorValue={color.nutritionEnergy}
        label="Calories"
        value={`${_formatPlanNumber({
          value: calculatePlanEnergyKcal({ plan }),
        })} kcal`}
      />
      <PlanMetric
        colorValue={color.nutritionCarbs}
        label="Carbs"
        value={`${_formatPlanNumber({ value: plan.carbsTargetGrams })} g`}
      />
      <PlanMetric
        colorValue={color.nutritionProtein}
        label="Protein"
        value={`${_formatPlanNumber({ value: plan.proteinTargetGrams })} g`}
      />
      <PlanMetric
        colorValue={color.nutritionFat}
        label="Fat"
        value={`${_formatPlanNumber({ value: plan.fatTargetGrams })} g`}
      />
    </View>
  );
}

function PlanMetric({
  colorValue,
  label,
  value,
}: {
  readonly colorValue: string;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <View style={styles.metric}>
      <Text
        numberOfLines={1}
        style={[styles.metricValue, { color: colorValue }]}
      >
        {value}
      </Text>
      <Text
        numberOfLines={1}
        style={[styles.metricLabel, { color: colorValue }]}
      >
        {label}
      </Text>
    </View>
  );
}

export function loadPlansRouteData({
  dateKeyParam,
}: {
  readonly dateKeyParam: string | undefined;
}) {
  return Effect.gen(function* () {
    const dateKey = yield* Schema.decodeUnknownEffect(DateKey)(
      dateKeyParam ?? todayDateKey()
    );
    const dailyLogs = yield* DailyLogs;
    const day = yield* dailyLogs.open({
      input: {
        dateKey,
      },
    });

    return {
      _tag: "Ready" as const,
      data: {
        dateKey,
        day,
      },
    };
  }).pipe(
    Effect.catchTag("NoMealPlans", ({ dateKey }) =>
      Effect.succeed({
        _tag: "NoMealPlans" as const,
        dateKey,
      })
    ),
    Effect.catchTag("SchemaError", () =>
      Effect.succeed({
        _tag: "InvalidRoute" as const,
      })
    )
  );
}

function _formatPlanNumber({ value }: { readonly value: number }) {
  return formatNumber({
    maximumFractionDigits: value > 0 && value < 10 ? 1 : 0,
    value,
  });
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.bg,
  },
  content: {
    flex: 1,
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 0,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.lg,
  },
  notice: {
    marginBottom: -spacing.sm,
  },
  tabScroll: {
    flex: 1,
  },
  tabScrollContent: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  planRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: color.surface,
    ...shadow.card,
  },
  planRowSelected: {
    borderColor: color.primary,
    backgroundColor: color.primarySoft,
  },
  pressed: {
    opacity: 0.84,
  },
  planCopy: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xs,
  },
  planName: {
    color: color.text,
    fontSize: type.size.md,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.md,
  },
  planMacroLine: {
    color: color.textMuted,
    fontSize: type.size.xs,
    fontWeight: type.weight.semibold,
    lineHeight: type.lineHeight.xs,
  },
  activeBadge: {
    color: color.primary,
    fontSize: type.size.xs,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xs,
  },
  card: {
    backgroundColor: color.surface,
  },
  metricGrid: {
    gap: spacing.sm,
  },
  metric: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: color.sheetBorder,
    paddingBottom: spacing.sm,
  },
  metricValue: {
    minWidth: 0,
    flex: 1,
    fontSize: type.size.lg,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.lg,
  },
  metricLabel: {
    fontSize: type.size.sm,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.sm,
  },
  footerButton: {
    flex: 1,
  },
});
