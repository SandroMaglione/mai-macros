import assert from "node:assert/strict";
import { test } from "node:test";
import { Effect, Schema } from "effect";
import { Domain } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import {
  RangeEditorEvents,
  rangeEditorMachine,
} from "../src/lib/range-editor-machine";
import {
  OneOffEntryEvents,
  oneOffEntryMachine,
} from "../src/lib/one-off-entry-machine";

test("range editor retains the other date while editing and clears validation feedback", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const initial = yield* Machine.planInitial(rangeEditorMachine);
      const opened = yield* Machine.plan(
        rangeEditorMachine,
        initial.state,
        RangeEditorEvents.open({ start: "2026-09-01", end: "2026-09-09" })
      );
      const invalid = yield* Machine.plan(
        rangeEditorMachine,
        opened.next,
        RangeEditorEvents.invalid()
      );
      const edited = yield* Machine.plan(
        rangeEditorMachine,
        invalid.next,
        RangeEditorEvents.start({ value: "2026-09-02" })
      );
      const encoded = yield* Machine.encodeSnapshot(
        rangeEditorMachine,
        edited.next
      );
      assert.deepEqual(
        encoded.active.find(({ path }) => path === "Open")?.value,
        {
          _tag: "Open",
          start: "2026-09-02",
          end: "2026-09-09",
          message: null,
        }
      );
      const closed = yield* Machine.plan(
        rangeEditorMachine,
        edited.next,
        RangeEditorEvents.close()
      );
      assert.deepEqual(closed.next, initial.state);
    })
  );
});

for (const mealEntryId of [null, "9535a059-a61f-42e1-a2e0-35ec87203c24"]) {
  test(`one-off deletion ${mealEntryId === null ? "is ignored for new entries" : "carries the existing entry ID"}`, async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const route = yield* Schema.decodeEffect(
          Schema.Struct({
            dateKey: Domain.DateKey,
            meal: Domain.MealId,
            mealEntryId: Schema.NullOr(Domain.MealEntryId),
          })
        )({
          dateKey: "2026-09-09",
          meal: "9535a059-a61f-42e1-a2e0-35ec87203c25:lunch",
          mealEntryId,
        });
        const initial = yield* Machine.planInitial(oneOffEntryMachine, route);
        const encoded = yield* Machine.encodeSnapshot(
          oneOffEntryMachine,
          initial.state
        );
        const ready = yield* Machine.decodeSnapshot(oneOffEntryMachine, {
          ...encoded,
          active: [
            ...encoded.active.filter(({ path }) => path === ""),
            { path: "Ready", value: { _tag: "Ready", notice: null } },
          ],
        });
        const deletion = yield* Machine.plan(
          oneOffEntryMachine,
          ready,
          OneOffEntryEvents.delete()
        );
        if (mealEntryId === null) assert.deepEqual(deletion.next, ready);
        else {
          const result = yield* Machine.encodeSnapshot(
            oneOffEntryMachine,
            deletion.next
          );
          assert.deepEqual(
            result.active.find(({ path }) => path === "Deleting")?.value,
            { _tag: "Deleting", mealEntryId }
          );
        }
      })
    );
  });
}
