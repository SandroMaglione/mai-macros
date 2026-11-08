import { describe, expect, it } from "@effect/vitest";
import { MealPlanFormMachine } from "@mai/machines";
import { Domain, MealPlans, Store } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect, Layer, Option, Queue, Schema } from "effect";
import type { Href } from "expo-router";

import {
  invalidNewPlanDateMessage,
  NewPlanEvents,
  NewPlanMachine,
  NewPlanStates,
} from "@/machines/new-plan-machine";
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

const _submission: MealPlanFormMachine.MealPlanFormSubmission = {
  name: "Rest day",
  meals: [{ name: "Lunch" }],
  proteinTargetGrams: "150",
  carbsTargetGrams: "180",
  fatTargetGrams: "60",
  targetRules: { ...Domain.DefaultPlanTargetRules, sugarGrams: "minimum" },
};

const _harness = ({
  canGoBack,
  mealPlans,
}: {
  readonly canGoBack: boolean;
  readonly mealPlans: Layer.Layer<MealPlans.MealPlans>;
}) =>
  Effect.gen(function* () {
    const navigation = yield* Queue.unbounded<
      | { readonly _tag: "Back" }
      | { readonly _tag: "Replace"; readonly href: Href }
    >();
    const alerts = yield* Queue.unbounded<string>();
    const layer = Layer.mergeAll(
      mealPlans,
      Layer.mock(Navigation, {
        back: Queue.offer(navigation, { _tag: "Back" }),
        canGoBack: Effect.succeed(canGoBack),
        replace: (href) => Queue.offer(navigation, { _tag: "Replace", href }),
      }),
      Layer.mock(Dialogs, {
        alert: ({ message }) => Queue.offer(alerts, message),
      })
    );

    return { alerts, layer, navigation };
  });

describe("NewPlanMachine", () => {
  it.effect("plans the startup and back navigation without services", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(NewPlanMachine, {
        input: { search: { _tag: "Invalid" } },
        events: [
          NewPlanEvents.Back(),
          NewPlanEvents.Submit({ input: _submission }),
        ],
      });

      yield* MachineTest.verify(NewPlanMachine, trace);

      const coverage = MachineTest.coverage(NewPlanMachine, trace);

      expect(trace.initial.startingState.value.searchErrorMessage).toBe(
        invalidNewPlanDateMessage
      );
      expect(trace.finalConfiguration).toContain("Screen.Loading");
      expect(trace.finalConfiguration).toContain("BackNavigation.Navigating");
      expect(
        coverage.transitions.definitions.misses.map(({ source }) => source)
      ).toEqual([
        "Screen.Loading",
        "Screen.Loading",
        "Screen.Form.Ready",
        "Screen.Form.Submitting",
        "Screen.Form.Submitting",
        "Screen.Form.Created",
        "BackNavigation.Navigating",
      ]);
    })
  );

  it.live("creates the plan and returns to the target day", () =>
    Effect.gen(function* () {
      const plan = yield* _plan;
      const created: MealPlans.CreateMealPlanInput[] = [];
      const { layer, navigation } = yield* _harness({
        canGoBack: true,
        mealPlans: Layer.mock(MealPlans.MealPlans, {
          list: () => Effect.succeed([plan]),
          create: ({ input }) =>
            Effect.sync(() => {
              created.push(input);

              return new MealPlans.CreatedMealPlan({ plan });
            }),
        }),
      });

      yield* Effect.gen(function* () {
        const machine = yield* Machine.start(NewPlanMachine, {
          search: { _tag: "Valid", dateKey: Domain.DateKey.make("2020-01-01") },
        });
        const ready = yield* Machine.waitFor(machine, ({ state }) =>
          NewPlanStates.matches(state, "Screen.Form.Ready")
        );

        expect(
          Option.map(
            NewPlanStates.get(ready.state, "Screen.Form"),
            ({ hasExistingPlan }) => hasExistingPlan
          )
        ).toEqual(Option.some(true));

        yield* machine.send(NewPlanEvents.Submit({ input: _submission }));

        expect(yield* Queue.take(navigation)).toEqual({
          _tag: "Replace",
          href: {
            pathname: "/days/[dateKey]",
            params: { dateKey: "2020-01-01" },
          },
        });
        expect(created).toEqual([_submission]);
        expect(
          NewPlanStates.matches(yield* machine.state, "Screen.Form.Created")
        ).toBe(true);
      }).pipe(Effect.provide(layer));
    }).pipe(Effect.scoped)
  );

  it.live("alerts and keeps the form editable when the plan is rejected", () =>
    Effect.gen(function* () {
      const { alerts, layer } = yield* _harness({
        canGoBack: true,
        mealPlans: Layer.mock(MealPlans.MealPlans, {
          list: () => Effect.succeed([]),
          create: ({ input }) =>
            Effect.fail(
              new MealPlans.PlanNameAlreadyExists({ name: input.name })
            ),
        }),
      });

      yield* Effect.gen(function* () {
        const machine = yield* Machine.start(NewPlanMachine, {
          search: { _tag: "Valid" },
        });

        yield* Machine.waitFor(machine, ({ state }) =>
          NewPlanStates.matches(state, "Screen.Form.Ready")
        );
        yield* machine.send(NewPlanEvents.Submit({ input: _submission }));

        const message =
          "A plan with this name already exists. Choose a different name and try again.";
        const rejected = yield* Machine.waitFor(machine, ({ state }) =>
          Option.exists(
            NewPlanStates.get(state, "Screen.Form.Ready"),
            ({ errorMessage }) => errorMessage === message
          )
        );

        expect(yield* Queue.take(alerts)).toBe(message);
        expect(
          Option.map(
            NewPlanStates.get(rejected.state, "Screen.Form"),
            ({ hasExistingPlan }) => hasExistingPlan
          )
        ).toEqual(Option.some(false));
      }).pipe(Effect.provide(layer));
    }).pipe(Effect.scoped)
  );

  it.live("returns to settings when there is no history to go back to", () =>
    Effect.gen(function* () {
      const { layer, navigation } = yield* _harness({
        canGoBack: false,
        mealPlans: Layer.mock(MealPlans.MealPlans, {
          list: () => Effect.succeed([]),
        }),
      });

      yield* Effect.gen(function* () {
        const machine = yield* Machine.start(NewPlanMachine, {
          search: {
            _tag: "Valid",
            returnDateKey: Domain.DateKey.make("2020-01-02"),
            source: "settings",
          },
        });

        yield* machine.send(NewPlanEvents.Back());

        expect(yield* Queue.take(navigation)).toEqual({
          _tag: "Replace",
          href: { pathname: "/settings", params: { dateKey: "2020-01-02" } },
        });
        yield* Machine.waitFor(machine, ({ state }) =>
          NewPlanStates.matches(state, "BackNavigation.Idle")
        );
      }).pipe(Effect.provide(layer));
    }).pipe(Effect.scoped)
  );

  it.live("goes back in history after creating a plan from settings", () =>
    Effect.gen(function* () {
      const plan = yield* _plan;
      const { layer, navigation } = yield* _harness({
        canGoBack: true,
        mealPlans: Layer.mock(MealPlans.MealPlans, {
          list: () => Effect.succeed([plan]),
          create: () => Effect.succeed(new MealPlans.CreatedMealPlan({ plan })),
        }),
      });

      yield* Effect.gen(function* () {
        const machine = yield* Machine.start(NewPlanMachine, {
          search: { _tag: "Valid", source: "settings" },
        });

        yield* Machine.waitFor(machine, ({ state }) =>
          NewPlanStates.matches(state, "Screen.Form.Ready")
        );
        yield* machine.send(NewPlanEvents.Submit({ input: _submission }));

        expect(yield* Queue.take(navigation)).toEqual({ _tag: "Back" });
      }).pipe(Effect.provide(layer));
    }).pipe(Effect.scoped)
  );

  it.live("shows a failure when existing plans cannot load", () =>
    Effect.gen(function* () {
      const { layer } = yield* _harness({
        canGoBack: true,
        mealPlans: Layer.mock(MealPlans.MealPlans, {
          list: () =>
            Effect.fail(
              new Store.NutritionStoreError({ cause: "unavailable" })
            ),
        }),
      });

      yield* Effect.gen(function* () {
        const machine = yield* Machine.start(NewPlanMachine, {
          search: { _tag: "Valid" },
        });
        const failed = yield* Machine.waitFor(machine, ({ state }) =>
          NewPlanStates.matches(state, "Screen.Failed")
        );

        expect(
          Option.map(
            NewPlanStates.get(failed.state, "Screen.Failed"),
            ({ message }) => message
          )
        ).toEqual(Option.some("Could not load meal plans. Please try again."));
      }).pipe(Effect.provide(layer));
    }).pipe(Effect.scoped)
  );
});
