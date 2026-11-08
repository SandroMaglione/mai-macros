import { assert, describe, it } from "@effect/vitest";
import { Domain } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect, Schema } from "effect";

import {
  calculateMealPlanEnergyKcalFromValues,
  createMealPlanInputFromValues,
  MealPlanFormEvents,
  MealPlanFormMachine,
  MealPlanMealsChild,
  MealPlanMealsEvents,
  MealPlanMealsMachine,
} from "../src/meal-plan-form-machine.ts";

const _initialPlan = Schema.decodeEffect(Domain.Plan)({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Targets",
  proteinTargetGrams: 100,
  carbsTargetGrams: 200,
  fatTargetGrams: 60,
  fiberTargetGrams: 30,
  createdAt: 0,
  targetRules: {
    ...Domain.DefaultPlanTargetRules,
    proteinGrams: "maximum",
  },
  meals: [
    { id: "dinner", name: "Dinner", position: 1, createdAt: 0 },
    { id: "lunch", name: "Lunch", position: 0, createdAt: 0 },
  ],
});

describe("MealPlanFormMachine", () => {
  it.live(
    "loads saved target rules and submits changes without resetting other nutrients",
    () =>
      Effect.gen(function* () {
        const initialPlan = yield* _initialPlan;
        const form = yield* Machine.start(MealPlanFormMachine, {
          initialPlan,
        });

        yield* form.send(
          MealPlanFormEvents.ChangeTargetRule({
            nutrient: "fiberGrams",
            rule: "maximum",
          })
        );
        yield* form.send(
          MealPlanFormEvents.ChangeField({
            name: "fiberTargetGrams",
            value: "35",
          })
        );

        const snapshot = yield* Machine.waitFor(
          form,
          ({ state }) => state.value.values.fiberTargetGrams === "35"
        );
        const meals = yield* Effect.flatMap(
          form.child(MealPlanMealsChild),
          Effect.fromOption
        );
        const mealsSnapshot = yield* meals.state;
        const input = createMealPlanInputFromValues({
          values: snapshot.state.value.values,
          meals: mealsSnapshot.value.meals,
        });

        assert.equal(input.fiberTargetGrams, "35");
        assert.deepEqual(input.targetRules, {
          ...initialPlan.targetRules,
          fiberGrams: "maximum",
        });
      }).pipe(Effect.scoped)
  );

  it.effect("starts an empty create form with default target rules", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(MealPlanFormMachine, {
        input: { initialPlan: null },
        events: [
          MealPlanFormEvents.ChangeField({ name: "name", value: "Rest day" }),
          MealPlanFormEvents.ChangeField({
            name: "proteinTargetGrams",
            value: "150",
          }),
          MealPlanFormEvents.ChangeField({
            name: "carbsTargetGrams",
            value: "200,5",
          }),
          MealPlanFormEvents.ChangeTargetRule({
            nutrient: "energyKcal",
            rule: "maximum",
          }),
        ],
      });

      yield* MachineTest.verify(MealPlanFormMachine, trace);

      const coverage = MachineTest.coverage(MealPlanFormMachine, trace);
      const { values } = trace.final.value;

      assert.strictEqual(trace.initial.startingState.value.values.name, "");
      assert.deepEqual(
        trace.initial.startingState.value.values.targetRules,
        Domain.DefaultPlanTargetRules
      );
      assert.strictEqual(values.name, "Rest day");
      assert.strictEqual(values.targetRules.energyKcal, "maximum");
      assert.strictEqual(
        calculateMealPlanEnergyKcalFromValues({ values }),
        150 * 4 + 200.5 * 4
      );
      assert.strictEqual(coverage.transitions.definitions.missing, 0);
    })
  );
});

describe("MealPlanMealsMachine", () => {
  it.effect("orders saved meals and edits the meal list", () =>
    Effect.gen(function* () {
      const initialPlan = yield* _initialPlan;
      const trace = yield* MachineTest.run(MealPlanMealsMachine, {
        input: { initialPlan },
        events: [
          MealPlanMealsEvents.AddMeal(),
          MealPlanMealsEvents.ChangeMealName({ index: 2, value: "Snack" }),
          MealPlanMealsEvents.RemoveMeal({ index: 0 }),
        ],
      });

      yield* MachineTest.verify(MealPlanMealsMachine, trace);

      const coverage = MachineTest.coverage(MealPlanMealsMachine, trace);

      assert.deepEqual(
        trace.initial.startingState.value.meals.map(({ name }) => name),
        ["Lunch", "Dinner"]
      );
      assert.deepEqual(
        trace.final.value.meals.map(({ id, name }) => ({ id, name })),
        [
          { id: Domain.MealId.make("dinner"), name: "Dinner" },
          { id: undefined, name: "Snack" },
        ]
      );
      assert.strictEqual(coverage.transitions.definitions.missing, 0);
    })
  );
});
