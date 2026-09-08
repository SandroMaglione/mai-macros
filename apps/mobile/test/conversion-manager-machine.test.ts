import assert from "node:assert/strict";
import { test } from "node:test";
import { Domain } from "@mai/nutrition";
import { Effect, Predicate, Schema } from "effect";
import { Machine } from "@typeonce/effect-machine";
import {
  ConversionEvents,
  conversionManagerMachine,
} from "../src/lib/conversion-manager-machine";

const foodId = "9535a059-a61f-42e1-a2e0-35ec87203c24";

function _editingSnapshot({
  mealEntryCount,
  state = "Editing",
}: {
  readonly mealEntryCount: number;
  readonly state?: "Editing" | "Reviewing" | "Saving";
}) {
  return Machine.decodeSnapshot(conversionManagerMachine, {
    version: 2,
    _tag: "MachineSnapshot",
    active: [
      { path: "" },
      {
        path: "Loaded",
        value: {
          _tag: "Loaded",
          food: {
            id: foodId,
            name: "Rice",
            origin: "user",
            createdAt: 0,
            updatedAt: 0,
            energyKcal: 100,
            proteinGrams: 4,
            carbsGrams: 12,
            fatGrams: 1,
          },
          usage: { foodId, mealEntryCount, portions: [] },
          form: {
            massAmount: "1",
            massUnit: "kg",
            volumeAmount: "1",
            volumeUnit: "l",
          },
        },
      },
      { path: `Loaded.${state}` },
      ...(state === "Editing"
        ? [
            {
              path: "Loaded.Editing.Failure",
              value: { _tag: "Failure", message: "Previous message" },
            },
          ]
        : []),
    ],
  });
}

for (const mealEntryCount of [0, 2]) {
  test(`submit and remove require preview only when ${mealEntryCount} historical entries exist`, async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const initial = yield* _editingSnapshot({ mealEntryCount });
        for (const event of [
          ConversionEvents.submit(),
          ConversionEvents.remove(),
        ]) {
          const plan = yield* Machine.plan(
            conversionManagerMachine,
            initial,
            event
          );
          const encoded = yield* Machine.encodeSnapshot(
            conversionManagerMachine,
            plan.next
          );
          assert.ok(
            encoded.active.some(
              ({ path }) =>
                path ===
                (mealEntryCount > 0 ? "Loaded.Previewing" : "Loaded.Saving")
            )
          );
          assert.ok(
            !encoded.active.some(({ path }) => path === "Loaded.ChooseSavePath")
          );
          const loaded = encoded.active.find(
            ({ path }) => path === "Loaded"
          )?.value;
          assert.ok(Predicate.hasProperty(loaded, "form"));
          assert.equal(Predicate.hasProperty(loaded, "message"), false);
          assert.ok(
            !encoded.active.some(({ path }) =>
              path.startsWith("Loaded.Editing")
            )
          );
          if (event._tag === "remove") {
            assert.deepEqual(loaded.form, {
              massAmount: "",
              massUnit: "kg",
              volumeAmount: "",
              volumeUnit: "l",
            });
          }
        }
      })
    );
  });
}

test("review requires confirmation and rejects edits while reviewing or saving", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      for (const state of ["Reviewing", "Saving"] as const) {
        const initial = yield* _editingSnapshot({ mealEntryCount: 2, state });
        const changed = yield* Machine.plan(
          conversionManagerMachine,
          initial,
          ConversionEvents.changeMassAmount({ value: "99" })
        );
        assert.deepEqual(changed.next, initial);
      }
      const initial = yield* _editingSnapshot({
        mealEntryCount: 2,
        state: "Reviewing",
      });
      for (const [event, target] of [
        [ConversionEvents.cancelReview(), "Loaded.Editing"],
        [ConversionEvents.confirm(), "Loaded.Saving"],
      ] as const) {
        const plan = yield* Machine.plan(
          conversionManagerMachine,
          initial,
          event
        );
        const encoded = yield* Machine.encodeSnapshot(
          conversionManagerMachine,
          plan.next
        );
        assert.ok(encoded.active.some(({ path }) => path === target));
      }
    })
  );
});

test("food ID belongs to loading and retry states, not the root", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const initial = yield* Machine.planInitial(conversionManagerMachine, {
        foodId: yield* Schema.decodeEffect(Domain.FoodId)(foodId),
      });
      const encoded = yield* Machine.encodeSnapshot(
        conversionManagerMachine,
        initial.state
      );
      assert.deepEqual(
        encoded.active.find(({ path }) => path === ""),
        { path: "" }
      );
      assert.deepEqual(
        encoded.active.find(({ path }) => path === "Loading")?.value,
        { _tag: "Loading", foodId }
      );
      const failed = yield* Machine.decodeSnapshot(conversionManagerMachine, {
        version: 2,
        _tag: "MachineSnapshot",
        active: [
          { path: "" },
          { path: "LoadFailed", value: { _tag: "LoadFailed", foodId } },
        ],
      });
      const retry = yield* Machine.plan(
        conversionManagerMachine,
        failed,
        ConversionEvents.retry()
      );
      assert.deepEqual(
        yield* Machine.encodeSnapshot(conversionManagerMachine, retry.next),
        encoded
      );
    })
  );
});
