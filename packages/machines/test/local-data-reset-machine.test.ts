import { assert, describe, it } from "@effect/vitest";
import { LocalData as NutritionLocalData } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect, Layer, Option } from "effect";

import {
  AppRestart,
  LocalDataResetEvents,
  LocalDataResetMachine,
  LocalDataResetStates,
} from "../src/local-data-reset-machine.ts";

const _services = ({
  reset,
  restarts,
}: {
  readonly reset: Effect.Effect<void, NutritionLocalData.LocalDataResetError>;
  readonly restarts: string[];
}) =>
  Layer.mergeAll(
    Layer.mock(NutritionLocalData.LocalData, { reset }),
    Layer.mock(AppRestart, {
      restart: Effect.sync(() => {
        restarts.push("restart");
      }),
    })
  );

describe("LocalDataResetMachine", () => {
  it.effect(
    "guards reset behind the confirmation text and keeps it on cancel",
    () =>
      Effect.gen(function* () {
        const trace = yield* MachineTest.run(LocalDataResetMachine, {
          events: [
            LocalDataResetEvents.Begin(),
            LocalDataResetEvents.Reset(),
            LocalDataResetEvents.ChangeConfirmationText({
              confirmationText: "Delete all",
            }),
            LocalDataResetEvents.Reset(),
            LocalDataResetEvents.Cancel(),
            LocalDataResetEvents.Begin(),
            LocalDataResetEvents.ChangeConfirmationText({
              confirmationText:
                NutritionLocalData.LocalDataResetConfirmationText,
            }),
            LocalDataResetEvents.Reset(),
          ],
        });

        yield* MachineTest.verify(LocalDataResetMachine, trace);
        assert.deepStrictEqual(
          trace.steps.map(({ after }) => after.state.path),
          [
            "Confirming",
            "Confirming",
            "Confirming",
            "Confirming",
            "Idle",
            "Confirming",
            "Confirming",
            "Confirming",
          ]
        );
        assert.deepStrictEqual(
          trace.steps.map(({ after }) =>
            LocalDataResetStates.matches(after, "Confirming.Resetting")
          ),
          [false, false, false, false, false, false, false, true]
        );
        assert.deepStrictEqual(
          trace.steps.map(({ after }) =>
            Option.getOrUndefined(
              Option.map(
                LocalDataResetStates.get(after, "Confirming"),
                ({ confirmationText }) => confirmationText
              )
            )
          ),
          [
            "",
            "",
            "Delete all",
            "Delete all",
            undefined,
            "",
            NutritionLocalData.LocalDataResetConfirmationText,
            NutritionLocalData.LocalDataResetConfirmationText,
          ]
        );

        const coverage = MachineTest.coverage(LocalDataResetMachine, trace);

        assert.deepStrictEqual(
          coverage.transitions.definitions.misses.map(
            ({ source, trigger }) => `${source}:${trigger.type}`
          ),
          ["Confirming.Resetting:invoke", "Confirming.Resetting:invoke"]
        );
      })
  );

  it.effect("reports whether reset is currently accepted", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(LocalDataResetMachine, {
        events: [
          LocalDataResetEvents.Begin(),
          LocalDataResetEvents.ChangeConfirmationText({
            confirmationText: NutritionLocalData.LocalDataResetConfirmationText,
          }),
        ],
      });
      const [begun, confirmed] = trace.steps;

      assert.isDefined(begun);
      assert.isDefined(confirmed);
      assert.isFalse(
        yield* Machine.can(
          LocalDataResetMachine,
          begun.after,
          LocalDataResetEvents.Reset()
        )
      );
      assert.isTrue(
        yield* Machine.can(
          LocalDataResetMachine,
          confirmed.after,
          LocalDataResetEvents.Reset()
        )
      );
    })
  );

  it.live("resets local data, restarts the app and completes", () => {
    const restarts: string[] = [];

    return Effect.gen(function* () {
      const reset = yield* Machine.start(LocalDataResetMachine);

      yield* reset.send(LocalDataResetEvents.Begin());
      yield* reset.send(
        LocalDataResetEvents.ChangeConfirmationText({
          confirmationText: NutritionLocalData.LocalDataResetConfirmationText,
        })
      );
      yield* reset.send(LocalDataResetEvents.Reset());
      yield* Machine.waitFor(reset, ({ state }) =>
        LocalDataResetStates.matches(state, "ResetCompleted")
      );

      assert.deepStrictEqual(restarts, ["restart"]);
    }).pipe(
      Effect.provide(_services({ reset: Effect.void, restarts })),
      Effect.scoped
    );
  });

  it.live(
    "shows the failure, keeps the confirmation text and allows retry",
    () => {
      const restarts: string[] = [];

      return Effect.gen(function* () {
        const reset = yield* Machine.start(LocalDataResetMachine);

        yield* reset.send(LocalDataResetEvents.Begin());
        yield* reset.send(
          LocalDataResetEvents.ChangeConfirmationText({
            confirmationText: NutritionLocalData.LocalDataResetConfirmationText,
          })
        );
        yield* reset.send(LocalDataResetEvents.Reset());
        const failed = yield* Machine.waitFor(reset, ({ state }) =>
          LocalDataResetStates.matches(state, "Confirming.Prompting.Failed")
        );

        assert.deepStrictEqual(
          Option.map(
            LocalDataResetStates.get(
              failed.state,
              "Confirming.Prompting.Failed"
            ),
            ({ message }) => message
          ),
          Option.some("Could not delete the local data.")
        );
        assert.deepStrictEqual(
          Option.map(
            LocalDataResetStates.get(failed.state, "Confirming"),
            ({ confirmationText }) => confirmationText
          ),
          Option.some(NutritionLocalData.LocalDataResetConfirmationText)
        );
        assert.deepStrictEqual(restarts, []);

        yield* reset.send(LocalDataResetEvents.Cancel());
        yield* Machine.waitFor(reset, ({ state }) =>
          LocalDataResetStates.matches(state, "Idle")
        );
      }).pipe(
        Effect.provide(
          _services({
            reset: Effect.fail(
              new NutritionLocalData.LocalDataResetError({ cause: "locked" })
            ),
            restarts,
          })
        ),
        Effect.scoped
      );
    }
  );
});
