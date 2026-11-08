import { Machine } from "@typeonce/effect-machine";
import { Schema } from "effect";

export const NutrientBreakdownStates = Machine.state({
  fields: {
    expanded: Schema.Boolean,
    includeEstimates: Schema.Boolean,
  },
});

export const NutrientBreakdownEvents = Machine.events({
  ToggleEstimates: {},
  ToggleExpanded: {},
});

export const NutrientBreakdownMachine = Machine.make({
  id: "NutrientBreakdown",
  root: NutrientBreakdownStates,
  events: NutrientBreakdownEvents,
}).handle({
  root: { expanded: false, includeEstimates: true },
  on: {
    ToggleEstimates: {
      update: "root",
      data: ({ root }) => ({
        ...root,
        includeEstimates: !root.includeEstimates,
      }),
    },
    ToggleExpanded: {
      update: "root",
      data: ({ root }) => ({ ...root, expanded: !root.expanded }),
    },
  },
});
