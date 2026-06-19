import type { ReactNode } from "react";

export type FoodNutrientOverviewNutrients = {
  readonly energyKcal: number;
  readonly proteinGrams: number;
  readonly carbsGrams: number;
  readonly fatGrams: number;
  readonly fiberGrams?: number | undefined;
  readonly sugarGrams?: number | undefined;
  readonly saturatedFatGrams?: number | undefined;
  readonly saltGrams?: number | undefined;
};

const nutrientToneClassNames = {
  carbs: "text-[#ff4f8b]",
  energy: "text-[#4c7dff]",
  fat: "text-[#ffbd35]",
  protein: "text-[#4c7dff]",
  salt: "text-[#aaaab1]",
} satisfies Record<"carbs" | "energy" | "fat" | "protein" | "salt", string>;

export function FoodNutrientOverview({
  brand,
  metadata,
  name,
  nutrients,
  primaryLabel,
  secondaryLabel,
}: {
  readonly brand: string | undefined;
  readonly metadata?: ReactNode;
  readonly name: string;
  readonly nutrients: FoodNutrientOverviewNutrients | undefined;
  readonly primaryLabel?: string;
  readonly secondaryLabel?: string;
}) {
  const displayedPrimaryLabel =
    primaryLabel ??
    (nutrients === undefined
      ? "New"
      : `${formatFoodNutrientNumber({
          value: nutrients.energyKcal,
        })} kcal`);

  return (
    <div className="grid w-full gap-3 text-left text-[#f5f5f7]">
      <div className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
        <span className="min-w-0 font-extrabold leading-tight wrap-anywhere">
          {name}
        </span>
        <span className="text-right text-sm font-black leading-tight text-[#4c7dff]">
          {displayedPrimaryLabel}
        </span>
        <span className="grid min-w-0 gap-1 text-sm leading-tight text-[#aaaab1]">
          <span className="min-w-0 font-bold wrap-anywhere">
            {brand ?? "No brand"}
          </span>
          {metadata}
        </span>
        {secondaryLabel === undefined ? null : (
          <span className="text-right text-sm font-medium leading-tight text-[#aaaab1]">
            {secondaryLabel}
          </span>
        )}
      </div>

      {nutrients === undefined ? null : (
        <dl className="divide-y divide-[#29292d]">
          <FoodNutrientOverviewRow
            label="Carbs"
            textClassName={nutrientToneClassNames.carbs}
            value={nutrients.carbsGrams}
          />
          <FoodNutrientOverviewRow
            label="Protein"
            textClassName={nutrientToneClassNames.protein}
            value={nutrients.proteinGrams}
          />
          <FoodNutrientOverviewRow
            label="Fat"
            textClassName={nutrientToneClassNames.fat}
            value={nutrients.fatGrams}
          />
          <FoodNutrientOverviewRow
            label="Fiber"
            textClassName={nutrientToneClassNames.carbs}
            value={nutrients.fiberGrams}
          />
          <FoodNutrientOverviewRow
            label="Sugar"
            textClassName={nutrientToneClassNames.carbs}
            value={nutrients.sugarGrams}
          />
          <FoodNutrientOverviewRow
            label="Sat fat"
            textClassName={nutrientToneClassNames.fat}
            value={nutrients.saturatedFatGrams}
          />
          <FoodNutrientOverviewRow
            label="Salt"
            textClassName={nutrientToneClassNames.salt}
            value={nutrients.saltGrams}
          />
          <FoodNutrientOverviewRow
            label="Calories"
            textClassName={nutrientToneClassNames.energy}
            unit="kcal"
            value={nutrients.energyKcal}
          />
        </dl>
      )}
    </div>
  );
}

export function foodQuickInputNutrients({
  food,
}: {
  readonly food: {
    readonly energyKcalPer100g: number;
    readonly proteinGramsPer100g: number;
    readonly carbsGramsPer100g: number;
    readonly fatGramsPer100g: number;
    readonly fiberGramsPer100g?: number | undefined;
    readonly sugarGramsPer100g?: number | undefined;
    readonly saturatedFatGramsPer100g?: number | undefined;
    readonly saltGramsPer100g?: number | undefined;
  };
}): FoodNutrientOverviewNutrients {
  return {
    energyKcal: food.energyKcalPer100g,
    proteinGrams: food.proteinGramsPer100g,
    carbsGrams: food.carbsGramsPer100g,
    fatGrams: food.fatGramsPer100g,
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
    maximumFractionDigits: value > 0 && value < 10 ? 1 : 0,
  }).format(value);
}
