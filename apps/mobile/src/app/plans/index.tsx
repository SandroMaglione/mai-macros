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
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { todayDateKey } from "@/lib/date-keys";
import { RuntimeClient } from "@/lib/runtime-client";
import { color, spacing } from "@/theme/tokens";
import { EmptyEvent } from "@mai/machines";
import { DailyLogs, Domain, MealPlans } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { Effect, Match, Option, Schema } from "effect";
import { Redirect, router } from "expo-router";
import { ChevronLeft, Pencil } from "lucide-react-native";
import { ScrollView, StyleSheet, View } from "react-native";
import { createAsyncLogic, setup } from "xstate";

const OpenedDay = Schema.TaggedStruct("OpenedDay", {
  dailyLog: Domain.DailyLog,
  plans: Schema.Array(Domain.Plan),
  selectedPlan: Domain.Plan,
});

const UnrecordedDay = Schema.TaggedStruct("UnrecordedDay", {
  dateKey: Domain.DateKey,
  plans: Schema.Array(Domain.Plan),
  selectedPlan: Domain.Plan,
});

const ChangedDayPlan = Schema.TaggedStruct("ChangedDayPlan", {
  dailyLog: Domain.DailyLog,
  plans: Schema.Array(Domain.Plan),
  selectedPlan: Domain.Plan,
});

const PlansDay = Schema.Union([ChangedDayPlan, OpenedDay, UnrecordedDay]);

const PlansRouteData = Schema.Struct({
  dateKey: Domain.DateKey,
  day: PlansDay,
});

type PlansRouteData = typeof PlansRouteData.Type;

const PlansSearchParams = Schema.Struct({
  dateKey: Schema.optionalKey(Domain.DateKey),
});

const PlansTabIndex = Schema.Union([
  Schema.Literal(0),
  Schema.Literal(1),
  Schema.Literal(2),
]);

type PlansTabIndex = typeof PlansTabIndex.Type;

const MealPlanInputMeal = Schema.Struct({
  id: Schema.optionalKey(Schema.String),
  name: Schema.String,
});

const CreateMealPlanInput = Schema.Struct({
  name: Schema.String,
  meals: Schema.Array(MealPlanInputMeal),
  proteinTargetGrams: Schema.String,
  carbsTargetGrams: Schema.String,
  fatTargetGrams: Schema.String,
  fiberTargetGrams: Schema.optionalKey(Schema.String),
  sugarTargetGrams: Schema.optionalKey(Schema.String),
  saltTargetGrams: Schema.optionalKey(Schema.String),
  saturatedFatTargetGrams: Schema.optionalKey(Schema.String),
});

const LoadPlansRouteDataResult = Schema.Union([
  Schema.TaggedStruct("InvalidRoute", {}),
  Schema.TaggedStruct("NoMealPlans", {
    dateKey: Domain.DateKey,
  }),
  Schema.TaggedStruct("Ready", {
    data: PlansRouteData,
  }),
]);

const ChangePlanInput = Schema.Struct({
  dateKey: Domain.DateKey,
  planId: Domain.PlanId,
});

const SavePlanInput = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("create"),
    dateKey: Domain.DateKey,
    day: PlansDay,
    input: CreateMealPlanInput,
  }),
  Schema.Struct({
    action: Schema.Literal("revise"),
    dateKey: Domain.DateKey,
    day: PlansDay,
    input: CreateMealPlanInput,
    planId: Domain.PlanId,
  }),
]);

const SavePlanResult = Schema.Union([
  Schema.TaggedStruct("Saved", {
    day: PlansDay,
    editingPlan: Domain.Plan,
    notice: Schema.String,
  }),
  Schema.TaggedStruct("Failed", {
    notice: Schema.String,
  }),
]);

const plansRouteMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(
      Schema.Struct({
        activeTab: PlansTabIndex,
        data: Schema.NullOr(PlansRouteData),
        dateKey: Schema.UndefinedOr(Domain.DateKey),
        editingPlan: Schema.NullOr(Domain.Plan),
        notice: Schema.NullOr(Schema.String),
        redirectDateKey: Schema.NullOr(Domain.DateKey),
      })
    ),
    events: {
      changePlan: Schema.toStandardSchemaV1(
        Schema.Struct({
          plan: Domain.Plan,
        })
      ),
      clearEditPlan: Schema.toStandardSchemaV1(EmptyEvent),
      createPlan: Schema.toStandardSchemaV1(
        Schema.Struct({
          input: CreateMealPlanInput,
        })
      ),
      revisePlan: Schema.toStandardSchemaV1(
        Schema.Struct({
          input: CreateMealPlanInput,
          plan: Domain.Plan,
        })
      ),
      selectEditPlan: Schema.toStandardSchemaV1(
        Schema.Struct({
          plan: Domain.Plan,
        })
      ),
      selectTab: Schema.toStandardSchemaV1(
        Schema.Struct({
          index: PlansTabIndex,
        })
      ),
    },
    input: Schema.toStandardSchemaV1(
      Schema.Struct({
        dateKey: Schema.optionalKey(Domain.DateKey),
      })
    ),
  },
  states: {
    Loading: {},
    Ready: {},
    ChangingPlan: {},
    SavingPlan: {},
    InvalidRoute: {},
    NoMealPlans: {},
  },
  actions: {
    replaceHome: () => {
      router.replace("/");
    },
    replaceToNewPlan: (params: { readonly dateKey: Domain.DateKey }) => {
      router.replace({
        pathname: "/plans/new",
        params,
      });
    },
  },
  actorSources: {
    changePlan: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(ChangePlanInput),
        output: Schema.toStandardSchemaV1(PlansDay),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const dailyLogs = yield* DailyLogs.DailyLogs;

            return yield* dailyLogs.changePlan({
              input: {
                dateKey: input.dateKey,
                planId: input.planId,
              },
            });
          })
        ),
    }),
    loadRouteData: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(Schema.UndefinedOr(Domain.DateKey)),
        output: Schema.toStandardSchemaV1(LoadPlansRouteDataResult),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const targetDateKey =
              input ??
              (yield* Schema.decodeEffect(Domain.DateKey)(todayDateKey()));
            const dailyLogs = yield* DailyLogs.DailyLogs;
            const day = yield* targetDateKey === todayDateKey()
              ? dailyLogs.openOrCreate({
                  input: {
                    dateKey: targetDateKey,
                  },
                })
              : dailyLogs.open({
                  input: {
                    dateKey: targetDateKey,
                  },
                });

            return {
              _tag: "Ready" as const,
              data: {
                dateKey: targetDateKey,
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
          )
        ),
    }),
    savePlan: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(SavePlanInput),
        output: Schema.toStandardSchemaV1(SavePlanResult),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const dailyLogs = yield* DailyLogs.DailyLogs;
            const mealPlans = yield* MealPlans.MealPlans;

            if (input.action === "create") {
              const created = yield* mealPlans.create({
                input: input.input,
              });

              if (input.day._tag === "UnrecordedDay") {
                const plans = yield* mealPlans.list();
                const day = new DailyLogs.UnrecordedDay({
                  dateKey: input.dateKey,
                  plans,
                  selectedPlan: created.plan,
                });

                return {
                  _tag: "Saved" as const,
                  day,
                  editingPlan: created.plan,
                  notice: "Plan created.",
                };
              }

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

            const revised = yield* mealPlans.revise({
              input: {
                ...input.input,
                dateKey: input.dateKey,
                planId: input.planId,
              },
            });

            if (input.day._tag === "UnrecordedDay") {
              const plans = yield* mealPlans.list();
              const day = new DailyLogs.UnrecordedDay({
                dateKey: input.dateKey,
                plans,
                selectedPlan: revised.plan,
              });

              return {
                _tag: "Saved" as const,
                day,
                editingPlan: revised.plan,
                notice: "Plan saved.",
              };
            }

            const day = yield* dailyLogs.open({
              input: {
                dateKey: input.dateKey,
              },
            });

            return {
              _tag: "Saved" as const,
              day,
              editingPlan:
                day._tag === "UnrecordedDay" ? revised.plan : day.selectedPlan,
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
            Effect.catchTag("PlanMealNameAlreadyExists", () =>
              Effect.succeed({
                _tag: "Failed" as const,
                notice:
                  "Meal names must be unique inside a plan. Rename the duplicate meal and try again.",
              })
            ),
            Effect.catchTag("SchemaError", () =>
              Effect.succeed({
                _tag: "Failed" as const,
                notice:
                  "Check that the plan name and meal names are filled, and every target is a non-negative number.",
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
          )
        ),
    }),
  },
}).createMachine({
  context: ({ input }) => ({
    activeTab: 0,
    data: null,
    dateKey: input.dateKey,
    editingPlan: null,
    notice: null,
    redirectDateKey: null,
  }),
  initial: "Loading",
  states: {
    Loading: {
      invoke: {
        src: "loadRouteData",
        input: ({ context }) => context.dateKey,
        onDone: ({ event }) =>
          Match.value(event.output).pipe(
            Match.tagsExhaustive({
              InvalidRoute: () => ({ target: "InvalidRoute" }),
              NoMealPlans: ({ dateKey }) => ({
                target: "NoMealPlans",
                context: {
                  data: null,
                  redirectDateKey: dateKey,
                },
              }),
              Ready: ({ data }) => ({
                target: "Ready",
                context: {
                  data,
                },
              }),
            })
          ),
        onError: {
          target: "InvalidRoute",
        },
      },
    },
    Ready: {
      on: {
        changePlan: ({ context, event }) => {
          if (context.data?.day._tag === "UnrecordedDay") {
            return {
              context: {
                data: {
                  ...context.data,
                  day: new DailyLogs.UnrecordedDay({
                    dateKey: context.data.day.dateKey,
                    plans: context.data.day.plans,
                    selectedPlan: event.plan,
                  }),
                },
                notice: null,
              },
            };
          }

          return {
            target: "ChangingPlan",
            context: {
              notice: null,
            },
          };
        },
        clearEditPlan: {
          context: {
            editingPlan: null,
            notice: null,
          },
        },
        createPlan: {
          target: "SavingPlan",
          context: {
            notice: null,
          },
        },
        revisePlan: {
          target: "SavingPlan",
          context: {
            notice: null,
          },
        },
        selectTab: ({ event }) => ({
          context: {
            activeTab: event.index,
          },
        }),
        selectEditPlan: ({ event }) => ({
          context: {
            editingPlan: event.plan,
            notice: null,
          },
        }),
      },
    },
    ChangingPlan: {
      invoke: {
        src: "changePlan",
        input: ({ context, event }) => {
          if (context.data === null) {
            throw new Error("Cannot change plans before the route loads.");
          }

          if (event.type !== "changePlan") {
            throw new Error("Cannot change plans without a selected plan.");
          }

          return {
            dateKey: context.data.dateKey,
            planId: event.plan.id,
          };
        },
        onDone: ({ context, event }) => ({
          target: "Ready",
          context:
            context.data === null
              ? {
                  notice: "Plan changed.",
                }
              : {
                  data: {
                    ...context.data,
                    day: event.output,
                  },
                  notice: "Plan changed.",
                },
        }),
        onError: {
          target: "Ready",
          context: {
            notice: "Could not change plan. Please try again.",
          },
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
              day: context.data.day,
              input: event.input,
            };
          }

          if (event.type !== "revisePlan") {
            throw new Error("Cannot save plans without a plan revision.");
          }

          return {
            action: "revise",
            dateKey: context.data.dateKey,
            day: context.data.day,
            input: event.input,
            planId: event.plan.id,
          };
        },
        onDone: ({ context, event }) =>
          Match.value(event.output).pipe(
            Match.tagsExhaustive({
              Failed: ({ notice }) => ({
                target: "Ready",
                context: {
                  notice,
                },
              }),
              Saved: ({ day, editingPlan, notice }) => ({
                target: "Ready",
                context:
                  context.data === null
                    ? {
                        editingPlan,
                        notice,
                      }
                    : {
                        data: {
                          ...context.data,
                          day,
                        },
                        editingPlan,
                        notice,
                      },
              }),
            })
          ),
        onError: {
          target: "Ready",
          context: {
            notice: "Could not save plan. Please try again.",
          },
        },
      },
    },
    InvalidRoute: {
      entry: ({ actions }, enq) => {
        enq(actions.replaceHome);
      },
    },
    NoMealPlans: {
      entry: ({ actions, context }, enq) => {
        if (context.redirectDateKey === null) {
          enq(actions.replaceHome);
          return;
        }

        enq(actions.replaceToNewPlan, {
          dateKey: context.redirectDateKey,
        });
      },
    },
  },
});

export default function PlansScreen() {
  const search = useSchemaLocalSearchParams(PlansSearchParams);

  if (Option.isNone(search)) {
    return <Redirect href="/" />;
  }

  const [snapshot, , actor] = useMachine(plansRouteMachine, {
    input: {
      dateKey: search.value.dateKey,
    },
  });

  if (
    snapshot.value === "Loading" ||
    snapshot.value === "InvalidRoute" ||
    snapshot.value === "NoMealPlans"
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
        snapshot.value === "ChangingPlan" || snapshot.value === "SavingPlan"
      }
      editingPlan={snapshot.context.editingPlan}
      notice={snapshot.context.notice}
      onChangePlan={(plan) => {
        actor.trigger.changePlan({ plan });
      }}
      onClearEditPlan={() => {
        actor.trigger.clearEditPlan();
      }}
      onCreatePlan={(input) => {
        actor.trigger.createPlan({ input });
      }}
      onRevisePlan={(plan, input) => {
        actor.trigger.revisePlan({ input, plan });
      }}
      onSelectEditPlan={(plan) => {
        actor.trigger.selectEditPlan({ plan });
      }}
      onSelectTab={(index) => {
        actor.trigger.selectTab({
          index: index === 0 ? 0 : index === 1 ? 1 : 2,
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
  readonly editingPlan: Domain.Plan | null;
  readonly notice: string | null;
  readonly onChangePlan: (plan: Domain.Plan) => void;
  readonly onClearEditPlan: () => void;
  readonly onCreatePlan: (input: MealPlans.CreateMealPlanInput) => void;
  readonly onRevisePlan: (
    plan: Domain.Plan,
    input: MealPlans.CreateMealPlanInput
  ) => void;
  readonly onSelectEditPlan: (plan: Domain.Plan) => void;
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
  readonly onChangePlan: (plan: Domain.Plan) => void;
  readonly plans: readonly Domain.Plan[];
  readonly selectedPlanId: Domain.Plan["id"];
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
  readonly editingPlan: Domain.Plan | null;
  readonly onClearEditPlan: () => void;
  readonly onRevisePlan: (
    plan: Domain.Plan,
    input: MealPlans.CreateMealPlanInput
  ) => void;
  readonly onSelectEditPlan: (plan: Domain.Plan) => void;
  readonly plans: readonly Domain.Plan[];
  readonly selectedPlanId: Domain.Plan["id"];
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
