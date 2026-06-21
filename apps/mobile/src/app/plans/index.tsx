import {
  AppHeader,
  AppScreen,
  Button,
  IconButton,
  LoadingOverlay,
  LoadingView,
  Notice,
  PagerTabs,
} from "@/components/ui";
import { MealPlanForm } from "@/components/nutrition/meal-plan-form";
import { MealPlanSummaryCard } from "@/components/nutrition";
import { todayDateKey } from "@/lib/date-keys";
import { RuntimeClient } from "@/lib/runtime-client";
import { color, spacing } from "@/theme/tokens";
import { DateKey, type Plan } from "@mai/nutrition";
import { DailyLogs, type OpenedDay } from "@mai/nutrition/services/daily-logs";
import {
  MealPlans,
  type CreateMealPlanInput,
} from "@mai/nutrition/services/meal-plans";
import { useMachine } from "@xstate/react";
import { Effect, Schema } from "effect";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft, Pencil } from "lucide-react-native";
import { ScrollView, StyleSheet, View } from "react-native";
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

type PlansTabIndex = 0 | 1 | 2;

type SavePlanInput =
  | {
      readonly action: "create";
      readonly dateKey: DateKey;
      readonly input: CreateMealPlanInput;
    }
  | {
      readonly action: "revise";
      readonly dateKey: DateKey;
      readonly input: CreateMealPlanInput;
      readonly planId: Plan["id"];
    };

type SavePlanResult =
  | {
      readonly _tag: "Saved";
      readonly day: PlansDay;
      readonly editingPlan: Plan;
      readonly notice: string;
    }
  | {
      readonly _tag: "Failed";
      readonly notice: string;
    };

type PlansRouteEvent =
  | {
      readonly index: PlansTabIndex;
      readonly type: "selectTab";
    }
  | {
      readonly plan: Plan;
      readonly type: "changePlan";
    }
  | {
      readonly input: CreateMealPlanInput;
      readonly type: "createPlan";
    }
  | {
      readonly input: CreateMealPlanInput;
      readonly plan: Plan;
      readonly type: "revisePlan";
    }
  | {
      readonly plan: Plan;
      readonly type: "selectEditPlan";
    }
  | {
      readonly type: "clearEditPlan";
    };

const plansRouteMachine = setup({
  types: {
    context: {} as {
      readonly activeTab: PlansTabIndex;
      readonly data: PlansRouteData | null;
      readonly dateKeyParam: string | undefined;
      readonly editingPlan: Plan | null;
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
    savePlan: fromPromise<SavePlanResult, SavePlanInput>(({ input }) =>
      RuntimeClient.runPromise(savePlan({ input }))
    ),
  },
}).createMachine({
  context: ({ input }) => ({
    activeTab: 0,
    data: null,
    dateKeyParam: input.dateKeyParam,
    editingPlan: null,
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
        clearEditPlan: {
          actions: assign({
            editingPlan: null,
            notice: null,
          }),
        },
        createPlan: {
          target: "SavingPlan",
          actions: assign({
            notice: null,
          }),
        },
        revisePlan: {
          target: "SavingPlan",
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
        selectEditPlan: {
          actions: assign(({ event }) => {
            assertEvent(event, "selectEditPlan");

            return {
              editingPlan: event.plan,
              notice: null,
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
    SavingPlan: {
      invoke: {
        src: "savePlan",
        input: ({ context, event }) => {
          if (context.data === null) {
            throw new Error("Cannot save plans before the route loads.");
          }

          if (event.type === "createPlan") {
            return {
              action: "create",
              dateKey: context.data.dateKey,
              input: event.input,
            };
          }

          assertEvent(event, "revisePlan");

          return {
            action: "revise",
            dateKey: context.data.dateKey,
            input: event.input,
            planId: event.plan.id,
          };
        },
        onDone: {
          target: "Ready",
          actions: assign(({ context, event }) => {
            if (event.output._tag === "Failed") {
              return {
                notice: event.output.notice,
              };
            }

            if (context.data === null) {
              return {
                editingPlan: event.output.editingPlan,
                notice: event.output.notice,
              };
            }

            return {
              data: {
                ...context.data,
                day: event.output.day,
              },
              editingPlan: event.output.editingPlan,
              notice: event.output.notice,
            };
          }),
        },
        onError: {
          target: "Ready",
          actions: assign({
            notice: "Could not save plan. Please try again.",
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
      disabled={
        snapshot.matches("ChangingPlan") || snapshot.matches("SavingPlan")
      }
      editingPlan={snapshot.context.editingPlan}
      notice={snapshot.context.notice}
      onChangePlan={(plan) => {
        send({
          plan,
          type: "changePlan",
        });
      }}
      onClearEditPlan={() => {
        send({
          type: "clearEditPlan",
        });
      }}
      onCreatePlan={(input) => {
        send({
          input,
          type: "createPlan",
        });
      }}
      onRevisePlan={(plan, input) => {
        send({
          input,
          plan,
          type: "revisePlan",
        });
      }}
      onSelectEditPlan={(plan) => {
        send({
          plan,
          type: "selectEditPlan",
        });
      }}
      onSelectTab={(index) => {
        send({
          index: index === 0 ? 0 : index === 1 ? 1 : 2,
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
  editingPlan,
  notice,
  onChangePlan,
  onClearEditPlan,
  onCreatePlan,
  onRevisePlan,
  onSelectEditPlan,
  onSelectTab,
}: {
  readonly activeTab: PlansTabIndex;
  readonly data: PlansRouteData;
  readonly disabled: boolean;
  readonly editingPlan: Plan | null;
  readonly notice: string | null;
  readonly onChangePlan: (plan: Plan) => void;
  readonly onClearEditPlan: () => void;
  readonly onCreatePlan: (input: CreateMealPlanInput) => void;
  readonly onRevisePlan: (plan: Plan, input: CreateMealPlanInput) => void;
  readonly onSelectEditPlan: (plan: Plan) => void;
  readonly onSelectTab: (index: number) => void;
}) {
  const selectedPlan = data.day.selectedPlan;
  const tabs = [
    {
      accessibilityLabel: "Select active plan",
      key: "select",
      label: "Select",
    },
    {
      accessibilityLabel: "Create plan",
      key: "create",
      label: "Create",
    },
    {
      accessibilityLabel: "Edit plans",
      key: "edit",
      label: "Edit",
    },
  ] as const;

  return (
    <View style={styles.screen}>
      <AppScreen
        contentStyle={styles.content}
        safeAreaEdges={["top", "bottom"]}
      >
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
            tone={notice.startsWith("Plan ") ? "success" : "danger"}
          />
        )}

        <PagerTabs
          activeIndex={activeTab}
          onActiveIndexChange={onSelectTab}
          tabBarPosition="bottom"
          tabs={[
            {
              ...tabs[0],
              content: (
                <PlanSelectTab
                  disabled={disabled}
                  onChangePlan={onChangePlan}
                  plans={data.day.plans}
                  selectedPlanId={selectedPlan.id}
                />
              ),
            },
            {
              ...tabs[1],
              content: (
                <MealPlanForm
                  action="create"
                  canNavigateBack={false}
                  initialPlan={null}
                  isSubmitting={disabled}
                  layout="embedded"
                  onBack={() => {
                    onSelectTab(0);
                  }}
                  onSubmit={onCreatePlan}
                />
              ),
            },
            {
              ...tabs[2],
              content: (
                <PlanEditTab
                  disabled={disabled}
                  editingPlan={editingPlan}
                  onClearEditPlan={onClearEditPlan}
                  onRevisePlan={onRevisePlan}
                  onSelectEditPlan={onSelectEditPlan}
                  plans={data.day.plans}
                  selectedPlanId={selectedPlan.id}
                />
              ),
            },
          ]}
        />
      </AppScreen>

      <LoadingOverlay message="Saving plan" visible={disabled} />
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
          <MealPlanSummaryCard
            disabled={disabled || isSelected}
            isActive={isSelected}
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

function PlanEditTab({
  disabled,
  editingPlan,
  onClearEditPlan,
  onRevisePlan,
  onSelectEditPlan,
  plans,
  selectedPlanId,
}: {
  readonly disabled: boolean;
  readonly editingPlan: Plan | null;
  readonly onClearEditPlan: () => void;
  readonly onRevisePlan: (plan: Plan, input: CreateMealPlanInput) => void;
  readonly onSelectEditPlan: (plan: Plan) => void;
  readonly plans: readonly Plan[];
  readonly selectedPlanId: Plan["id"];
}) {
  if (editingPlan === null) {
    return (
      <ScrollView
        alwaysBounceVertical={false}
        contentContainerStyle={styles.tabScrollContent}
        keyboardShouldPersistTaps="handled"
        style={styles.tabScroll}
      >
        {plans.map((plan) => (
          <MealPlanSummaryCard
            disabled={disabled}
            isActive={plan.id === selectedPlanId}
            key={plan.id}
            onPress={() => {
              onSelectEditPlan(plan);
            }}
            plan={plan}
          />
        ))}
      </ScrollView>
    );
  }

  return (
    <View style={styles.editTab}>
      <Button
        disabled={disabled}
        icon={Pencil}
        onPress={onClearEditPlan}
        variant="secondary"
      >
        Change plan
      </Button>
      <MealPlanForm
        action="edit"
        initialPlan={editingPlan}
        isSubmitting={disabled}
        key={editingPlan.id}
        layout="embedded"
        onBack={onClearEditPlan}
        onSubmit={(input) => {
          onRevisePlan(editingPlan, input);
        }}
      />
    </View>
  );
}

export function loadPlansRouteData({
  dateKeyParam,
}: {
  readonly dateKeyParam: string | undefined;
}) {
  return Effect.gen(function* () {
    const dateKey = yield* Schema.decodeEffect(DateKey)(
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

export function savePlan({ input }: { readonly input: SavePlanInput }) {
  return Effect.gen(function* () {
    const dailyLogs = yield* DailyLogs;
    const mealPlans = yield* MealPlans;

    if (input.action === "create") {
      const created = yield* mealPlans.create({
        input: input.input,
      });
      const day = yield* dailyLogs.changePlan({
        input: {
          dateKey: input.dateKey,
          planId: created.plan.id,
        },
      });

      return {
        _tag: "Saved" as const,
        day,
        editingPlan: created.plan,
        notice: "Plan created.",
      };
    }

    yield* mealPlans.revise({
      input: {
        ...input.input,
        dateKey: input.dateKey,
        planId: input.planId,
      },
    });

    const day = yield* dailyLogs.open({
      input: {
        dateKey: input.dateKey,
      },
    });

    return {
      _tag: "Saved" as const,
      day,
      editingPlan: day.selectedPlan,
      notice: "Plan saved.",
    };
  }).pipe(
    Effect.catchTag("PlanNameAlreadyExists", () =>
      Effect.succeed({
        _tag: "Failed" as const,
        notice:
          "A plan with this name already exists. Choose a different name and try again.",
      })
    ),
    Effect.catchTag("SchemaError", () =>
      Effect.succeed({
        _tag: "Failed" as const,
        notice:
          "Check that the name is filled and every target is a non-negative number.",
      })
    ),
    Effect.catchTag("PlanNotFound", () =>
      Effect.succeed({
        _tag: "Failed" as const,
        notice: "This plan is no longer available.",
      })
    ),
    Effect.catch(() =>
      Effect.succeed({
        _tag: "Failed" as const,
        notice: "Could not save plan. Please try again.",
      })
    )
  );
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
  editTab: {
    flex: 1,
    gap: spacing.md,
  },
});
