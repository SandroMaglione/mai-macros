import { Machine } from "@typeonce/effect-machine";
import { Schema } from "effect";

export const RangeEditorEvents = Machine.events({
  open: { start: Schema.String, end: Schema.String },
  close: {},
  start: { value: Schema.String },
  end: { value: Schema.String },
  invalid: {},
});

const RangeEditorStates = Machine.state({
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
});

const targets = Machine.targets(RangeEditorStates);

export const rangeEditorMachine = Machine.make({
  id: "RangeEditor",
  root: RangeEditorStates,
  events: RangeEditorEvents,
}).handle({
  initial: { target: targets.root.Closed },
  on: {
    open: {
      target: targets.root.Open,
      data: ({ event }) => ({
        start: event.start,
        end: event.end,
        message: null,
      }),
    },
  },
  states: {
    Open: {
      on: {
        close: { target: targets.root.Closed },
        start: {
          update: targets.root.Open,
          data: ({ state: current, event }) => ({
            ...current,
            start: event.value,
            message: null,
          }),
        },
        end: {
          update: targets.root.Open,
          data: ({ state: current, event }) => ({
            ...current,
            end: event.value,
            message: null,
          }),
        },
        invalid: {
          update: targets.root.Open,
          data: ({ state: current }) => ({
            ...current,
            message:
              "Enter valid dates as YYYY-MM-DD, with From on or before To.",
          }),
        },
      },
    },
  },
});
