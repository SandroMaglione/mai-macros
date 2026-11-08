import { describe, expect, it } from "@effect/vitest";
import { MealPlanFormMachine } from "@mai/machines";
import { DailyLogs, Domain, MealPlans, Store } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect, Layer, Option, Queue, Schema } from "effect";
import type { Href } from "expo-router";

import {
  PlansEvents,
  PlansMachine,
  PlansStates,
} from "@/machines/plans-machine";
import { Navigation } from "@/machines/services/navigation";

const _dateKey = Domain.DateKey.make("2020-01-01");

const _plans = Effect.all([
  Schema.decodeEffect(Domain.Plan)({
    id: "11111111-1111-4111-8111-111111111111",
    name: "Training day",
    proteinTargetGrams: 160,
    carbsTargetGrams: 220,
    fatTargetGrams: 70,
    createdAt: 0,
    meals: [{ id: "lunch", name: "Lunch", position: 0, createdAt: 0 }],
  }),
  Schema.decodeEffect(Domain.Plan)({
    id: "22222222-2222-4222-8222-222222222222",
    name: "Rest day",
    proteinTargetGrams: 140,
    carbsTargetGrams: 160,
    fatTargetGrams: 60,
    createdAt: 0,
    meals: [{ id: "dinner", name: "Dinner", position: 0, createdAt: 0 }],
  }),
]);

const _dailyLog = ({ planId }: { readonly planId: string }) =>
  Schema.decodeEffect(Domain.DailyLog)({
    dateKey: _dateKey,
    planId,
    createdAt: 0,
    updatedAt: 0,
  });

const _submission: MealPlanFormMachine.MealPlanFormSubmission = {
  name: "Refeed",
  meals: [{ name: "Lunch" }],
  proteinTargetGrams: "150",
  carbsTargetGrams: "300",
  fatTargetGrams: "50",
};

const _harness = ({
  services,
}: {
  readonly services: Layer.Layer<DailyLogs.DailyLogs | MealPlans.MealPlans>;
}) =>
  Effect.gen(function* () {
    const replaced = yield* Queue.unbounded<Href>();
    const layer = Layer.mergeAll(
      services,
      Layer.mock(Navigation, {
        replace: (href) => Queue.offer(replaced, href),
      })
    );

    return { layer, replaced };
  });

const _start = ({ source }: { readonly source: "settings" | undefined }) =>
  Machine.start(PlansMachine, { dateKey: _dateKey, source });

const _loadedValue = ({
  machine,
}: {
  readonly machine: Effect.Success<ReturnType<typeof _start>>;
}) =>
  Effect.gen(function* () {
    const snapshot = yield* Machine.waitFor(machine, ({ state }) =>
      PlansStates.matches(state, "Loaded.Ready")
    );

    return yield* Effect.fromOption(PlansStates.get(snapshot.state, "Loaded"));
  });

describe("PlansMachine", () => {
  it.effect("waits for the route data before accepting plan events", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(PlansMachine, {
        input: { dateKey: _dateKey, source: undefined },
        events: [
          PlansEvents.SelectTab({ index: 1 }),
          PlansEvents.ClearEditPlan(),
        ],
      });

      yield* MachineTest.verify(PlansMachine, trace);

      const coverage = MachineTest.coverage(PlansMachine, trace);

      expect(trace.finalConfiguration).toContain("Loading");
      expect(coverage.transitions.definitions.hit).toBe(0);
      expect(
        coverage.transitions.definitions.misses.map(({ source }) => source)
      ).toEqual([
        "Loading",
        "Loading",
        "InvalidRoute",
        "NoMealPlans",
        "Loaded.Ready",
        "Loaded.Ready",
        "Loaded.Ready",
        "Loaded.Ready",
        "Loaded.Ready",
        "Loaded.Ready",
        "Loaded.ChangingPlan",
        "Loaded.ChangingPlan",
        "Loaded.SavingPlan",
      ]);
    })
  );

  it.live("edits an unrecorded day without changing the stored day plan", () =>
    Effect.gen(function* () {
      const [training, rest] = yield* _plans;
      const { layer } = yield* _harness({
        services: Layer.mergeAll(
          Layer.mock(DailyLogs.DailyLogs, {
            open: () =>
              Effect.succeed(
                new DailyLogs.UnrecordedDay({
                  dateKey: _dateKey,
                  plans: [training, rest],
                  selectedPlan: training,
                })
              ),
          }),
          Layer.mock(MealPlans.MealPlans, {})
        ),
      });

      yield* Effect.gen(function* () {
        const machine = yield* _start({ source: undefined });

        yield* _loadedValue({ machine });
        yield* machine.send(PlansEvents.ChangePlan({ plan: rest }));
        yield* machine.send(PlansEvents.SelectTab({ index: 2 }));
        yield* machine.send(PlansEvents.SelectEditPlan({ plan: rest }));

        const editing = yield* Machine.waitFor(machine, ({ state }) =>
          Option.exists(
            PlansStates.get(state, "Loaded"),
            ({ editingPlan }) => editingPlan?.id === rest.id
          )
        ).pipe(
          Effect.flatMap(({ state }) =>
            Effect.fromOption(PlansStates.get(state, "Loaded"))
          )
        );

        expect(editing.data.day.selectedPlan.id).toBe(rest.id);
        expect(editing.data.day._tag).toBe("UnrecordedDay");
        expect(editing.activeTab).toBe(2);
        expect(editing.editingPlan?.id).toBe(rest.id);

        yield* machine.send(PlansEvents.ClearEditPlan());

        yield* Machine.waitFor(machine, ({ state }) =>
          Option.exists(
            PlansStates.get(state, "Loaded"),
            ({ editingPlan }) => editingPlan === null
          )
        );
      }).pipe(Effect.provide(layer));
    }).pipe(Effect.scoped)
  );

  it.live("changes the plan of a recorded day", () =>
    Effect.gen(function* () {
      const [training, rest] = yield* _plans;
      const dailyLog = yield* _dailyLog({ planId: training.id });
      const changedLog = yield* _dailyLog({ planId: rest.id });
      const changes: DailyLogs.ChangeDayPlanInput[] = [];
      const { layer } = yield* _harness({
        services: Layer.mergeAll(
          Layer.mock(DailyLogs.DailyLogs, {
            open: () =>
              Effect.succeed(
                new DailyLogs.OpenedDay({
                  dailyLog,
                  plans: [training, rest],
                  selectedPlan: training,
                })
              ),
            changePlan: ({ input }) =>
              Effect.sync(() => {
                changes.push(input);

                return new DailyLogs.ChangedDayPlan({
                  dailyLog: changedLog,
                  plans: [training, rest],
                  selectedPlan: rest,
                });
              }),
          }),
          Layer.mock(MealPlans.MealPlans, {})
        ),
      });

      yield* Effect.gen(function* () {
        const machine = yield* _start({ source: undefined });

        yield* _loadedValue({ machine });
        yield* machine.send(PlansEvents.ChangePlan({ plan: rest }));

        const changed = yield* Machine.waitFor(machine, ({ state }) =>
          Option.exists(
            PlansStates.get(state, "Loaded"),
            ({ notice }) => notice === "Plan changed."
          )
        );

        expect(changes).toEqual([{ dateKey: _dateKey, planId: rest.id }]);
        expect(
          Option.map(
            PlansStates.get(changed.state, "Loaded"),
            ({ data }) => data.day._tag
          )
        ).toEqual(Option.some("ChangedDayPlan"));
      }).pipe(Effect.provide(layer));
    }).pipe(Effect.scoped)
  );

  it.live("reports a failed plan change", () =>
    Effect.gen(function* () {
      const [training, rest] = yield* _plans;
      const dailyLog = yield* _dailyLog({ planId: training.id });
      const { layer } = yield* _harness({
        services: Layer.mergeAll(
          Layer.mock(DailyLogs.DailyLogs, {
            open: () =>
              Effect.succeed(
                new DailyLogs.OpenedDay({
                  dailyLog,
                  plans: [training, rest],
                  selectedPlan: training,
                })
              ),
            changePlan: () =>
              Effect.fail(
                new DailyLogs.CannotChangeLoggedDayPlan({ dateKey: _dateKey })
              ),
          }),
          Layer.mock(MealPlans.MealPlans, {})
        ),
      });

      yield* Effect.gen(function* () {
        const machine = yield* _start({ source: undefined });

        yield* _loadedValue({ machine });
        yield* machine.send(PlansEvents.ChangePlan({ plan: rest }));

        yield* Machine.waitFor(machine, ({ state }) =>
          Option.exists(
            PlansStates.get(state, "Loaded"),
            ({ notice }) =>
              notice === "Could not change plan. Please try again."
          )
        );
      }).pipe(Effect.provide(layer));
    }).pipe(Effect.scoped)
  );

  it.live("creates a plan for an unrecorded day and opens it for editing", () =>
    Effect.gen(function* () {
      const [training, rest] = yield* _plans;
      const created: MealPlans.CreateMealPlanInput[] = [];
      const { layer } = yield* _harness({
        services: Layer.mergeAll(
          Layer.mock(DailyLogs.DailyLogs, {
            open: () =>
              Effect.succeed(
                new DailyLogs.UnrecordedDay({
                  dateKey: _dateKey,
                  plans: [training],
                  selectedPlan: training,
                })
              ),
          }),
          Layer.mock(MealPlans.MealPlans, {
            create: ({ input }) =>
              Effect.sync(() => {
                created.push(input);

                return new MealPlans.CreatedMealPlan({ plan: rest });
              }),
            list: () => Effect.succeed([training, rest]),
          })
        ),
      });

      yield* Effect.gen(function* () {
        const machine = yield* _start({ source: undefined });

        yield* _loadedValue({ machine });
        yield* machine.send(PlansEvents.CreatePlan({ input: _submission }));

        const saved = yield* Machine.waitFor(machine, ({ state }) =>
          Option.exists(
            PlansStates.get(state, "Loaded"),
            ({ notice }) => notice === "Plan created."
          )
        );
        const loaded = PlansStates.get(saved.state, "Loaded");

        expect(created).toEqual([_submission]);
        expect(
          Option.map(loaded, ({ editingPlan }) => editingPlan?.id)
        ).toEqual(Option.some(rest.id));
        expect(
          Option.map(loaded, ({ data }) => data.day.plans.map(({ id }) => id))
        ).toEqual(Option.some([training.id, rest.id]));
      }).pipe(Effect.provide(layer));
    }).pipe(Effect.scoped)
  );

  it.live("reports a rejected plan revision", () =>
    Effect.gen(function* () {
      const [training] = yield* _plans;
      const dailyLog = yield* _dailyLog({ planId: training.id });
      const { layer } = yield* _harness({
        services: Layer.mergeAll(
          Layer.mock(DailyLogs.DailyLogs, {
            open: () =>
              Effect.succeed(
                new DailyLogs.OpenedDay({
                  dailyLog,
                  plans: [training],
                  selectedPlan: training,
                })
              ),
          }),
          Layer.mock(MealPlans.MealPlans, {
            revise: ({ input }) =>
              Effect.fail(
                new MealPlans.PlanNameAlreadyExists({ name: input.name })
              ),
          })
        ),
      });

      yield* Effect.gen(function* () {
        const machine = yield* _start({ source: undefined });

        yield* _loadedValue({ machine });
        yield* machine.send(
          PlansEvents.RevisePlan({ input: _submission, plan: training })
        );

        yield* Machine.waitFor(machine, ({ state }) =>
          Option.exists(
            PlansStates.get(state, "Loaded"),
            ({ notice }) =>
              notice ===
              "A plan with this name already exists. Choose a different name and try again."
          )
        );
      }).pipe(Effect.provide(layer));
    }).pipe(Effect.scoped)
  );

  it.live("redirects to plan creation when no meal plans exist", () =>
    Effect.gen(function* () {
      const { layer, replaced } = yield* _harness({
        services: Layer.mergeAll(
          Layer.mock(DailyLogs.DailyLogs, {
            open: () =>
              Effect.fail(new DailyLogs.NoMealPlans({ dateKey: _dateKey })),
          }),
          Layer.mock(MealPlans.MealPlans, {})
        ),
      });

      yield* Effect.gen(function* () {
        yield* _start({ source: "settings" });

        expect(yield* Queue.take(replaced)).toEqual({
          pathname: "/plans/new",
          params: {
            dateKey: _dateKey,
            returnDateKey: _dateKey,
            source: "settings",
          },
        });
      }).pipe(Effect.provide(layer));
    }).pipe(Effect.scoped)
  );

  it.live("redirects home when the route data cannot load", () =>
    Effect.gen(function* () {
      const { layer, replaced } = yield* _harness({
        services: Layer.mergeAll(
          Layer.mock(DailyLogs.DailyLogs, {
            open: () =>
              Effect.fail(
                new Store.NutritionStoreError({ cause: "unavailable" })
              ),
          }),
          Layer.mock(MealPlans.MealPlans, {})
        ),
      });

      yield* Effect.gen(function* () {
        const machine = yield* _start({ source: undefined });

        expect(yield* Queue.take(replaced)).toBe("/");
        expect(PlansStates.matches(yield* machine.state, "InvalidRoute")).toBe(
          true
        );
      }).pipe(Effect.provide(layer));
    }).pipe(Effect.scoped)
  );
});
