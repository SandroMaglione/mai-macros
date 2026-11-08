import { describe, expect, it } from "@effect/vitest";
import { DailyLogs, Domain, Foods, MealEntries, Store } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect, Layer, Option } from "effect";
import type { Href } from "expo-router";

import {
  EditMealEntryEvents,
  EditMealEntryLoaderMachine,
  EditMealEntryLoaderStates,
  EditMealEntryMachine,
  EditMealEntryStates,
  type EditMealEntryData,
} from "@/machines/edit-meal-entry-machine";
import { Navigation } from "@/machines/services/navigation";

import {
  breakfastMealId,
  dinnerMealId,
  makeCatalogMealEntry,
  makeFood,
  makeOpenedDay,
  pastDateKey,
} from "./meal-entry-machine-fixtures.ts";

const foodId = "11111111-1111-4111-8111-111111111111";
const mealEntryId = Domain.MealEntryId.make(
  "44444444-4444-4444-8444-444444444444"
);

const _fixtures = Effect.gen(function* () {
  const food = yield* makeFood({ id: foodId, name: "Eggs" });
  const mealEntry = yield* makeCatalogMealEntry({
    dateKey: pastDateKey,
    foodId: food.id,
    id: mealEntryId,
    mealId: breakfastMealId,
  });
  const data: EditMealEntryData = {
    dateKey: pastDateKey,
    food,
    meal: breakfastMealId,
    mealEntry,
    mealLabel: "Breakfast",
  };

  return { data, food, mealEntry };
});

const _navigation = () => {
  const replaced: Href[] = [];
  const layer = Layer.mock(Navigation, {
    replace: (href) => Effect.sync(() => replaced.push(href)),
  });

  return { layer, replaced };
};

const _loaderLayer = Effect.gen(function* () {
  const { food, mealEntry } = yield* Effect.orDie(_fixtures);
  const day = yield* Effect.orDie(makeOpenedDay(pastDateKey));

  return Layer.mergeAll(
    Layer.mock(DailyLogs.DailyLogs, { open: () => Effect.succeed(day) }),
    Layer.mock(Foods.Foods, { get: () => Effect.succeed(food) }),
    Layer.mock(MealEntries.MealEntries, {
      listForDay: () => Effect.succeed([mealEntry]),
    })
  );
}).pipe(Layer.unwrap);

describe("EditMealEntryLoaderMachine", () => {
  it.live("loads the catalog entry with its food and meal label", () =>
    Effect.gen(function* () {
      const loader = yield* Machine.start(EditMealEntryLoaderMachine, {
        dateKey: pastDateKey,
        meal: breakfastMealId,
        mealEntryId,
      });
      const ready = yield* Machine.waitFor(loader, ({ state }) =>
        EditMealEntryLoaderStates.matches(state, "Ready")
      );

      expect(
        Option.map(
          EditMealEntryLoaderStates.get(ready.state, "Ready"),
          ({ data }) => ({
            food: data.food?.id,
            mealEntry: data.mealEntry.id,
            mealLabel: data.mealLabel,
          })
        )
      ).toEqual(
        Option.some({
          food: foodId,
          mealEntry: mealEntryId,
          mealLabel: "Breakfast",
        })
      );
    }).pipe(
      Effect.provide(Layer.merge(_loaderLayer, Layer.mock(Navigation, {}))),
      Effect.scoped
    )
  );

  it.live("redirects home when the entry is not in the requested meal", () =>
    Effect.gen(function* () {
      const navigation = _navigation();
      const loader = yield* Machine.start(EditMealEntryLoaderMachine, {
        dateKey: pastDateKey,
        meal: dinnerMealId,
        mealEntryId,
      }).pipe(Effect.provide(navigation.layer));

      yield* Machine.waitFor(
        loader,
        ({ state }) =>
          navigation.replaced.length === 1 &&
          EditMealEntryLoaderStates.matches(state, "InvalidRoute")
      );
      expect(navigation.replaced).toEqual(["/"]);
    }).pipe(Effect.provide(_loaderLayer), Effect.scoped)
  );
});

describe("EditMealEntryMachine", () => {
  it.effect("plans quantity edits before saving or deleting", () =>
    Effect.gen(function* () {
      const { data } = yield* _fixtures;
      const save = yield* MachineTest.run(EditMealEntryMachine, {
        input: data,
        events: [
          EditMealEntryEvents.ChangeQuantity({ quantityAmount: "2" }),
          EditMealEntryEvents.ChangeAccuracy({ accuracy: "estimated" }),
          EditMealEntryEvents.SelectPortion({
            portionId: Domain.FoodPortionId.make(
              "33333333-3333-4333-8333-333333333333"
            ),
          }),
          EditMealEntryEvents.SelectMeasurementUnit({ unit: "ml" }),
          EditMealEntryEvents.Submit(),
          EditMealEntryEvents.ChangeQuantity({ quantityAmount: "9" }),
        ],
      });
      const remove = yield* MachineTest.run(EditMealEntryMachine, {
        input: data,
        events: [EditMealEntryEvents.Delete()],
      });

      yield* MachineTest.verify(EditMealEntryMachine, save);
      yield* MachineTest.verify(EditMealEntryMachine, remove);
      expect(save.initial.startingState.value).toMatchObject({
        portionId: null,
        quantityAccuracy: "measured",
        quantityAmount: "120",
        quantityUnit: "g",
      });
      expect(save.final.value).toMatchObject({
        portionId: null,
        quantityAccuracy: "estimated",
        quantityAmount: "2",
        quantityUnit: "ml",
      });
      expect(EditMealEntryStates.matches(save.final, "Saving")).toBe(true);
      expect(EditMealEntryStates.matches(remove.final, "Deleting")).toBe(true);

      const coverage = MachineTest.coverage(EditMealEntryMachine, [
        save,
        remove,
      ]);

      expect(
        coverage.transitions.definitions.misses.filter(
          ({ trigger }) => trigger.type !== "invoke"
        )
      ).toEqual([]);
    })
  );

  it.live("saves the revised quantity and returns to the day", () =>
    Effect.gen(function* () {
      const { data, mealEntry } = yield* _fixtures;
      const navigation = _navigation();
      const revised: MealEntries.ReviseMealEntryInput[] = [];
      const machine = yield* Machine.start(EditMealEntryMachine, data).pipe(
        Effect.provide(
          Layer.mergeAll(
            navigation.layer,
            Layer.mock(MealEntries.MealEntries, {
              revise: ({ input }) =>
                Effect.sync(() => {
                  revised.push(input);

                  return new MealEntries.RevisedMealEntry({
                    mealEntry,
                    previousMealEntry: mealEntry,
                  });
                }),
            })
          )
        )
      );

      yield* machine.send(
        EditMealEntryEvents.ChangeQuantity({ quantityAmount: "200" })
      );
      yield* machine.send(EditMealEntryEvents.Submit());
      yield* Machine.waitFor(
        machine,
        ({ state }) =>
          navigation.replaced.length === 1 &&
          EditMealEntryStates.matches(state, "Saved")
      );

      expect(revised).toEqual([
        {
          mealEntryId,
          quantity: {
            _tag: "MeasuredFoodQuantity",
            amount: "200",
            unit: "g",
          },
          quantityAccuracy: "measured",
        },
      ]);
      expect(navigation.replaced).toEqual([
        { pathname: "/days/[dateKey]", params: { dateKey: pastDateKey } },
      ]);
    }).pipe(Effect.scoped)
  );

  it.live("deletes the entry and returns to the day", () =>
    Effect.gen(function* () {
      const { data, mealEntry } = yield* _fixtures;
      const navigation = _navigation();
      const deleted: MealEntries.DeleteMealEntryInput[] = [];
      const machine = yield* Machine.start(EditMealEntryMachine, data).pipe(
        Effect.provide(
          Layer.mergeAll(
            navigation.layer,
            Layer.mock(MealEntries.MealEntries, {
              delete: ({ input }) =>
                Effect.sync(() => {
                  deleted.push(input);

                  return new MealEntries.DeletedMealEntry({ mealEntry });
                }),
            })
          )
        )
      );

      yield* machine.send(EditMealEntryEvents.Delete());
      yield* Machine.waitFor(
        machine,
        ({ state }) =>
          navigation.replaced.length === 1 &&
          EditMealEntryStates.matches(state, "Deleted")
      );

      expect(deleted).toEqual([{ mealEntryId }]);
      expect(navigation.replaced).toEqual([
        { pathname: "/days/[dateKey]", params: { dateKey: pastDateKey } },
      ]);
    }).pipe(Effect.scoped)
  );

  it.live("explains mutation failures and stays editable", () =>
    Effect.gen(function* () {
      const { data } = yield* _fixtures;
      const machine = yield* Machine.start(EditMealEntryMachine, data).pipe(
        Effect.provide(
          Layer.mergeAll(
            _navigation().layer,
            Layer.mock(MealEntries.MealEntries, {
              delete: () =>
                Effect.fail(new MealEntries.MealEntryNotFound({ mealEntryId })),
              revise: () =>
                Effect.fail(
                  new Store.NutritionStoreError({ cause: "database busy" })
                ),
            })
          )
        )
      );

      yield* machine.send(EditMealEntryEvents.Delete());

      const deleteFailed = yield* Machine.waitFor(
        machine,
        ({ state }) =>
          state.value.notice !== null &&
          EditMealEntryStates.matches(state, "Ready")
      );

      expect(deleteFailed.state.value.notice).toBe(
        "This meal entry is no longer available."
      );

      yield* machine.send(EditMealEntryEvents.Submit());

      const saveFailed = yield* Machine.waitFor(
        machine,
        ({ state }) =>
          state.value.notice === "Could not save this entry. Please try again."
      );

      expect(EditMealEntryStates.matches(saveFailed.state, "Ready")).toBe(true);
    }).pipe(Effect.scoped)
  );
});
