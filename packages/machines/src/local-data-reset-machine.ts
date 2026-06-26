import { LocalData as NutritionLocalData } from "@mai/nutrition";
import { Effect } from "effect";
import {
  assertEvent,
  assign,
  fromPromise,
  setup,
  type ActorRefFrom,
  type SnapshotFrom,
} from "xstate";

import type { MachineRuntime } from "./runtime";

export type LocalDataResetEvent =
  | {
      readonly type: "begin";
    }
  | {
      readonly type: "cancel";
    }
  | {
      readonly confirmationText: string;
      readonly type: "changeConfirmationText";
    }
  | {
      readonly type: "reset";
    };

const ResetLocalData = Effect.gen(function* () {
  const localData = yield* NutritionLocalData.LocalData;

  yield* localData.reset;
});

const LocalDataResetErrorMessage = ({ error }: { readonly error: unknown }) =>
  error instanceof Error ? error.message : "Could not delete the local data.";

export const makeLocalDataResetMachine = ({
  restartApp,
  runtime,
}: {
  readonly restartApp: () => Promise<void> | void;
  readonly runtime: MachineRuntime<NutritionLocalData.LocalData>;
}) =>
  setup({
    types: {
      context: {} as {
        readonly confirmationText: string;
        readonly errorMessage: string | null;
      },
      events: {} as LocalDataResetEvent,
    },
    actors: {
      resetLocalData: fromPromise(async () => {
        await runtime.runPromise(ResetLocalData);
        await restartApp();
      }),
    },
    guards: {
      confirmationMatches: ({ context }) =>
        context.confirmationText ===
        NutritionLocalData.LocalDataResetConfirmationText,
    },
  }).createMachine({
    context: () => ({
      confirmationText: "",
      errorMessage: null,
    }),
    initial: "Idle",
    states: {
      Idle: {
        on: {
          begin: {
            target: "Confirming",
            actions: assign({
              confirmationText: "",
              errorMessage: null,
            }),
          },
        },
      },
      Confirming: {
        on: {
          cancel: {
            target: "Idle",
            actions: assign({
              confirmationText: "",
              errorMessage: null,
            }),
          },
          changeConfirmationText: {
            actions: assign(({ event }) => {
              assertEvent(event, "changeConfirmationText");

              return {
                confirmationText: event.confirmationText,
              };
            }),
          },
          reset: {
            guard: "confirmationMatches",
            target: "Resetting",
          },
        },
      },
      Failure: {
        on: {
          cancel: {
            target: "Idle",
            actions: assign({
              confirmationText: "",
              errorMessage: null,
            }),
          },
          changeConfirmationText: {
            actions: assign(({ event }) => {
              assertEvent(event, "changeConfirmationText");

              return {
                confirmationText: event.confirmationText,
              };
            }),
          },
          reset: {
            guard: "confirmationMatches",
            target: "Resetting",
          },
        },
      },
      Resetting: {
        invoke: {
          src: "resetLocalData",
          onDone: {
            target: "Reset",
          },
          onError: {
            target: "Failure",
            actions: assign(({ event }) => ({
              errorMessage: LocalDataResetErrorMessage({
                error: event.error,
              }),
            })),
          },
        },
      },
      Reset: {},
    },
  });

export type LocalDataResetMachine = ReturnType<
  typeof makeLocalDataResetMachine
>;
export type LocalDataResetActorRef = ActorRefFrom<LocalDataResetMachine>;
export type LocalDataResetSnapshot = SnapshotFrom<LocalDataResetMachine>;
