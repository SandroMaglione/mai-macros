import { Food, MaiDatabase } from "@mai/nutrition";
import { Context, Crypto, Data, DateTime, Effect, Layer, Schema } from "effect";

const _FormNonNegativeNumber = Schema.NumberFromString.check(
  Schema.isFinite(),
  Schema.isGreaterThanOrEqualTo(0)
);

const _CreateFoodInput = Schema.Struct({
  name: Schema.String.check(Schema.isNonEmpty()),
  brand: Schema.optional(Schema.String.check(Schema.isNonEmpty())),
  energyKcalPer100g: _FormNonNegativeNumber,
  proteinGramsPer100g: _FormNonNegativeNumber,
  carbsGramsPer100g: _FormNonNegativeNumber,
  fatGramsPer100g: _FormNonNegativeNumber,
  fiberGramsPer100g: _FormNonNegativeNumber,
  sugarGramsPer100g: _FormNonNegativeNumber,
  saturatedFatGramsPer100g: _FormNonNegativeNumber,
  saltGramsPer100g: _FormNonNegativeNumber,
});

export type CreateFoodInput = typeof _CreateFoodInput.Encoded;

export class CreatedFood extends Data.TaggedClass("CreatedFood")<{
  readonly food: Food;
}> {}

export class Foods extends Context.Service<Foods>()("Foods", {
  make: Effect.gen(function* () {
    const api = yield* MaiDatabase.getQueryBuilder;
    const crypto = yield* Crypto.Crypto;

    return {
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
    };
  }),
}) {
  static readonly layer = Layer.effect(this)(this.make);
}
