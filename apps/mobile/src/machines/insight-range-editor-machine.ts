import { Machine } from "@typeonce/effect-machine";
import { Schema } from "effect";

export const InsightRangeEditorStates = Machine.state({
  fields: {
    end: Schema.String,
    message: Schema.NullOr(Schema.String),
    start: Schema.String,
  },
  states: { Closed: {}, Open: {} },
});

export const InsightRangeEditorEvents = Machine.events({
  ChangeEnd: { value: Schema.String },
  ChangeStart: { value: Schema.String },
  Close: {},
  Invalid: {},
  Open: { end: Schema.String, start: Schema.String },
});

export const InsightRangeEditorMachine = Machine.make({
  id: "InsightRangeEditor",
  root: InsightRangeEditorStates,
  events: InsightRangeEditorEvents,
}).handle({
  root: () => ({ end: "", message: null, start: "" }),
  initial: { target: "Closed" },
  states: {
    Closed: {
      on: {
        Open: {
          target: "Open",
          update: "root",
          data: ({ event }) => ({
            target: undefined,
            update: { end: event.end, message: null, start: event.start },
          }),
        },
      },
    },
    Open: {
      on: {
        ChangeEnd: {
          update: "root",
          data: ({ root, event }) => ({
            ...root,
            end: event.value,
            message: null,
          }),
        },
        ChangeStart: {
          update: "root",
          data: ({ root, event }) => ({
            ...root,
            message: null,
            start: event.value,
          }),
        },
        Close: { target: "Closed" },
        Invalid: {
          update: "root",
          data: ({ root }) => ({
            ...root,
            message:
              "Enter valid dates as YYYY-MM-DD, with From on or before To.",
          }),
        },
      },
    },
  },
});
