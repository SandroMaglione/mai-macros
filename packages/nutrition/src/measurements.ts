import { Data, Effect, Option, Schema } from "effect";

import {
  type Food,
  LoggedFoodQuantity,
  type MassUnit,
  MeasuredQuantity,
  MeasurementAmount,
  type MeasurementUnit,
  NutritionMultiplier,
  type VolumeUnit,
} from "./domain.ts";

const gramsPerMassUnit = {
  g: 1,
  kg: 1_000,
  oz: 28.349_523_125,
  lb: 453.592_37,
} satisfies Record<MassUnit, number>;

const millilitersPerVolumeUnit = {
  ml: 1,
  l: 1_000,
} satisfies Record<VolumeUnit, number>;

export class IncompatibleFoodMeasurement extends Data.TaggedError(
  "IncompatibleFoodMeasurement"
)<{
  readonly sourceUnit: MeasurementUnit;
  readonly targetUnit: MeasurementUnit;
}> {}

export const isMassUnit = (unit: MeasurementUnit): unit is MassUnit =>
  unit === "g" || unit === "kg" || unit === "oz" || unit === "lb";

export const isVolumeUnit = (unit: MeasurementUnit): unit is VolumeUnit =>
  unit === "ml" || unit === "l";

export const baseMeasurementAmount = ({
  quantity,
}: {
  readonly quantity: typeof MeasuredQuantity.Encoded;
}) =>
  isMassUnit(quantity.unit)
    ? quantity.amount * gramsPerMassUnit[quantity.unit]
    : quantity.amount * millilitersPerVolumeUnit[quantity.unit];

export const measuredQuantityFromLoggedQuantity = ({
  quantity,
}: {
  readonly quantity: LoggedFoodQuantity;
}): typeof MeasuredQuantity.Encoded =>
  quantity._tag === "MeasuredFoodQuantity"
    ? {
        amount: quantity.amount,
        unit: quantity.unit,
      }
    : {
        amount: quantity.portionSize.amount * quantity.count,
        unit: quantity.portionSize.unit,
      };

export const convertMeasuredQuantity = ({
  food,
  quantity,
  targetUnit,
}: {
  readonly food: Food;
  readonly quantity: typeof MeasuredQuantity.Encoded;
  readonly targetUnit: MeasurementUnit;
}) =>
  Effect.gen(function* () {
    const convertedAmount = _convertedMeasurementAmount({
      food,
      quantity,
      targetUnit,
    });

    if (convertedAmount === undefined) {
      return yield* new IncompatibleFoodMeasurement({
        sourceUnit: quantity.unit,
        targetUnit,
      });
    }

    return yield* Schema.decodeEffect(MeasurementAmount)(convertedAmount);
  });

export const nutritionMultiplierFromQuantity = ({
  food,
  quantity,
}: {
  readonly food: Food;
  readonly quantity: LoggedFoodQuantity;
}) =>
  convertMeasuredQuantity({
    food,
    quantity: measuredQuantityFromLoggedQuantity({ quantity }),
    targetUnit: food.nutritionReference.unit,
  }).pipe(
    Effect.flatMap((referenceAmount) =>
      Schema.decodeEffect(NutritionMultiplier)(
        referenceAmount / food.nutritionReference.amount
      )
    )
  );

export const massGramsFromQuantity = ({
  food,
  quantity,
}: {
  readonly food: Food;
  readonly quantity: LoggedFoodQuantity;
}): number | undefined =>
  _convertedMeasurementAmount({
    food,
    quantity: measuredQuantityFromLoggedQuantity({ quantity }),
    targetUnit: "g",
  });

export const volumeMillilitersFromQuantity = ({
  food,
  quantity,
}: {
  readonly food: Food;
  readonly quantity: LoggedFoodQuantity;
}): number | undefined =>
  _convertedMeasurementAmount({
    food,
    quantity: measuredQuantityFromLoggedQuantity({ quantity }),
    targetUnit: "ml",
  });

export const nutritionMultiplierFromQuantityOption = ({
  food,
  quantity,
}: {
  readonly food: Food;
  readonly quantity: LoggedFoodQuantity;
}) => {
  const referenceAmount = _convertedMeasurementAmount({
    food,
    quantity: measuredQuantityFromLoggedQuantity({ quantity }),
    targetUnit: food.nutritionReference.unit,
  });

  return referenceAmount === undefined
    ? Option.none()
    : Schema.decodeOption(NutritionMultiplier)(
        referenceAmount / food.nutritionReference.amount
      );
};

function _convertedMeasurementAmount({
  food,
  quantity,
  targetUnit,
}: {
  readonly food: Food;
  readonly quantity: typeof MeasuredQuantity.Encoded;
  readonly targetUnit: MeasurementUnit;
}): number | undefined {
  const sourceBaseAmount = baseMeasurementAmount({ quantity });

  if (isMassUnit(quantity.unit) && isMassUnit(targetUnit)) {
    return sourceBaseAmount / gramsPerMassUnit[targetUnit];
  }

  if (isVolumeUnit(quantity.unit) && isVolumeUnit(targetUnit)) {
    return sourceBaseAmount / millilitersPerVolumeUnit[targetUnit];
  }

  if (food.massVolumeConversion === undefined) {
    return undefined;
  }

  const conversionMassGrams =
    food.massVolumeConversion.mass.amount *
    gramsPerMassUnit[food.massVolumeConversion.mass.unit];
  const conversionVolumeMilliliters =
    food.massVolumeConversion.volume.amount *
    millilitersPerVolumeUnit[food.massVolumeConversion.volume.unit];

  if (isMassUnit(quantity.unit) && isVolumeUnit(targetUnit)) {
    const milliliters =
      (sourceBaseAmount / conversionMassGrams) * conversionVolumeMilliliters;

    return milliliters / millilitersPerVolumeUnit[targetUnit];
  }

  if (isVolumeUnit(quantity.unit) && isMassUnit(targetUnit)) {
    const grams =
      (sourceBaseAmount / conversionVolumeMilliliters) * conversionMassGrams;

    return grams / gramsPerMassUnit[targetUnit];
  }

  return undefined;
}
