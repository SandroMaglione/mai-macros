import { Domain } from "@mai/nutrition";
import { Effect, Schema } from "effect";
import { assert, it } from "vitest";
import { createActor } from "xstate";
import {
  createFoodInputFromFormValues,
  foodFormMachine,
} from "../src/food-form-machine.ts";

it("loads corrected food text and keeps text, fields and the update payload synchronized", async () => {
  const food = await Effect.runPromise(
    Schema.decodeEffect(Domain.Food)({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Yogurt",
      brand: "Brand",
      origin: "user",
      nutritionReference: { amount: 200, unit: "ml" },
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
      },
      massVolumeConversion: {
        mass: { amount: 103, unit: "g" },
        volume: { amount: 100, unit: "ml" },
      },
      portions: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Cup",
          position: 0,
          size: { amount: 200, unit: "ml" },
        },
      ],
    })
  );
  const actor = createActor(foodFormMachine, {
    input: { initialFood: food, syncQuickInputFromFields: true },
  });
  actor.start();
  assert.equal(
    actor.getSnapshot().context.quickInput,
    "Yogurt, Brand, k120 f1 c10 fi0 p20"
  );
  actor.send({
    type: "changeQuickInput",
    input: "Yogurt, Brand, k140 f2 c12 p22",
  });
  let context = actor.getSnapshot().context;
  assert.equal(context.formValues.energyKcal, "140");
  assert.equal(context.formValues.fiberGrams, "");
  assert.equal(context.formValues.nutritionReferenceAmount, "200");
  assert.equal(context.formValues.nutritionReferenceUnit, "ml");
  assert.equal(context.formValues.conversionMassAmount, "103");
  assert.equal(context.portions[0]?.id, food.portions[0]?.id);
  actor.send({ type: "changeFormValue", name: "proteinGrams", value: "25" });
  context = actor.getSnapshot().context;
  assert.equal(context.quickInput, "Yogurt, Brand, k140 f2 c12 p25");
  const input = createFoodInputFromFormValues(context);
  assert.equal(input.proteinGrams, "25");
  assert.deepEqual(input.nutritionReference, { amount: "200", unit: "ml" });
  assert.equal(input.portions?.[0]?.id, food.portions[0]?.id);
  actor.send({ type: "loadFood", food });
  assert.equal(
    actor.getSnapshot().context.quickInput,
    "Yogurt, Brand, k120 f1 c10 fi0 p20"
  );
  actor.send({ type: "reset" });
  assert.equal(actor.getSnapshot().context.quickInput, "");
  actor.stop();
});
