import { LocalData as NutritionLocalData } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { Effect, Schema } from "effect";

export class LocalDataResetIdle extends Schema.TaggedClass<LocalDataResetIdle>(
  "LocalDataResetIdle"
)("LocalDataResetIdle", {}) {}

export class LocalDataResetConfirmation extends Schema.TaggedClass<LocalDataResetConfirmation>(
  "LocalDataResetConfirmation"
)("LocalDataResetConfirmation", { confirmationText: Schema.String }) {}

export class EditingResetConfirmation extends Schema.TaggedClass<EditingResetConfirmation>(
  "EditingResetConfirmation"
)("EditingResetConfirmation", {}) {}

export class LocalDataResetFailure extends Schema.TaggedClass<LocalDataResetFailure>(
  "LocalDataResetFailure"
)("LocalDataResetFailure", { message: Schema.String }) {}

export class LocalDataResetting extends Schema.TaggedClass<LocalDataResetting>(
  "LocalDataResetting"
)("LocalDataResetting", { confirmationText: Schema.String }) {}

export class LocalDataResetCompleted extends Schema.TaggedClass<LocalDataResetCompleted>(
  "LocalDataResetCompleted"
)("LocalDataResetCompleted", {}) {}

export class BeginReset extends Schema.TaggedClass<BeginReset>("BeginReset")(
  "BeginReset",
  {}
) {}

export class CancelReset extends Schema.TaggedClass<CancelReset>("CancelReset")(
  "CancelReset",
  {}
) {}

export class ChangeResetConfirmationText extends Schema.TaggedClass<ChangeResetConfirmationText>(
  "ChangeResetConfirmationText"
)("ChangeResetConfirmationText", { confirmationText: Schema.String }) {}

export class ConfirmLocalDataReset extends Schema.TaggedClass<ConfirmLocalDataReset>(
  "ConfirmLocalDataReset"
)("ConfirmLocalDataReset", {}) {}

class LocalDataResetSucceeded extends Schema.TaggedClass<LocalDataResetSucceeded>(
  "LocalDataResetSucceeded"
)("LocalDataResetSucceeded", {}) {}

class LocalDataResetFailed extends Schema.TaggedClass<LocalDataResetFailed>(
  "LocalDataResetFailed"
)("LocalDataResetFailed", { message: Schema.String }) {}

export const LocalDataResetStates = Machine.defineStates({
  Idle: LocalDataResetIdle,
  Confirmation: {
    schema: LocalDataResetConfirmation,
    initial: "Editing",
    states: {
      Editing: EditingResetConfirmation,
      Failure: LocalDataResetFailure,
    },
  },
  Resetting: LocalDataResetting,
  ResetCompleted: LocalDataResetCompleted,
});

export const makeLocalDataResetMachine = ({
  restartApp,
}: {
  readonly restartApp: Effect.Effect<void>;
}) => {
  const resetLocalData = Machine.invokeEffect({
    id: "resetLocalData",
    effect: Effect.gen(function* () {
      const localData = yield* NutritionLocalData.LocalData;
      yield* localData.reset;
      yield* restartApp;
    }),
    onFailure: (error) =>
      new LocalDataResetFailed({
        message:
          error instanceof Error
            ? error.message
            : "Could not delete the local data.",
      }),
    onSuccess: () => new LocalDataResetSucceeded(),
  });

  return Machine.make({
    id: "localDataReset",
    states: LocalDataResetStates.states,
    events: [
      BeginReset,
      CancelReset,
      ChangeResetConfirmationText,
      ConfirmLocalDataReset,
    ],
    internalEvents: [LocalDataResetSucceeded, LocalDataResetFailed],
    initial: () => LocalDataResetStates.initial.Idle(new LocalDataResetIdle()),
  }).handle({
    Idle: {
      on: {
        BeginReset: () =>
          LocalDataResetStates.initial.Confirmation(
            new LocalDataResetConfirmation({ confirmationText: "" }),
            (confirmation) =>
              confirmation.Editing(new EditingResetConfirmation())
          ),
      },
    },
    Confirmation: {
      on: {
        CancelReset: ({ target }) => target.full.Idle(new LocalDataResetIdle()),
      },
      states: {
        Editing: {
          on: {
            ChangeResetConfirmationText: ({ event, target }) =>
              target.full.Confirmation(
                new LocalDataResetConfirmation({
                  confirmationText: event.confirmationText,
                }),
                (confirmation) =>
                  confirmation.Editing(new EditingResetConfirmation())
              ),
            ConfirmLocalDataReset: ({ parents, target }) =>
              parents.Confirmation.confirmationText ===
              NutritionLocalData.LocalDataResetConfirmationText
                ? target.full.Resetting(
                    new LocalDataResetting({
                      confirmationText: parents.Confirmation.confirmationText,
                    })
                  )
                : undefined,
          },
        },
        Failure: {
          on: {
            ChangeResetConfirmationText: ({ event, state, target }) =>
              target.full.Confirmation(
                new LocalDataResetConfirmation({
                  confirmationText: event.confirmationText,
                }),
                (confirmation) => confirmation.Failure(state)
              ),
            ConfirmLocalDataReset: ({ parents, target }) =>
              parents.Confirmation.confirmationText ===
              NutritionLocalData.LocalDataResetConfirmationText
                ? target.full.Resetting(
                    new LocalDataResetting({
                      confirmationText: parents.Confirmation.confirmationText,
                    })
                  )
                : undefined,
          },
        },
      },
    },
    Resetting: {
      invoke: resetLocalData,
      on: {
        LocalDataResetSucceeded: ({ target }) =>
          target.full.ResetCompleted(new LocalDataResetCompleted()),
        LocalDataResetFailed: ({ event, state, target }) =>
          target.full.Confirmation(
            new LocalDataResetConfirmation({
              confirmationText: state.confirmationText,
            }),
            (confirmation) =>
              confirmation.Failure(
                new LocalDataResetFailure({ message: event.message })
              )
          ),
      },
    },
  });
};

export type LocalDataResetMachine = ReturnType<
  typeof makeLocalDataResetMachine
>;
export type LocalDataResetSnapshot = Machine.Machine.Snapshot<
  typeof LocalDataResetStates.states
>;
