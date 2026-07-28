import { Effect, Schema } from "effect";

import {
  Food,
  FoodCategory,
  FoodId,
  FoodMassVolumeConversion,
  FoodOrigin,
  FoodPortion,
  MeasuredQuantity,
  NonEmptyString,
  NonNegativeNumber,
} from "../domain.ts";

export class FoodBeforePrices extends Schema.Class<FoodBeforePrices>(
  "FoodBeforePrices"
)({
  id: FoodId,
  name: NonEmptyString,
  brand: Schema.optional(NonEmptyString),
  category: Schema.optional(FoodCategory),
  origin: FoodOrigin,
  nutritionReference: MeasuredQuantity.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed({ amount: 100, unit: "g" }))
  ),
  energyKcal: NonNegativeNumber,
  proteinGrams: NonNegativeNumber,
  carbsGrams: NonNegativeNumber,
  fatGrams: NonNegativeNumber,
  fiberGrams: Schema.optional(NonNegativeNumber),
  sugarGrams: Schema.optional(NonNegativeNumber),
  saturatedFatGrams: Schema.optional(NonNegativeNumber),
  saltGrams: Schema.optional(NonNegativeNumber),
  portions: Schema.Array(FoodPortion).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed([]))
  ),
  massVolumeConversion: Schema.optional(FoodMassVolumeConversion),
  createdAt: Schema.DateTimeUtcFromMillis,
  updatedAt: Schema.DateTimeUtcFromMillis,
}) {}

export const migrateFoodToPrices = Effect.fn("migrateFoodToPrices")(function* ({
  food,
}: {
  readonly food: FoodBeforePrices;
}) {
  const encodedFood = yield* Schema.encodeEffect(FoodBeforePrices)(food);

  return yield* Schema.decodeEffect(Food)({
    ...encodedFood,
    prices: [],
  });
});

export const migrateFoodsToPrices = Effect.fn("migrateFoodsToPrices")(
  function* ({ foods }: { readonly foods: readonly FoodBeforePrices[] }) {
    return yield* Effect.forEach(foods, (food) =>
      migrateFoodToPrices({ food })
    );
  }
);
