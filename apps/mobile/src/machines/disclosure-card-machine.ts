import { Machine } from "@typeonce/effect-machine";

export const DisclosureCardStates = Machine.state({
  states: { Collapsed: {}, Expanded: {} },
});

export const DisclosureCardEvents = Machine.events({ Toggle: {} });

export const DisclosureCardMachine = Machine.make({
  id: "DisclosureCard",
  root: DisclosureCardStates,
  events: DisclosureCardEvents,
}).handle({
  initial: { target: "Collapsed" },
  states: {
    Collapsed: { on: { Toggle: { target: "Expanded" } } },
    Expanded: { on: { Toggle: { target: "Collapsed" } } },
  },
});
