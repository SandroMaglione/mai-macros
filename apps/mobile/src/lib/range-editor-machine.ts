import { Machine } from "@typeonce/effect-machine";
import { Schema } from "effect";

export const RangeEditorEvents = Machine.events({
  open: { start: Schema.String, end: Schema.String },
  close: {},
  start: { value: Schema.String },
  end: { value: Schema.String },
  invalid: {},
});

export const rangeEditorMachine = Machine.make({
  id: "RangeEditor",
  root: Machine.state({
    initial: "Closed",
    states: {
      Closed: {},
      Open: {
        fields: {
          start: Schema.String,
          end: Schema.String,
          message: Schema.NullOr(Schema.String),
        },
      },
    },
  }),
  events: RangeEditorEvents,
}).handle({
  on: {
    open: (to) =>
      to.local.Open().from(({ event }) => ({
        start: event.start,
        end: event.end,
        message: null,
      })),
  },
  states: {
    Open: {
      on: {
        close: (to) => to.local.Closed(),
        start: (to) =>
          to.self.update.from(({ current, event }) => ({
            ...current,
            start: event.value,
            message: null,
          })),
        end: (to) =>
          to.self.update.from(({ current, event }) => ({
            ...current,
            end: event.value,
            message: null,
          })),
        invalid: (to) =>
          to.self.update.from(({ current }) => ({
            ...current,
            message:
              "Enter valid dates as YYYY-MM-DD, with From on or before To.",
          })),
      },
    },
  },
});
