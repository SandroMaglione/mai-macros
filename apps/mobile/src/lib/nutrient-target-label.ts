import { Reporting, type Domain } from "@mai/nutrition";

export const nutrientTargetLabels = {
  minimum: { symbol: "≥", label: "Reach" },
  maximum: { symbol: "≤", label: "Limit" },
} satisfies Record<
  Domain.NutrientTargetSemantics,
  { readonly symbol: string; readonly label: string }
>;

export const nutrientTargetOptions = [
  {
    value: "minimum",
    label: `Reach target (up to ${Reporting.TargetOverageToleranceFraction * 100}% over)`,
  },
  { value: "maximum", label: "Stay at or below target" },
] as const;
