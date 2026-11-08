import { assert, describe, it } from "@effect/vitest";
import { Domain } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect, Option, Schema } from "effect";

import {
  FoodSearchEvents,
  FoodSearchMachine,
  FoodSearchParentEvents,
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
    const trace = await _run({
      input: { baseOrder: "provided", foods: [eggs, apple] },
      events: [FoodSearchEvents.ChangeQuery({ query: "e" })],
    });

    assert.deepEqual(_matchingFoodIds(trace.initial.startingState), [
      eggs.id,
      apple.id,
    ]);
    assert.deepEqual(_matchingFoodIds(trace.final), [eggs.id, apple.id]);
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
    const trace = await _run({
      input: { baseOrder: "provided", foods: [eggs, apple] },
      events: [
        FoodSearchEvents.ChangeMacroOrder({ macroOrder: "energy" }),
        FoodSearchEvents.ChangeMacroOrder({ macroOrder: null }),
      ],
    });

    assert.deepEqual(_matchingFoodIds(trace.final), [eggs.id, apple.id]);
  });
});

describe("food search price order", () => {
  it("orders price coverage by missing price, usage, then food name", async () => {
    const missingUsedBanana = await _food({
      createdAt: 100,
      id: "11111111-1111-4111-8111-111111111111",
      name: "Banana",
    });
    const missingUsedApple = await _food({
      createdAt: 200,
      id: "22222222-2222-4222-8222-222222222222",
      name: "Apple",
    });
    const missingUnused = await _food({
      createdAt: 300,
      id: "33333333-3333-4333-8333-333333333333",
      name: "Carrot",
    });
    const pricedUsed = await _food({
      createdAt: 400,
      currentPrice: {
        priceMinor: 200,
        referenceAmount: 1,
        referenceUnit: "kg",
      },
      id: "55555555-5555-4555-8555-555555555555",
      name: "Dates",
    });
    const pricedUnused = await _food({
      createdAt: 500,
      currentPrice: {
        priceMinor: 300,
        referenceAmount: 1,
        referenceUnit: "kg",
      },
      id: "66666666-6666-4666-8666-666666666666",
      name: "Eggs",
    });
    const trace = await _run({
      input: {
        foods: [
          pricedUnused,
          missingUsedBanana,
          pricedUsed,
          missingUnused,
          missingUsedApple,
        ],
        macroOrder: "priceCoverage",
        usedFoodIds: [missingUsedBanana.id, missingUsedApple.id, pricedUsed.id],
      },
      events: [],
    });

    assert.deepEqual(_matchingFoodIds(trace.final), [
      missingUsedApple.id,
      missingUsedBanana.id,
      missingUnused.id,
      pricedUsed.id,
      pricedUnused.id,
    ]);
  });

  it("normalizes current euro prices and leaves unpriced foods last", async () => {
    const cheap = await _food({
      createdAt: 100,
      currentPrice: {
        priceMinor: 300,
        referenceAmount: 1,
        referenceUnit: "kg",
      },
      id: "11111111-1111-4111-8111-111111111111",
      name: "Cheap",
    });
    const expensive = await _food({
      createdAt: 200,
      currentPrice: {
        priceMinor: 200,
        referenceAmount: 100,
        referenceUnit: "g",
      },
      id: "22222222-2222-4222-8222-222222222222",
      name: "Expensive",
    });
    const unpriced = await _food({
      createdAt: 300,
      id: "33333333-3333-4333-8333-333333333333",
      name: "Unpriced",
    });
    const trace = await _run({
      input: { foods: [unpriced, expensive, cheap] },
      events: [
        FoodSearchEvents.ChangeMacroOrder({ macroOrder: "priceLow" }),
        FoodSearchEvents.ChangeMacroOrder({ macroOrder: "priceHigh" }),
      ],
    });

    assert.deepEqual(_matchingFoodIds(trace.steps[0]?.after), [
      cheap.id,
      expensive.id,
      unpriced.id,
    ]);
    assert.deepEqual(_matchingFoodIds(trace.final), [
      expensive.id,
      cheap.id,
      unpriced.id,
    ]);
  });
});

describe("food search selection", () => {
  it("covers every transition and keeps the selected food inside the catalog", async () => {
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
    const trace = await _run({
      input: { foods: [eggs, apple], selectedFoodId: eggs.id },
      events: [
        FoodSearchEvents.ChangeQuery({ query: "app" }),
        FoodSearchEvents.SelectFirstMatchingFood(),
        FoodSearchEvents.ClearSelectedFood(),
        FoodSearchEvents.SelectFood({ foodId: eggs.id }),
        FoodSearchEvents.ChangeMacroOrder({ macroOrder: "protein" }),
        FoodSearchEvents.ChangeFoods({ foods: [apple] }),
        FoodSearchEvents.Reset({ foods: [eggs], query: "egg" }),
      ],
    });
    const coverage = MachineTest.coverage(FoodSearchMachine, trace);

    assert.deepEqual(
      trace.steps.map(({ after }) => after.value.selectedFoodId),
      [eggs.id, apple.id, null, eggs.id, eggs.id, null, null]
    );
    assert.deepEqual(_matchingFoodIds(trace.final), [eggs.id]);
    assert.strictEqual(trace.steps[4]?.after.value.macroOrder, "protein");
    assert.strictEqual(trace.final.value.macroOrder, null);
    assert.strictEqual(coverage.transitions.definitions.missing, 0);
    assert.strictEqual(coverage.events.available, true);

    if (coverage.events.available) {
      assert.strictEqual(coverage.events.missing, 0);
    }
  });

  it.live(
    "notifies its owner about explicit and first-matching selections",
    () =>
      Effect.gen(function* () {
        const eggs = yield* Effect.promise(() =>
          _food({
            createdAt: 100,
            id: "11111111-1111-4111-8111-111111111111",
            name: "Eggs",
          })
        );
        const FoodSearchChild = Machine.child("foodSearch", FoodSearchMachine);
        const OwnerStates = Machine.state({
          states: {
            Searching: {
              fields: {
                selections: Schema.Array(
                  Schema.Literals(["explicit", "firstMatching"])
                ),
              },
            },
          },
        });
        const OwnerMachine = Machine.make({
          id: "FoodSearchOwner",
          root: OwnerStates,
          events: FoodSearchParentEvents,
          children: { foodSearch: FoodSearchChild },
        }).handle({
          initial: { target: "Searching", data: { selections: [] } },
          states: {
            Searching: {
              invoke: { src: "foodSearch", input: () => ({ foods: [eggs] }) },
              on: {
                FoodSearchSelected: {
                  update: "Searching",
                  data: ({ state, event }) => ({
                    selections: [...state.selections, event.selection],
                  }),
                },
              },
            },
          },
        });
        const owner = yield* Machine.start(OwnerMachine);
        const foodSearch = yield* Effect.flatMap(
          owner.child(FoodSearchChild),
          Effect.fromOption
        );

        yield* foodSearch.send(FoodSearchEvents.SelectFirstMatchingFood());
        yield* foodSearch.send(
          FoodSearchEvents.SelectFood({ foodId: eggs.id })
        );

        const snapshot = yield* Machine.waitFor(owner, ({ state }) =>
          Option.exists(
            OwnerStates.get(state, "Searching"),
            ({ selections }) => selections.length === 2
          )
        );

        assert.deepEqual(
          Option.map(
            OwnerStates.get(snapshot.state, "Searching"),
            ({ selections }) => [...selections]
          ),
          Option.some(["firstMatching", "explicit"])
        );
      }).pipe(Effect.scoped)
  );
});

function _run(scenario: MachineTest.Scenario<typeof FoodSearchMachine>) {
  return Effect.runPromise(MachineTest.run(FoodSearchMachine, scenario));
}

function _matchingFoodIds(
  snapshot:
    | Machine.Machine.Snapshot<Machine.Machine.States<typeof FoodSearchMachine>>
    | undefined
) {
  return snapshot?.value.matchingFoods.map((food) => food.id);
}

function _food({
  brand,
  createdAt,
  currentPrice,
  id,
  name,
}: {
  readonly brand?: string | undefined;
  readonly createdAt: number;
  readonly currentPrice?:
    | {
        readonly priceMinor: number;
        readonly referenceAmount: number;
        readonly referenceUnit: Domain.MeasurementUnit;
      }
    | undefined;
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
      ...(currentPrice === undefined
        ? {}
        : {
            prices: [
              {
                id: "44444444-4444-4444-8444-444444444444",
                priceMinor: currentPrice.priceMinor,
                currency: "EUR",
                referenceQuantity: {
                  amount: currentPrice.referenceAmount,
                  unit: currentPrice.referenceUnit,
                },
                isCurrent: true,
                createdAt,
                updatedAt: createdAt,
              },
            ],
          }),
      createdAt,
      updatedAt: createdAt,
    })
  );
}
