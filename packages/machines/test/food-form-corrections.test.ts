import { Domain, Utils } from "@mai/nutrition";
import { Effect, Schema } from "effect";
import { assert, it } from "vitest";
import { createActor } from "xstate";
import { foodFormMachine } from "../src/food-form-machine.ts";

it("loads corrected nutrition into a copy draft and uses it for the dominant macro", async () => {
  const food = await Effect.runPromise(
    Schema.decodeEffect(Domain.Food)({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Catalog food",
      origin: "app-default",
      energyKcal: 100,
      proteinGrams: 2,
      carbsGrams: 10,
      fatGrams: 1,
      createdAt: 0,
      updatedAt: 0,
      nutritionCorrections: {
        energyKcal: 120,
        proteinGrams: 20,
        fiberGrams: 0,
        sugarGrams: 0,
      },
    })
  );
  const actor = createActor(foodFormMachine, {
    input: { initialFood: null, syncQuickInputFromFields: false },
  });
  actor.start();
  actor.send({ type: "loadFood", food });
  const values = actor.getSnapshot().context.formValues;
  actor.stop();
  assert.equal(values.energyKcal, "120");
  assert.equal(values.proteinGrams, "20");
  assert.equal(values.carbsGrams, "10");
  assert.equal(values.fiberGrams, "0");
  assert.equal(values.sugarGrams, "0");
  assert.equal(values.saltGrams, "");
  assert.deepEqual(Utils.findDominantMacronutrients({ food }), ["protein"]);
  assert.equal(food.energyKcal, 100);
});
