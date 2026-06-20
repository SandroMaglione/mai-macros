import {
  Array,
  Context,
  Crypto,
  Data,
  DateTime,
  Effect,
  Layer,
  Option,
  Schema,
} from "effect";

import { Food, FoodId } from "../domain.ts";
import { NutritionStore } from "../store.ts";

const _FormNonNegativeNumber = Schema.NumberFromString.check(
  Schema.isFinite(),
  Schema.isGreaterThanOrEqualTo(0)
);

const foodInputFields = {
  name: Schema.Trim.check(Schema.isNonEmpty()),
  brand: Schema.optional(Schema.Trim.check(Schema.isNonEmpty())),
  energyKcalPer100g: _FormNonNegativeNumber,
  proteinGramsPer100g: _FormNonNegativeNumber,
  carbsGramsPer100g: _FormNonNegativeNumber,
  fatGramsPer100g: _FormNonNegativeNumber,
  fiberGramsPer100g: Schema.optional(_FormNonNegativeNumber),
  sugarGramsPer100g: Schema.optional(_FormNonNegativeNumber),
  saturatedFatGramsPer100g: Schema.optional(_FormNonNegativeNumber),
  saltGramsPer100g: Schema.optional(_FormNonNegativeNumber),
};

const _CreateFoodInput = Schema.Struct(foodInputFields);

const _GetFoodInput = Schema.Struct({
  foodId: FoodId,
});

const _ReviseFoodInput = Schema.Struct({
  foodId: FoodId,
  ...foodInputFields,
});

export type CreateFoodInput = typeof _CreateFoodInput.Encoded;

export type GetFoodInput = typeof _GetFoodInput.Encoded;

export type ReviseFoodInput = typeof _ReviseFoodInput.Encoded;

export class CreatedFood extends Data.TaggedClass("CreatedFood")<{
  readonly food: Food;
}> {}

export class RevisedFood extends Data.TaggedClass("RevisedFood")<{
  readonly food: Food;
  readonly previousFood: Food;
}> {}

export class FoodNotFound extends Data.TaggedError("FoodNotFound")<{
  readonly foodId: FoodId;
}> {}

export class Foods extends Context.Service<Foods>()("Foods", {
  make: Effect.gen(function* () {
    const store = yield* NutritionStore;
    const crypto = yield* Crypto.Crypto;

    return {
      list: Effect.fn("Foods.list")(function* () {
        return yield* store.listFoods;
      }),

      get: Effect.fn("Foods.get")(function* ({
        input,
      }: {
        readonly input: GetFoodInput;
      }) {
        const decodedInput = yield* Schema.decodeEffect(_GetFoodInput)(input);
        const foods = yield* store.findFoodById(decodedInput.foodId);

        return yield* Array.head(foods).pipe(
          Option.match({
            onNone: () =>
              new FoodNotFound({
                foodId: decodedInput.foodId,
              }),
            onSome: Effect.succeed,
          })
        );
      }),

      create: Effect.fn("Foods.create")(function* ({
        input,
      }: {
        readonly input: CreateFoodInput;
      }) {
        const decodedInput =
          yield* Schema.decodeEffect(_CreateFoodInput)(input);
        const now = DateTime.toEpochMillis(yield* DateTime.now);
        const food = yield* Schema.decodeEffect(Food)({
          id: yield* crypto.randomUUIDv4,
          name: decodedInput.name,
          brand: decodedInput.brand,
          origin: "user",
          energyKcalPer100g: decodedInput.energyKcalPer100g,
          proteinGramsPer100g: decodedInput.proteinGramsPer100g,
          carbsGramsPer100g: decodedInput.carbsGramsPer100g,
          fatGramsPer100g: decodedInput.fatGramsPer100g,
          ..._optionalNutrientFields(decodedInput),
          createdAt: now,
          updatedAt: now,
        });

        yield* store.insertFood(food);

        return new CreatedFood({
          food,
        });
      }),

      revise: Effect.fn("Foods.revise")(function* ({
        input,
      }: {
        readonly input: ReviseFoodInput;
      }) {
        const decodedInput =
          yield* Schema.decodeEffect(_ReviseFoodInput)(input);
        const previousFoods = yield* store.findFoodById(decodedInput.foodId);

        return yield* Array.head(previousFoods).pipe(
          Option.match({
            onNone: () =>
              new FoodNotFound({
                foodId: decodedInput.foodId,
              }),
            onSome: (previousFood) =>
              Effect.gen(function* () {
                const now = DateTime.toEpochMillis(yield* DateTime.now);
                const mealEntryCount = yield* store.countMealEntriesByFood(
                  previousFood.id
                );
                const hasMealEntries = mealEntryCount > 0;
                const encodedPreviousFood =
                  yield* Schema.encodeEffect(Food)(previousFood);
                const shouldCreateRevision =
                  hasMealEntries || previousFood.origin === "app-default";
                const foodId = shouldCreateRevision
                  ? yield* crypto.randomUUIDv4
                  : previousFood.id;
                const food = yield* Schema.decodeEffect(Food)({
                  id: foodId,
                  ...(shouldCreateRevision
                    ? { basedOnFoodId: previousFood.id }
                    : encodedPreviousFood.basedOnFoodId === undefined
                      ? {}
                      : { basedOnFoodId: encodedPreviousFood.basedOnFoodId }),
                  name: decodedInput.name,
                  brand: decodedInput.brand,
                  ...(encodedPreviousFood.category === undefined
                    ? {}
                    : { category: encodedPreviousFood.category }),
                  origin: "user",
                  energyKcalPer100g: decodedInput.energyKcalPer100g,
                  proteinGramsPer100g: decodedInput.proteinGramsPer100g,
                  carbsGramsPer100g: decodedInput.carbsGramsPer100g,
                  fatGramsPer100g: decodedInput.fatGramsPer100g,
                  ..._optionalNutrientFields(decodedInput),
                  createdAt: shouldCreateRevision
                    ? now
                    : encodedPreviousFood.createdAt,
                  updatedAt: now,
                });

                if (shouldCreateRevision) {
                  yield* store.insertFood(food);
                } else {
                  yield* store.upsertFood(food);
                }

                return new RevisedFood({
                  food,
                  previousFood,
                });
              }),
          })
        );
      }),
    };
  }),
}) {
  static readonly layer = Layer.effect(this)(this.make);
}

function _optionalNutrientFields({
  fiberGramsPer100g,
  saltGramsPer100g,
  saturatedFatGramsPer100g,
  sugarGramsPer100g,
}: {
  readonly fiberGramsPer100g?: number | undefined;
  readonly saltGramsPer100g?: number | undefined;
  readonly saturatedFatGramsPer100g?: number | undefined;
  readonly sugarGramsPer100g?: number | undefined;
}) {
  return {
    ...(fiberGramsPer100g === undefined ? {} : { fiberGramsPer100g }),
    ...(sugarGramsPer100g === undefined ? {} : { sugarGramsPer100g }),
    ...(saturatedFatGramsPer100g === undefined
      ? {}
      : { saturatedFatGramsPer100g }),
    ...(saltGramsPer100g === undefined ? {} : { saltGramsPer100g }),
  };
}
