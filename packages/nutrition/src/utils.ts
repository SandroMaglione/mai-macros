import { Array, DateTime, Iterable, Option } from "effect";

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
  const startDate = _localDateTimeFromDateKey({ dateKey: startDateKey });
  const endDate = _localDateTimeFromDateKey({ dateKey: endDateKey });

  if (DateTime.isGreaterThan(startDate, endDate)) {
    return [];
  }

  const dates = Iterable.takeWhile(
    Iterable.makeBy<DateTime.DateTime>((days) =>
      DateTime.add(startDate, { days })
    ),
    (date) => DateTime.isLessThanOrEqualTo(date, endDate)
  );

  return Array.fromIterable(
    Iterable.map(dates, (date) => DateTime.formatIsoDate(date))
  );
};

const _localDateTimeFromDateKey = ({
  dateKey,
}: {
  readonly dateKey: DateKey | string;
}) =>
  DateTime.makeZoned(dateKey, {
    adjustForTimeZone: true,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }).pipe(Option.getOrThrow);
