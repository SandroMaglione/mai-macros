import { Domain } from "@mai/nutrition";
import { Effect, Schema } from "effect";
import { assert, describe, it } from "vitest";

import {
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
