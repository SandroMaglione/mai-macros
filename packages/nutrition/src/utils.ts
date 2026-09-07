import { Array, Data, Effect, Schema } from "effect";

import type {
  DateKey,
  EntryNutrients,
  Food,
  NutritionMultiplier,
  Plan,
} from "./domain.ts";
import { DateKey as DateKeySchema } from "./domain.ts";

const dateKeyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const dayInMilliseconds = 24 * 60 * 60 * 1000;

export type DateKeyRangeBoundary =
  | "endDateKey"
  | "generatedDateKey"
  | "startDateKey";

export class InvalidDateKey extends Data.TaggedError("InvalidDateKey")<{
  readonly boundary: DateKeyRangeBoundary;
  readonly dateKey: string;
}> {}

export type DominantMacronutrient = "carbs" | "fat" | "protein";

export const calculateMacronutrientEnergyKcal = ({
  proteinGrams,
  carbsGrams,
  fatGrams,
}: {
  readonly proteinGrams: number;
  readonly carbsGrams: number;
  readonly fatGrams: number;
}): number => proteinGrams * 4 + carbsGrams * 4 + fatGrams * 9;

export const calculatePlanEnergyKcal = ({
  plan,
}: {
  readonly plan: Plan;
}): number =>
  calculateMacronutrientEnergyKcal({
    proteinGrams: plan.proteinTargetGrams,
    carbsGrams: plan.carbsTargetGrams,
    fatGrams: plan.fatTargetGrams,
  });

export const foodNutrition = (food: Food) => ({
  energyKcal: food.nutritionCorrections.energyKcal ?? food.energyKcal,
  proteinGrams: food.nutritionCorrections.proteinGrams ?? food.proteinGrams,
  carbsGrams: food.nutritionCorrections.carbsGrams ?? food.carbsGrams,
  fatGrams: food.nutritionCorrections.fatGrams ?? food.fatGrams,
  fiberGrams: food.nutritionCorrections.fiberGrams ?? food.fiberGrams,
  sugarGrams: food.nutritionCorrections.sugarGrams ?? food.sugarGrams,
  saturatedFatGrams:
    food.nutritionCorrections.saturatedFatGrams ?? food.saturatedFatGrams,
  saltGrams: food.nutritionCorrections.saltGrams ?? food.saltGrams,
});

export const findDominantMacronutrients = ({
  food,
}: {
  readonly food: Pick<Food, "carbsGrams" | "fatGrams" | "proteinGrams"> &
    Partial<Pick<Food, "nutritionCorrections">>;
}): readonly DominantMacronutrient[] => {
  const macronutrientGrams = [
    {
      grams: food.nutritionCorrections?.proteinGrams ?? food.proteinGrams,
      macronutrient: "protein",
    },
    {
      grams: food.nutritionCorrections?.carbsGrams ?? food.carbsGrams,
      macronutrient: "carbs",
    },
    {
      grams: food.nutritionCorrections?.fatGrams ?? food.fatGrams,
      macronutrient: "fat",
    },
  ] satisfies readonly {
    readonly grams: number;
    readonly macronutrient: DominantMacronutrient;
  }[];

  const highestGrams = macronutrientGrams.reduce(
    (current, candidate) => Math.max(current, candidate.grams),
    0
  );

  if (highestGrams <= 0) {
    return [];
  }

  return macronutrientGrams.flatMap((item) =>
    item.grams === highestGrams ? [item.macronutrient] : []
  );
};

export const calculateEntryNutrients = ({
  food,
  nutritionMultiplier,
}: {
  readonly food: Food;
  readonly nutritionMultiplier: NutritionMultiplier;
}): typeof EntryNutrients.Encoded => {
  const nutrients = foodNutrition(food);
  return {
    energyKcal: nutrients.energyKcal * nutritionMultiplier,
    proteinGrams: nutrients.proteinGrams * nutritionMultiplier,
    carbsGrams: nutrients.carbsGrams * nutritionMultiplier,
    fatGrams: nutrients.fatGrams * nutritionMultiplier,
    ...(nutrients.fiberGrams === undefined
      ? {}
      : { fiberGrams: nutrients.fiberGrams * nutritionMultiplier }),
    ...(nutrients.sugarGrams === undefined
      ? {}
      : { sugarGrams: nutrients.sugarGrams * nutritionMultiplier }),
    ...(nutrients.saturatedFatGrams === undefined
      ? {}
      : {
          saturatedFatGrams: nutrients.saturatedFatGrams * nutritionMultiplier,
        }),
    ...(nutrients.saltGrams === undefined
      ? {}
      : { saltGrams: nutrients.saltGrams * nutritionMultiplier }),
  };
};

export const dateKeysInRange = ({
  endDateKey,
  startDateKey,
}: {
  readonly endDateKey: DateKey | string;
  readonly startDateKey: DateKey | string;
}) =>
  Effect.gen(function* () {
    const startDate = yield* _parseDateKey({
      boundary: "startDateKey",
      dateKey: startDateKey,
    });
    const endDate = yield* _parseDateKey({
      boundary: "endDateKey",
      dateKey: endDateKey,
    });

    if (startDate.utcNoonEpochMilliseconds > endDate.utcNoonEpochMilliseconds) {
      return [];
    }

    const dayCount =
      Math.floor(
        (endDate.utcNoonEpochMilliseconds -
          startDate.utcNoonEpochMilliseconds) /
          dayInMilliseconds
      ) + 1;

    return yield* Effect.forEach(
      Array.makeBy(dayCount, (dayIndex) => {
        const date = new Date(
          startDate.utcNoonEpochMilliseconds + dayIndex * dayInMilliseconds
        );

        return [
          date.getUTCFullYear().toString().padStart(4, "0"),
          (date.getUTCMonth() + 1).toString().padStart(2, "0"),
          date.getUTCDate().toString().padStart(2, "0"),
        ].join("-");
      }),
      (dateKey) =>
        Schema.decodeEffect(DateKeySchema)(dateKey).pipe(
          Effect.mapError(
            () =>
              new InvalidDateKey({
                boundary: "generatedDateKey",
                dateKey,
              })
          )
        )
    );
  });

function _parseDateKey({
  boundary,
  dateKey,
}: {
  readonly boundary: Exclude<DateKeyRangeBoundary, "generatedDateKey">;
  readonly dateKey: DateKey | string;
}): Effect.Effect<
  {
    readonly dateKey: DateKey;
    readonly utcNoonEpochMilliseconds: number;
  },
  InvalidDateKey
> {
  return Effect.gen(function* () {
    const decodedDateKey = yield* Schema.decodeEffect(DateKeySchema)(
      dateKey
    ).pipe(
      Effect.mapError(
        () =>
          new InvalidDateKey({
            boundary,
            dateKey,
          })
      )
    );
    const match = dateKeyPattern.exec(decodedDateKey);

    if (match === null) {
      return yield* new InvalidDateKey({
        boundary,
        dateKey,
      });
    }

    const [, yearString, monthString, dayString] = match;
    const year = Number(yearString);
    const month = Number(monthString);
    const day = Number(dayString);
    const date = new Date(0);

    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(12, 0, 0, 0);

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return yield* new InvalidDateKey({
        boundary,
        dateKey,
      });
    }

    return {
      dateKey: decodedDateKey,
      utcNoonEpochMilliseconds: date.getTime(),
    };
  });
}
