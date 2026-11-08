import * as Domain from "@mai/nutrition/domain";
import * as BodyWeights from "@mai/nutrition/services/body-weights";
import { Machine } from "@typeonce/effect-machine";
import { Effect, Schema } from "effect";

import { formatNumber } from "../lib/format.ts";

function _entryInput({
  entry,
}: {
  readonly entry: Domain.BodyWeightEntry | null;
}) {
  return entry === null
    ? ""
    : formatNumber({
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
        value: entry.weightKilograms,
      });
}

export const DailyBodyWeightStates = Machine.state({
  fields: {
    dateKey: Domain.DateKey,
    entry: Schema.NullOr(Domain.BodyWeightEntry),
    message: Schema.NullOr(Schema.String),
    weightInput: Schema.String,
  },
  states: {
    Deleting: {},
    Failed: {},
    Idle: {},
    Loading: {},
    Saving: {},
  },
});

export const DailyBodyWeightEvents = Machine.events({
  ChangeWeight: { value: Schema.String },
  DeleteWeight: {},
  Retry: {},
  Save: {},
});

export const DailyBodyWeightMachine = Machine.make({
  id: "DailyBodyWeight",
  root: DailyBodyWeightStates,
  events: DailyBodyWeightEvents,
  input: Schema.Struct({ dateKey: Domain.DateKey }),
  effects: {
    deleteWeight: (dateKey: Domain.DateKey) =>
      Effect.gen(function* () {
        const bodyWeights = yield* BodyWeights.BodyWeights;

        yield* bodyWeights.delete({ input: { dateKey } });
      }),
    loadWeight: (dateKey: Domain.DateKey) =>
      Effect.gen(function* () {
        const bodyWeights = yield* BodyWeights.BodyWeights;
        return yield* bodyWeights.findByDate({ input: { dateKey } });
      }),
    saveWeight: (input: {
      readonly dateKey: Domain.DateKey;
      readonly weightInput: string;
    }) =>
      Effect.gen(function* () {
        const bodyWeights = yield* BodyWeights.BodyWeights;
        const saved = yield* bodyWeights.save({
          input: {
            dateKey: input.dateKey,
            weightKilograms: input.weightInput,
          },
        });

        return { _tag: "Saved" as const, entry: saved.bodyWeightEntry };
      }).pipe(
        Effect.catchTag("SchemaError", () =>
          Effect.succeed({ _tag: "ValidationFailure" as const })
        )
      ),
  },
}).handle({
  root: ({ input }) => ({
    dateKey: input.dateKey,
    entry: null,
    message: null,
    weightInput: "",
  }),
  initial: { target: "Loading" },
  states: {
    Loading: {
      invoke: {
        src: "loadWeight",
        input: ({ root }) => root.dateKey,
        onDone: {
          target: "Idle",
          update: "root",
          data: ({ output, root }) => ({
            target: undefined,
            update: {
              dateKey: root.dateKey,
              entry: output,
              message: null,
              weightInput: _entryInput({ entry: output }),
            },
          }),
        },
        onFailure: {
          target: "Failed",
          update: "root",
          data: ({ root }) => ({
            target: undefined,
            update: {
              ...root,
              message: "Could not load the weight for this day.",
            },
          }),
        },
      },
    },
    Idle: {
      on: {
        ChangeWeight: {
          update: "root",
          data: ({ root, event }) => ({
            ...root,
            message: null,
            weightInput: event.value,
          }),
        },
        DeleteWeight: {
          target: "Deleting",
          guard: ({ root }) => root.entry !== null,
        },
        Save: { target: "Saving" },
      },
    },
    Saving: {
      invoke: {
        src: "saveWeight",
        input: ({ root }) => ({
          dateKey: root.dateKey,
          weightInput: root.weightInput,
        }),
        onDone: {
          target: "Idle",
          update: "root",
          data: ({ output, root }) => ({
            target: undefined,
            update:
              output._tag === "Saved"
                ? {
                    dateKey: root.dateKey,
                    entry: output.entry,
                    message: null,
                    weightInput: _entryInput({ entry: output.entry }),
                  }
                : {
                    ...root,
                    message: "Enter a positive weight in kilograms.",
                  },
          }),
        },
        onFailure: {
          target: "Idle",
          update: "root",
          data: ({ root }) => ({
            target: undefined,
            update: { ...root, message: "Could not save this weight." },
          }),
        },
      },
    },
    Deleting: {
      invoke: {
        src: "deleteWeight",
        input: ({ root }) => root.dateKey,
        onDone: {
          target: "Idle",
          update: "root",
          data: ({ root }) => ({
            target: undefined,
            update: {
              dateKey: root.dateKey,
              entry: null,
              message: null,
              weightInput: "",
            },
          }),
        },
        onFailure: {
          target: "Idle",
          update: "root",
          data: ({ root }) => ({
            target: undefined,
            update: { ...root, message: "Could not delete this weight." },
          }),
        },
      },
    },
    Failed: {
      on: {
        Retry: {
          target: "Loading",
          update: "root",
          data: ({ root }) => ({
            target: undefined,
            update: { ...root, message: null },
          }),
        },
      },
    },
  },
});
