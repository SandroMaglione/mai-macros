import { Domain, Foods } from "@mai/nutrition";

export function describeFoodChanges({
  draft,
  food,
}: {
  readonly draft: Omit<
    Foods.EditFoodDetailsInput,
    "foodId" | "nutritionReference"
  > & {
    readonly nutritionReference: NonNullable<
      Foods.EditFoodDetailsInput["nutritionReference"]
    >;
  };
  readonly food: Domain.Food;
}) {
  const changes: string[] = [];
  const addTextChange = ({
    after,
    before,
    label,
  }: {
    readonly after: string | undefined;
    readonly before: string | undefined;
    readonly label: string;
  }) => {
    const normalizedAfter = after?.trim() || undefined;
    const normalizedBefore = before?.trim() || undefined;
    if (normalizedAfter !== normalizedBefore) {
      changes.push(
        `${label}: ${_displayChangeValue(normalizedBefore)} → ${_displayChangeValue(normalizedAfter)}`
      );
    }
  };
  const addNumberChange = ({
    after,
    before,
    label,
    unit,
  }: {
    readonly after: string | undefined;
    readonly before: number | undefined;
    readonly label: string;
    readonly unit: string;
  }) => {
    const afterNumber = after === undefined ? undefined : Number(after);
    if (afterNumber !== before) {
      changes.push(
        `${label}: ${_displayNumberChangeValue({ unit, value: before })} → ${_displayNumberChangeValue({ unit, value: afterNumber })}`
      );
    }
  };

  addTextChange({ after: draft.name, before: food.name, label: "Name" });
  addTextChange({ after: draft.brand, before: food.brand, label: "Brand" });

  const previousReference = `${food.nutritionReference.amount} ${food.nutritionReference.unit}`;
  const nextReference = `${draft.nutritionReference.amount} ${draft.nutritionReference.unit}`;
  if (
    Number(draft.nutritionReference.amount) !==
      food.nutritionReference.amount ||
    draft.nutritionReference.unit !== food.nutritionReference.unit
  ) {
    changes.push(
      `Nutrition reference: ${previousReference} → ${nextReference}`
    );
  }

  addNumberChange({
    after: draft.energyKcal,
    before: food.energyKcal,
    label: "Calories",
    unit: "kcal",
  });
  addNumberChange({
    after: draft.fatGrams,
    before: food.fatGrams,
    label: "Fat",
    unit: "g",
  });
  addNumberChange({
    after: draft.saturatedFatGrams,
    before: food.saturatedFatGrams,
    label: "Saturated fat",
    unit: "g",
  });
  addNumberChange({
    after: draft.carbsGrams,
    before: food.carbsGrams,
    label: "Carbs",
    unit: "g",
  });
  addNumberChange({
    after: draft.sugarGrams,
    before: food.sugarGrams,
    label: "Sugar",
    unit: "g",
  });
  addNumberChange({
    after: draft.fiberGrams,
    before: food.fiberGrams,
    label: "Fiber",
    unit: "g",
  });
  addNumberChange({
    after: draft.proteinGrams,
    before: food.proteinGrams,
    label: "Protein",
    unit: "g",
  });
  addNumberChange({
    after: draft.saltGrams,
    before: food.saltGrams,
    label: "Salt",
    unit: "g",
  });

  const previousConversion = food.massVolumeConversion;
  const nextConversion = draft.massVolumeConversion;
  if (previousConversion === undefined && nextConversion !== undefined) {
    changes.push(
      `Added weight/volume conversion (${nextConversion.mass.amount} ${nextConversion.mass.unit} = ${nextConversion.volume.amount} ${nextConversion.volume.unit})`
    );
  } else if (previousConversion !== undefined && nextConversion === undefined) {
    changes.push("Removed weight/volume conversion");
  } else if (
    previousConversion !== undefined &&
    nextConversion !== undefined &&
    (previousConversion.mass.amount !== Number(nextConversion.mass.amount) ||
      previousConversion.mass.unit !== nextConversion.mass.unit ||
      previousConversion.volume.amount !==
        Number(nextConversion.volume.amount) ||
      previousConversion.volume.unit !== nextConversion.volume.unit)
  ) {
    changes.push(
      `Weight/volume conversion: ${previousConversion.mass.amount} ${previousConversion.mass.unit} = ${previousConversion.volume.amount} ${previousConversion.volume.unit} → ${nextConversion.mass.amount} ${nextConversion.mass.unit} = ${nextConversion.volume.amount} ${nextConversion.volume.unit}`
    );
  }

  return changes;
}

function _displayChangeValue(value: string | undefined) {
  return value === undefined ? "Not set" : `“${value}”`;
}

function _displayNumberChangeValue({
  unit,
  value,
}: {
  readonly unit: string;
  readonly value: number | undefined;
}) {
  return value === undefined ? "Not set" : `${value} ${unit}`;
}
