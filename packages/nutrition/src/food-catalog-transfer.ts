import { Context, Data, DateTime, Effect, Equal, Layer, Schema } from "effect";

import { DefaultFoods } from "./default-foods.ts";
import {
  Food,
  FoodCategory,
  FoodId,
  NonEmptyString,
  NonNegativeNumber,
} from "./domain.ts";
import { CurrentDatabaseVersion, DatabaseName } from "./metadata.ts";
import { NutritionStore } from "./store.ts";

export const MaiFoodCatalogFormat = Schema.Literal("mai.food-catalog");

export const MaiFoodCatalogFormatVersion = Schema.Literal(1);

export const FoodCatalogCount = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0)
).pipe(Schema.brand("FoodCatalogCount"));

export type FoodCatalogCount = typeof FoodCatalogCount.Type;

export class FoodCatalogFood extends Schema.Class<FoodCatalogFood>(
  "FoodCatalogFood"
)({
  id: FoodId,
  basedOnFoodId: Schema.optional(FoodId),
  name: NonEmptyString,
  brand: Schema.optional(NonEmptyString),
  category: Schema.optional(FoodCategory),
  origin: Schema.Literal("user"),
  energyKcalPer100g: NonNegativeNumber,
  proteinGramsPer100g: NonNegativeNumber,
  carbsGramsPer100g: NonNegativeNumber,
  fatGramsPer100g: NonNegativeNumber,
  fiberGramsPer100g: Schema.optional(NonNegativeNumber),
  sugarGramsPer100g: Schema.optional(NonNegativeNumber),
  saturatedFatGramsPer100g: Schema.optional(NonNegativeNumber),
  saltGramsPer100g: Schema.optional(NonNegativeNumber),
  createdAt: Schema.DateTimeUtcFromMillis,
  updatedAt: Schema.DateTimeUtcFromMillis,
}) {}

export class MaiFoodCatalogSource extends Schema.Class<MaiFoodCatalogSource>(
  "MaiFoodCatalogSource"
)({
  databaseName: Schema.Literal(DatabaseName),
  databaseVersion: Schema.Literal(CurrentDatabaseVersion),
  exportedAt: Schema.DateTimeUtcFromMillis,
}) {}

export class MaiFoodCatalogCounts extends Schema.Class<MaiFoodCatalogCounts>(
  "MaiFoodCatalogCounts"
)({
  foods: FoodCatalogCount,
}) {}

export class MaiFoodCatalogIntegrity extends Schema.Class<MaiFoodCatalogIntegrity>(
  "MaiFoodCatalogIntegrity"
)({
  counts: MaiFoodCatalogCounts,
}) {}

export class MaiFoodCatalogStores extends Schema.Class<MaiFoodCatalogStores>(
  "MaiFoodCatalogStores"
)({
  foods: Schema.Array(FoodCatalogFood),
}) {}

export class MaiFoodCatalogV1 extends Schema.Class<MaiFoodCatalogV1>(
  "MaiFoodCatalogV1"
)({
  format: MaiFoodCatalogFormat,
  formatVersion: MaiFoodCatalogFormatVersion,
  integrity: MaiFoodCatalogIntegrity,
  source: MaiFoodCatalogSource,
  stores: MaiFoodCatalogStores,
}) {}

export type MaiFoodCatalog = typeof MaiFoodCatalogV1.Type;

export type MaiFoodCatalogEncoded = typeof MaiFoodCatalogV1.Encoded;

export const MaiFoodCatalogJson = Schema.fromJsonString(MaiFoodCatalogV1);

const FoodCatalogJsonInputSchema = Schema.Struct({
  json: Schema.String,
});

const ImportSelectedFoodCatalogJsonInputSchema = Schema.Struct({
  json: Schema.String,
  selectedFoodIds: Schema.Array(FoodId),
});

export type PreviewFoodCatalogJsonInput =
  typeof FoodCatalogJsonInputSchema.Encoded;

export type ImportSelectedFoodCatalogJsonInput =
  typeof ImportSelectedFoodCatalogJsonInputSchema.Encoded;

export type FoodCatalogImportCandidateStatus =
  | "already-present"
  | "id-conflict"
  | "new";

export type FoodCatalogBasedOnFoodIdStatus =
  | "available-in-catalog"
  | "available-locally"
  | "missing"
  | "none";

export type FoodCatalogImportCandidate = {
  readonly basedOnFoodIdStatus: FoodCatalogBasedOnFoodIdStatus;
  readonly food: FoodCatalogFood;
  readonly status: FoodCatalogImportCandidateStatus;
};

export const FoodCatalogIntegrityErrorReason = Schema.Literals([
  "count-mismatch",
  "default-food-id-collision",
  "duplicate-food-id",
]);

export type FoodCatalogIntegrityErrorReason =
  typeof FoodCatalogIntegrityErrorReason.Type;

export class FoodCatalogIntegrityError extends Data.TaggedError(
  "FoodCatalogIntegrityError"
)<{
  readonly detail: string;
  readonly reason: FoodCatalogIntegrityErrorReason;
}> {}

export const FoodCatalogImportSelectionErrorReason = Schema.Literals([
  "selected-food-conflict",
  "selected-food-missing",
]);

export type FoodCatalogImportSelectionErrorReason =
  typeof FoodCatalogImportSelectionErrorReason.Type;

export class FoodCatalogImportSelectionError extends Data.TaggedError(
  "FoodCatalogImportSelectionError"
)<{
  readonly detail: string;
  readonly foodId: FoodId;
  readonly reason: FoodCatalogImportSelectionErrorReason;
}> {}

export class ExportedFoodCatalog extends Data.TaggedClass(
  "ExportedFoodCatalog"
)<{
  readonly catalog: MaiFoodCatalog;
  readonly json: string;
}> {}

export class PreviewedFoodCatalogImport extends Data.TaggedClass(
  "PreviewedFoodCatalogImport"
)<{
  readonly candidates: readonly FoodCatalogImportCandidate[];
  readonly catalog: MaiFoodCatalog;
}> {}

export class ImportedFoodCatalog extends Data.TaggedClass(
  "ImportedFoodCatalog"
)<{
  readonly catalog: MaiFoodCatalog;
  readonly importedFoods: readonly Food[];
}> {}

export const validateFoodCatalog = Effect.fn("validateFoodCatalog")(function* ({
  catalog,
}: {
  readonly catalog: MaiFoodCatalog;
}) {
  const foodIds = catalog.stores.foods.map((food) => food.id);

  if (catalog.integrity.counts.foods !== catalog.stores.foods.length) {
    return yield* new FoodCatalogIntegrityError({
      detail: "The food count does not match the catalog stores.",
      reason: "count-mismatch",
    });
  }

  if (foodIds.some((foodId, index) => foodIds.indexOf(foodId) !== index)) {
    return yield* new FoodCatalogIntegrityError({
      detail: "The catalog contains duplicate food ids.",
      reason: "duplicate-food-id",
    });
  }

  const defaultFoodIds = yield* _defaultFoodIds;
  const defaultFoodIdCollision = foodIds.find((foodId) =>
    defaultFoodIds.includes(foodId)
  );

  if (defaultFoodIdCollision !== undefined) {
    return yield* new FoodCatalogIntegrityError({
      detail: `Food ${defaultFoodIdCollision} uses an app-default food id.`,
      reason: "default-food-id-collision",
    });
  }

  return yield* Effect.void;
});

export class FoodCatalogTransfers extends Context.Service<FoodCatalogTransfers>()(
  "FoodCatalogTransfers",
  {
    make: Effect.gen(function* () {
      const store = yield* NutritionStore;

      return {
        exportToJson: Effect.fn("FoodCatalogTransfers.exportToJson")(
          function* () {
            const foods = yield* store.listFoods;
            const catalogFoods = yield* Effect.forEach(
              foods.filter((food) => food.origin === "user"),
              _foodCatalogFoodFromFood
            );
            const catalog = yield* _makeFoodCatalog({ foods: catalogFoods });
            const json =
              yield* Schema.encodeEffect(MaiFoodCatalogJson)(catalog);

            return new ExportedFoodCatalog({
              catalog,
              json,
            });
          }
        ),

        importSelectedFromJson: Effect.fn(
          "FoodCatalogTransfers.importSelectedFromJson"
        )(function* ({
          input,
        }: {
          readonly input: ImportSelectedFoodCatalogJsonInput;
        }) {
          const decodedInput = yield* Schema.decodeEffect(
            ImportSelectedFoodCatalogJsonInputSchema
          )(input);
          const catalog = yield* _decodeFoodCatalogJson({
            json: decodedInput.json,
          });
          const localFoods = yield* store.listFoods;
          const candidates = yield* _foodCatalogImportCandidates({
            catalog,
            localFoods,
          });
          const selectedFoodIds = decodedInput.selectedFoodIds;
          const missingSelectedFoodId = selectedFoodIds.find(
            (selectedFoodId) =>
              !catalog.stores.foods.some((food) => food.id === selectedFoodId)
          );

          if (missingSelectedFoodId !== undefined) {
            return yield* new FoodCatalogImportSelectionError({
              detail:
                "The selected food is not present in the imported catalog.",
              foodId: missingSelectedFoodId,
              reason: "selected-food-missing",
            });
          }

          const conflictingCandidate = candidates.find(
            (candidate) =>
              selectedFoodIds.includes(candidate.food.id) &&
              candidate.status === "id-conflict"
          );

          if (conflictingCandidate !== undefined) {
            return yield* new FoodCatalogImportSelectionError({
              detail:
                "The selected food conflicts with a different local food that uses the same id.",
              foodId: conflictingCandidate.food.id,
              reason: "selected-food-conflict",
            });
          }

          const defaultFoodIds = yield* _defaultFoodIds;
          const importedFoods = yield* Effect.forEach(
            catalog.stores.foods.filter((food) =>
              selectedFoodIds.includes(food.id)
            ),
            (food) =>
              _normalizedFoodFromCatalogFood({
                defaultFoodIds,
                food,
                localFoods,
                selectedFoodIds,
              })
          );

          yield* store.upsertFoods(importedFoods);

          return new ImportedFoodCatalog({
            catalog,
            importedFoods,
          });
        }),

        previewImportFromJson: Effect.fn(
          "FoodCatalogTransfers.previewImportFromJson"
        )(function* ({
          input,
        }: {
          readonly input: PreviewFoodCatalogJsonInput;
        }) {
          const decodedInput = yield* Schema.decodeEffect(
            FoodCatalogJsonInputSchema
          )(input);
          const catalog = yield* _decodeFoodCatalogJson({
            json: decodedInput.json,
          });
          const localFoods = yield* store.listFoods;
          const candidates = yield* _foodCatalogImportCandidates({
            catalog,
            localFoods,
          });

          return new PreviewedFoodCatalogImport({
            candidates,
            catalog,
          });
        }),
      };
    }),
  }
) {
  static readonly layer = Layer.effect(this)(this.make);
}

const _defaultFoodIds = Schema.decodeEffect(Schema.Array(Food))(
  DefaultFoods
).pipe(Effect.map((foods) => foods.map((food) => food.id)));

const _decodeFoodCatalogJson = Effect.fn("_decodeFoodCatalogJson")(function* ({
  json,
}: {
  readonly json: string;
}) {
  const catalog = yield* Schema.decodeEffect(MaiFoodCatalogJson)(json);

  yield* validateFoodCatalog({ catalog });

  return catalog;
});

const _foodCatalogFoodFromFood = Effect.fn("_foodCatalogFoodFromFood")(
  function* (food: Food) {
    const encodedFood = yield* Schema.encodeEffect(Food)(food);

    return yield* Schema.decodeUnknownEffect(FoodCatalogFood)(encodedFood);
  }
);

const _foodCatalogImportCandidates = Effect.fn("_foodCatalogImportCandidates")(
  function* ({
    catalog,
    localFoods,
  }: {
    readonly catalog: MaiFoodCatalog;
    readonly localFoods: readonly Food[];
  }) {
    const defaultFoodIds = yield* _defaultFoodIds;
    const catalogFoodIds = catalog.stores.foods.map((food) => food.id);
    const localFoodIds = localFoods.map((food) => food.id);

    return yield* Effect.forEach(catalog.stores.foods, (food) =>
      Effect.gen(function* () {
        return {
          basedOnFoodIdStatus: _basedOnFoodIdStatus({
            catalogFoodIds,
            defaultFoodIds,
            food,
            localFoodIds,
          }),
          food,
          status: yield* _foodCatalogImportCandidateStatus({
            food,
            localFoods,
          }),
        } satisfies FoodCatalogImportCandidate;
      })
    );
  }
);

const _foodCatalogImportCandidateStatus = Effect.fn(
  "_foodCatalogImportCandidateStatus"
)(function* ({
  food,
  localFoods,
}: {
  readonly food: FoodCatalogFood;
  readonly localFoods: readonly Food[];
}) {
  const localFood = localFoods.find((candidate) => candidate.id === food.id);

  if (localFood === undefined) {
    return "new" satisfies FoodCatalogImportCandidateStatus;
  }

  const encodedFood = yield* Schema.encodeEffect(FoodCatalogFood)(food);
  const encodedLocalFood = yield* Schema.encodeEffect(Food)(localFood);

  return Equal.equals(encodedFood, encodedLocalFood)
    ? ("already-present" satisfies FoodCatalogImportCandidateStatus)
    : ("id-conflict" satisfies FoodCatalogImportCandidateStatus);
});

function _basedOnFoodIdStatus({
  catalogFoodIds,
  defaultFoodIds,
  food,
  localFoodIds,
}: {
  readonly catalogFoodIds: readonly FoodId[];
  readonly defaultFoodIds: readonly FoodId[];
  readonly food: FoodCatalogFood;
  readonly localFoodIds: readonly FoodId[];
}): FoodCatalogBasedOnFoodIdStatus {
  if (food.basedOnFoodId === undefined) {
    return "none";
  }

  if (
    localFoodIds.includes(food.basedOnFoodId) ||
    defaultFoodIds.includes(food.basedOnFoodId)
  ) {
    return "available-locally";
  }

  if (catalogFoodIds.includes(food.basedOnFoodId)) {
    return "available-in-catalog";
  }

  return "missing";
}

const _makeFoodCatalog = Effect.fn("_makeFoodCatalog")(function* ({
  foods,
}: {
  readonly foods: readonly FoodCatalogFood[];
}) {
  const encodedFoods = yield* Schema.encodeEffect(
    Schema.Array(FoodCatalogFood)
  )(foods);
  const catalog = yield* Schema.decodeEffect(MaiFoodCatalogV1)({
    format: "mai.food-catalog",
    formatVersion: 1,
    integrity: {
      counts: {
        foods: encodedFoods.length,
      },
    },
    source: {
      databaseName: DatabaseName,
      databaseVersion: CurrentDatabaseVersion,
      exportedAt: DateTime.toEpochMillis(yield* DateTime.now),
    },
    stores: {
      foods: encodedFoods,
    },
  } satisfies MaiFoodCatalogEncoded);

  yield* validateFoodCatalog({ catalog });

  return catalog;
});

const _normalizedFoodFromCatalogFood = Effect.fn(
  "_normalizedFoodFromCatalogFood"
)(function* ({
  defaultFoodIds,
  food,
  localFoods,
  selectedFoodIds,
}: {
  readonly defaultFoodIds: readonly FoodId[];
  readonly food: FoodCatalogFood;
  readonly localFoods: readonly Food[];
  readonly selectedFoodIds: readonly FoodId[];
}) {
  const encodedFood = yield* Schema.encodeEffect(FoodCatalogFood)(food);
  const localFoodIds = localFoods.map((localFood) => localFood.id);
  const shouldKeepBasedOnFoodId =
    food.basedOnFoodId !== undefined &&
    (localFoodIds.includes(food.basedOnFoodId) ||
      selectedFoodIds.includes(food.basedOnFoodId) ||
      defaultFoodIds.includes(food.basedOnFoodId));

  return yield* Schema.decodeEffect(Food)(
    shouldKeepBasedOnFoodId
      ? encodedFood
      : {
          ...encodedFood,
          basedOnFoodId: undefined,
        }
  );
});
