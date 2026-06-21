import type {
  DateKey,
  EntryNutrients,
  Food,
  Plan,
  QuantityGrams,
} from "./domain.ts";

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
}) => {
  const dateKeyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
  const parseDateKey = ({
    dateKey,
  }: {
    readonly dateKey: DateKey | string;
  }) => {
    const match = dateKeyPattern.exec(dateKey);

    if (match === null) {
      throw new RangeError(`Invalid date key: ${dateKey}`);
    }

    const [, yearString, monthString, dayString] = match;
    const year = Number(yearString);
    const month = Number(monthString);
    const day = Number(dayString);
    const date = new Date(year, month - 1, day, 12);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      throw new RangeError(`Invalid date key: ${dateKey}`);
    }

    return date;
  };
  const formatDateKey = ({ date }: { readonly date: Date }) =>
    [
      date.getFullYear().toString().padStart(4, "0"),
      (date.getMonth() + 1).toString().padStart(2, "0"),
      date.getDate().toString().padStart(2, "0"),
    ].join("-");
  const startDate = parseDateKey({ dateKey: startDateKey });
  const endDate = parseDateKey({ dateKey: endDateKey });

  if (startDate > endDate) {
    return [];
  }

  const dateKeys: string[] = [];
  const cursor = new Date(startDate);

  while (cursor <= endDate) {
    dateKeys.push(formatDateKey({ date: cursor }));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dateKeys;
};
