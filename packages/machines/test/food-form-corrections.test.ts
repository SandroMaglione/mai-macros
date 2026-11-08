import { assert, it } from "@effect/vitest";
import { Domain, Utils } from "@mai/nutrition";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect, Schema } from "effect";

import { FoodFormEvents, FoodFormMachine } from "../src/food-form-machine.ts";

it.effect(
  "loads corrected nutrition into a copy draft and uses it for the dominant macro",
  () =>
    Effect.gen(function* () {
      const food = yield* Schema.decodeEffect(Domain.Food)({
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
      });
      const trace = yield* MachineTest.run(FoodFormMachine, {
        input: { initialFood: null, syncQuickInputFromFields: false },
        events: [FoodFormEvents.LoadFood({ food })],
      });

      yield* MachineTest.verify(FoodFormMachine, trace);

      const values = trace.final.value.formValues;

      assert.equal(values.energyKcal, "120");
      assert.equal(values.proteinGrams, "20");
      assert.equal(values.carbsGrams, "10");
      assert.equal(values.fiberGrams, "0");
      assert.equal(values.sugarGrams, "0");
      assert.equal(values.saltGrams, "");
      assert.deepEqual(Utils.findDominantMacronutrients({ food }), ["protein"]);
      assert.equal(food.energyKcal, 100);
    })
);
