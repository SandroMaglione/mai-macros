import { MealPlanForm } from "@/components/nutrition/meal-plan-form";
import { MealPlanSummaryCard } from "@/components/nutrition/meal-plan-summary-card";
import { AppScreen } from "@/components/ui/app-screen";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { LoadingOverlay, LoadingView } from "@/components/ui/loading-view";
import { AppHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { PagerTabs } from "@/components/ui/pager-tabs";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { todayDateKey } from "@/lib/date-keys";
import { MobileMachine } from "@/lib/runtime-client";
import { color, spacing } from "@/theme/tokens";
import { DailyLogs, Domain, MealPlans } from "@mai/nutrition";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { Machine } from "@typeonce/effect-machine";
import { Effect, Option, Schema } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { Redirect, router } from "expo-router";
import { ChevronLeft, Pencil } from "lucide-react-native";
import { useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

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

const PlansSource = Schema.Literal("settings");
type PlansSource = typeof PlansSource.Type;

const PlansSearchParams = Schema.Struct({
  dateKey: Schema.optionalKey(Domain.DateKey),
  source: Schema.optionalKey(PlansSource),
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

const PlansReadyData = {
  activeTab: PlansTabIndex,
  data: PlansRouteData,
  editingPlan: Schema.NullOr(Domain.Plan),
  notice: Schema.NullOr(Schema.String),
} as const;

class PlansRoute extends Schema.TaggedClass<PlansRoute>("PlansRoute")(
  "PlansRoute",
  {
    dateKey: Schema.UndefinedOr(Domain.DateKey),
    source: Schema.UndefinedOr(PlansSource),
  }
) {}
class PlansLoading extends Schema.TaggedClass<PlansLoading>("PlansLoading")(
  "PlansLoading",
  {}
) {}
class PlansReady extends Schema.TaggedClass<PlansReady>("PlansReady")(
  "PlansReady",
  PlansReadyData
) {}
class PlansChanging extends Schema.TaggedClass<PlansChanging>("PlansChanging")(
  "PlansChanging",
  { ...PlansReadyData, plan: Domain.Plan }
) {}
class PlansSaving extends Schema.TaggedClass<PlansSaving>("PlansSaving")(
  "PlansSaving",
  { ...PlansReadyData, save: SavePlanInput }
) {}
class PlansRedirecting extends Schema.TaggedClass<PlansRedirecting>(
  "PlansRedirecting"
)("PlansRedirecting", {}) {}

class ChangePlan extends Schema.TaggedClass<ChangePlan>("ChangePlan")(
  "ChangePlan",
  { plan: Domain.Plan }
) {}
class ClearEditPlan extends Schema.TaggedClass<ClearEditPlan>("ClearEditPlan")(
  "ClearEditPlan",
  {}
) {}
class CreatePlan extends Schema.TaggedClass<CreatePlan>("CreatePlan")(
  "CreatePlan",
  { input: CreateMealPlanInput }
) {}
class RevisePlan extends Schema.TaggedClass<RevisePlan>("RevisePlan")(
  "RevisePlan",
  { input: CreateMealPlanInput, plan: Domain.Plan }
) {}
class SelectEditPlan extends Schema.TaggedClass<SelectEditPlan>(
  "SelectEditPlan"
)("SelectEditPlan", { plan: Domain.Plan }) {}
class SelectPlansTab extends Schema.TaggedClass<SelectPlansTab>(
  "SelectPlansTab"
)("SelectPlansTab", { index: PlansTabIndex }) {}
class PlansLoaded extends Schema.TaggedClass<PlansLoaded>("PlansLoaded")(
  "PlansLoaded",
  { data: PlansRouteData }
) {}
class PlansInvalidRoute extends Schema.TaggedClass<PlansInvalidRoute>(
  "PlansInvalidRoute"
)("PlansInvalidRoute", {}) {}
class PlansMissing extends Schema.TaggedClass<PlansMissing>("PlansMissing")(
  "PlansMissing",
  { dateKey: Domain.DateKey }
) {}
class PlanChanged extends Schema.TaggedClass<PlanChanged>("PlanChanged")(
  "PlanChanged",
  { day: PlansDay }
) {}
class PlanChangeFailed extends Schema.TaggedClass<PlanChangeFailed>(
  "PlanChangeFailed"
)("PlanChangeFailed", {}) {}
class PlanSaved extends Schema.TaggedClass<PlanSaved>("PlanSaved")(
  "PlanSaved",
  {
    day: PlansDay,
    editingPlan: Domain.Plan,
    notice: Schema.String,
  }
) {}
class PlanSaveFailed extends Schema.TaggedClass<PlanSaveFailed>(
  "PlanSaveFailed"
)("PlanSaveFailed", { notice: Schema.String }) {}

const PlansStates = Machine.defineStates({
  Route: {
    schema: PlansRoute,
    initial: "Loading",
    states: {
      Changing: PlansChanging,
      Loading: PlansLoading,
      Ready: PlansReady,
      Redirecting: PlansRedirecting,
      Saving: PlansSaving,
    },
  },
});

const plansRouteMachine = Machine.make({
  states: PlansStates.states,
  events: [
    ChangePlan,
    ClearEditPlan,
    CreatePlan,
    RevisePlan,
    SelectEditPlan,
    SelectPlansTab,
  ],
  internalEvents: [
    PlansLoaded,
    PlansInvalidRoute,
    PlansMissing,
    PlanChanged,
    PlanChangeFailed,
    PlanSaved,
    PlanSaveFailed,
  ],
  input: Schema.Struct({
    dateKey: Schema.optionalKey(Domain.DateKey),
    source: Schema.optionalKey(PlansSource),
  }),
  initial: ({ dateKey, source }) =>
    PlansStates.initial.Route(new PlansRoute({ dateKey, source }), (route) =>
      route.Loading(new PlansLoading())
    ),
}).handle({
  Route: {
    states: {
      Loading: {
        invoke: ({ parents }) =>
          Machine.invoke({
            id: "loadPlans",
            src: () =>
              Machine.effect(
                Effect.gen(function* () {
                  const targetDateKey =
                    parents.Route.dateKey ??
                    (yield* Schema.decodeEffect(Domain.DateKey)(
                      todayDateKey()
                    ));
                  const dailyLogs = yield* DailyLogs.DailyLogs;
                  const day = yield* targetDateKey === todayDateKey()
                    ? dailyLogs.openOrCreate({
                        input: { dateKey: targetDateKey },
                      })
                    : dailyLogs.open({ input: { dateKey: targetDateKey } });
                  return new PlansLoaded({
                    data: { dateKey: targetDateKey, day },
                  });
                }).pipe(
                  Effect.catchTag("NoMealPlans", ({ dateKey }) =>
                    Effect.succeed(new PlansMissing({ dateKey }))
                  ),
                  Effect.catch(() => Effect.succeed(new PlansInvalidRoute()))
                )
              ),
          }),
        on: {
          PlansLoaded: ({ event, parents, target }) =>
            target.full.Route(new PlansRoute({ ...parents.Route }), (route) =>
              route.Ready(
                new PlansReady({
                  activeTab: 0,
                  data: event.data,
                  editingPlan: null,
                  notice: null,
                })
              )
            ),
          PlansInvalidRoute: ({ parents, target }) =>
            Machine.action(
              Effect.sync(() => router.replace("/")),
              target.full.Route(new PlansRoute({ ...parents.Route }), (route) =>
                route.Redirecting(new PlansRedirecting())
              )
            ),
          PlansMissing: ({ event, parents, target }) =>
            Machine.action(
              Effect.sync(() => {
                router.replace({
                  pathname: "/plans/new",
                  params:
                    parents.Route.source === "settings"
                      ? {
                          dateKey: event.dateKey,
                          returnDateKey: parents.Route.dateKey,
                          source: parents.Route.source,
                        }
                      : { dateKey: event.dateKey },
                });
              }),
              target.full.Route(new PlansRoute({ ...parents.Route }), (route) =>
                route.Redirecting(new PlansRedirecting())
              )
            ),
        },
      },
      Ready: {
        on: {
          ChangePlan: ({ event, state, target }) => {
            if (state.data.day._tag === "UnrecordedDay") {
              return target.local.Ready(
                new PlansReady({
                  ...state,
                  data: {
                    ...state.data,
                    day: new DailyLogs.UnrecordedDay({
                      dateKey: state.data.day.dateKey,
                      plans: state.data.day.plans,
                      selectedPlan: event.plan,
                    }),
                  },
                  notice: null,
                })
              );
            }

            return target.local.Changing(
              Machine.retag(PlansChanging, state, {
                notice: null,
                plan: event.plan,
              })
            );
          },
          ClearEditPlan: ({ state, target }) =>
            target.local.Ready(
              new PlansReady({
                ...state,
                editingPlan: null,
                notice: null,
              })
            ),
          CreatePlan: ({ event, state, target }) =>
            target.local.Saving(
              Machine.retag(PlansSaving, state, {
                notice: null,
                save: {
                  action: "create",
                  dateKey: state.data.dateKey,
                  day: state.data.day,
                  input: event.input,
                },
              })
            ),
          RevisePlan: ({ event, state, target }) =>
            target.local.Saving(
              Machine.retag(PlansSaving, state, {
                notice: null,
                save: {
                  action: "revise",
                  dateKey: state.data.dateKey,
                  day: state.data.day,
                  input: event.input,
                  planId: event.plan.id,
                },
              })
            ),
          SelectPlansTab: ({ event, state, target }) =>
            target.local.Ready(
              new PlansReady({ ...state, activeTab: event.index })
            ),
          SelectEditPlan: ({ event, state, target }) =>
            target.local.Ready(
              new PlansReady({
                ...state,
                editingPlan: event.plan,
                notice: null,
              })
            ),
        },
      },
      Changing: {
        invoke: ({ state }) =>
          Machine.invoke({
            id: "changePlan",
            src: () =>
              Machine.effect(
                Effect.gen(function* () {
                  const dailyLogs = yield* DailyLogs.DailyLogs;
                  const day = yield* dailyLogs.changePlan({
                    input: {
                      dateKey: state.data.dateKey,
                      planId: state.plan.id,
                    },
                  });
                  return new PlanChanged({ day });
                }).pipe(
                  Effect.catch(() => Effect.succeed(new PlanChangeFailed()))
                )
              ),
          }),
        on: {
          PlanChanged: ({ event, state, target }) =>
            target.local.Ready(
              new PlansReady({
                activeTab: state.activeTab,
                data: { ...state.data, day: event.day },
                editingPlan: state.editingPlan,
                notice: "Plan changed.",
              })
            ),
          PlanChangeFailed: ({ state, target }) =>
            target.local.Ready(
              new PlansReady({
                activeTab: state.activeTab,
                data: state.data,
                editingPlan: state.editingPlan,
                notice: "Could not change plan. Please try again.",
              })
            ),
        },
      },
      Saving: {
        invoke: ({ state }) =>
          Machine.invoke({
            id: "savePlan",
            src: () => Machine.effect(planOperations.save(state.save)),
          }),
        on: {
          PlanSaved: ({ event, state, target }) =>
            target.local.Ready(
              new PlansReady({
                activeTab: state.activeTab,
                data: { ...state.data, day: event.day },
                editingPlan: event.editingPlan,
                notice: event.notice,
              })
            ),
          PlanSaveFailed: ({ event, state, target }) =>
            target.local.Ready(
              new PlansReady({
                activeTab: state.activeTab,
                data: state.data,
                editingPlan: state.editingPlan,
                notice: event.notice,
              })
            ),
        },
      },
      Redirecting: {},
    },
  },
});

const planOperations = {
  save: (input: typeof SavePlanInput.Type) =>
    Effect.gen(function* () {
      const dailyLogs = yield* DailyLogs.DailyLogs;
      const mealPlans = yield* MealPlans.MealPlans;

      if (input.action === "create") {
        const created = yield* mealPlans.create({ input: input.input });

        if (input.day._tag === "UnrecordedDay") {
          const plans = yield* mealPlans.list();
          return new PlanSaved({
            day: new DailyLogs.UnrecordedDay({
              dateKey: input.dateKey,
              plans,
              selectedPlan: created.plan,
            }),
            editingPlan: created.plan,
            notice: "Plan created.",
          });
        }

        const day = yield* dailyLogs.changePlan({
          input: { dateKey: input.dateKey, planId: created.plan.id },
        });
        return new PlanSaved({
          day,
          editingPlan: created.plan,
          notice: "Plan created.",
        });
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
        return new PlanSaved({
          day: new DailyLogs.UnrecordedDay({
            dateKey: input.dateKey,
            plans,
            selectedPlan: revised.plan,
          }),
          editingPlan: revised.plan,
          notice: "Plan saved.",
        });
      }

      const day = yield* dailyLogs.open({
        input: { dateKey: input.dateKey },
      });
      return new PlanSaved({
        day,
        editingPlan:
          day._tag === "UnrecordedDay" ? revised.plan : day.selectedPlan,
        notice: "Plan saved.",
      });
    }).pipe(
      Effect.catchTag("PlanNameAlreadyExists", () =>
        Effect.succeed(
          new PlanSaveFailed({
            notice:
              "A plan with this name already exists. Choose a different name and try again.",
          })
        )
      ),
      Effect.catchTag("PlanMealNameAlreadyExists", () =>
        Effect.succeed(
          new PlanSaveFailed({
            notice:
              "Meal names must be unique inside a plan. Rename the duplicate meal and try again.",
          })
        )
      ),
      Effect.catchTag("SchemaError", () =>
        Effect.succeed(
          new PlanSaveFailed({
            notice:
              "Check that the plan name and meal names are filled, and every target is a non-negative number.",
          })
        )
      ),
      Effect.catchTag("PlanNotFound", () =>
        Effect.succeed(
          new PlanSaveFailed({
            notice: "This plan is no longer available.",
          })
        )
      ),
      Effect.catch(() =>
        Effect.succeed(
          new PlanSaveFailed({
            notice: "Could not save plan. Please try again.",
          })
        )
      )
    ),
} as const;

export default function PlansScreen() {
  const search = useSchemaLocalSearchParams(PlansSearchParams);

  if (Option.isNone(search)) {
    return <Redirect href="/" />;
  }

  return (
    <DecodedPlansScreen
      dateKey={search.value.dateKey}
      source={search.value.source}
    />
  );
}

function DecodedPlansScreen({
  dateKey,
  source,
}: {
  readonly dateKey: Domain.DateKey | undefined;
  readonly source: PlansSource | undefined;
}) {
  const machineAtom = useMemo(
    () => MobileMachine.make(plansRouteMachine, { dateKey, source }),
    [dateKey, source]
  );
  const stateResult = useAtomValue(machineAtom.state);
  const send = useAtomSet(machineAtom.send);

  if (
    AsyncResult.isInitial(stateResult) ||
    AsyncResult.isFailure(stateResult)
  ) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading plans" />
      </AppScreen>
    );
  }

  const state = stateResult.value;
  const current = Option.firstSomeOf([
    PlansStates.get(state, "Route.Ready"),
    PlansStates.get(state, "Route.Changing"),
    PlansStates.get(state, "Route.Saving"),
  ]).pipe(Option.getOrNull);

  if (current === null) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading plans" />
      </AppScreen>
    );
  }

  return (
    <ReadyPlansScreen
      activeTab={current.activeTab}
      data={current.data}
      disabled={
        PlansStates.matches(state, "Route.Changing") ||
        PlansStates.matches(state, "Route.Saving")
      }
      editingPlan={current.editingPlan}
      notice={current.notice}
      returnDateKey={dateKey}
      source={source}
      onChangePlan={(plan) => {
        send(new ChangePlan({ plan }));
      }}
      onClearEditPlan={() => {
        send(new ClearEditPlan());
      }}
      onCreatePlan={(input) => {
        send(new CreatePlan({ input }));
      }}
      onRevisePlan={(plan, input) => {
        send(new RevisePlan({ input, plan }));
      }}
      onSelectEditPlan={(plan) => {
        send(new SelectEditPlan({ plan }));
      }}
      onSelectTab={(index) => {
        send(
          new SelectPlansTab({
            index: index === 0 ? 0 : index === 1 ? 1 : 2,
          })
        );
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
  returnDateKey,
  source,
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
  readonly returnDateKey: Domain.DateKey | undefined;
  readonly source: PlansSource | undefined;
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
              accessibilityLabel={
                source === "settings" ? "Back to settings" : "Back to day"
              }
              icon={ChevronLeft}
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                  return;
                }

                if (source === "settings") {
                  router.replace(
                    returnDateKey === undefined
                      ? "/settings"
                      : {
                          pathname: "/settings",
                          params: { dateKey: returnDateKey },
                        }
                  );
                  return;
                }

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
