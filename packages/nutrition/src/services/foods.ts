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
  DateKey,
  Food,
  FoodId,
  FoodPortion,
  FoodPortionId,
  MassUnit,
  MeasurementUnit,
  MealEntry,
  NonNegativeNumber,
  PortionFoodQuantity,
  VolumeUnit,
} from "../domain.ts";
import * as Measurements from "../measurements.ts";
import { NutritionStore } from "./store.ts";

const _FormNonNegativeNumber = Schema.NumberFromString.check(
  Schema.isFinite(),
  Schema.isGreaterThanOrEqualTo(0)
);

const _FormPositiveNumber = Schema.NumberFromString.check(
  Schema.isFinite(),
  Schema.isGreaterThan(0)
);

const _FoodPortionFieldsInput = Schema.Struct({
  name: Schema.Trim.check(Schema.isNonEmpty()),
  size: Schema.Struct({
    amount: _FormPositiveNumber,
    unit: MeasurementUnit,
  }),
});

const _FoodPortionInput = Schema.Struct({
  id: Schema.optional(FoodPortionId),
  ..._FoodPortionFieldsInput.fields,
});

const _FoodPortionsInput = Schema.Array(_FoodPortionInput).check(
  Schema.makeFilter((portions) => {
    const names = portions.map((portion) =>
      _normalizePortionName(portion.name)
    );
    return HashSet.size(HashSet.fromIterable(names)) === names.length
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

const foodDetailsInputFields = {
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
  massVolumeConversion: Schema.optional(_MassVolumeConversionInput),
};

const _CreateFoodInput = Schema.Struct({
  ...foodDetailsInputFields,
  portions: _FoodPortionsInput.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed([]))
  ),
});

const _GetFoodInput = Schema.Struct({ foodId: FoodId });

const _CopyFoodInput = Schema.Struct({
  sourceFoodId: FoodId,
  ...foodDetailsInputFields,
});

const _EditFoodDetailsInput = Schema.Struct({
  foodId: FoodId,
  ...foodDetailsInputFields,
});

const _AddFoodPortionInput = Schema.Struct({
  foodId: FoodId,
  ..._FoodPortionFieldsInput.fields,
});

const _EditFoodPortionInput = Schema.Struct({
  foodId: FoodId,
  portionId: FoodPortionId,
  ..._FoodPortionFieldsInput.fields,
});

const _RemoveFoodPortionInput = Schema.Struct({
  foodId: FoodId,
  portionId: FoodPortionId,
});

export type CreateFoodInput = typeof _CreateFoodInput.Encoded;
export type GetFoodInput = typeof _GetFoodInput.Encoded;
export type CopyFoodInput = typeof _CopyFoodInput.Encoded;
export type EditFoodDetailsInput = typeof _EditFoodDetailsInput.Encoded;
export type AddFoodPortionInput = typeof _AddFoodPortionInput.Encoded;
export type EditFoodPortionInput = typeof _EditFoodPortionInput.Encoded;
export type RemoveFoodPortionInput = typeof _RemoveFoodPortionInput.Encoded;

export class FoodPortionUsage extends Schema.Class<FoodPortionUsage>(
  "FoodPortionUsage"
)({
  portionId: FoodPortionId,
  mealEntryCount: NonNegativeNumber,
  firstDateKey: Schema.optional(DateKey),
  lastDateKey: Schema.optional(DateKey),
}) {}

export class FoodEditUsage extends Schema.Class<FoodEditUsage>("FoodEditUsage")(
  {
    foodId: FoodId,
    mealEntryCount: NonNegativeNumber,
    firstDateKey: Schema.optional(DateKey),
    lastDateKey: Schema.optional(DateKey),
    portions: Schema.Array(FoodPortionUsage),
  }
) {}

export class FoodEditPreview extends Schema.Class<FoodEditPreview>(
  "FoodEditPreview"
)({ usage: FoodEditUsage }) {}

export class FoodPortionEditPreview extends Schema.Class<FoodPortionEditPreview>(
  "FoodPortionEditPreview"
)({
  portion: FoodPortion,
  usage: FoodPortionUsage,
}) {}

export class CreatedFood extends Data.TaggedClass("CreatedFood")<{
  readonly food: Food;
}> {}

export class CopiedFood extends Data.TaggedClass("CopiedFood")<{
  readonly food: Food;
  readonly sourceFood: Food;
}> {}

export class EditedFood extends Data.TaggedClass("EditedFood")<{
  readonly food: Food;
  readonly previousFood: Food;
  readonly revisedMealEntryCount: number;
}> {}

export class AddedFoodPortion extends Data.TaggedClass("AddedFoodPortion")<{
  readonly food: Food;
  readonly portion: FoodPortion;
}> {}

export class EditedFoodPortion extends Data.TaggedClass("EditedFoodPortion")<{
  readonly food: Food;
  readonly portion: FoodPortion;
  readonly previousPortion: FoodPortion;
  readonly revisedMealEntryCount: number;
}> {}

export class RemovedFoodPortion extends Data.TaggedClass("RemovedFoodPortion")<{
  readonly food: Food;
  readonly portion: FoodPortion;
}> {}

export class FoodNotFound extends Data.TaggedError("FoodNotFound")<{
  readonly foodId: FoodId;
}> {}

export class FoodPortionNotFound extends Data.TaggedError(
  "FoodPortionNotFound"
)<{
  readonly foodId: FoodId;
  readonly portionId: FoodPortionId;
}> {}

export class FoodPortionNameAlreadyExists extends Data.TaggedError(
  "FoodPortionNameAlreadyExists"
)<{
  readonly foodId: FoodId;
  readonly name: string;
}> {}

export class UsedFoodPortionMutationNotAllowed extends Data.TaggedError(
  "UsedFoodPortionMutationNotAllowed"
)<{
  readonly foodId: FoodId;
  readonly operation: "remove";
  readonly portionId: FoodPortionId;
}> {}

export class AppDefaultFoodEditNotAllowed extends Data.TaggedError(
  "AppDefaultFoodEditNotAllowed"
)<{
  readonly foodId: FoodId;
}> {}

export class Foods extends Context.Service<Foods>()("Foods", {
  make: Effect.gen(function* () {
    const store = yield* NutritionStore;
    const crypto = yield* Crypto.Crypto;

    const findFood = Effect.fn("Foods.findFood")(function* (foodId: FoodId) {
      const foods = yield* store.findFoodById(foodId);

      return yield* Array.head(foods).pipe(
        Option.match({
          onNone: () => new FoodNotFound({ foodId }),
          onSome: Effect.succeed,
        })
      );
    });

    const ensureUserFood = Effect.fn("Foods.ensureUserFood")(function* (
      food: Food
    ) {
      if (food.origin === "app-default") {
        return yield* new AppDefaultFoodEditNotAllowed({ foodId: food.id });
      }
    });

    const mealEntriesForFood = Effect.fn("Foods.mealEntriesForFood")(function* (
      foodId: FoodId
    ) {
      return (yield* store.listMealEntries).filter(
        (mealEntry) => mealEntry.foodId === foodId
      );
    });

    const inspectFood = Effect.fn("Foods.inspectFood")(function* (food: Food) {
      return foodEditUsage({
        food,
        mealEntries: yield* mealEntriesForFood(food.id),
      });
    });

    const ensureUniquePortionName = Effect.fn("Foods.ensureUniquePortionName")(
      function* ({
        exceptPortionId,
        food,
        name,
      }: {
        readonly exceptPortionId?: FoodPortionId;
        readonly food: Food;
        readonly name: string;
      }) {
        const normalizedName = _normalizePortionName(name);
        if (
          food.portions.some(
            (portion) =>
              portion.id !== exceptPortionId &&
              _normalizePortionName(portion.name) === normalizedName
          )
        ) {
          return yield* new FoodPortionNameAlreadyExists({
            foodId: food.id,
            name,
          });
        }
      }
    );

    const planFoodDetailsEdit = Effect.fn("Foods.planFoodDetailsEdit")(
      function* ({
        decodedInput,
        previousFood,
      }: {
        readonly decodedInput: typeof _EditFoodDetailsInput.Type;
        readonly previousFood: Food;
      }) {
        yield* ensureUserFood(previousFood);

        const previousMealEntries = yield* mealEntriesForFood(previousFood.id);
        const now = DateTime.toEpochMillis(yield* DateTime.now);
        const encodedPreviousFood =
          yield* Schema.encodeEffect(Food)(previousFood);
        const food = yield* _foodFromDetailsInput({
          category: encodedPreviousFood.category,
          createdAt: encodedPreviousFood.createdAt,
          id: previousFood.id,
          input: decodedInput,
          now,
          origin: "user",
          portions: previousFood.portions,
        });

        const previousConversion = previousFood.massVolumeConversion;
        const conversion = food.massVolumeConversion;
        const multiplierInputsChanged =
          food.nutritionReference.amount !==
            previousFood.nutritionReference.amount ||
          food.nutritionReference.unit !==
            previousFood.nutritionReference.unit ||
          (conversion === undefined) !== (previousConversion === undefined) ||
          (conversion !== undefined &&
            previousConversion !== undefined &&
            (conversion.mass.amount !== previousConversion.mass.amount ||
              conversion.mass.unit !== previousConversion.mass.unit ||
              conversion.volume.amount !== previousConversion.volume.amount ||
              conversion.volume.unit !== previousConversion.volume.unit));
        const mealEntries = multiplierInputsChanged
          ? yield* Effect.forEach(previousMealEntries, (previousMealEntry) =>
              _mealEntryWithQuantity({
                food,
                now,
                previousMealEntry,
                quantity: previousMealEntry.quantity,
              })
            )
          : [];

        return { food, mealEntries, previousMealEntries };
      }
    );

    const planFoodPortionEdit = Effect.fn("Foods.planFoodPortionEdit")(
      function* ({
        decodedInput,
        previousFood,
      }: {
        readonly decodedInput: typeof _EditFoodPortionInput.Type;
        readonly previousFood: Food;
      }) {
        yield* ensureUserFood(previousFood);
        yield* ensureUniquePortionName({
          exceptPortionId: decodedInput.portionId,
          food: previousFood,
          name: decodedInput.name,
        });

        const previousPortion = yield* _findPortion({
          food: previousFood,
          portionId: decodedInput.portionId,
        });
        const now = DateTime.toEpochMillis(yield* DateTime.now);
        const portion = yield* Schema.decodeEffect(FoodPortion)({
          id: previousPortion.id,
          name: decodedInput.name,
          position: previousPortion.position,
          size: decodedInput.size,
        });
        const food = yield* _foodWithPortions({
          food: previousFood,
          now,
          portions: previousFood.portions.map((candidate) =>
            candidate.id === portion.id ? portion : candidate
          ),
        });
        const previousMealEntries = (yield* mealEntriesForFood(food.id)).filter(
          (
            mealEntry
          ): mealEntry is MealEntry & {
            readonly quantity: PortionFoodQuantity;
          } =>
            mealEntry.quantity._tag === "PortionFoodQuantity" &&
            mealEntry.quantity.portionId === portion.id
        );
        const mealEntries = yield* Effect.forEach(
          previousMealEntries,
          (previousMealEntry) =>
            _mealEntryWithQuantity({
              food,
              now,
              previousMealEntry,
              quantity: {
                ...previousMealEntry.quantity,
                portionName: portion.name,
                portionSize: portion.size,
              },
            })
        );

        return {
          food,
          mealEntries,
          portion,
          previousMealEntries,
          previousPortion,
        };
      }
    );

    const editFoodDetails = Effect.fn("Foods.editFoodDetails")(function* ({
      input,
    }: {
      readonly input: EditFoodDetailsInput;
    }) {
      const decodedInput = yield* Schema.decodeEffect(_EditFoodDetailsInput)(
        input
      );
      const previousFood = yield* findFood(decodedInput.foodId);
      const { food, mealEntries, previousMealEntries } =
        yield* planFoodDetailsEdit({ decodedInput, previousFood });

      yield* store.applyFoodEdit({ food, mealEntries });

      return new EditedFood({
        food,
        previousFood,
        revisedMealEntryCount: previousMealEntries.length,
      });
    });

    const previewFoodDetailsEdit = Effect.fn("Foods.previewFoodDetailsEdit")(
      function* ({ input }: { readonly input: EditFoodDetailsInput }) {
        const decodedInput = yield* Schema.decodeEffect(_EditFoodDetailsInput)(
          input
        );
        const previousFood = yield* findFood(decodedInput.foodId);
        yield* planFoodDetailsEdit({ decodedInput, previousFood });

        return new FoodEditPreview({ usage: yield* inspectFood(previousFood) });
      }
    );

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
        return yield* findFood(decodedInput.foodId);
      }),

      inspectEdit: Effect.fn("Foods.inspectEdit")(function* ({
        input,
      }: {
        readonly input: GetFoodInput;
      }) {
        const decodedInput = yield* Schema.decodeEffect(_GetFoodInput)(input);
        return yield* inspectFood(yield* findFood(decodedInput.foodId));
      }),

      create: Effect.fn("Foods.create")(function* ({
        input,
      }: {
        readonly input: CreateFoodInput;
      }) {
        const decodedInput =
          yield* Schema.decodeEffect(_CreateFoodInput)(input);
        const now = DateTime.toEpochMillis(yield* DateTime.now);
        const portions = yield* Effect.forEach(
          decodedInput.portions,
          (portion, position) =>
            Effect.gen(function* () {
              return yield* Schema.decodeEffect(FoodPortion)({
                id: yield* crypto.randomUUIDv4,
                name: portion.name,
                position,
                size: portion.size,
              });
            })
        );
        const food = yield* _foodFromDetailsInput({
          createdAt: now,
          id: yield* crypto.randomUUIDv4,
          input: decodedInput,
          now,
          origin: "user",
          portions,
        });

        yield* store.insertFood(food);
        return new CreatedFood({ food });
      }),

      copy: Effect.fn("Foods.copy")(function* ({
        input,
      }: {
        readonly input: CopyFoodInput;
      }) {
        const decodedInput = yield* Schema.decodeEffect(_CopyFoodInput)(input);
        const sourceFood = yield* findFood(decodedInput.sourceFoodId);
        const encodedSourceFood = yield* Schema.encodeEffect(Food)(sourceFood);
        const now = DateTime.toEpochMillis(yield* DateTime.now);
        const portions = yield* Effect.forEach(sourceFood.portions, (portion) =>
          Effect.gen(function* () {
            return yield* Schema.decodeEffect(FoodPortion)({
              id: yield* crypto.randomUUIDv4,
              name: portion.name,
              position: portion.position,
              size: portion.size,
            });
          })
        );
        const food = yield* _foodFromDetailsInput({
          category: encodedSourceFood.category,
          createdAt: now,
          id: yield* crypto.randomUUIDv4,
          input: decodedInput,
          now,
          origin: "user",
          portions,
        });

        yield* store.insertFood(food);
        return new CopiedFood({ food, sourceFood });
      }),

      previewFoodDetailsEdit,
      editFoodDetails,

      addFoodPortion: Effect.fn("Foods.addFoodPortion")(function* ({
        input,
      }: {
        readonly input: AddFoodPortionInput;
      }) {
        const decodedInput =
          yield* Schema.decodeEffect(_AddFoodPortionInput)(input);
        const previousFood = yield* findFood(decodedInput.foodId);
        yield* ensureUserFood(previousFood);
        yield* ensureUniquePortionName({
          food: previousFood,
          name: decodedInput.name,
        });

        const position =
          previousFood.portions.reduce(
            (highest, portion) => Math.max(highest, portion.position),
            -1
          ) + 1;
        const portion = yield* Schema.decodeEffect(FoodPortion)({
          id: yield* crypto.randomUUIDv4,
          name: decodedInput.name,
          position,
          size: decodedInput.size,
        });
        const food = yield* _foodWithPortions({
          food: previousFood,
          now: DateTime.toEpochMillis(yield* DateTime.now),
          portions: [...previousFood.portions, portion],
        });

        yield* store.applyFoodEdit({ food, mealEntries: [] });
        return new AddedFoodPortion({ food, portion });
      }),

      previewFoodPortionEdit: Effect.fn("Foods.previewFoodPortionEdit")(
        function* ({ input }: { readonly input: EditFoodPortionInput }) {
          const decodedInput = yield* Schema.decodeEffect(
            _EditFoodPortionInput
          )(input);
          const previousFood = yield* findFood(decodedInput.foodId);
          const { portion } = yield* planFoodPortionEdit({
            decodedInput,
            previousFood,
          });
          const usage = yield* inspectFood(previousFood);
          const portionUsage = usage.portions.find(
            (candidate) => candidate.portionId === portion.id
          );

          return new FoodPortionEditPreview({
            portion,
            usage:
              portionUsage ??
              new FoodPortionUsage({
                portionId: portion.id,
                mealEntryCount: 0,
              }),
          });
        }
      ),

      editFoodPortionEverywhere: Effect.fn("Foods.editFoodPortionEverywhere")(
        function* ({ input }: { readonly input: EditFoodPortionInput }) {
          const decodedInput = yield* Schema.decodeEffect(
            _EditFoodPortionInput
          )(input);
          const previousFood = yield* findFood(decodedInput.foodId);
          const {
            food,
            mealEntries,
            portion,
            previousMealEntries,
            previousPortion,
          } = yield* planFoodPortionEdit({ decodedInput, previousFood });

          yield* store.applyFoodEdit({ food, mealEntries });
          return new EditedFoodPortion({
            food,
            portion,
            previousPortion,
            revisedMealEntryCount: previousMealEntries.length,
          });
        }
      ),

      removeUnusedFoodPortion: Effect.fn("Foods.removeUnusedFoodPortion")(
        function* ({ input }: { readonly input: RemoveFoodPortionInput }) {
          const decodedInput = yield* Schema.decodeEffect(
            _RemoveFoodPortionInput
          )(input);
          const previousFood = yield* findFood(decodedInput.foodId);
          yield* ensureUserFood(previousFood);
          const portion = yield* _findPortion({
            food: previousFood,
            portionId: decodedInput.portionId,
          });
          const isUsed = (yield* mealEntriesForFood(previousFood.id)).some(
            (mealEntry) =>
              mealEntry.quantity._tag === "PortionFoodQuantity" &&
              mealEntry.quantity.portionId === portion.id
          );
          if (isUsed) {
            return yield* new UsedFoodPortionMutationNotAllowed({
              foodId: previousFood.id,
              operation: "remove",
              portionId: portion.id,
            });
          }

          const food = yield* _foodWithPortions({
            food: previousFood,
            now: DateTime.toEpochMillis(yield* DateTime.now),
            portions: previousFood.portions.filter(
              (candidate) => candidate.id !== portion.id
            ),
          });
          yield* store.applyFoodEdit({ food, mealEntries: [] });

          return new RemovedFoodPortion({ food, portion });
        }
      ),
    };
  }),
}) {
  static readonly layer = Layer.effect(this)(this.make);
}

const _foodFromDetailsInput = Effect.fn("Foods.foodFromDetailsInput")(
  function* ({
    category,
    createdAt,
    id,
    input,
    now,
    origin,
    portions,
  }: {
    readonly category?: Food["category"] | undefined;
    readonly createdAt: number;
    readonly id: FoodId | string;
    readonly input: Omit<typeof _CreateFoodInput.Type, "portions">;
    readonly now: number;
    readonly origin: Food["origin"];
    readonly portions: readonly FoodPortion[];
  }) {
    return yield* Schema.decodeEffect(Food)({
      id,
      name: input.name,
      brand: input.brand,
      ...(category === undefined ? {} : { category }),
      origin,
      nutritionReference: input.nutritionReference,
      energyKcal: input.energyKcal,
      proteinGrams: input.proteinGrams,
      carbsGrams: input.carbsGrams,
      fatGrams: input.fatGrams,
      ...(input.fiberGrams === undefined
        ? {}
        : { fiberGrams: input.fiberGrams }),
      ...(input.sugarGrams === undefined
        ? {}
        : { sugarGrams: input.sugarGrams }),
      ...(input.saturatedFatGrams === undefined
        ? {}
        : { saturatedFatGrams: input.saturatedFatGrams }),
      ...(input.saltGrams === undefined ? {} : { saltGrams: input.saltGrams }),
      portions,
      ...(input.massVolumeConversion === undefined
        ? {}
        : { massVolumeConversion: input.massVolumeConversion }),
      createdAt,
      updatedAt: now,
    });
  }
);

const _foodWithPortions = Effect.fn("Foods.foodWithPortions")(function* ({
  food,
  now,
  portions,
}: {
  readonly food: Food;
  readonly now: number;
  readonly portions: readonly FoodPortion[];
}) {
  const encodedFood = yield* Schema.encodeEffect(Food)(food);
  return yield* Schema.decodeEffect(Food)({
    ...encodedFood,
    portions,
    updatedAt: now,
  });
});

const _mealEntryWithQuantity = Effect.fn("Foods.mealEntryWithQuantity")(
  function* ({
    food,
    now,
    previousMealEntry,
    quantity,
  }: {
    readonly food: Food;
    readonly now: number;
    readonly previousMealEntry: MealEntry;
    readonly quantity: MealEntry["quantity"];
  }) {
    const nutritionMultiplier =
      yield* Measurements.nutritionMultiplierFromQuantity({ food, quantity });
    const encodedPreviousMealEntry =
      yield* Schema.encodeEffect(MealEntry)(previousMealEntry);

    return yield* Schema.decodeEffect(MealEntry)({
      ...encodedPreviousMealEntry,
      nutritionMultiplier,
      quantity,
      updatedAt: now,
    });
  }
);

const _findPortion = Effect.fn("Foods.findPortion")(function* ({
  food,
  portionId,
}: {
  readonly food: Food;
  readonly portionId: FoodPortionId;
}) {
  return yield* Array.findFirst(
    food.portions,
    (portion) => portion.id === portionId
  ).pipe(
    Option.match({
      onNone: () => new FoodPortionNotFound({ foodId: food.id, portionId }),
      onSome: Effect.succeed,
    })
  );
});

function _normalizePortionName(name: string) {
  return name.trim().toLocaleLowerCase();
}

export function foodEditUsage({
  food,
  mealEntries,
}: {
  readonly food: Food;
  readonly mealEntries: readonly MealEntry[];
}) {
  const dateKeys = mealEntries.map((mealEntry) => mealEntry.dateKey).sort();

  return new FoodEditUsage({
    foodId: food.id,
    mealEntryCount: mealEntries.length,
    ...(dateKeys[0] === undefined ? {} : { firstDateKey: dateKeys[0] }),
    ...(dateKeys.at(-1) === undefined ? {} : { lastDateKey: dateKeys.at(-1) }),
    portions: food.portions.map((portion) => {
      const portionDateKeys = mealEntries
        .filter(
          (mealEntry) =>
            mealEntry.quantity._tag === "PortionFoodQuantity" &&
            mealEntry.quantity.portionId === portion.id
        )
        .map((mealEntry) => mealEntry.dateKey)
        .sort();

      return new FoodPortionUsage({
        portionId: portion.id,
        mealEntryCount: portionDateKeys.length,
        ...(portionDateKeys[0] === undefined
          ? {}
          : { firstDateKey: portionDateKeys[0] }),
        ...(portionDateKeys.at(-1) === undefined
          ? {}
          : { lastDateKey: portionDateKeys.at(-1) }),
      });
    }),
  });
}
