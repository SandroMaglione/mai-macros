import { Machine } from "@typeonce/effect-machine";

export const MealComparisonStates = Machine.state({
  states: { Collapsed: {}, Expanded: {} },
});

export const MealComparisonEvents = Machine.events({ Toggle: {} });

export const MealComparisonMachine = Machine.make({
  id: "MealComparison",
  root: MealComparisonStates,
  events: MealComparisonEvents,
}).handle({
  initial: { target: "Collapsed" },
  states: {
    Collapsed: { on: { Toggle: { target: "Expanded" } } },
    Expanded: { on: { Toggle: { target: "Collapsed" } } },
  },
});
