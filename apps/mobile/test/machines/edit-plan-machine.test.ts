import { describe, expect, it } from "@effect/vitest";
import { MealPlanFormMachine } from "@mai/machines";
import { Domain, MealPlans, Store } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect, Layer, Option, Queue, Schema } from "effect";
import type { Href } from "expo-router";

import {
  EditPlanEvents,
  EditPlanMachine,
  EditPlanStates,
} from "@/machines/edit-plan-machine";
import { Dialogs } from "@/machines/services/dialogs";
import { Navigation } from "@/machines/services/navigation";

const _plan = Schema.decodeEffect(Domain.Plan)({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Training day",
  proteinTargetGrams: 160,
  carbsTargetGrams: 220,
  fatTargetGrams: 70,
  createdAt: 0,
  meals: [{ id: "lunch", name: "Lunch", position: 0, createdAt: 0 }],
});

const _planId = Domain.PlanId.make("11111111-1111-4111-8111-111111111111");

const _dateKey = Domain.DateKey.make("2020-01-01");

const _submission: MealPlanFormMachine.MealPlanFormSubmission = {
  name: "Training day",
  meals: [{ id: "lunch", name: "Lunch" }, { name: "Dinner" }],
  proteinTargetGrams: "170",
  carbsTargetGrams: "220",
  fatTargetGrams: "70",
  targetRules: Domain.DefaultPlanTargetRules,
};

const _harness = ({
  mealPlans,
}: {
  readonly mealPlans: Layer.Layer<MealPlans.MealPlans>;
}) =>
  Effect.gen(function* () {
    const replaced = yield* Queue.unbounded<Href>();
    const alerts = yield* Queue.unbounded<string>();
    const layer = Layer.mergeAll(
      mealPlans,
      Layer.mock(Navigation, {
        replace: (href) => Queue.offer(replaced, href),
      }),
      Layer.mock(Dialogs, {
        alert: ({ message }) => Queue.offer(alerts, message),
      })
    );

    return { alerts, layer, replaced };
  });

const _startReady = Effect.gen(function* () {
  const machine = yield* Machine.start(EditPlanMachine, {
    routeParams: { _tag: "Valid", dateKey: _dateKey, planId: _planId },
  });

  yield* Machine.waitFor(machine, ({ state }) =>
    EditPlanStates.matches(state, "Screen.Form.Ready")
  );

  return machine;
});

describe("EditPlanMachine", () => {
  it.effect("leaves an invalid route through the eventless transition", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(EditPlanMachine, {
        input: { routeParams: { _tag: "Invalid" } },
        events: [EditPlanEvents.Back()],
      });

      yield* MachineTest.verify(EditPlanMachine, trace);

      const coverage = MachineTest.coverage(EditPlanMachine, trace);

      expect(trace.initial.startingState.value.planId).toBeNull();
      expect(trace.finalConfiguration).toContain("Screen.InvalidRoute");
      expect(trace.finalConfiguration).toContain("BackNavigation.Navigating");
      expect(
        coverage.transitions.definitions.misses.map(({ source }) => source)
      ).toEqual([
        "Screen.Loading",
        "Screen.Loading",
        "Screen.InvalidRoute",
        "Screen.Form.Ready",
        "Screen.Form.Submitting",
        "Screen.Form.Submitting",
        "Screen.Form.Revised",
        "BackNavigation.Navigating",
      ]);
    })
  );

  it.live("redirects home when the route params are invalid", () =>
    Effect.gen(function* () {
      const { layer, replaced } = yield* _harness({
        mealPlans: Layer.mock(MealPlans.MealPlans, {}),
      });

      yield* Effect.gen(function* () {
        const machine = yield* Machine.start(EditPlanMachine, {
          routeParams: { _tag: "Invalid" },
        });

        expect(yield* Queue.take(replaced)).toBe("/");
        expect(
          EditPlanStates.matches(yield* machine.state, "Screen.InvalidRoute")
        ).toBe(true);
      }).pipe(Effect.provide(layer));
    }).pipe(Effect.scoped)
  );

  it.live("revises the loaded plan and returns to its day", () =>
    Effect.gen(function* () {
      const plan = yield* _plan;
      const revisions: MealPlans.ReviseMealPlanInput[] = [];
      const { layer, replaced } = yield* _harness({
        mealPlans: Layer.mock(MealPlans.MealPlans, {
          get: () => Effect.succeed(plan),
          revise: ({ input }) =>
            Effect.sync(() => {
              revisions.push(input);

              return new MealPlans.RevisedMealPlan({
                dailyLog: null,
                plan,
                previousPlan: plan,
              });
            }),
        }),
      });

      yield* Effect.gen(function* () {
        const machine = yield* _startReady;
        const form = Option.map(
          EditPlanStates.get(yield* machine.state, "Screen.Form"),
          (form) => form.plan.id
        );

        expect(form).toEqual(Option.some(_planId));

        yield* machine.send(EditPlanEvents.Submit({ input: _submission }));

        expect(yield* Queue.take(replaced)).toEqual({
          pathname: "/days/[dateKey]",
          params: { dateKey: _dateKey },
        });
        expect(revisions).toEqual([
          { ..._submission, dateKey: _dateKey, planId: _planId },
        ]);
        expect(
          EditPlanStates.matches(yield* machine.state, "Screen.Form.Revised")
        ).toBe(true);
      }).pipe(Effect.provide(layer));
    }).pipe(Effect.scoped)
  );

  it.live("alerts and keeps the plan when the revision is rejected", () =>
    Effect.gen(function* () {
      const plan = yield* _plan;
      const { alerts, layer } = yield* _harness({
        mealPlans: Layer.mock(MealPlans.MealPlans, {
          get: () => Effect.succeed(plan),
          revise: () =>
            Effect.fail(
              new MealPlans.PlanMealNameAlreadyExists({ name: "Lunch" })
            ),
        }),
      });

      yield* Effect.gen(function* () {
        const machine = yield* _startReady;
        const message =
          "Meal names must be unique inside a plan. Rename the duplicate meal and try again.";

        yield* machine.send(EditPlanEvents.Submit({ input: _submission }));

        yield* Machine.waitFor(machine, ({ state }) =>
          Option.exists(
            EditPlanStates.get(state, "Screen.Form.Ready"),
            ({ errorMessage }) => errorMessage === message
          )
        );
        expect(yield* Queue.take(alerts)).toBe(message);
      }).pipe(Effect.provide(layer));
    }).pipe(Effect.scoped)
  );

  it.live("redirects home when the plan disappears during revision", () =>
    Effect.gen(function* () {
      const plan = yield* _plan;
      const { layer, replaced } = yield* _harness({
        mealPlans: Layer.mock(MealPlans.MealPlans, {
          get: () => Effect.succeed(plan),
          revise: () =>
            Effect.fail(new MealPlans.PlanNotFound({ planId: _planId })),
        }),
      });

      yield* Effect.gen(function* () {
        const machine = yield* _startReady;

        yield* machine.send(EditPlanEvents.Submit({ input: _submission }));

        expect(yield* Queue.take(replaced)).toBe("/");
        expect(
          EditPlanStates.matches(yield* machine.state, "Screen.InvalidRoute")
        ).toBe(true);
      }).pipe(Effect.provide(layer));
    }).pipe(Effect.scoped)
  );

  it.live("redirects home when the plan does not exist", () =>
    Effect.gen(function* () {
      const { layer, replaced } = yield* _harness({
        mealPlans: Layer.mock(MealPlans.MealPlans, {
          get: () =>
            Effect.fail(new MealPlans.PlanNotFound({ planId: _planId })),
        }),
      });

      yield* Effect.gen(function* () {
        yield* Machine.start(EditPlanMachine, {
          routeParams: { _tag: "Valid", planId: _planId },
        });

        expect(yield* Queue.take(replaced)).toBe("/");
      }).pipe(Effect.provide(layer));
    }).pipe(Effect.scoped)
  );

  it.live("shows a failure when the plan cannot load", () =>
    Effect.gen(function* () {
      const { layer } = yield* _harness({
        mealPlans: Layer.mock(MealPlans.MealPlans, {
          get: () =>
            Effect.fail(
              new Store.NutritionStoreError({ cause: "unavailable" })
            ),
        }),
      });

      yield* Effect.gen(function* () {
        const machine = yield* Machine.start(EditPlanMachine, {
          routeParams: { _tag: "Valid", planId: _planId },
        });
        const failed = yield* Machine.waitFor(machine, ({ state }) =>
          EditPlanStates.matches(state, "Screen.Failed")
        );

        expect(
          Option.map(
            EditPlanStates.get(failed.state, "Screen.Failed"),
            ({ message }) => message
          )
        ).toEqual(
          Option.some("Could not load this meal plan. Please try again.")
        );
      }).pipe(Effect.provide(layer));
    }).pipe(Effect.scoped)
  );

  it.live("navigates back to the route day", () =>
    Effect.gen(function* () {
      const plan = yield* _plan;
      const { layer, replaced } = yield* _harness({
        mealPlans: Layer.mock(MealPlans.MealPlans, {
          get: () => Effect.succeed(plan),
        }),
      });

      yield* Effect.gen(function* () {
        const machine = yield* _startReady;

        yield* machine.send(EditPlanEvents.Back());

        expect(yield* Queue.take(replaced)).toEqual({
          pathname: "/days/[dateKey]",
          params: { dateKey: _dateKey },
        });
        yield* Machine.waitFor(
          machine,
          ({ state }) =>
            EditPlanStates.matches(state, "BackNavigation.Idle") &&
            EditPlanStates.matches(state, "Screen.Form.Ready")
        );
      }).pipe(Effect.provide(layer));
    }).pipe(Effect.scoped)
  );
});
