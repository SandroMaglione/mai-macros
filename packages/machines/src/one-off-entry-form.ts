import { Domain, MealEntries, Reporting } from "@mai/nutrition";
import { Cause, Data, Effect, Schema } from "effect";

export const OneOffNutrientField = Schema.Struct({
  value: Schema.String,
  source: Schema.Literals(["Recorded", "Estimated"]),
});
export const OneOffFormValues = Schema.Struct({
  name: Schema.String,
  amountDescription: Schema.String,
  note: Schema.String,
  nutrients: Schema.Struct({
    energyKcal: OneOffNutrientField,
    proteinGrams: OneOffNutrientField,
    carbsGrams: OneOffNutrientField,
    fatGrams: OneOffNutrientField,
    fiberGrams: OneOffNutrientField,
    sugarGrams: OneOffNutrientField,
    saturatedFatGrams: OneOffNutrientField,
    saltGrams: OneOffNutrientField,
  }),
});
const nutrientNames = {
  energyKcal: "Calories",
  proteinGrams: "Protein",
  carbsGrams: "Carbs",
  fatGrams: "Fat",
  fiberGrams: "Fiber",
  sugarGrams: "Sugar",
  saturatedFatGrams: "Saturated fat",
  saltGrams: "Salt",
} satisfies Record<Reporting.NutrientName, string>;
const FormNumber = Schema.NumberFromString.check(
  Schema.isFinite(),
  Schema.isGreaterThanOrEqualTo(0)
);
class OneOffFieldError extends Data.TaggedError("OneOffFieldError")<{
  readonly message: string;
}> {}

export const decodeOneOffEntryForm = Effect.fn("decodeOneOffEntryForm")(
  function* (values: typeof OneOffFormValues.Type) {
    if (values.name.trim() === "")
      return yield* new OneOffFieldError({
        message: "Enter a name for this entry.",
      });
    const nutrients = yield* Effect.all({
      energyKcal: _decodeNutrient({
        name: "energyKcal",
        field: values.nutrients.energyKcal,
      }),
      proteinGrams: _decodeNutrient({
        name: "proteinGrams",
        field: values.nutrients.proteinGrams,
      }),
      carbsGrams: _decodeNutrient({
        name: "carbsGrams",
        field: values.nutrients.carbsGrams,
      }),
      fatGrams: _decodeNutrient({
        name: "fatGrams",
        field: values.nutrients.fatGrams,
      }),
      fiberGrams: _decodeNutrient({
        name: "fiberGrams",
        field: values.nutrients.fiberGrams,
      }),
      sugarGrams: _decodeNutrient({
        name: "sugarGrams",
        field: values.nutrients.sugarGrams,
      }),
      saturatedFatGrams: _decodeNutrient({
        name: "saturatedFatGrams",
        field: values.nutrients.saturatedFatGrams,
      }),
      saltGrams: _decodeNutrient({
        name: "saltGrams",
        field: values.nutrients.saltGrams,
      }),
    });
    return yield* Schema.decodeEffect(Domain.OneOffDetails)({
      name: values.name.trim(),
      amountDescription: values.amountDescription.trim(),
      note: values.note.trim(),
      nutrients,
    });
  }
);
const _decodeNutrient = Effect.fn("decodeOneOffNutrient")(function* ({
  name,
  field,
}: {
  readonly name: Reporting.NutrientName;
  readonly field: typeof OneOffNutrientField.Type;
}) {
  if (field.value.trim() === "") return { _tag: "Unknown" as const };
  const value = yield* Schema.decodeEffect(FormNumber)(
    field.value.trim().replace(",", ".")
  ).pipe(
    Effect.mapError(
      () =>
        new OneOffFieldError({
          message: `${nutrientNames[name]} must be a number of 0 or more. Leave it blank if unknown.`,
        })
    )
  );
  return { _tag: field.source, value };
});

const ErrorInfo = Schema.Struct({
  message: Schema.optional(Schema.String),
  _tag: Schema.optional(Schema.String),
  cause: Schema.optional(Schema.Unknown),
  reason: Schema.optional(Schema.Unknown),
});

export function oneOffEntryErrorMessage({
  error,
  action,
}: {
  readonly error: unknown;
  readonly action: "save" | "delete" | "open";
}): string {
  const failure = Cause.isCause(error) ? Cause.squash(error) : error;
  if (failure instanceof OneOffFieldError) return failure.message;
  if (failure instanceof MealEntries.MealNotFound)
    return "This meal is no longer available for the selected day. Return to the day and select a meal again.";
  if (failure instanceof MealEntries.MealEntryNotFound)
    return "This entry no longer exists. Return to the day to add a new entry.";
  const details = _errorDetails({ error: failure, depth: 0 });
  if (/no such column|has no column|no such table/i.test(details))
    return `The local database is missing a required update. Fully close and reopen the app, then retry. Details: ${details}`;
  if (
    /database is locked|database is busy|SQLITE_BUSY|SQLITE_LOCKED/i.test(
      details
    )
  )
    return "The local database is busy. Wait a moment and try again.";
  if (/disk.*full|SQLITE_FULL|no space left/i.test(details))
    return "The device has no space left to save this entry. Free some storage and try again.";
  if (/readonly|read-only|SQLITE_READONLY/i.test(details))
    return "The local database is read-only, so this entry cannot be changed. Fully close and reopen the app, then retry.";
  return `Could not ${action} this entry: ${details || "the app returned no error details"}.`;
}

function _errorDetails({
  error,
  depth,
}: {
  readonly error: unknown;
  readonly depth: number;
}): string {
  if (depth > 6) return "";
  if (typeof error === "string") return error.trim();
  if (!Schema.is(ErrorInfo)(error)) return "";
  const nested = error.cause ?? error.reason;
  const detail =
    nested === undefined
      ? ""
      : _errorDetails({ error: nested, depth: depth + 1 });
  return detail || error.message?.trim() || error._tag || "";
}
