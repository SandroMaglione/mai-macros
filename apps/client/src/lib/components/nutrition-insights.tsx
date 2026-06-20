import type { NutrientName } from "@mai/nutrition";
import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

import { AppHeader, appHeaderActionClassName } from "./app-header.tsx";

export const reportPrimaryNutrients = [
  "energyKcal",
  "proteinGrams",
  "carbsGrams",
  "fatGrams",
] as const satisfies readonly NutrientName[];

export const reportTrackedNutrients = [
  "energyKcal",
  "proteinGrams",
  "carbsGrams",
  "fatGrams",
  "fiberGrams",
  "sugarGrams",
  "saturatedFatGrams",
  "saltGrams",
] as const satisfies readonly NutrientName[];

export const reportNutrientLabels = {
  carbsGrams: "Carbs",
  energyKcal: "Calories",
  fatGrams: "Fat",
  fiberGrams: "Fiber",
  proteinGrams: "Protein",
  saltGrams: "Salt",
  saturatedFatGrams: "Sat fat",
  sugarGrams: "Sugar",
} satisfies Record<NutrientName, string>;

export const reportNutrientUnits = {
  carbsGrams: "g",
  energyKcal: "kcal",
  fatGrams: "g",
  fiberGrams: "g",
  proteinGrams: "g",
  saltGrams: "g",
  saturatedFatGrams: "g",
  sugarGrams: "g",
} satisfies Record<NutrientName, "g" | "kcal">;

export const reportNutrientToneClassNames = {
  carbsGrams: "text-[#ff4f8b]",
  energyKcal: "text-[#4c7dff]",
  fatGrams: "text-[#ffbd35]",
  fiberGrams: "text-[#74d99f]",
  proteinGrams: "text-[#79a0ff]",
  saltGrams: "text-[#aaaab1]",
  saturatedFatGrams: "text-[#ffbd35]",
  sugarGrams: "text-[#ff7aa9]",
} satisfies Record<NutrientName, string>;

export function NutritionInsightsLayout({
  children,
  title,
}: {
  readonly children: ReactNode;
  readonly title: string;
}) {
  return (
    <main className="min-h-screen bg-[#090909] text-[#e9e9ed]">
      <section className="mx-auto min-h-screen w-full max-w-[720px] bg-[#090909] pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        <AppHeader
          leading={
            <Link
              aria-label="Back to today"
              className={appHeaderActionClassName}
              title="Back to today"
              to="/"
            >
              <ChevronLeft aria-hidden="true" size={31} strokeWidth={2.6} />
            </Link>
          }
          shadow={true}
          title={title}
        />

        <div className="grid gap-8 px-4 py-6">{children}</div>
      </section>
    </main>
  );
}

export function formatReportNumber({ value }: { readonly value: number }) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: value > 0 && value < 10 ? 1 : 0,
  }).format(value);
}

export function formatReportSignedNumber({
  unit,
  value,
}: {
  readonly unit: "g" | "kcal";
  readonly value: number;
}) {
  const formatted = formatReportNumber({ value: Math.abs(value) });

  if (value === 0) {
    return `0 ${unit}`;
  }

  return `${value > 0 ? "+" : "-"}${formatted} ${unit}`;
}

export function formatReportNutrient({
  nutrientName,
  value,
}: {
  readonly nutrientName: NutrientName;
  readonly value: number;
}) {
  const unit = reportNutrientUnits[nutrientName];
  const formatted = formatReportNumber({ value });

  return unit === "kcal" ? `${formatted} kcal` : `${formatted}g`;
}
