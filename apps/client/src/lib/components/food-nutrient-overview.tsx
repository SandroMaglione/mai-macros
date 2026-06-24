import type { ReactNode } from "react";

export type FoodNutrientOverviewNutrients = {
  readonly energyKcal?: number | undefined;
  readonly proteinGrams?: number | undefined;
  readonly carbsGrams?: number | undefined;
  readonly fatGrams?: number | undefined;
  readonly fiberGrams?: number | undefined;
  readonly sugarGrams?: number | undefined;
  readonly saturatedFatGrams?: number | undefined;
  readonly saltGrams?: number | undefined;
};

export type FoodNutrientOverviewNutrientName =
  | "carbsGrams"
  | "energyKcal"
  | "fatGrams"
  | "fiberGrams"
  | "proteinGrams"
  | "saltGrams"
  | "saturatedFatGrams"
  | "sugarGrams";

const nutrientToneClassNames = {
  carbs: "text-[#ff4f8b]",
  energy: "text-[#4c7dff]",
  fat: "text-[#ffbd35]",
  protein: "text-[#4c7dff]",
  salt: "text-[#aaaab1]",
} satisfies Record<"carbs" | "energy" | "fat" | "protein" | "salt", string>;

const defaultFoodNutrientOverviewOrder = [
  "carbsGrams",
  "proteinGrams",
  "fatGrams",
  "fiberGrams",
  "sugarGrams",
  "saturatedFatGrams",
  "saltGrams",
  "energyKcal",
] satisfies readonly FoodNutrientOverviewNutrientName[];

export const foodQuickInputNutrientOverviewOrder = [
  "energyKcal",
  "fatGrams",
  "saturatedFatGrams",
  "carbsGrams",
  "sugarGrams",
  "fiberGrams",
  "proteinGrams",
  "saltGrams",
] satisfies readonly FoodNutrientOverviewNutrientName[];

const foodNutrientOverviewRows = {
  carbsGrams: {
    label: "Carbs",
    textClassName: nutrientToneClassNames.carbs,
    unit: "g",
  },
  energyKcal: {
    label: "Calories",
    textClassName: nutrientToneClassNames.energy,
    unit: "kcal",
  },
  fatGrams: {
    label: "Fat",
    textClassName: nutrientToneClassNames.fat,
    unit: "g",
  },
  fiberGrams: {
    label: "Fiber",
    textClassName: nutrientToneClassNames.carbs,
    unit: "g",
  },
  proteinGrams: {
    label: "Protein",
    textClassName: nutrientToneClassNames.protein,
    unit: "g",
  },
  saltGrams: {
    label: "Salt",
    textClassName: nutrientToneClassNames.salt,
    unit: "g",
  },
  saturatedFatGrams: {
    label: "Sat fat",
    textClassName: nutrientToneClassNames.fat,
    unit: "g",
  },
  sugarGrams: {
    label: "Sugar",
    textClassName: nutrientToneClassNames.carbs,
    unit: "g",
  },
} satisfies Record<
  FoodNutrientOverviewNutrientName,
  {
    readonly label: string;
    readonly textClassName: string;
    readonly unit: "g" | "kcal";
  }
>;

export function FoodNutrientOverview({
  brand,
  metadata,
  name,
  namePrefix,
  nutrients,
  nutrientOrder = defaultFoodNutrientOverviewOrder,
  primaryLabel,
  secondaryLabel,
}: {
  readonly brand: string | undefined;
  readonly metadata?: ReactNode;
  readonly name: string;
  readonly namePrefix?: ReactNode;
  readonly nutrients: FoodNutrientOverviewNutrients | undefined;
  readonly nutrientOrder?: readonly FoodNutrientOverviewNutrientName[];
  readonly primaryLabel?: string;
  readonly secondaryLabel?: string;
}) {
  const displayedPrimaryLabel =
    primaryLabel ??
    (nutrients?.energyKcal === undefined
      ? "New"
      : `${formatFoodNutrientNumber({
          value: nutrients.energyKcal,
        })} kcal`);

  return (
    <div className="grid w-full gap-3 text-left text-[#f5f5f7]">
      <div className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
        <span className="min-w-0 text-sm font-bold leading-tight wrap-anywhere">
          {namePrefix}
          {name}
        </span>
        <span className="text-right text-sm font-black leading-tight text-[#f5f5f7]">
          {displayedPrimaryLabel}
        </span>
        <span className="grid min-w-0 gap-1 text-xs leading-tight text-[#aaaab1]">
          <span
            aria-hidden={brand === undefined || brand.trim() === ""}
            className="min-h-[1em] min-w-0 font-normal wrap-anywhere"
          >
            {brand}
          </span>
          {metadata}
        </span>
        <span
          aria-hidden={secondaryLabel === undefined}
          className="min-h-[1em] text-right text-xs font-medium leading-tight text-[#aaaab1]"
        >
          {secondaryLabel}
        </span>
      </div>

      {nutrients === undefined ? null : (
        <dl className="divide-y divide-[#29292d]">
          {nutrientOrder.map((nutrientName) => {
            const row = foodNutrientOverviewRows[nutrientName];

            return (
              <FoodNutrientOverviewRow
                key={nutrientName}
                label={row.label}
                textClassName={row.textClassName}
                unit={row.unit}
                value={nutrients[nutrientName]}
              />
            );
          })}
        </dl>
      )}
    </div>
  );
}

export function foodQuickInputNutrients({
  food,
}: {
  readonly food: {
    readonly energyKcalPer100g?: number | undefined;
    readonly proteinGramsPer100g?: number | undefined;
    readonly carbsGramsPer100g?: number | undefined;
    readonly fatGramsPer100g?: number | undefined;
    readonly fiberGramsPer100g?: number | undefined;
    readonly sugarGramsPer100g?: number | undefined;
    readonly saturatedFatGramsPer100g?: number | undefined;
    readonly saltGramsPer100g?: number | undefined;
  };
}): FoodNutrientOverviewNutrients {
  return {
    ...(food.energyKcalPer100g === undefined
      ? {}
      : { energyKcal: food.energyKcalPer100g }),
    ...(food.proteinGramsPer100g === undefined
      ? {}
      : { proteinGrams: food.proteinGramsPer100g }),
    ...(food.carbsGramsPer100g === undefined
      ? {}
      : { carbsGrams: food.carbsGramsPer100g }),
    ...(food.fatGramsPer100g === undefined
      ? {}
      : { fatGrams: food.fatGramsPer100g }),
    ...(food.fiberGramsPer100g === undefined
      ? {}
      : { fiberGrams: food.fiberGramsPer100g }),
    ...(food.sugarGramsPer100g === undefined
      ? {}
      : { sugarGrams: food.sugarGramsPer100g }),
    ...(food.saturatedFatGramsPer100g === undefined
      ? {}
      : { saturatedFatGrams: food.saturatedFatGramsPer100g }),
    ...(food.saltGramsPer100g === undefined
      ? {}
      : { saltGrams: food.saltGramsPer100g }),
  };
}

function FoodNutrientOverviewRow({
  label,
  textClassName,
  unit = "g",
  value,
}: {
  readonly label: string;
  readonly textClassName: string;
  readonly unit?: "g" | "kcal";
  readonly value: number | undefined;
}) {
  return (
    <div className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2">
      <dt
        className={`truncate text-sm font-medium leading-tight ${textClassName}`}
      >
        {label}
      </dt>
      <dd
        className={`truncate text-right text-sm font-black leading-tight ${textClassName}`}
      >
        {value === undefined
          ? "n/a"
          : unit === "kcal"
            ? formatFoodNutrientNumber({ value })
            : `${formatFoodNutrientNumber({ value })}g`}
      </dd>
    </div>
  );
}

export function formatFoodNutrientNumber({
  value,
}: {
  readonly value: number;
}) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(value);
}
