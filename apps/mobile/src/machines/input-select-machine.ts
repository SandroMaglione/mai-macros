import { Machine } from "@typeonce/effect-machine";

export const InputSelectDialogStates = Machine.state({
  states: { Closed: {}, Open: {} },
});

export const InputSelectDialogEvents = Machine.events({
  Close: {},
  Open: {},
});

export const InputSelectDialogMachine = Machine.make({
  id: "InputSelectDialog",
  root: InputSelectDialogStates,
  events: InputSelectDialogEvents,
}).handle({
  initial: { target: "Closed" },
  states: {
    Closed: { on: { Open: { target: "Open" } } },
    Open: { on: { Close: { target: "Closed" } } },
  },
});
