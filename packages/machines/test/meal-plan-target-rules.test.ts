import { Domain } from "@mai/nutrition";
import { Effect, Schema } from "effect";
import { assert, it } from "vitest";
import { createActor } from "xstate";
import {
  createMealPlanInputFromValues,
  mealPlanFormMachine,
} from "../src/meal-plan-form-machine.ts";

it("loads saved target rules and submits changes without resetting other nutrients", async () => {
  const initialPlan = await Effect.runPromise(
    Schema.decodeEffect(Domain.Plan)({
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
      meals: [{ id: "lunch", name: "Lunch", position: 0, createdAt: 0 }],
    })
  );
  const actor = createActor(mealPlanFormMachine, { input: { initialPlan } });
  actor.start();
  actor.send({
    type: "changeTargetRule",
    nutrient: "fiberGrams",
    rule: "maximum",
  });
  actor.send({ type: "changeField", name: "fiberTargetGrams", value: "35" });
  const context = actor.getSnapshot().context;
  const input = createMealPlanInputFromValues({
    values: context.values,
    meals: context.mealsActor.getSnapshot().context.meals,
  });
  actor.stop();
  assert.equal(input.fiberTargetGrams, "35");
  assert.deepEqual(input.targetRules, {
    ...initialPlan.targetRules,
    fiberGrams: "maximum",
  });
});
