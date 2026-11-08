import { MealPlanFormMachine } from "@mai/machines";
import { DailyLogs, Domain, MealPlans } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { Effect, Schema } from "effect";

import { todayDateKey } from "../lib/date-keys.ts";
import { Navigation } from "./services/navigation.ts";

const PlansDay = Schema.Union([
  Schema.TaggedStruct("ChangedDayPlan", {
    dailyLog: Domain.DailyLog,
    plans: Schema.Array(Domain.Plan),
    selectedPlan: Domain.Plan,
  }),
  Schema.TaggedStruct("OpenedDay", {
    dailyLog: Domain.DailyLog,
    plans: Schema.Array(Domain.Plan),
    selectedPlan: Domain.Plan,
  }),
  Schema.TaggedStruct("UnrecordedDay", {
    dateKey: Domain.DateKey,
    plans: Schema.Array(Domain.Plan),
    selectedPlan: Domain.Plan,
  }),
]);

export const PlansRouteData = Schema.Struct({
  dateKey: Domain.DateKey,
  day: PlansDay,
});

export type PlansRouteData = typeof PlansRouteData.Type;

export const PlansSource = Schema.Literal("settings");

export type PlansSource = typeof PlansSource.Type;

export const PlansTabIndex = Schema.Literals([0, 1, 2]);

export type PlansTabIndex = typeof PlansTabIndex.Type;

const SavePlanRequest = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("create"),
    input: MealPlanFormMachine.MealPlanFormSubmission,
  }),
  Schema.Struct({
    action: Schema.Literal("revise"),
    input: MealPlanFormMachine.MealPlanFormSubmission,
    planId: Domain.PlanId,
  }),
]);

type SavePlanRequest = typeof SavePlanRequest.Type;

export const PlansStates = Machine.state({
  fields: {
    dateKey: Schema.UndefinedOr(Domain.DateKey),
    source: Schema.UndefinedOr(PlansSource),
  },
  states: {
    Loading: {},
    InvalidRoute: {},
    NoMealPlans: { fields: { redirectDateKey: Domain.DateKey } },
    Loaded: {
      fields: {
        activeTab: PlansTabIndex,
        data: PlansRouteData,
        editingPlan: Schema.NullOr(Domain.Plan),
        notice: Schema.NullOr(Schema.String),
      },
      states: {
        Ready: {},
        ChangingPlan: { fields: { planId: Domain.PlanId } },
        SavingPlan: { fields: { request: SavePlanRequest } },
      },
    },
  },
});

export const PlansEvents = Machine.events({
  ChangePlan: { plan: Domain.Plan },
  ClearEditPlan: {},
  CreatePlan: { input: MealPlanFormMachine.MealPlanFormSubmission },
  RevisePlan: {
    input: MealPlanFormMachine.MealPlanFormSubmission,
    plan: Domain.Plan,
  },
  SelectEditPlan: { plan: Domain.Plan },
  SelectTab: { index: PlansTabIndex },
});

export const PlansMachine = Machine.make({
  id: "Plans",
  root: PlansStates,
  events: PlansEvents,
  input: Schema.Struct({
    dateKey: Schema.UndefinedOr(Domain.DateKey),
    source: Schema.UndefinedOr(PlansSource),
  }),
  effects: {
    loadRouteData: (dateKey: Domain.DateKey | undefined) =>
      Effect.gen(function* () {
        const targetDateKey =
          dateKey ??
          (yield* Schema.decodeEffect(Domain.DateKey)(todayDateKey()));
        const dailyLogs = yield* DailyLogs.DailyLogs;
        const day = yield* targetDateKey === todayDateKey()
          ? dailyLogs.openOrCreate({ input: { dateKey: targetDateKey } })
          : dailyLogs.open({ input: { dateKey: targetDateKey } });

        return {
          _tag: "Ready" as const,
          data: { dateKey: targetDateKey, day },
        };
      }).pipe(
        Effect.catchTag("NoMealPlans", ({ dateKey: redirectDateKey }) =>
          Effect.succeed({
            _tag: "NoMealPlans" as const,
            redirectDateKey,
          })
        ),
        Effect.catchTag("SchemaError", () =>
          Effect.succeed({ _tag: "InvalidRoute" as const })
        )
      ),
    changePlan: (input: {
      readonly dateKey: Domain.DateKey;
      readonly planId: Domain.PlanId;
    }) =>
      Effect.gen(function* () {
        const dailyLogs = yield* DailyLogs.DailyLogs;

        return yield* dailyLogs.changePlan({ input });
      }),
    savePlan: ({
      dateKey,
      day,
      request,
    }: {
      readonly dateKey: Domain.DateKey;
      readonly day: PlansRouteData["day"];
      readonly request: SavePlanRequest;
    }) =>
      Effect.gen(function* () {
        const dailyLogs = yield* DailyLogs.DailyLogs;
        const mealPlans = yield* MealPlans.MealPlans;

        if (request.action === "create") {
          const created = yield* mealPlans.create({ input: request.input });

          if (day._tag === "UnrecordedDay") {
            const plans = yield* mealPlans.list();

            return {
              _tag: "Saved" as const,
              day: new DailyLogs.UnrecordedDay({
                dateKey,
                plans,
                selectedPlan: created.plan,
              }),
              editingPlan: created.plan,
              notice: "Plan created.",
            };
          }

          return {
            _tag: "Saved" as const,
            day: yield* dailyLogs.changePlan({
              input: { dateKey, planId: created.plan.id },
            }),
            editingPlan: created.plan,
            notice: "Plan created.",
          };
        }

        const revised = yield* mealPlans.revise({
          input: { ...request.input, dateKey, planId: request.planId },
        });

        if (day._tag === "UnrecordedDay") {
          const plans = yield* mealPlans.list();

          return {
            _tag: "Saved" as const,
            day: new DailyLogs.UnrecordedDay({
              dateKey,
              plans,
              selectedPlan: revised.plan,
            }),
            editingPlan: revised.plan,
            notice: "Plan saved.",
          };
        }

        const openedDay = yield* dailyLogs.open({ input: { dateKey } });

        return {
          _tag: "Saved" as const,
          day: openedDay,
          editingPlan:
            openedDay._tag === "UnrecordedDay"
              ? revised.plan
              : openedDay.selectedPlan,
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
      ),
    replaceHome: Effect.gen(function* () {
      const navigation = yield* Navigation;

      yield* navigation.replace("/");
    }),
    replaceToNewPlan: (input: {
      readonly dateKey: Domain.DateKey;
      readonly returnDateKey: Domain.DateKey | undefined;
      readonly source: PlansSource | undefined;
    }) =>
      Effect.gen(function* () {
        const navigation = yield* Navigation;

        yield* navigation.replace({
          pathname: "/plans/new",
          params:
            input.source !== "settings"
              ? { dateKey: input.dateKey }
              : input.returnDateKey === undefined
                ? { dateKey: input.dateKey, source: input.source }
                : {
                    dateKey: input.dateKey,
                    returnDateKey: input.returnDateKey,
                    source: input.source,
                  },
        });
      }),
  },
  branches: {
    loaded: {
      invalidRoute: { target: "InvalidRoute" },
      noMealPlans: { target: "NoMealPlans" },
      ready: { target: "Loaded" },
    },
    changePlan: {
      unrecordedDay: { update: "Loaded" },
      changing: { target: "Loaded.ChangingPlan", update: "Loaded" },
    },
  },
}).handle({
  root: ({ input }) => ({ dateKey: input.dateKey, source: input.source }),
  initial: { target: "Loading" },
  states: {
    Loading: {
      invoke: {
        src: "loadRouteData",
        input: ({ root }) => root.dateKey,
        onDone: {
          branches: "loaded",
          resolve: ({ output, select }) =>
            output._tag === "InvalidRoute"
              ? select.invalidRoute()
              : output._tag === "NoMealPlans"
                ? select.noMealPlans({
                    data: { redirectDateKey: output.redirectDateKey },
                  })
                : select.ready({
                    data: {
                      activeTab: 0,
                      data: output.data,
                      editingPlan: null,
                      notice: null,
                    },
                  }),
        },
        onFailure: { target: "InvalidRoute" },
      },
    },
    InvalidRoute: {
      invoke: { src: "replaceHome", onDone: { none: true } },
    },
    NoMealPlans: {
      invoke: {
        src: "replaceToNewPlan",
        input: ({ root, state }) => ({
          dateKey: state.redirectDateKey,
          returnDateKey: root.dateKey,
          source: root.source,
        }),
        onDone: { none: true },
      },
    },
    Loaded: {
      initial: { target: "Loaded.Ready" },
      states: {
        Ready: {
          on: {
            ChangePlan: {
              branches: "changePlan",
              resolve: ({ containingState, event, select }) =>
                containingState.data.day._tag === "UnrecordedDay"
                  ? select.unrecordedDay({
                      data: {
                        ...containingState,
                        data: {
                          ...containingState.data,
                          day: {
                            _tag: "UnrecordedDay",
                            dateKey: containingState.data.day.dateKey,
                            plans: containingState.data.day.plans,
                            selectedPlan: event.plan,
                          },
                        },
                        notice: null,
                      },
                    })
                  : select.changing({
                      data: { planId: event.plan.id },
                      update: { data: { ...containingState, notice: null } },
                    }),
            },
            ClearEditPlan: {
              update: "Loaded",
              data: ({ containingState }) => ({
                ...containingState,
                editingPlan: null,
                notice: null,
              }),
            },
            CreatePlan: {
              target: "Loaded.SavingPlan",
              update: "Loaded",
              data: ({ containingState, event }) => ({
                target: {
                  request: { action: "create", input: event.input },
                },
                update: { ...containingState, notice: null },
              }),
            },
            RevisePlan: {
              target: "Loaded.SavingPlan",
              update: "Loaded",
              data: ({ containingState, event }) => ({
                target: {
                  request: {
                    action: "revise",
                    input: event.input,
                    planId: event.plan.id,
                  },
                },
                update: { ...containingState, notice: null },
              }),
            },
            SelectEditPlan: {
              update: "Loaded",
              data: ({ containingState, event }) => ({
                ...containingState,
                editingPlan: event.plan,
                notice: null,
              }),
            },
            SelectTab: {
              update: "Loaded",
              data: ({ containingState, event }) => ({
                ...containingState,
                activeTab: event.index,
              }),
            },
          },
        },
        ChangingPlan: {
          invoke: {
            src: "changePlan",
            input: ({ containingState, state }) => ({
              dateKey: containingState.data.dateKey,
              planId: state.planId,
            }),
            onDone: {
              target: "Loaded.Ready",
              update: "Loaded",
              data: ({ containingState, output }) => ({
                target: undefined,
                update: {
                  ...containingState,
                  data: { ...containingState.data, day: output },
                  notice: "Plan changed.",
                },
              }),
            },
            onFailure: {
              target: "Loaded.Ready",
              update: "Loaded",
              data: ({ containingState }) => ({
                target: undefined,
                update: {
                  ...containingState,
                  notice: "Could not change plan. Please try again.",
                },
              }),
            },
          },
        },
        SavingPlan: {
          invoke: {
            src: "savePlan",
            input: ({ containingState, state }) => ({
              dateKey: containingState.data.dateKey,
              day: containingState.data.day,
              request: state.request,
            }),
            onDone: {
              target: "Loaded.Ready",
              update: "Loaded",
              data: ({ containingState, output }) => ({
                target: undefined,
                update:
                  output._tag === "Failed"
                    ? { ...containingState, notice: output.notice }
                    : {
                        ...containingState,
                        data: { ...containingState.data, day: output.day },
                        editingPlan: output.editingPlan,
                        notice: output.notice,
                      },
              }),
            },
          },
        },
      },
    },
  },
});
