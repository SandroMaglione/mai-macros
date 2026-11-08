import { describe, expect, it } from "@effect/vitest";
import * as Domain from "@mai/nutrition/domain";
import * as BodyWeights from "@mai/nutrition/services/body-weights";
import * as Store from "@mai/nutrition/services/store";
import { Machine } from "@typeonce/effect-machine";
import { MachineTest } from "@typeonce/effect-machine/testing";
import { Effect, Layer, Schema } from "effect";

import {
  DailyBodyWeightEvents,
  DailyBodyWeightMachine,
  DailyBodyWeightStates,
} from "@/machines/daily-body-weight-machine";

const _dateKey = Domain.DateKey.make("2026-11-08");

const _entry = ({ weightKilograms }: { readonly weightKilograms: number }) =>
  Schema.decodeEffect(Domain.BodyWeightEntry)({
    createdAt: 100,
    dateKey: _dateKey,
    updatedAt: 100,
    weightKilograms,
  });

const _storeError = new Store.NutritionStoreError({ cause: "unavailable" });

const _schemaError = Effect.flatMap(
  Schema.decodeEffect(Domain.DateKey)("not a date"),
  () => Effect.die("unreachable")
);

describe("DailyBodyWeightMachine", () => {
  it.effect("ignores edits until the weight has loaded", () =>
    Effect.gen(function* () {
      const trace = yield* MachineTest.run(DailyBodyWeightMachine, {
        input: { dateKey: _dateKey },
        events: [
          DailyBodyWeightEvents.ChangeWeight({ value: "80" }),
          DailyBodyWeightEvents.Save(),
          DailyBodyWeightEvents.DeleteWeight(),
          DailyBodyWeightEvents.Retry(),
        ],
      });

      yield* MachineTest.verify(DailyBodyWeightMachine, trace);
      expect(trace.finalConfiguration).toContain("Loading");
      expect(trace.final.value).toMatchObject({
        dateKey: _dateKey,
        entry: null,
        message: null,
        weightInput: "",
      });

      const coverage = MachineTest.coverage(DailyBodyWeightMachine, trace);
      expect(coverage.transitions.definitions.hit).toBe(0);
      expect(coverage.transitions.definitions.missing).toBe(
        coverage.transitions.definitions.total
      );
    })
  );

  it.live("loads, saves and deletes the weight for the day", () =>
    Effect.gen(function* () {
      const existing = yield* _entry({ weightKilograms: 80.5 });
      const updated = yield* _entry({ weightKilograms: 79.25 });
      const saved: BodyWeights.SaveBodyWeightInput[] = [];
      const deleted: BodyWeights.BodyWeightDateKeyInput[] = [];
      const machine = yield* Machine.start(DailyBodyWeightMachine, {
        dateKey: _dateKey,
      }).pipe(
        Effect.provide(
          Layer.mock(BodyWeights.BodyWeights, {
            findByDate: () => Effect.succeed(existing),
            save: ({ input }) =>
              Effect.sync(() => {
                saved.push(input);

                return new BodyWeights.SavedBodyWeightEntry({
                  bodyWeightEntry: updated,
                  previousBodyWeightEntry: existing,
                });
              }),
            delete: ({ input }) =>
              Effect.sync(() => {
                deleted.push(input);

                return new BodyWeights.DeletedBodyWeightEntry({
                  bodyWeightEntry: updated,
                });
              }),
          })
        )
      );
      const loaded = yield* Machine.waitFor(machine, ({ state }) =>
        DailyBodyWeightStates.matches(state, "Idle")
      );

      expect(loaded.state.value.weightInput).toBe("80.50");
      expect(loaded.state.value.entry?.weightKilograms).toBe(80.5);

      yield* machine.send(
        DailyBodyWeightEvents.ChangeWeight({ value: "79.25" })
      );
      yield* machine.send(DailyBodyWeightEvents.Save());
      const afterSave = yield* Machine.waitFor(
        machine,
        ({ state }) =>
          DailyBodyWeightStates.matches(state, "Idle") &&
          state.value.entry?.weightKilograms === 79.25
      );

      expect(saved).toEqual([{ dateKey: _dateKey, weightKilograms: "79.25" }]);
      expect(afterSave.state.value).toMatchObject({
        message: null,
        weightInput: "79.25",
      });

      yield* machine.send(DailyBodyWeightEvents.DeleteWeight());
      const afterDelete = yield* Machine.waitFor(
        machine,
        ({ state }) =>
          DailyBodyWeightStates.matches(state, "Idle") &&
          state.value.entry === null
      );

      expect(deleted).toEqual([{ dateKey: _dateKey }]);
      expect(afterDelete.state.value).toMatchObject({
        message: null,
        weightInput: "",
      });
    }).pipe(Effect.scoped)
  );

  it.live("reports validation and storage failures inline", () =>
    Effect.gen(function* () {
      const machine = yield* Machine.start(DailyBodyWeightMachine, {
        dateKey: _dateKey,
      }).pipe(
        Effect.provide(
          Layer.mock(BodyWeights.BodyWeights, {
            findByDate: () => Effect.succeed(null),
            save: ({ input }) =>
              input.weightKilograms === "abc"
                ? _schemaError
                : Effect.fail(_storeError),
          })
        )
      );

      yield* Machine.waitFor(machine, ({ state }) =>
        DailyBodyWeightStates.matches(state, "Idle")
      );
      yield* machine.send(DailyBodyWeightEvents.DeleteWeight());
      yield* machine.send(DailyBodyWeightEvents.ChangeWeight({ value: "abc" }));
      const edited = yield* Machine.waitFor(
        machine,
        ({ state }) => state.value.weightInput === "abc"
      );

      expect(DailyBodyWeightStates.matches(edited.state, "Idle")).toBe(true);

      yield* machine.send(DailyBodyWeightEvents.Save());
      const invalid = yield* Machine.waitFor(
        machine,
        ({ state }) =>
          DailyBodyWeightStates.matches(state, "Idle") &&
          state.value.message !== null
      );

      expect(invalid.state.value.message).toBe(
        "Enter a positive weight in kilograms."
      );

      yield* machine.send(DailyBodyWeightEvents.ChangeWeight({ value: "80" }));
      const cleared = yield* Machine.waitFor(
        machine,
        ({ state }) => state.value.weightInput === "80"
      );

      expect(cleared.state.value.message).toBeNull();

      yield* machine.send(DailyBodyWeightEvents.Save());
      const failed = yield* Machine.waitFor(
        machine,
        ({ state }) =>
          DailyBodyWeightStates.matches(state, "Idle") &&
          state.value.message !== null
      );

      expect(failed.state.value).toMatchObject({
        message: "Could not save this weight.",
        weightInput: "80",
      });
    }).pipe(Effect.scoped)
  );

  it.live("shows a retryable load failure", () =>
    Effect.gen(function* () {
      const existing = yield* _entry({ weightKilograms: 81 });
      const attempts: number[] = [];
      const machine = yield* Machine.start(DailyBodyWeightMachine, {
        dateKey: _dateKey,
      }).pipe(
        Effect.provide(
          Layer.mock(BodyWeights.BodyWeights, {
            findByDate: () =>
              Effect.suspend(() => {
                attempts.push(attempts.length);

                return attempts.length === 1
                  ? Effect.fail(_storeError)
                  : Effect.succeed(existing);
              }),
          })
        )
      );
      const failed = yield* Machine.waitFor(machine, ({ state }) =>
        DailyBodyWeightStates.matches(state, "Failed")
      );

      expect(failed.state.value.message).toBe(
        "Could not load the weight for this day."
      );

      yield* machine.send(DailyBodyWeightEvents.Retry());
      const loaded = yield* Machine.waitFor(machine, ({ state }) =>
        DailyBodyWeightStates.matches(state, "Idle")
      );

      expect(loaded.state.value).toMatchObject({
        message: null,
        weightInput: "81.00",
      });
    }).pipe(Effect.scoped)
  );
});
