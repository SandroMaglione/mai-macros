import type {
  NutrientName,
  NutrientTargetSemantics,
  NutrientTargetStatus,
} from "@mai/nutrition";
import { Link } from "@tanstack/react-router";
import { Activity, CalendarDays, ChevronLeft, ListChecks } from "lucide-react";
import type { ReactNode } from "react";

export const reportPrimaryNutrients = [
  "energyKcal",
  "proteinGrams",
  "carbsGrams",
  "fatGrams",
] as const satisfies readonly NutrientName[];

export const reportSecondaryNutrients = [
  "fiberGrams",
  "sugarGrams",
  "saturatedFatGrams",
  "saltGrams",
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

export const reportNutrientDotClassNames = {
  carbsGrams: "bg-[#ff4f8b]",
  energyKcal: "bg-[#4c7dff]",
  fatGrams: "bg-[#ffbd35]",
  fiberGrams: "bg-[#74d99f]",
  proteinGrams: "bg-[#79a0ff]",
  saltGrams: "bg-[#aaaab1]",
  saturatedFatGrams: "bg-[#ffbd35]",
  sugarGrams: "bg-[#ff7aa9]",
} satisfies Record<NutrientName, string>;

type InsightsRoute = "calendar" | "range" | "week";

const navLinkClassName =
  "inline-flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-md border px-1 text-[0.68rem] font-black leading-tight no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffbd35]/45";
const activeNavLinkClassName =
  "border-[#5a3b26] bg-[#2a1d14] text-[#ffbd35] hover:bg-[#322216]";
const inactiveNavLinkClassName =
  "border-transparent text-[#dfd2bd] hover:border-[#5a3b26] hover:bg-[#2a1d14]";

export function NutritionInsightsLayout({
  activeRoute,
  children,
  title,
}: {
  readonly activeRoute: InsightsRoute;
  readonly children: ReactNode;
  readonly title: string;
}) {
  return (
    <main className="min-h-screen bg-[#090909] text-[#e9e9ed]">
      <section className="mx-auto min-h-screen w-full max-w-[720px] bg-[#090909] pb-[calc(env(safe-area-inset-bottom)+5.75rem)]">
        <header className="bg-[#ff5a51] px-4 pt-[calc(env(safe-area-inset-top)+0.55rem)] pb-2 shadow-lg shadow-black/20">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
            <Link
              aria-label="Back to today"
              className="inline-flex size-9 items-center justify-center rounded-md border border-white/20 bg-white/10 text-white no-underline transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              to="/"
            >
              <ChevronLeft aria-hidden="true" size={18} strokeWidth={3} />
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-black leading-tight text-white">
                {title}
              </h1>
            </div>
          </div>
        </header>

        <div className="grid gap-8 px-4 py-6">{children}</div>
        <nav
          aria-label="Nutrition insight views"
          className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
        >
          <div className="mx-auto grid w-full max-w-[520px] grid-cols-3 gap-1.5 rounded-lg border border-[#3d332a] bg-[#15120f]/95 p-1.5 shadow-[0_-12px_32px_rgb(0_0_0/0.36)] backdrop-blur">
            <Link
              className={`${navLinkClassName} ${
                activeRoute === "range"
                  ? activeNavLinkClassName
                  : inactiveNavLinkClassName
              }`}
              to="/insights"
            >
              <ListChecks aria-hidden="true" size={18} strokeWidth={3} />
              Summary
            </Link>
            <Link
              className={`${navLinkClassName} ${
                activeRoute === "week"
                  ? activeNavLinkClassName
                  : inactiveNavLinkClassName
              }`}
              to="/insights/week"
            >
              <Activity aria-hidden="true" size={18} strokeWidth={3} />7 days
            </Link>
            <Link
              className={`${navLinkClassName} ${
                activeRoute === "calendar"
                  ? activeNavLinkClassName
                  : inactiveNavLinkClassName
              }`}
              to="/insights/calendar"
            >
              <CalendarDays aria-hidden="true" size={18} strokeWidth={3} />
              Month
            </Link>
          </div>
        </nav>
      </section>
    </main>
  );
}

export function TargetStatusPill({
  status,
}: {
  readonly status: NutrientTargetStatus;
}) {
  const statusText = targetStatusText({ status });

  return (
    <span
      className={`inline-flex min-h-7 items-center justify-center rounded-md border px-2 text-xs font-black ${targetStatusClassName(
        { status }
      )}`}
    >
      {statusText}
    </span>
  );
}

export function targetStatusText({
  status,
}: {
  readonly status: NutrientTargetStatus;
}) {
  if (status.status === "inside") {
    return "On plan";
  }

  if (status.semantics === "maximum") {
    return "High";
  }

  if (status.semantics === "minimum") {
    return "Low";
  }

  return status.status === "above" ? "High" : "Low";
}

export function targetStatusClassName({
  status,
}: {
  readonly status: NutrientTargetStatus;
}) {
  if (status.status === "inside") {
    return "border-[#1f5f38] bg-[#102417] text-[#74d99f]";
  }

  if (status.status === "above") {
    return "border-[#74322f] bg-[#201717] text-[#ff5a51]";
  }

  return "border-[#51421c] bg-[#211d13] text-[#ffbd35]";
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

export function targetSemanticsLabel({
  semantics,
}: {
  readonly semantics: NutrientTargetSemantics;
}) {
  const labelBySemantics = {
    maximum: "Limit",
    minimum: "Goal",
    range: "Range",
  } satisfies Record<NutrientTargetSemantics, string>;

  return labelBySemantics[semantics];
}
