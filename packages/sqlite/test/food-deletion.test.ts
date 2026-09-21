import { Domain, Foods, Store } from "@mai/nutrition";
import { Crypto, Effect, Exit, Layer, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { assert, it } from "vitest";
import { TestSqliteNutritionStoreLayer } from "./sqlite-test-layers.ts";

const testLayer = Foods.Foods.layer.pipe(
  Layer.provideMerge(TestSqliteNutritionStoreLayer),
  Layer.provide(
    Layer.succeed(Crypto.Crypto)(
      Crypto.make({
        digest: (_, data) => Effect.succeed(data),
        randomBytes: (size) => new Uint8Array(size).fill(1),
      })
    )
  )
);
const seed = Effect.gen(function* () {
  const store = yield* Store.NutritionStore;
  const food = yield* Schema.decodeEffect(Domain.Food)({
    id: "11111111-1111-4111-8111-111111111111",
    name: "Unused food",
    origin: "user",
    energyKcal: 100,
    proteinGrams: 5,
    carbsGrams: 10,
    fatGrams: 4,
    createdAt: 1,
    updatedAt: 1,
    portions: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Bowl",
        size: { amount: 200, unit: "g" },
        position: 0,
      },
    ],
    prices: [
      {
        id: "33333333-3333-4333-8333-333333333333",
        priceMinor: 250,
        currency: "EUR",
        referenceQuantity: { amount: 100, unit: "g" },
        isCurrent: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  });
  yield* store.insertFood(food);
  return food;
});

it("deletes an unused user food with its portions and prices", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const food = yield* seed;
      const store = yield* Store.NutritionStore;
      const service = yield* Foods.Foods;
      const sql = yield* SqlClient.SqlClient;
      const before = yield* store.listFoods;
      yield* service.deleteUnused({ input: { foodId: food.id } });
      assert.deepEqual(yield* store.findFoodById(food.id), []);
      assert.deepEqual(
        yield* store.listFoods,
        before.filter((entry) => entry.id !== food.id)
      );
      assert.deepEqual(
        yield* sql`SELECT id FROM food_portions WHERE food_id = ${food.id}`,
        []
      );
      assert.deepEqual(
        yield* sql`SELECT id FROM food_prices WHERE food_id = ${food.id}`,
        []
      );
      assert.isTrue(
        Exit.isFailure(
          yield* Effect.exit(
            service.deleteUnused({ input: { foodId: food.id } })
          )
        )
      );
    }).pipe(Effect.provide(testLayer))
  );
});

it.each(["app-default", "import"] as const)(
  "rejects deleting %s foods in the service and store",
  async (origin) => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const food = yield* seed;
        const store = yield* Store.NutritionStore;
        const service = yield* Foods.Foods;
        const protectedFood = yield* Schema.decodeEffect(Domain.Food)({
          ...(yield* Schema.encodeEffect(Domain.Food)(food)),
          origin,
        });
        yield* store.upsertFood(protectedFood);
        assert.isTrue(
          Exit.isFailure(
            yield* Effect.exit(
              service.deleteUnused({ input: { foodId: food.id } })
            )
          )
        );
        assert.isFalse(yield* store.deleteUnusedUserFood(food.id));
        assert.deepEqual(yield* store.findFoodById(food.id), [protectedFood]);
      }).pipe(Effect.provide(testLayer))
    );
  }
);

it("rejects a food used after the editor inspected it and preserves its related data", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const food = yield* seed;
      const store = yield* Store.NutritionStore;
      const service = yield* Foods.Foods;
      assert.equal(
        (yield* service.inspectEdit({ input: { foodId: food.id } }))
          .mealEntryCount,
        0
      );
      const sql = yield* SqlClient.SqlClient;
      yield* sql`INSERT INTO plans (id, name, protein_target_grams, carbs_target_grams, fat_target_grams, created_at) VALUES ('55555555-5555-4555-8555-555555555555', 'Plan', 100, 200, 60, 1)`;
      yield* sql`INSERT INTO plan_meals (id, plan_id, name, position, created_at) VALUES ('meal', '55555555-5555-4555-8555-555555555555', 'Lunch', 0, 1)`;
      yield* sql`INSERT INTO meal_entries (id, date_key, meal_id, food_id, kind, quantity_kind, quantity_amount, quantity_unit, nutrition_multiplier, created_at, updated_at) VALUES ('44444444-4444-4444-8444-444444444444', '2026-01-01', 'meal', ${food.id}, 'catalog', 'measured', 100, 'g', 1, 1, 1)`;
      const before = yield* store.readStores;
      assert.isFalse(yield* store.deleteUnusedUserFood(food.id));
      assert.isTrue(
        Exit.isFailure(
          yield* Effect.exit(
            service.deleteUnused({ input: { foodId: food.id } })
          )
        )
      );
      assert.deepEqual(yield* store.readStores, before);
    }).pipe(Effect.provide(testLayer))
  );
});

it("rolls back the entire deletion if related data cannot be removed", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const food = yield* seed;
      const store = yield* Store.NutritionStore;
      const service = yield* Foods.Foods;
      const sql = yield* SqlClient.SqlClient;
      const before = yield* store.readStores;
      yield* sql`CREATE TRIGGER block_portion_delete BEFORE DELETE ON food_portions BEGIN SELECT RAISE(ABORT, 'test failure'); END`;
      assert.isTrue(
        Exit.isFailure(
          yield* Effect.exit(
            service.deleteUnused({ input: { foodId: food.id } })
          )
        )
      );
      assert.deepEqual(yield* store.readStores, before);
    }).pipe(Effect.provide(testLayer))
  );
});
