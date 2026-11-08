import { Machine } from "@typeonce/effect-machine";
import { Schema } from "effect";

export const ChartDateLabelStates = Machine.state({
  fields: { dayIndex: Schema.NullOr(Schema.Number) },
});

export const ChartDateLabelEvents = Machine.events({
  Select: { dayIndex: Schema.NullOr(Schema.Number) },
});

export const ChartDateLabelMachine = Machine.make({
  id: "ChartDateLabel",
  root: ChartDateLabelStates,
  events: ChartDateLabelEvents,
}).handle({
  root: () => ({ dayIndex: null }),
  on: {
    Select: {
      update: "root",
      data: ({ event }) => ({ dayIndex: event.dayIndex }),
    },
  },
});
