import { Array, Data, Effect, Schema } from "effect";

import type {
  DateKey,
  EntryNutrients,
  Food,
  Plan,
  QuantityGrams,
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

export const findDominantMacronutrient = ({
  food,
}: {
  readonly food: Pick<
    Food,
    "carbsGramsPer100g" | "fatGramsPer100g" | "proteinGramsPer100g"
  >;
}): DominantMacronutrient | null => {
  const macronutrientEnergy = [
    {
      energyKcal: food.proteinGramsPer100g * 4,
      macronutrient: "protein",
    },
    {
      energyKcal: food.carbsGramsPer100g * 4,
      macronutrient: "carbs",
    },
    {
      energyKcal: food.fatGramsPer100g * 9,
      macronutrient: "fat",
    },
  ] satisfies readonly {
    readonly energyKcal: number;
    readonly macronutrient: DominantMacronutrient;
  }[];

  const dominant = macronutrientEnergy.reduce((current, candidate) =>
    candidate.energyKcal > current.energyKcal ? candidate : current
  );

  if (
    dominant.energyKcal <= 0 ||
    macronutrientEnergy.some(
      (item) =>
        item.macronutrient !== dominant.macronutrient &&
        item.energyKcal === dominant.energyKcal
    )
  ) {
    return null;
  }

  return dominant.macronutrient;
};

export const calculateEntryNutrients = ({
  food,
  quantityGrams,
}: {
  readonly food: Food;
  readonly quantityGrams: QuantityGrams;
}): typeof EntryNutrients.Encoded => {
  const multiplier = quantityGrams / 100;

  return {
    energyKcal: food.energyKcalPer100g * multiplier,
    proteinGrams: food.proteinGramsPer100g * multiplier,
    carbsGrams: food.carbsGramsPer100g * multiplier,
    fatGrams: food.fatGramsPer100g * multiplier,
    ...(food.fiberGramsPer100g === undefined
      ? {}
      : { fiberGrams: food.fiberGramsPer100g * multiplier }),
    ...(food.sugarGramsPer100g === undefined
      ? {}
      : { sugarGrams: food.sugarGramsPer100g * multiplier }),
    ...(food.saturatedFatGramsPer100g === undefined
      ? {}
      : { saturatedFatGrams: food.saturatedFatGramsPer100g * multiplier }),
    ...(food.saltGramsPer100g === undefined
      ? {}
      : { saltGrams: food.saltGramsPer100g * multiplier }),
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
