import type { FoodFormMachine } from "@mai/machines";
import type { Domain } from "@mai/nutrition";

export type FoodNutrientOverviewNutrients = {
  readonly carbsGrams?: number | undefined;
  readonly energyKcal?: number | undefined;
  readonly fatGrams?: number | undefined;
  readonly fiberGrams?: number | undefined;
  readonly proteinGrams?: number | undefined;
  readonly saltGrams?: number | undefined;
  readonly saturatedFatGrams?: number | undefined;
  readonly sugarGrams?: number | undefined;
};

export const formatNumber = ({
  maximumFractionDigits = 1,
  value,
}: {
  readonly maximumFractionDigits?: number;
  readonly value: number;
}) =>
  new Intl.NumberFormat(undefined, {
    maximumFractionDigits,
  }).format(value);

export const formatDateTitle = ({
  dateKey,
}: {
  readonly dateKey: Domain.DateKey;
}) => {
  const date = new Date(`${dateKey}T00:00:00`);

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    weekday: "short",
  }).format(date);
};

export function formatFoodNutrientNumber({
  value,
}: {
  readonly value: number;
}) {
  return formatNumber({
    maximumFractionDigits: 2,
    value,
  });
}

export function foodNutrientOverviewFromFormValues({
  values,
}: {
  readonly values: FoodFormMachine.FoodFormValues;
}): FoodNutrientOverviewNutrients {
  return {
    carbsGrams: _nonNegativeFormNumber(values.carbsGramsPer100g),
    energyKcal: _nonNegativeFormNumber(values.energyKcalPer100g),
    fatGrams: _nonNegativeFormNumber(values.fatGramsPer100g),
    fiberGrams: _nonNegativeFormNumber(values.fiberGramsPer100g),
    proteinGrams: _nonNegativeFormNumber(values.proteinGramsPer100g),
    saltGrams: _nonNegativeFormNumber(values.saltGramsPer100g),
    saturatedFatGrams: _nonNegativeFormNumber(values.saturatedFatGramsPer100g),
    sugarGrams: _nonNegativeFormNumber(values.sugarGramsPer100g),
  };
}

export function foodNutrientOverviewPrimaryLabel({
  values,
}: {
  readonly values: FoodFormMachine.FoodFormValues;
}) {
  const energyKcal = _nonNegativeFormNumber(values.energyKcalPer100g);

  return energyKcal === undefined
    ? "Partial"
    : `${formatFoodNutrientNumber({ value: energyKcal })} kcal`;
}

function _nonNegativeFormNumber(value: string) {
  const trimmedValue = value.trim();

  if (trimmedValue === "") {
    return undefined;
  }

  const parsedValue = Number(trimmedValue.replace(",", "."));

  return Number.isFinite(parsedValue) && parsedValue >= 0
    ? parsedValue
    : undefined;
}
