import { LocalData as NutritionLocalData } from "@mai/nutrition";
import { Effect, Schema } from "effect";
import {
  createAsyncLogic,
  setup,
  type ActorRefFrom,
  type SnapshotFrom,
} from "xstate";
import type { MachineRuntime } from "./runtime";
import { EmptyEvent } from "./schemas";

export const makeLocalDataResetMachine = ({
  restartApp,
  runtime,
}: {
  readonly restartApp: Effect.Effect<void>;
  readonly runtime: MachineRuntime<NutritionLocalData.LocalData>;
}) =>
  setup({
    schemas: {
      events: {
        begin: Schema.toStandardSchemaV1(EmptyEvent),
        cancel: Schema.toStandardSchemaV1(EmptyEvent),
        reset: Schema.toStandardSchemaV1(EmptyEvent),
        changeConfirmationText: Schema.toStandardSchemaV1(
          Schema.Struct({
            confirmationText: Schema.String,
          })
        ),
      },
    },
    states: {
      Idle: {},
      ConfirmReset: {
        schemas: {
          context: Schema.toStandardSchemaV1(
            Schema.Struct({ confirmationText: Schema.String })
          ),
        },
      },
      Failure: {
        schemas: {
          context: Schema.toStandardSchemaV1(
            Schema.Struct({ message: Schema.String })
          ),
        },
      },
      Resetting: {},
      ResetCompleted: {},
    },
    actorSources: {
      resetLocalData: createAsyncLogic({
        run: () =>
          runtime.runPromise(
            Effect.gen(function* () {
              const localData = yield* NutritionLocalData.LocalData;

              yield* localData.reset;
              yield* restartApp;
            })
          ),
      }),
    },
    guards: {
      confirmationMatches: (params: { readonly confirmationText: string }) =>
        params.confirmationText ===
        NutritionLocalData.LocalDataResetConfirmationText,
    },
  }).createMachine({
    initial: "Idle",
    states: {
      Idle: {
        on: {
          begin: { target: "ConfirmReset", context: { confirmationText: "" } },
        },
      },
      ConfirmReset: {
        on: {
          cancel: { target: "Idle" },
          changeConfirmationText: ({ event }) => ({
            context: { confirmationText: event.confirmationText },
          }),
          reset: ({ guards, context }) =>
            guards.confirmationMatches({
              confirmationText: context.confirmationText,
            })
              ? { target: "Resetting" }
              : undefined,
        },
      },
      Resetting: {
        invoke: {
          src: "resetLocalData",
          onDone: { target: "ResetCompleted" },
          onError: ({ event }) => ({
            target: "Failure",
            context: {
              message:
                event.error instanceof Error
                  ? event.error.message
                  : "Could not delete the local data.",
            },
          }),
        },
      },
      Failure: {
        on: {
          cancel: { target: "Idle" },
          changeConfirmationText: ({ event }) => ({
            context: { confirmationText: event.confirmationText },
          }),
          reset: ({ guards, context }) =>
            guards.confirmationMatches({
              confirmationText: context.confirmationText,
            })
              ? { target: "Resetting" }
              : undefined,
        },
      },
      ResetCompleted: {},
    },
  });

export type LocalDataResetMachine = ReturnType<
  typeof makeLocalDataResetMachine
>;
export type LocalDataResetActorRef = ActorRefFrom<LocalDataResetMachine>;
export type LocalDataResetSnapshot = SnapshotFrom<LocalDataResetMachine>;
