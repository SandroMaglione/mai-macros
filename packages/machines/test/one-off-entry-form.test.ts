import { Domain, MealEntries, Store } from "@mai/nutrition";
import { Cause, Effect, Schema } from "effect";
import { SqlError, UnknownError } from "effect/unstable/sql/SqlError";
import { assert, describe, it } from "vitest";
import {
  decodeOneOffEntryForm,
  oneOffEntryErrorMessage,
  OneOffFormValues,
} from "../src/one-off-entry-form.ts";

const blank = { value: "", source: "Estimated" } as const;
const values = {
  name: " Dinner ",
  amountDescription: " Half a plate ",
  note: " Menu calories ",
  nutrients: {
    energyKcal: blank,
    proteinGrams: blank,
    carbsGrams: blank,
    fatGrams: blank,
    fiberGrams: blank,
    sugarGrams: blank,
    saturatedFatGrams: blank,
    saltGrams: blank,
  },
} satisfies typeof OneOffFormValues.Type;

describe("one-off entry form feedback", () => {
  it("preserves mixed certainty, comma decimals, explicit zero and unknown values", async () => {
    const result = await Effect.runPromise(
      decodeOneOffEntryForm({
        ...values,
        nutrients: {
          ...values.nutrients,
          energyKcal: { value: "700", source: "Recorded" },
          proteinGrams: { value: " 30,5 ", source: "Estimated" },
          saltGrams: { value: "0", source: "Recorded" },
        },
      })
    );
    assert.equal(result.name, "Dinner");
    assert.equal(result.amountDescription, "Half a plate");
    assert.deepEqual(result.nutrients.energyKcal, {
      _tag: "Recorded",
      value: 700,
    });
    assert.deepEqual(result.nutrients.proteinGrams, {
      _tag: "Estimated",
      value: 30.5,
    });
    assert.deepEqual(result.nutrients.saltGrams, {
      _tag: "Recorded",
      value: 0,
    });
    assert.deepEqual(result.nutrients.carbsGrams, { _tag: "Unknown" });
  });

  it.each(["-1", "abc", "Infinity", "NaN", "1,2,3"])(
    "identifies the invalid nutrient for %s",
    async (value) => {
      const message = await Effect.runPromise(
        decodeOneOffEntryForm({
          ...values,
          nutrients: { ...values.nutrients, fiberGrams: { ...blank, value } },
        }).pipe(
          Effect.matchCause({
            onFailure: (error) =>
              oneOffEntryErrorMessage({ error, action: "save" }),
            onSuccess: () => "unexpected success",
          })
        )
      );
      assert.equal(
        message,
        "Fiber must be a number of 0 or more. Leave it blank if unknown."
      );
    }
  );

  it("identifies a missing name", async () => {
    const message = await Effect.runPromise(
      decodeOneOffEntryForm({ ...values, name: " " }).pipe(
        Effect.matchCause({
          onFailure: (error) =>
            oneOffEntryErrorMessage({ error, action: "save" }),
          onSuccess: () => "unexpected success",
        })
      )
    );
    assert.equal(message, "Enter a name for this entry.");
  });

  it("retains the native database message through Effect, store and SQL error wrappers", () => {
    const error = Cause.fail(
      new Store.NutritionStoreError({
        cause: new SqlError({
          reason: new UnknownError({
            message: "Failed to execute statement",
            cause: new Error("CHECK constraint failed: meal_entries"),
          }),
        }),
      })
    );
    assert.equal(
      oneOffEntryErrorMessage({ error, action: "save" }),
      "Could not save this entry: CHECK constraint failed: meal_entries."
    );
  });

  it("explains an out-of-date local schema and retains the failing column", () => {
    const error = new Store.NutritionStoreError({
      cause: new Error("table meal_entries has no column named kind"),
    });
    const message = oneOffEntryErrorMessage({ error, action: "save" });
    assert.include(message, "Fully close and reopen the app");
    assert.include(message, "has no column named kind");
  });

  it.each([
    {
      detail: "SQLITE_FULL: database or disk is full",
      expected: "no space left",
    },
    { detail: "database is locked", expected: "database is busy" },
    {
      detail: "attempt to write a readonly database",
      expected: "database is read-only",
    },
  ])("gives an actionable explanation for $detail", ({ detail, expected }) => {
    assert.include(
      oneOffEntryErrorMessage({ error: new Error(detail), action: "save" }),
      expected
    );
  });

  it("explains missing entries and meals", async () => {
    const id = await Effect.runPromise(
      Schema.decodeEffect(Domain.MealEntryId)(
        "11111111-1111-4111-8111-111111111111"
      )
    );
    const mealId = await Effect.runPromise(
      Schema.decodeEffect(Domain.MealId)("meal")
    );
    assert.include(
      oneOffEntryErrorMessage({
        error: new MealEntries.MealEntryNotFound({ mealEntryId: id }),
        action: "save",
      }),
      "entry no longer exists"
    );
    assert.include(
      oneOffEntryErrorMessage({
        error: new MealEntries.MealNotFound({ mealId }),
        action: "save",
      }),
      "meal is no longer available"
    );
  });

  it("preserves unexpected defect descriptions", () => {
    assert.equal(
      oneOffEntryErrorMessage({
        error: Cause.die(new Error("Native write failed")),
        action: "save",
      }),
      "Could not save this entry: Native write failed."
    );
  });
});
