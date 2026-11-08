import { describe, expect, it } from "@effect/vitest";
import { Domain, Foods, Store } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect, Layer, Option, Schema } from "effect";

import {
  FoodPricesEvents,
  FoodPricesLoaderEvents,
  FoodPricesLoaderMachine,
  FoodPricesLoaderStates,
  FoodPricesMachine,
  FoodPricesStates,
} from "@/machines/food-prices-machine";

const foodId = Domain.FoodId.make("11111111-1111-4111-8111-111111111111");
const priceId = Domain.FoodPriceId.make("22222222-2222-4222-8222-222222222222");
const missingPriceId = Domain.FoodPriceId.make(
  "33333333-3333-4333-8333-333333333333"
);

const _encodedPrice = (isCurrent: boolean) => ({
  id: priceId,
  priceMinor: 250,
  currency: "EUR",
  referenceQuantity: { amount: 1, unit: "kg" },
  isCurrent,
  createdAt: 100,
  updatedAt: 100,
});

const _food = (prices: readonly ReturnType<typeof _encodedPrice>[]) =>
  Schema.decodeUnknownEffect(Domain.Food)({
    id: foodId,
    name: "Rice",
    origin: "user",
    energyKcal: 360,
    proteinGrams: 7,
    carbsGrams: 79,
    fatGrams: 1,
    prices,
    createdAt: 100,
    updatedAt: 100,
  }).pipe(Effect.orDie);

const _price = Schema.decodeUnknownEffect(Domain.FoodPrice)(
  _encodedPrice(true)
).pipe(Effect.orDie);

const _storeError = new Store.NutritionStoreError({ cause: "unavailable" });

describe("FoodPricesLoaderMachine", () => {
  it.live("loads the food and retries after a failure", () =>
    Effect.gen(function* () {
      const attempts: string[] = [];
      const loader = yield* Machine.start(FoodPricesLoaderMachine, {
        foodId,
      }).pipe(
        Effect.provide(
          Layer.mock(Foods.Foods, {
            get: () =>
              attempts.push("get") === 1
                ? Effect.fail(_storeError)
                : _food([_encodedPrice(true)]),
          })
        )
      );
      const failed = yield* Machine.waitFor(loader, ({ state }) =>
        FoodPricesLoaderStates.matches(state, "Failed")
      );

      expect(
        Option.map(
          FoodPricesLoaderStates.get(failed.state, "Failed"),
          ({ message }) => message
        )
      ).toEqual(Option.some("Could not load prices for this food."));

      yield* loader.send(FoodPricesLoaderEvents.Retry());
      const ready = yield* Machine.waitFor(loader, ({ state }) =>
        FoodPricesLoaderStates.matches(state, "Ready")
      );

      expect(
        Option.map(
          FoodPricesLoaderStates.get(ready.state, "Ready"),
          ({ data }) => data.food.prices.map(({ id }) => id)
        )
      ).toEqual(Option.some([priceId]));
    }).pipe(Effect.scoped)
  );
});

describe("FoodPricesMachine", () => {
  it.effect("drives every listing and form transition", () =>
    Effect.gen(function* () {
      const input = { food: yield* _food([_encodedPrice(true)]) };
      const adding = yield* MachineTest.run(FoodPricesMachine, {
        input,
        events: [
          FoodPricesEvents.Add(),
          FoodPricesEvents.ChangePrice({ value: "2,5" }),
          FoodPricesEvents.ChangeQuantityAmount({ value: "500" }),
          FoodPricesEvents.ChangeQuantityUnit({ unit: "g" }),
          FoodPricesEvents.Cancel(),
          FoodPricesEvents.Add(),
          FoodPricesEvents.Submit(),
        ],
      });
      const editing = yield* MachineTest.run(FoodPricesMachine, {
        input,
        events: [
          FoodPricesEvents.Edit({ priceId: missingPriceId }),
          FoodPricesEvents.Edit({ priceId }),
          FoodPricesEvents.Cancel(),
          FoodPricesEvents.Edit({ priceId }),
          FoodPricesEvents.Submit(),
        ],
      });
      const removing = yield* MachineTest.run(FoodPricesMachine, {
        input,
        events: [FoodPricesEvents.Remove({ priceId })],
      });
      const selecting = yield* MachineTest.run(FoodPricesMachine, {
        input,
        events: [FoodPricesEvents.Select({ priceId })],
      });
      const clearing = yield* MachineTest.run(FoodPricesMachine, {
        input,
        events: [FoodPricesEvents.ClearCurrent()],
      });
      const traces = [adding, editing, removing, selecting, clearing];

      yield* Effect.forEach(traces, (trace) =>
        MachineTest.verify(FoodPricesMachine, trace)
      );
      expect(adding.steps[3]?.after.value.form).toEqual({
        price: "2,5",
        quantityAmount: "500",
        quantityUnit: "g",
      });
      expect(adding.final.value.form).toEqual({
        price: "",
        quantityAmount: "1",
        quantityUnit: "kg",
      });
      expect(adding.finalConfiguration).toContain("Adding.Saving");
      expect(
        editing.steps.map(({ after }) =>
          FoodPricesStates.matches(after, "Editing")
        )
      ).toEqual([false, true, false, true, true]);
      expect(editing.steps[1]?.after.value.form).toEqual({
        price: "2.5",
        quantityAmount: "1",
        quantityUnit: "kg",
      });
      expect(
        Option.map(
          FoodPricesStates.get(editing.final, "Editing"),
          (state) => state.priceId
        )
      ).toEqual(Option.some(priceId));
      expect(editing.finalConfiguration).toContain("Editing.Saving");
      expect(
        Option.map(
          FoodPricesStates.get(removing.final, "Removing"),
          (state) => state.priceId
        )
      ).toEqual(Option.some(priceId));
      expect(
        Option.map(
          FoodPricesStates.get(selecting.final, "Selecting"),
          (state) => state.priceId
        )
      ).toEqual(Option.some(priceId));
      expect(
        Option.map(
          FoodPricesStates.get(clearing.final, "Selecting"),
          (state) => state.priceId
        )
      ).toEqual(Option.some(null));

      const coverage = MachineTest.coverage(FoodPricesMachine, traces);

      expect(
        coverage.transitions.definitions.misses.map(({ source, trigger }) =>
          trigger.type === "invoke"
            ? `${source}:${trigger.id}.${trigger.outcome}`
            : `${source}:${trigger.type}`
        )
      ).toEqual([
        "Adding.Saving:addPrice.done",
        "Adding.Saving:addPrice.failure",
        "Editing.Saving:editPrice.done",
        "Editing.Saving:editPrice.failure",
        "Removing:removePrice.done",
        "Removing:removePrice.failure",
        "Selecting:selectPrice.done",
        "Selecting:selectPrice.failure",
      ]);
    })
  );

  it.live("runs price mutations and reports their outcomes", () =>
    Effect.gen(function* () {
      const price = yield* _price;
      const withPrice = yield* _food([_encodedPrice(true)]);
      const withoutCurrent = yield* _food([_encodedPrice(false)]);
      const calls: unknown[] = [];
      const editor = yield* Machine.start(FoodPricesMachine, {
        food: yield* _food([]),
      }).pipe(
        Effect.provide(
          Layer.mock(Foods.Foods, {
            addFoodPrice: ({ input }) =>
              Effect.sync(() => calls.push(["add", input])).pipe(
                Effect.as(new Foods.AddedFoodPrice({ food: withPrice, price }))
              ),
            editFoodPrice: ({ input }) =>
              Effect.sync(() => calls.push(["edit", input])).pipe(
                Effect.andThen(Effect.fail(_storeError))
              ),
            selectCurrentFoodPrice: ({ input }) =>
              Effect.sync(() => calls.push(["select", input])).pipe(
                Effect.as(
                  new Foods.SelectedCurrentFoodPrice({
                    food: withoutCurrent,
                    price: null,
                  })
                )
              ),
            removeFoodPrice: ({ input }) =>
              Effect.sync(() => calls.push(["remove", input])).pipe(
                Effect.andThen(Effect.fail(_storeError))
              ),
          })
        )
      );

      yield* editor.send(FoodPricesEvents.Add());
      yield* editor.send(FoodPricesEvents.ChangePrice({ value: "2,5" }));
      yield* editor.send(FoodPricesEvents.Submit());
      const added = yield* Machine.waitFor(
        editor,
        ({ state }) =>
          FoodPricesStates.matches(state, "Listing") &&
          state.value.message === "Price added and selected as current."
      );

      expect(added.state.value.food.prices.map(({ id }) => id)).toEqual([
        priceId,
      ]);

      yield* editor.send(FoodPricesEvents.Edit({ priceId }));
      yield* editor.send(FoodPricesEvents.Submit());
      yield* Machine.waitFor(
        editor,
        ({ state }) =>
          FoodPricesStates.matches(state, "Editing.Form") &&
          state.value.message === "Could not update this price."
      );
      yield* editor.send(FoodPricesEvents.Cancel());
      yield* editor.send(FoodPricesEvents.ClearCurrent());
      const cleared = yield* Machine.waitFor(
        editor,
        ({ state }) =>
          FoodPricesStates.matches(state, "Listing") &&
          state.value.message === "No current price selected."
      );

      expect(cleared.state.value.messageTone).toBe("success");

      yield* editor.send(FoodPricesEvents.Remove({ priceId }));
      const failedRemoval = yield* Machine.waitFor(
        editor,
        ({ state }) =>
          FoodPricesStates.matches(state, "Listing") &&
          state.value.message === "Could not delete this price."
      );

      expect(failedRemoval.state.value.messageTone).toBe("danger");
      expect(calls).toEqual([
        [
          "add",
          {
            price: "2.5",
            currency: "EUR",
            foodId,
            referenceQuantity: { amount: "1", unit: "kg" },
          },
        ],
        [
          "edit",
          {
            price: "2.5",
            currency: "EUR",
            foodId,
            referenceQuantity: { amount: "1", unit: "kg" },
            priceId,
          },
        ],
        ["select", { foodId, priceId: null }],
        ["remove", { foodId, priceId }],
      ]);
    }).pipe(Effect.scoped)
  );
});
