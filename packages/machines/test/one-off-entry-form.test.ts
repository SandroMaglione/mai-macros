import { Domain, MealEntries, Reporting, Store } from "@mai/nutrition";
import { Cause, Effect, Schema } from "effect";
import { SqlError, UnknownError } from "effect/unstable/sql/SqlError";
import { assert, describe, it } from "vitest";
import {
  decodeOneOffEntryForm,
  oneOffEntryFormValues,
  oneOffEntryErrorMessage,
  OneOffFormValues,
  applyOneOffEntryQuickInput,
  oneOffEntryQuickInputFromValues,
  setAllOneOffNutrientSources,
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

describe("one-off entry quick input", () => {
  it("prefills a reusable draft preserving notes, mixed sources, unknown and recorded zero", async () => {
    const entry = await Effect.runPromise(
      Schema.decodeEffect(Domain.OneOffMealEntry)({
        id: "11111111-1111-4111-8111-111111111111",
        dateKey: "2026-09-01",
        mealId: "dinner",
        kind: "one-off",
        createdAt: 1,
        updatedAt: 2,
        name: "Dinner",
        amountDescription: "Half plate",
        note: "Menu\nwith notes",
        nutrients: {
          energyKcal: { _tag: "Recorded", value: 650 },
          proteinGrams: { _tag: "Estimated", value: 25 },
          carbsGrams: { _tag: "Unknown" },
          fatGrams: { _tag: "Unknown" },
          fiberGrams: { _tag: "Unknown" },
          sugarGrams: { _tag: "Unknown" },
          saturatedFatGrams: { _tag: "Unknown" },
          saltGrams: { _tag: "Recorded", value: 0 },
        },
      })
    );
    const draft = oneOffEntryQuickInputFromValues({
      values: oneOffEntryFormValues(entry),
    });
    assert.equal(draft.values.nutrients.saltGrams.value, "0");
    assert.equal(draft.values.nutrients.carbsGrams.value, "");
    assert.deepEqual(draft.quickInputIssues, []);
    assert.equal(draft.quickInput, "Dinner, Half plate, k650 p25 sa0");
    const decoded = await Effect.runPromise(
      decodeOneOffEntryForm(draft.values)
    );
    assert.deepEqual(
      decoded,
      await Effect.runPromise(Schema.encodeEffect(Domain.OneOffDetails)(entry))
    );
  });

  it.each(["Recorded", "Estimated"] as const)(
    "sets all sources to %s without changing nutrition or inventing unknown values",
    async (source) => {
      const draft = await Effect.runPromise(
        applyOneOffEntryQuickInput({
          input: "Dinner, Half a plate, k650 p25 sa0",
          values,
        })
      );
      const updated = setAllOneOffNutrientSources({
        values: draft.values,
        source,
      });
      assert.equal(updated.name, draft.values.name);
      assert.equal(updated.amountDescription, draft.values.amountDescription);
      assert.equal(updated.note, draft.values.note);
      for (const field of Reporting.NutrientNames) {
        assert.equal(updated.nutrients[field].source, source);
        assert.equal(
          updated.nutrients[field].value,
          draft.values.nutrients[field].value
        );
      }
      const details = await Effect.runPromise(decodeOneOffEntryForm(updated));
      assert.deepEqual(details.nutrients.energyKcal, {
        _tag: source,
        value: 650,
      });
      assert.deepEqual(details.nutrients.saltGrams, { _tag: source, value: 0 });
      assert.deepEqual(details.nutrients.fiberGrams, { _tag: "Unknown" });
      const edited = await Effect.runPromise(
        applyOneOffEntryQuickInput({
          input: "Dinner,,k700 fi3",
          values: updated,
        })
      );
      assert.equal(edited.values.nutrients.fiberGrams.source, source);
      assert.equal(edited.values.nutrients.energyKcal.source, source);
    }
  );

  it("supports a single-nutrient override after setting every source", async () => {
    const recorded = setAllOneOffNutrientSources({
      values,
      source: "Recorded",
    });
    const mixed = {
      ...recorded,
      nutrients: {
        ...recorded.nutrients,
        proteinGrams: { value: "25", source: "Estimated" as const },
      },
    };
    const draft = await Effect.runPromise(
      applyOneOffEntryQuickInput({ input: "Dinner,,k650 p30", values: mixed })
    );
    const details = await Effect.runPromise(
      decodeOneOffEntryForm(draft.values)
    );
    assert.deepEqual(details.nutrients.energyKcal, {
      _tag: "Recorded",
      value: 650,
    });
    assert.deepEqual(details.nutrients.proteinGrams, {
      _tag: "Estimated",
      value: 30,
    });
  });
  it("accepts partial nutrition and saves unknown separately from explicit zero", async () => {
    const draft = await Effect.runPromise(
      applyOneOffEntryQuickInput({
        input: "Noodle bowl, 1 bowl, k650 p25 sa0",
        values,
      })
    );
    assert.deepEqual(draft.quickInputIssues, []);
    const details = await Effect.runPromise(
      decodeOneOffEntryForm(draft.values)
    );
    assert.equal(details.name, "Noodle bowl");
    assert.equal(details.amountDescription, "1 bowl");
    assert.equal(details.note, "Menu calories");
    assert.deepEqual(details.nutrients.energyKcal, {
      _tag: "Estimated",
      value: 650,
    });
    assert.deepEqual(details.nutrients.saltGrams, {
      _tag: "Estimated",
      value: 0,
    });
    assert.deepEqual(details.nutrients.carbsGrams, { _tag: "Unknown" });
  });

  it("uses the same positional nutrient order as food creation", async () => {
    const draft = await Effect.runPromise(
      applyOneOffEntryQuickInput({
        input: "Dinner,,650,20,5,80,10,3,25,0",
        values,
      })
    );
    assert.deepEqual(draft.quickInputIssues, []);
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(draft.values.nutrients).map(([field, nutrient]) => [
          field,
          nutrient.value,
        ])
      ),
      {
        energyKcal: "650",
        fatGrams: "20",
        saturatedFatGrams: "5",
        carbsGrams: "80",
        sugarGrams: "10",
        fiberGrams: "3",
        proteinGrams: "25",
        saltGrams: "0",
      }
    );
    assert.equal(draft.values.amountDescription, "");
  });

  it("round-trips manual values and preserves existing certainty when editing text", async () => {
    const existing = {
      ...values,
      nutrients: {
        ...values.nutrients,
        energyKcal: { value: "700", source: "Recorded" as const },
        proteinGrams: { value: "30,5", source: "Estimated" as const },
        saltGrams: { value: "0", source: "Recorded" as const },
      },
    };
    const text = oneOffEntryQuickInputFromValues({ values: existing });
    assert.equal(text.quickInput, "Dinner, Half a plate, k700 p30.5 sa0");
    const draft = await Effect.runPromise(
      applyOneOffEntryQuickInput({
        input: text.quickInput.replace("k700", "k750"),
        values: existing,
      })
    );
    assert.deepEqual(draft.quickInputIssues, []);
    const details = await Effect.runPromise(
      decodeOneOffEntryForm(draft.values)
    );
    assert.deepEqual(details.nutrients.energyKcal, {
      _tag: "Recorded",
      value: 750,
    });
    assert.deepEqual(details.nutrients.proteinGrams, {
      _tag: "Estimated",
      value: 30.5,
    });
    assert.deepEqual(details.nutrients.saltGrams, {
      _tag: "Recorded",
      value: 0,
    });
    assert.equal(draft.values.note, existing.note);
  });

  it("removes cleared nutrients instead of retaining old values", async () => {
    const first = await Effect.runPromise(
      applyOneOffEntryQuickInput({ input: "Dinner,,k650 p25", values })
    );
    const next = await Effect.runPromise(
      applyOneOffEntryQuickInput({
        input: "Dinner,,k650",
        values: first.values,
      })
    );
    assert.equal(next.values.nutrients.proteinGrams.value, "");
    const cleared = await Effect.runPromise(
      applyOneOffEntryQuickInput({ input: "", values: next.values })
    );
    assert.equal(cleared.values.name, "");
    assert.equal(cleared.values.nutrients.energyKcal.value, "");
    assert.equal(cleared.values.note, values.note);
  });

  it.each(["Dinner", "Dinner, Half a plate", "Dinner,,k650"])(
    "allows unknown nutrients in %s",
    async (input) => {
      const draft = await Effect.runPromise(
        applyOneOffEntryQuickInput({ input, values })
      );
      assert.deepEqual(draft.quickInputIssues, []);
      await Effect.runPromise(decodeOneOffEntryForm(draft.values));
    }
  );

  it.each([
    "Dinner,,k650 k700",
    "Dinner,,k650 p-1",
    "Dinner,,650,nope",
    ",,k650",
  ])("reports invalid notation in %s", async (input) => {
    const draft = await Effect.runPromise(
      applyOneOffEntryQuickInput({ input, values })
    );
    assert.isAbove(draft.quickInputIssues.length, 0);
    assert.isFalse(
      draft.quickInputIssues.some((issue) => issue.includes("missing required"))
    );
  });
});

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
