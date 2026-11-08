import { Machine } from "@typeonce/effect-machine";

export const FoodSearchOrderDialogStates = Machine.state({
  states: { Closed: {}, Open: {} },
});

export const FoodSearchOrderDialogEvents = Machine.events({
  Close: {},
  Open: {},
});

export const FoodSearchOrderDialogMachine = Machine.make({
  id: "FoodSearchOrderDialog",
  root: FoodSearchOrderDialogStates,
  events: FoodSearchOrderDialogEvents,
}).handle({
  initial: { target: "Closed" },
  states: {
    Closed: { on: { Open: { target: "Open" } } },
    Open: { on: { Close: { target: "Closed" } } },
  },
});
