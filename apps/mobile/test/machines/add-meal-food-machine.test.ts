import { describe, expect, it } from "@effect/vitest";
import { FoodSearchMachine } from "@mai/machines";
import { DailyLogs, Domain, Foods, MealEntries, Store } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { DateTime, Effect, Layer, Option, Schema } from "effect";
import type { Href } from "expo-router";

import { todayDateKey } from "@/lib/date-keys";
import {
  AddMealFoodEvents,
  AddMealFoodLoaderMachine,
  AddMealFoodLoaderStates,
  AddMealFoodMachine,
  AddMealFoodStates,
  type AddMealFoodData,
} from "@/machines/add-meal-food-machine";
import { Navigation } from "@/machines/services/navigation";

import {
  breakfastMealId,
  dinnerMealId,
  makeCatalogMealEntry,
  makeFood,
  makeOpenedDay,
  makeUnrecordedDay,
  pastDateKey,
} from "./meal-entry-machine-fixtures.ts";

const eggsId = "11111111-1111-4111-8111-111111111111";
const appleId = "22222222-2222-4222-8222-222222222222";

const _fixtures = Effect.gen(function* () {
  const eggs = yield* makeFood({ id: eggsId, name: "Eggs" });
  const apple = yield* makeFood({ id: appleId, name: "Apple" });
  const latestQuantity = yield* Schema.decodeUnknownEffect(
    Domain.LoggedFoodQuantity
  )({ _tag: "MeasuredFoodQuantity", amount: 80, unit: "g" });
  const latestUsedAt = yield* Effect.fromOption(DateTime.make(500));
  const data: AddMealFoodData = {
    dateKey: pastDateKey,
    foods: [apple, eggs],
    foodUsage: [
      {
        foodId: eggs.id,
        latestQuantity,
        latestUsedAt,
        meals: [{ latestQuantity, latestUsedAt, mealId: breakfastMealId }],
      },
    ],
    meal: breakfastMealId,
    mealLabel: "Breakfast",
  };

  return { apple, data, eggs };
});

const _loaderLayer = ({
  day,
}: {
  readonly day: Effect.Effect<
    DailyLogs.Day,
    DailyLogs.NoMealPlans | Store.NutritionStoreError
  >;
}) =>
  Layer.mergeAll(
    Layer.mock(DailyLogs.DailyLogs, {
      open: () => day,
    }),
    Layer.mock(Foods.Foods, {
      list: () =>
        Effect.orDie(makeFood({ id: eggsId, name: "Eggs" })).pipe(
          Effect.map((food) => [food])
        ),
    }),
    Layer.mock(MealEntries.MealEntries, {
      listFoodUsage: () => Effect.succeed([]),
    }),
    Layer.mock(Navigation, {})
  );

const _replaced = () => {
  const replaced: Href[] = [];
  const layer = Layer.mock(Navigation, {
    replace: (href) => Effect.sync(() => replaced.push(href)),
  });

  return { layer, replaced };
};

describe("AddMealFoodLoaderMachine", () => {
  it.live("loads the meal label, foods and usage for a recorded day", () =>
    Effect.gen(function* () {
      const loader = yield* Machine.start(AddMealFoodLoaderMachine, {
        dateKey: pastDateKey,
        meal: dinnerMealId,
      });
      const ready = yield* Machine.waitFor(loader, ({ state }) =>
        AddMealFoodLoaderStates.matches(state, "Ready")
      );

      expect(
        Option.map(
          AddMealFoodLoaderStates.get(ready.state, "Ready"),
          ({ data }) => ({
            dateKey: data.dateKey,
            foods: data.foods.map(({ id }) => id),
            mealLabel: data.mealLabel,
          })
        )
      ).toEqual(
        Option.some({
          dateKey: pastDateKey,
          foods: [eggsId],
          mealLabel: "Dinner",
        })
      );
    }).pipe(
      Effect.provide(
        _loaderLayer({ day: Effect.orDie(makeOpenedDay(pastDateKey)) })
      ),
      Effect.scoped
    )
  );

  it.live("opens or creates today's day before loading", () =>
    Effect.gen(function* () {
      const today = Domain.DateKey.make(todayDateKey());
      const opened: string[] = [];
      const loader = yield* Machine.start(AddMealFoodLoaderMachine, {
        dateKey: today,
        meal: breakfastMealId,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.mock(DailyLogs.DailyLogs, {
              open: () => Effect.die("open must not be used for today"),
              openOrCreate: ({ input }) =>
                Effect.sync(() => opened.push(input.dateKey)).pipe(
                  Effect.andThen(Effect.orDie(makeOpenedDay(today)))
                ),
            }),
            Layer.mock(Foods.Foods, { list: () => Effect.succeed([]) }),
            Layer.mock(MealEntries.MealEntries, {
              listFoodUsage: () => Effect.succeed([]),
            }),
            Layer.mock(Navigation, {})
          )
        )
      );

      yield* Machine.waitFor(loader, ({ state }) =>
        AddMealFoodLoaderStates.matches(state, "Ready")
      );
      expect(opened).toEqual([today]);
    }).pipe(Effect.scoped)
  );

  it.live("explains unrecorded days, unknown meals and load failures", () =>
    Effect.gen(function* () {
      const message = ({
        layer,
        meal,
      }: {
        readonly layer: Layer.Layer<
          | DailyLogs.DailyLogs
          | Foods.Foods
          | MealEntries.MealEntries
          | Navigation
        >;
        readonly meal: Domain.MealId;
      }) =>
        Effect.gen(function* () {
          const loader = yield* Machine.start(AddMealFoodLoaderMachine, {
            dateKey: pastDateKey,
            meal,
          });
          const failed = yield* Machine.waitFor(loader, ({ state }) =>
            AddMealFoodLoaderStates.matches(state, "Failed")
          );

          return Option.map(
            AddMealFoodLoaderStates.get(failed.state, "Failed"),
            (state) => state.message
          );
        }).pipe(Effect.provide(layer), Effect.scoped);

      expect(
        yield* message({
          layer: _loaderLayer({
            day: Effect.orDie(makeUnrecordedDay(pastDateKey)),
          }),
          meal: breakfastMealId,
        })
      ).toEqual(Option.some("Create this day before adding food."));
      expect(
        yield* message({
          layer: _loaderLayer({
            day: Effect.orDie(makeOpenedDay(pastDateKey)),
          }),
          meal: Domain.MealId.make("snack"),
        })
      ).toEqual(Option.some("Could not find this meal."));
      expect(
        yield* message({
          layer: _loaderLayer({
            day: Effect.fail(
              new Store.NutritionStoreError({ cause: "database unavailable" })
            ),
          }),
          meal: breakfastMealId,
        })
      ).toEqual(Option.some("Could not load this meal."));
    })
  );

  it.live("redirects to plan creation when there are no meal plans", () =>
    Effect.gen(function* () {
      const navigation = _replaced();
      const loader = yield* Machine.start(AddMealFoodLoaderMachine, {
        dateKey: pastDateKey,
        meal: breakfastMealId,
      }).pipe(Effect.provide(navigation.layer));

      yield* Machine.waitFor(loader, ({ state }) =>
        AddMealFoodLoaderStates.matches(state, "Redirected")
      );
      expect(navigation.replaced).toEqual([
        { pathname: "/plans/new", params: { dateKey: pastDateKey } },
      ]);
    }).pipe(
      Effect.provide(
        _loaderLayer({
          day: Effect.fail(new DailyLogs.NoMealPlans({ dateKey: pastDateKey })),
        })
      ),
      Effect.scoped
    )
  );
});

describe("AddMealFoodMachine", () => {
  it.effect("plans food selection, quantity edits and submission", () =>
    Effect.gen(function* () {
      const { data, eggs } = yield* _fixtures;
      const trace = yield* MachineTest.run(AddMealFoodMachine, {
        input: data,
        events: [
          AddMealFoodEvents.Submit(),
          FoodSearchMachine.FoodSearchParentEvents.FoodSearchSelected({
            food: null,
            selection: "firstMatching",
          }),
          FoodSearchMachine.FoodSearchParentEvents.FoodSearchSelected({
            food: eggs,
            selection: "explicit",
          }),
          AddMealFoodEvents.ChangeAccuracy({ accuracy: "estimated" }),
          AddMealFoodEvents.SelectMeasurementUnit({ unit: "ml" }),
          AddMealFoodEvents.SelectPortion({
            portionId: Domain.FoodPortionId.make(
              "33333333-3333-4333-8333-333333333333"
            ),
          }),
          AddMealFoodEvents.ClearSelectedFood(),
          FoodSearchMachine.FoodSearchParentEvents.FoodSearchSelected({
            food: eggs,
            selection: "firstMatching",
          }),
          AddMealFoodEvents.ChangeQuantity({ quantityAmount: " " }),
          AddMealFoodEvents.Submit(),
          AddMealFoodEvents.ChangeQuantity({ quantityAmount: "150" }),
          AddMealFoodEvents.Submit(),
        ],
      });

      yield* MachineTest.verify(AddMealFoodMachine, trace);
      expect(trace.final.value.quantityAmount).toBe("150");
      expect(trace.final.value.quantityAccuracy).toBe("estimated");
      expect(trace.steps[2]?.after.value).toMatchObject({
        portionId: null,
        quantityAmount: "80",
        quantityUnit: "g",
      });
      expect(trace.steps[7]?.after.value.portionId).not.toBeNull();
      expect(
        AddMealFoodStates.matches(trace.final, "Logging.Quantity.Submitting")
      ).toBe(true);
      expect(
        trace.steps.map(({ after }) =>
          AddMealFoodStates.matches(after, "Logging.Quantity")
        )
      ).toEqual([
        false,
        false,
        true,
        true,
        true,
        true,
        false,
        true,
        true,
        true,
        true,
        true,
      ]);

      const coverage = MachineTest.coverage(AddMealFoodMachine, trace);

      expect(
        coverage.transitions.definitions.misses.filter(
          ({ trigger }) => trigger.type !== "invoke"
        )
      ).toEqual([]);
    })
  );

  it.live(
    "selects a food through the search child, submits it and returns to the day",
    () =>
      Effect.gen(function* () {
        const { data, eggs } = yield* _fixtures;
        const navigation = _replaced();
        const created: MealEntries.CreateMealEntryInput[] = [];
        const entry = yield* makeCatalogMealEntry({
          dateKey: pastDateKey,
          foodId: eggs.id,
          id: "44444444-4444-4444-8444-444444444444",
          mealId: breakfastMealId,
        });
        const machine = yield* Machine.start(AddMealFoodMachine, data).pipe(
          Effect.provide(
            Layer.mergeAll(
              navigation.layer,
              Layer.mock(MealEntries.MealEntries, {
                create: ({ input }) =>
                  Effect.sync(() => {
                    created.push(input);

                    return new MealEntries.CreatedMealEntry({
                      mealEntry: entry,
                    });
                  }),
              })
            )
          )
        );
        const foodSearch = yield* Effect.flatMap(
          machine.child(FoodSearchMachine.FoodSearchChild),
          Effect.fromOption
        );
        const search = yield* foodSearch.state;

        expect(search.value.matchingFoods.map(({ id }) => id)).toEqual([
          eggs.id,
          appleId,
        ]);

        yield* foodSearch.send(
          FoodSearchMachine.FoodSearchEvents.SelectFood({ foodId: eggs.id })
        );
        yield* Machine.waitFor(machine, ({ state }) =>
          AddMealFoodStates.matches(state, "Logging.Quantity.Entering")
        );
        yield* machine.send(
          AddMealFoodEvents.ChangeQuantity({ quantityAmount: "150" })
        );
        yield* machine.send(AddMealFoodEvents.Submit());
        yield* Machine.waitFor(
          machine,
          ({ state }) =>
            navigation.replaced.length === 1 &&
            AddMealFoodStates.matches(state, "Logging.Quantity.Submitted")
        );

        expect(created).toEqual([
          {
            dateKey: pastDateKey,
            foodId: eggs.id,
            mealId: breakfastMealId,
            quantity: {
              _tag: "MeasuredFoodQuantity",
              amount: "150",
              unit: "g",
            },
            quantityAccuracy: "unspecified",
          },
        ]);
        expect(navigation.replaced).toEqual([
          { pathname: "/days/[dateKey]", params: { dateKey: pastDateKey } },
        ]);
      }).pipe(Effect.scoped)
  );

  it.live("returns home after logging food for today", () =>
    Effect.gen(function* () {
      const { data, eggs } = yield* _fixtures;
      const today = Domain.DateKey.make(todayDateKey());
      const navigation = _replaced();
      const entry = yield* makeCatalogMealEntry({
        dateKey: today,
        foodId: eggs.id,
        id: "44444444-4444-4444-8444-444444444444",
        mealId: breakfastMealId,
      });
      const machine = yield* Machine.start(AddMealFoodMachine, {
        ...data,
        dateKey: today,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            navigation.layer,
            Layer.mock(MealEntries.MealEntries, {
              create: () =>
                Effect.succeed(
                  new MealEntries.CreatedMealEntry({ mealEntry: entry })
                ),
            })
          )
        )
      );

      yield* machine.send(
        FoodSearchMachine.FoodSearchParentEvents.FoodSearchSelected({
          food: eggs,
          selection: "explicit",
        })
      );
      yield* machine.send(AddMealFoodEvents.Submit());
      yield* Machine.waitFor(
        machine,
        ({ state }) =>
          navigation.replaced.length === 1 &&
          AddMealFoodStates.matches(state, "Logging.Quantity.Submitted")
      );

      expect(navigation.replaced).toEqual(["/"]);
    }).pipe(Effect.scoped)
  );

  it.live("shows a notice when the meal entry cannot be created", () =>
    Effect.gen(function* () {
      const { data, eggs } = yield* _fixtures;
      const machine = yield* Machine.start(AddMealFoodMachine, data).pipe(
        Effect.provide(
          Layer.mergeAll(
            _replaced().layer,
            Layer.mock(MealEntries.MealEntries, {
              create: () =>
                Effect.fail(new MealEntries.FoodNotFound({ foodId: eggs.id })),
            })
          )
        )
      );

      yield* machine.send(
        FoodSearchMachine.FoodSearchParentEvents.FoodSearchSelected({
          food: eggs,
          selection: "explicit",
        })
      );
      yield* machine.send(AddMealFoodEvents.Submit());

      const failed = yield* Machine.waitFor(
        machine,
        ({ state }) => state.value.notice !== null
      );

      expect(failed.state.value.notice).toBe(
        "Could not find that food. Pick another food and try again."
      );
      expect(
        AddMealFoodStates.matches(failed.state, "Logging.Quantity.Entering")
      ).toBe(true);
    }).pipe(Effect.scoped)
  );

  it.live("clears the child selection when returning to food search", () =>
    Effect.gen(function* () {
      const { data, eggs } = yield* _fixtures;
      const machine = yield* Machine.start(AddMealFoodMachine, data).pipe(
        Effect.provide(_replaced().layer),
        Effect.provide(Layer.mock(MealEntries.MealEntries, {}))
      );
      const foodSearch = yield* Effect.flatMap(
        machine.child(FoodSearchMachine.FoodSearchChild),
        Effect.fromOption
      );

      yield* foodSearch.send(
        FoodSearchMachine.FoodSearchEvents.SelectFood({ foodId: eggs.id })
      );
      yield* Machine.waitFor(machine, ({ state }) =>
        AddMealFoodStates.matches(state, "Logging.Quantity.Entering")
      );
      yield* machine.send(AddMealFoodEvents.ClearSelectedFood());
      yield* Machine.waitFor(machine, ({ state }) =>
        AddMealFoodStates.matches(state, "Logging.SelectingFood")
      );

      const search = yield* Machine.waitFor(
        foodSearch,
        ({ state }) => state.value.selectedFoodId === null
      );

      expect(search.state.value.selectedFoodId).toBeNull();
    }).pipe(Effect.scoped)
  );
});
