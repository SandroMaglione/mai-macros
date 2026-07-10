import { Domain, Measurements, Utils } from "@mai/nutrition";
import { Option, Schema } from "effect";

import { formatNumber } from "./format";

export const MealEntryQuantityFormInput = Schema.Union([
  Schema.TaggedStruct("MeasuredFoodQuantity", {
    amount: Schema.String,
    unit: Domain.MeasurementUnit,
  }),
  Schema.TaggedStruct("PortionFoodQuantity", {
    count: Schema.String,
    portionId: Domain.FoodPortionId,
  }),
]);

export type MealEntryQuantityFormInput = typeof MealEntryQuantityFormInput.Type;

export type FoodQuantitySelection = {
  readonly portionId: Domain.FoodPortionId | null;
  readonly quantityAmount: string;
  readonly quantityUnit: Domain.MeasurementUnit;
};

export function measurementUnitFromValue({
  fallback,
  value,
}: {
  readonly fallback: Domain.MeasurementUnit;
  readonly value: string;
}): Domain.MeasurementUnit {
  return value === "g" ||
    value === "kg" ||
    value === "oz" ||
    value === "lb" ||
    value === "ml" ||
    value === "l"
    ? value
    : fallback;
}

export function quantitySelectionFromLoggedQuantity({
  food,
  quantity,
}: {
  readonly food: Domain.Food | null;
  readonly quantity: Domain.LoggedFoodQuantity | undefined;
}): FoodQuantitySelection {
  if (quantity?._tag === "MeasuredFoodQuantity") {
    return {
      portionId: null,
      quantityAmount: formatNumber({
        maximumFractionDigits: 2,
        value: quantity.amount,
      }),
      quantityUnit: quantity.unit,
    };
  }

  if (
    quantity?._tag === "PortionFoodQuantity" &&
    food?.portions.some((portion) => portion.id === quantity.portionId) === true
  ) {
    return {
      portionId: quantity.portionId,
      quantityAmount: formatNumber({
        maximumFractionDigits: 2,
        value: quantity.count,
      }),
      quantityUnit: quantity.portionSize.unit,
    };
  }

  return {
    portionId: null,
    quantityAmount: "",
    quantityUnit: food?.nutritionReference.unit ?? "g",
  };
}

export function mealEntryQuantityInputFromSelection({
  portionId,
  quantityAmount,
  quantityUnit,
}: FoodQuantitySelection): MealEntryQuantityFormInput {
  return portionId === null
    ? {
        _tag: "MeasuredFoodQuantity",
        amount: quantityAmount,
        unit: quantityUnit,
      }
    : {
        _tag: "PortionFoodQuantity",
        count: quantityAmount,
        portionId,
      };
}

export function loggedQuantityFromForm({
  food,
  portionId,
  quantityAmount,
  quantityUnit,
}: FoodQuantitySelection & { readonly food: Domain.Food }) {
  const amount = Number(quantityAmount);
  const portion =
    portionId === null
      ? undefined
      : food.portions.find((candidate) => candidate.id === portionId);

  return portion === undefined
    ? Schema.decodeOption(Domain.LoggedFoodQuantity)({
        _tag: "MeasuredFoodQuantity",
        amount,
        unit: quantityUnit,
      })
    : Schema.decodeOption(Domain.LoggedFoodQuantity)({
        _tag: "PortionFoodQuantity",
        count: amount,
        portionId: portion.id,
        portionName: portion.name,
        portionSize: portion.size,
      });
}

export function nutrientsFromLoggedQuantity({
  food,
  quantity,
}: {
  readonly food: Domain.Food;
  readonly quantity: Domain.LoggedFoodQuantity;
}) {
  return Measurements.nutritionMultiplierFromQuantityOption({
    food,
    quantity,
  }).pipe(
    Option.match({
      onNone: () => undefined,
      onSome: (nutritionMultiplier) =>
        Utils.calculateEntryNutrients({ food, nutritionMultiplier }),
    })
  );
}

export function availableMeasurementUnits({
  food,
}: {
  readonly food: Domain.Food;
}): readonly Domain.MeasurementUnit[] {
  if (food.massVolumeConversion !== undefined) {
    return ["g", "kg", "oz", "lb", "ml", "l"];
  }

  return Measurements.isMassUnit(food.nutritionReference.unit)
    ? ["g", "kg", "oz", "lb"]
    : ["ml", "l"];
}
