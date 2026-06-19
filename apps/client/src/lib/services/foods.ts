import { Food, FoodId, MaiDatabase } from "@mai/nutrition";
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
  fiberGramsPer100g: _FormNonNegativeNumber,
  sugarGramsPer100g: _FormNonNegativeNumber,
  saturatedFatGramsPer100g: _FormNonNegativeNumber,
  saltGramsPer100g: _FormNonNegativeNumber,
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
    const api = yield* MaiDatabase.getQueryBuilder;
    const crypto = yield* Crypto.Crypto;

    return {
      list: Effect.fn("Foods.list")(function* () {
        return yield* api.from("foods").select();
      }),

      get: Effect.fn("Foods.get")(function* ({
        input,
      }: {
        readonly input: GetFoodInput;
      }) {
        const decodedInput = yield* Schema.decodeEffect(_GetFoodInput)(input);
        const foods = yield* api
          .from("foods")
          .select()
          .equals(decodedInput.foodId);

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
          energyKcalPer100g: decodedInput.energyKcalPer100g,
          proteinGramsPer100g: decodedInput.proteinGramsPer100g,
          carbsGramsPer100g: decodedInput.carbsGramsPer100g,
          fatGramsPer100g: decodedInput.fatGramsPer100g,
          fiberGramsPer100g: decodedInput.fiberGramsPer100g,
          sugarGramsPer100g: decodedInput.sugarGramsPer100g,
          saturatedFatGramsPer100g: decodedInput.saturatedFatGramsPer100g,
          saltGramsPer100g: decodedInput.saltGramsPer100g,
          createdAt: now,
          updatedAt: now,
        });

        yield* api.from("foods").insert(food);

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
        const previousFoods = yield* api
          .from("foods")
          .select()
          .equals(decodedInput.foodId);

        return yield* Array.head(previousFoods).pipe(
          Option.match({
            onNone: () =>
              new FoodNotFound({
                foodId: decodedInput.foodId,
              }),
            onSome: (previousFood) =>
              Effect.gen(function* () {
                const now = DateTime.toEpochMillis(yield* DateTime.now);
                const mealEntryCount = yield* api
                  .from("mealEntries")
                  .count("byFood")
                  .equals(previousFood.id);
                const hasMealEntries = mealEntryCount > 0;
                const encodedPreviousFood =
                  yield* Schema.encodeEffect(Food)(previousFood);
                const foodId = hasMealEntries
                  ? yield* crypto.randomUUIDv4
                  : previousFood.id;
                const food = yield* Schema.decodeEffect(Food)({
                  id: foodId,
                  ...(hasMealEntries
                    ? { basedOnFoodId: previousFood.id }
                    : encodedPreviousFood.basedOnFoodId === undefined
                      ? {}
                      : { basedOnFoodId: encodedPreviousFood.basedOnFoodId }),
                  name: decodedInput.name,
                  brand: decodedInput.brand,
                  energyKcalPer100g: decodedInput.energyKcalPer100g,
                  proteinGramsPer100g: decodedInput.proteinGramsPer100g,
                  carbsGramsPer100g: decodedInput.carbsGramsPer100g,
                  fatGramsPer100g: decodedInput.fatGramsPer100g,
                  fiberGramsPer100g: decodedInput.fiberGramsPer100g,
                  sugarGramsPer100g: decodedInput.sugarGramsPer100g,
                  saturatedFatGramsPer100g:
                    decodedInput.saturatedFatGramsPer100g,
                  saltGramsPer100g: decodedInput.saltGramsPer100g,
                  createdAt: hasMealEntries
                    ? now
                    : encodedPreviousFood.createdAt,
                  updatedAt: now,
                });

                if (hasMealEntries) {
                  yield* api.from("foods").insert(food);
                } else {
                  yield* api.from("foods").upsert(food);
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
