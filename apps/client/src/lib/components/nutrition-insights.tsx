import type { NutrientName } from "@mai/nutrition";
import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

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
        <header className="bg-[#ff5a51] pt-[calc(env(safe-area-inset-top)+0.45rem)] shadow-lg shadow-black/20">
          <div className="grid h-14 grid-cols-[1fr_auto_1fr] items-center px-4">
            <Link
              aria-label="Back to today"
              className="inline-flex size-12 items-center justify-center justify-self-start rounded-full text-white no-underline transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              title="Back to today"
              to="/"
            >
              <ChevronLeft aria-hidden="true" size={31} strokeWidth={2.6} />
            </Link>
            <h1 className="min-w-0 truncate text-center text-xl font-black leading-tight text-white">
              {title}
            </h1>
            <span aria-hidden="true" />
          </div>
        </header>

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
