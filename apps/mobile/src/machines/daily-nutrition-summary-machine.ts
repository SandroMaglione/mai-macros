import { Machine } from "@typeonce/effect-machine";
import { Schema } from "effect";

import { dailySummaryNutrients } from "../lib/daily-summary-nutrients.ts";

const SummaryNutrient = Schema.Literals(
  dailySummaryNutrients.map(({ name }) => name)
);

export const DailyNutritionSummaryStates = Machine.state({
  fields: {
    mode: Schema.Literals(["consumed", "remaining"]),
    nutrient: SummaryNutrient,
    pinned: Schema.Boolean,
  },
});

export const DailyNutritionSummaryEvents = Machine.events({
  SelectNutrient: { nutrient: SummaryNutrient },
  SetPinned: { pinned: Schema.Boolean },
  Toggle: {},
});

export const DailyNutritionSummaryMachine = Machine.make({
  id: "DailyNutritionSummary",
  root: DailyNutritionSummaryStates,
  events: DailyNutritionSummaryEvents,
}).handle({
  root: { mode: "consumed", nutrient: "energyKcal", pinned: false },
  on: {
    SelectNutrient: {
      update: "root",
      data: ({ root, event }) => ({ ...root, nutrient: event.nutrient }),
    },
    SetPinned: {
      update: "root",
      data: ({ root, event }) => ({ ...root, pinned: event.pinned }),
    },
    Toggle: {
      update: "root",
      data: ({ root }) => ({
        ...root,
        mode: root.mode === "consumed" ? "remaining" : "consumed",
      }),
    },
  },
});
