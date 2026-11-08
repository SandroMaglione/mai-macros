import { LocalData as NutritionLocalData } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { Context, Effect, Schema } from "effect";

export class AppRestart extends Context.Service<
  AppRestart,
  {
    readonly restart: Effect.Effect<void>;
  }
>()("@mai/machines/AppRestart") {}

export const LocalDataResetStates = Machine.state({
  states: {
    Idle: {},
    Confirming: {
      fields: { confirmationText: Schema.String },
      states: {
        Prompting: {
          states: {
            Editing: {},
            Failed: { fields: { message: Schema.String } },
          },
        },
        Resetting: {},
      },
    },
    ResetCompleted: {},
  },
});

export const LocalDataResetEvents = Machine.events({
  Begin: {},
  Cancel: {},
  ChangeConfirmationText: { confirmationText: Schema.String },
  Reset: {},
});

export const LocalDataResetMachine = Machine.make({
  id: "LocalDataReset",
  root: LocalDataResetStates,
  events: LocalDataResetEvents,
  effects: {
    resetLocalData: Effect.gen(function* () {
      const localData = yield* NutritionLocalData.LocalData;
      const appRestart = yield* AppRestart;

      yield* localData.reset;
      yield* appRestart.restart;
    }),
  },
}).handle({
  initial: { target: "Idle" },
  states: {
    Idle: {
      on: {
        Begin: { target: "Confirming", data: { confirmationText: "" } },
      },
    },
    Confirming: {
      initial: { target: "Confirming.Prompting" },
      states: {
        Prompting: {
          initial: { target: "Confirming.Prompting.Editing" },
          on: {
            Cancel: { target: "Idle" },
            ChangeConfirmationText: {
              update: "Confirming",
              data: ({ event }) => ({
                confirmationText: event.confirmationText,
              }),
            },
            Reset: {
              target: "Confirming.Resetting",
              guard: ({ ancestors }) =>
                ancestors.Confirming.confirmationText ===
                NutritionLocalData.LocalDataResetConfirmationText,
            },
          },
          states: {
            Editing: {},
            Failed: {},
          },
        },
        Resetting: {
          invoke: {
            src: "resetLocalData",
            onDone: { target: "ResetCompleted" },
            onFailure: {
              target: "Confirming.Prompting.Failed",
              data: ({ error }) => ({
                message:
                  error.message === ""
                    ? "Could not delete the local data."
                    : error.message,
              }),
            },
          },
        },
      },
    },
    ResetCompleted: {},
  },
});
