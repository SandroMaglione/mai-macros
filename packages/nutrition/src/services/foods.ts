import {
  Array,
  Context,
  Crypto,
  Data,
  DateTime,
  Effect,
  HashSet,
  Layer,
  Option,
  Schema,
} from "effect";

import {
  Food,
  FoodId,
  FoodPortion,
  FoodPortionId,
  MassUnit,
  MeasurementUnit,
  VolumeUnit,
} from "../domain.ts";
import { NutritionStore } from "./store.ts";

const _FormNonNegativeNumber = Schema.NumberFromString.check(
  Schema.isFinite(),
  Schema.isGreaterThanOrEqualTo(0)
);

const _FormPositiveNumber = Schema.NumberFromString.check(
  Schema.isFinite(),
  Schema.isGreaterThan(0)
);

const _FoodPortionInput = Schema.Struct({
  id: Schema.optional(FoodPortionId),
  name: Schema.Trim.check(Schema.isNonEmpty()),
  size: Schema.Struct({
    amount: _FormPositiveNumber,
    unit: MeasurementUnit,
  }),
});

const _FoodPortionsInput = Schema.Array(_FoodPortionInput).check(
  Schema.makeFilter((portions) => {
    const normalizedNames = portions.map((portion) =>
      portion.name.toLocaleLowerCase()
    );

    return HashSet.size(HashSet.fromIterable(normalizedNames)) ===
      normalizedNames.length
      ? undefined
      : "Portion names must be unique for a food.";
  })
);

const _MassVolumeConversionInput = Schema.Struct({
  mass: Schema.Struct({
    amount: _FormPositiveNumber,
    unit: MassUnit,
  }),
  volume: Schema.Struct({
    amount: _FormPositiveNumber,
    unit: VolumeUnit,
  }),
});

const foodInputFields = {
  name: Schema.Trim.check(Schema.isNonEmpty()),
  brand: Schema.optional(Schema.Trim.check(Schema.isNonEmpty())),
  nutritionReference: Schema.Struct({
    amount: _FormPositiveNumber,
    unit: MeasurementUnit,
  }).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed({ amount: "100", unit: "g" }))
  ),
  energyKcal: _FormNonNegativeNumber,
  proteinGrams: _FormNonNegativeNumber,
  carbsGrams: _FormNonNegativeNumber,
  fatGrams: _FormNonNegativeNumber,
  fiberGrams: Schema.optional(_FormNonNegativeNumber),
  sugarGrams: Schema.optional(_FormNonNegativeNumber),
  saturatedFatGrams: Schema.optional(_FormNonNegativeNumber),
  saltGrams: Schema.optional(_FormNonNegativeNumber),
  portions: _FoodPortionsInput.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed([]))
  ),
  massVolumeConversion: Schema.optional(_MassVolumeConversionInput),
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
        const portions = yield* _foodPortionsFromInput({
          crypto,
          portions: decodedInput.portions,
          replaceIds: true,
        });
        const food = yield* Schema.decodeEffect(Food)({
          id: yield* crypto.randomUUIDv4,
          name: decodedInput.name,
          brand: decodedInput.brand,
          origin: "user",
          nutritionReference: decodedInput.nutritionReference,
          energyKcal: decodedInput.energyKcal,
          proteinGrams: decodedInput.proteinGrams,
          carbsGrams: decodedInput.carbsGrams,
          fatGrams: decodedInput.fatGrams,
          ..._optionalNutrientFields(decodedInput),
          portions,
          ...(decodedInput.massVolumeConversion === undefined
            ? {}
            : { massVolumeConversion: decodedInput.massVolumeConversion }),
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
                const shouldCreateRevision = hasMealEntries;
                const foodId = shouldCreateRevision
                  ? yield* crypto.randomUUIDv4
                  : previousFood.id;
                const portions = yield* _foodPortionsFromInput({
                  crypto,
                  portions: decodedInput.portions,
                  replaceIds: shouldCreateRevision,
                });
                const food = yield* Schema.decodeEffect(Food)({
                  id: foodId,
                  name: decodedInput.name,
                  brand: decodedInput.brand,
                  ...(encodedPreviousFood.category === undefined
                    ? {}
                    : { category: encodedPreviousFood.category }),
                  origin: "user",
                  nutritionReference: decodedInput.nutritionReference,
                  energyKcal: decodedInput.energyKcal,
                  proteinGrams: decodedInput.proteinGrams,
                  carbsGrams: decodedInput.carbsGrams,
                  fatGrams: decodedInput.fatGrams,
                  ..._optionalNutrientFields(decodedInput),
                  portions,
                  ...(decodedInput.massVolumeConversion === undefined
                    ? {}
                    : {
                        massVolumeConversion: decodedInput.massVolumeConversion,
                      }),
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

const _foodPortionsFromInput = Effect.fn("Foods.foodPortionsFromInput")(
  function* ({
    crypto,
    portions,
    replaceIds,
  }: {
    readonly crypto: Crypto.Crypto;
    readonly portions: readonly (typeof _FoodPortionInput.Type)[];
    readonly replaceIds: boolean;
  }) {
    return yield* Effect.forEach(portions, (portion, position) =>
      Effect.gen(function* () {
        const id =
          replaceIds || portion.id === undefined
            ? yield* crypto.randomUUIDv4
            : portion.id;

        return yield* Schema.decodeEffect(FoodPortion)({
          id,
          name: portion.name,
          position,
          size: portion.size,
        });
      })
    );
  }
);

function _optionalNutrientFields({
  fiberGrams,
  saltGrams,
  saturatedFatGrams,
  sugarGrams,
}: {
  readonly fiberGrams?: number | undefined;
  readonly saltGrams?: number | undefined;
  readonly saturatedFatGrams?: number | undefined;
  readonly sugarGrams?: number | undefined;
}) {
  return {
    ...(fiberGrams === undefined ? {} : { fiberGrams }),
    ...(sugarGrams === undefined ? {} : { sugarGrams }),
    ...(saturatedFatGrams === undefined ? {} : { saturatedFatGrams }),
    ...(saltGrams === undefined ? {} : { saltGrams }),
  };
}
