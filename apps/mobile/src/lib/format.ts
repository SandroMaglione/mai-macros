import type { FoodFormMachine } from "@mai/machines";
import { Measurements, type Domain } from "@mai/nutrition";

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
  minimumFractionDigits = 0,
  value,
}: {
  readonly maximumFractionDigits?: number;
  readonly minimumFractionDigits?: number;
  readonly value: number;
}) =>
  new Intl.NumberFormat(undefined, {
    maximumFractionDigits,
    minimumFractionDigits,
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

export const formatShortDate = ({
  dateKey,
}: {
  readonly dateKey: Domain.DateKey;
}) => {
  const date = new Date(`${dateKey}T00:00:00`);

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
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
    carbsGrams: _nonNegativeFormNumber(values.carbsGrams),
    energyKcal: _nonNegativeFormNumber(values.energyKcal),
    fatGrams: _nonNegativeFormNumber(values.fatGrams),
    fiberGrams: _nonNegativeFormNumber(values.fiberGrams),
    proteinGrams: _nonNegativeFormNumber(values.proteinGrams),
    saltGrams: _nonNegativeFormNumber(values.saltGrams),
    saturatedFatGrams: _nonNegativeFormNumber(values.saturatedFatGrams),
    sugarGrams: _nonNegativeFormNumber(values.sugarGrams),
  };
}

export function foodNutrientOverviewPrimaryLabel({
  values,
}: {
  readonly values: FoodFormMachine.FoodFormValues;
}) {
  const energyKcal = _nonNegativeFormNumber(values.energyKcal);

  return energyKcal === undefined
    ? "Partial"
    : `${formatFoodNutrientNumber({ value: energyKcal })} kcal`;
}

export function formatLoggedFoodQuantity({
  quantity,
}: {
  readonly quantity: Domain.LoggedFoodQuantity;
}) {
  const value =
    quantity._tag === "MeasuredFoodQuantity" ? quantity.amount : quantity.count;
  const unit =
    quantity._tag === "MeasuredFoodQuantity"
      ? quantity.unit === "l"
        ? "L"
        : quantity.unit
      : `× ${quantity.portionName}`;

  return `${formatNumber({ maximumFractionDigits: 2, value })} ${unit}`;
}

export function mealEntryMassGrams({
  food,
  mealEntry,
}: {
  readonly food: Domain.Food;
  readonly mealEntry: Domain.MealEntry;
}) {
  return Measurements.massGramsFromQuantity({
    food,
    quantity: mealEntry.quantity,
  });
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
