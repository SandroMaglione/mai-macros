import { Domain } from "@mai/nutrition";
import { Effect, Schema } from "effect";
import { assert, describe, it } from "vitest";
import { createActor } from "xstate";

import {
  foodSearchMachine,
  getFoodNameGroupLabel,
  sortFoodsByOriginAndName,
} from "../src/food-search-machine.ts";

describe("food search name groups", () => {
  it("labels the newest same-name-and-brand food and sorts it first", async () => {
    const older = await _food({
      brand: " FAGE ",
      createdAt: 100,
      id: "11111111-1111-4111-8111-111111111111",
      name: "Greek Yogurt",
    });
    const newest = await _food({
      brand: "fage",
      createdAt: 200,
      id: "22222222-2222-4222-8222-222222222222",
      name: " greek yogurt ",
    });
    const unrelated = await _food({
      createdAt: 300,
      id: "33333333-3333-4333-8333-333333333333",
      name: "Milk",
    });
    const foods = [older, unrelated, newest];

    assert.equal(getFoodNameGroupLabel({ food: newest, foods }), "Newest");
    assert.equal(getFoodNameGroupLabel({ food: older, foods }), "Older");
    assert.equal(getFoodNameGroupLabel({ food: unrelated, foods }), null);
    assert.deepEqual(
      sortFoodsByOriginAndName({ foods })
        .filter(
          (food) => food.name.trim().toLocaleLowerCase() === "greek yogurt"
        )
        .map((food) => food.id),
      [newest.id, older.id]
    );
  });
});

describe("food search base order", () => {
  it("preserves a caller-provided order through filtering", async () => {
    const eggs = await _food({
      createdAt: 100,
      id: "11111111-1111-4111-8111-111111111111",
      name: "Eggs",
    });
    const apple = await _food({
      createdAt: 200,
      id: "22222222-2222-4222-8222-222222222222",
      name: "Apple",
    });
    const actor = createActor(foodSearchMachine, {
      input: {
        baseOrder: "provided",
        foods: [eggs, apple],
      },
    });

    actor.start();

    assert.deepEqual(
      actor.getSnapshot().context.matchingFoods.map((food) => food.id),
      [eggs.id, apple.id]
    );

    actor.send({ type: "changeQuery", query: "e" });

    assert.deepEqual(
      actor.getSnapshot().context.matchingFoods.map((food) => food.id),
      [eggs.id, apple.id]
    );
  });

  it("restores a caller-provided order after clearing a macro order", async () => {
    const eggs = await _food({
      createdAt: 100,
      id: "11111111-1111-4111-8111-111111111111",
      name: "Eggs",
    });
    const apple = await _food({
      createdAt: 200,
      id: "22222222-2222-4222-8222-222222222222",
      name: "Apple",
    });
    const actor = createActor(foodSearchMachine, {
      input: {
        baseOrder: "provided",
        foods: [eggs, apple],
      },
    });

    actor.start();
    actor.send({ type: "changeMacroOrder", macroOrder: "energy" });
    actor.send({ type: "changeMacroOrder", macroOrder: null });

    assert.deepEqual(
      actor.getSnapshot().context.matchingFoods.map((food) => food.id),
      [eggs.id, apple.id]
    );
  });
});

function _food({
  brand,
  createdAt,
  id,
  name,
}: {
  readonly brand?: string | undefined;
  readonly createdAt: number;
  readonly id: string;
  readonly name: string;
}) {
  return Effect.runPromise(
    Schema.decodeEffect(Domain.Food)({
      id,
      name,
      ...(brand === undefined ? {} : { brand }),
      origin: "user",
      energyKcal: 60,
      proteinGrams: 3,
      carbsGrams: 5,
      fatGrams: 3,
      createdAt,
      updatedAt: createdAt,
    })
  );
}
