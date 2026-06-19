import { Data, Effect, Schema } from "effect";

import { NonEmptyString, NonNegativeNumber } from "./domain.ts";

export const FoodQuickInput = Schema.Struct({
  name: NonEmptyString,
  brand: Schema.optional(NonEmptyString),
  energyKcalPer100g: NonNegativeNumber,
  proteinGramsPer100g: NonNegativeNumber,
  carbsGramsPer100g: NonNegativeNumber,
  fatGramsPer100g: NonNegativeNumber,
  fiberGramsPer100g: Schema.optional(NonNegativeNumber),
  sugarGramsPer100g: Schema.optional(NonNegativeNumber),
  saturatedFatGramsPer100g: Schema.optional(NonNegativeNumber),
  saltGramsPer100g: Schema.optional(NonNegativeNumber),
});

export type FoodQuickInput = typeof FoodQuickInput.Type;

export type FoodQuickInputParseErrorReason =
  | "duplicate-tag"
  | "invalid-number"
  | "missing-name"
  | "missing-required-nutrient"
  | "schema-error"
  | "too-many-fields"
  | "unrecognized-token";

type FoodQuickInputFieldName =
  | "brand"
  | "carbsGramsPer100g"
  | "energyKcalPer100g"
  | "fatGramsPer100g"
  | "fiberGramsPer100g"
  | "name"
  | "proteinGramsPer100g"
  | "saltGramsPer100g"
  | "saturatedFatGramsPer100g"
  | "sugarGramsPer100g";

type FoodQuickInputNutrientTag =
  | "c"
  | "f"
  | "fi"
  | "k"
  | "p"
  | "sa"
  | "sf"
  | "su";

type FoodQuickInputPartialFields = {
  energyKcalPer100g?: number;
  fatGramsPer100g?: number;
  saturatedFatGramsPer100g?: number;
  carbsGramsPer100g?: number;
  sugarGramsPer100g?: number;
  fiberGramsPer100g?: number;
  proteinGramsPer100g?: number;
  saltGramsPer100g?: number;
};

export class FoodQuickInputParseError extends Data.TaggedError(
  "FoodQuickInputParseError"
)<{
  readonly field?: FoodQuickInputFieldName;
  readonly input: string;
  readonly message: string;
  readonly reason: FoodQuickInputParseErrorReason;
}> {}

const nutrientFieldCount = 8;

const taggedNutrientPattern =
  /(^|[\s,]+)(sf|su|fi|sa|k|f|c|p)\s*(\d+(?:\.\d+)?|\.\d+)/g;

export const parseFoodQuickInput = Effect.fn("parseFoodQuickInput")(function* ({
  input,
}: {
  readonly input: string;
}) {
  const fields = input.split(",");
  const name = _optionalTrimmedString({ value: fields[0] });

  if (name === undefined) {
    return yield* new FoodQuickInputParseError({
      input,
      message: "Food quick input is missing a food name.",
      reason: "missing-name",
      field: "name",
    });
  }

  const brand = _optionalTrimmedString({ value: fields[1] });
  const nutrientInput = fields.slice(2).join(",");
  taggedNutrientPattern.lastIndex = 0;
  const hasTaggedNutrients = taggedNutrientPattern.test(nutrientInput);
  const nutrients = hasTaggedNutrients
    ? yield* Effect.gen(function* () {
        const fields: FoodQuickInputPartialFields = {};
        taggedNutrientPattern.lastIndex = 0;

        for (const match of nutrientInput.matchAll(taggedNutrientPattern)) {
          const matchedTag = match[2];

          if (
            matchedTag !== "c" &&
            matchedTag !== "f" &&
            matchedTag !== "fi" &&
            matchedTag !== "k" &&
            matchedTag !== "p" &&
            matchedTag !== "sa" &&
            matchedTag !== "sf" &&
            matchedTag !== "su"
          ) {
            return yield* new FoodQuickInputParseError({
              input,
              message: "Food quick input contains an unsupported nutrient tag.",
              reason: "unrecognized-token",
            });
          }

          const tag = matchedTag;
          const value = yield* _parseNutrientNumber({
            field: _fieldNameFromTag({ tag }),
            input,
            value: match[3],
          });
          const existingValue =
            tag === "k"
              ? fields.energyKcalPer100g
              : tag === "f"
                ? fields.fatGramsPer100g
                : tag === "sf"
                  ? fields.saturatedFatGramsPer100g
                  : tag === "c"
                    ? fields.carbsGramsPer100g
                    : tag === "su"
                      ? fields.sugarGramsPer100g
                      : tag === "fi"
                        ? fields.fiberGramsPer100g
                        : tag === "p"
                          ? fields.proteinGramsPer100g
                          : fields.saltGramsPer100g;

          if (existingValue !== undefined) {
            return yield* new FoodQuickInputParseError({
              field: _fieldNameFromTag({ tag }),
              input,
              message: `Food quick input repeats the ${tag} nutrient tag.`,
              reason: "duplicate-tag",
            });
          }

          if (tag === "k") {
            fields.energyKcalPer100g = value;
          } else if (tag === "f") {
            fields.fatGramsPer100g = value;
          } else if (tag === "sf") {
            fields.saturatedFatGramsPer100g = value;
          } else if (tag === "c") {
            fields.carbsGramsPer100g = value;
          } else if (tag === "su") {
            fields.sugarGramsPer100g = value;
          } else if (tag === "fi") {
            fields.fiberGramsPer100g = value;
          } else if (tag === "p") {
            fields.proteinGramsPer100g = value;
          } else {
            fields.saltGramsPer100g = value;
          }
        }

        taggedNutrientPattern.lastIndex = 0;
        const unparsedInput = nutrientInput
          .replace(taggedNutrientPattern, " ")
          .replaceAll(/[,\s]/g, "");

        if (unparsedInput !== "") {
          return yield* new FoodQuickInputParseError({
            input,
            message: "Food quick input contains unrecognized tagged nutrients.",
            reason: "unrecognized-token",
          });
        }

        return {
          energyKcalPer100g: yield* _requireTaggedNutrient({
            field: "energyKcalPer100g",
            input,
            label: "calories",
            value: fields.energyKcalPer100g,
          }),
          fatGramsPer100g: yield* _requireTaggedNutrient({
            field: "fatGramsPer100g",
            input,
            label: "fat",
            value: fields.fatGramsPer100g,
          }),
          ...(fields.saturatedFatGramsPer100g === undefined
            ? {}
            : { saturatedFatGramsPer100g: fields.saturatedFatGramsPer100g }),
          carbsGramsPer100g: yield* _requireTaggedNutrient({
            field: "carbsGramsPer100g",
            input,
            label: "carbs",
            value: fields.carbsGramsPer100g,
          }),
          ...(fields.sugarGramsPer100g === undefined
            ? {}
            : { sugarGramsPer100g: fields.sugarGramsPer100g }),
          ...(fields.fiberGramsPer100g === undefined
            ? {}
            : { fiberGramsPer100g: fields.fiberGramsPer100g }),
          proteinGramsPer100g: yield* _requireTaggedNutrient({
            field: "proteinGramsPer100g",
            input,
            label: "protein",
            value: fields.proteinGramsPer100g,
          }),
          ...(fields.saltGramsPer100g === undefined
            ? {}
            : { saltGramsPer100g: fields.saltGramsPer100g }),
        };
      })
    : yield* Effect.gen(function* () {
        const nutrientFields = fields.slice(2);
        let endIndex = nutrientFields.length;

        while (
          endIndex > nutrientFieldCount &&
          (nutrientFields[endIndex - 1]?.trim() ?? "") === ""
        ) {
          endIndex = endIndex - 1;
        }

        const normalizedFields = nutrientFields.slice(0, endIndex);

        if (normalizedFields.length > nutrientFieldCount) {
          return yield* new FoodQuickInputParseError({
            input,
            message:
              "Food quick input has too many positional nutrient fields.",
            reason: "too-many-fields",
          });
        }

        const energyKcalPer100g = yield* _parseRequiredNutrient({
          field: "energyKcalPer100g",
          input,
          label: "calories",
          value: normalizedFields[0],
        });
        const fatGramsPer100g = yield* _parseRequiredNutrient({
          field: "fatGramsPer100g",
          input,
          label: "fat",
          value: normalizedFields[1],
        });
        const saturatedFatGramsPer100g = yield* _parseOptionalNutrient({
          field: "saturatedFatGramsPer100g",
          input,
          value: normalizedFields[2],
        });
        const carbsGramsPer100g = yield* _parseRequiredNutrient({
          field: "carbsGramsPer100g",
          input,
          label: "carbs",
          value: normalizedFields[3],
        });
        const sugarGramsPer100g = yield* _parseOptionalNutrient({
          field: "sugarGramsPer100g",
          input,
          value: normalizedFields[4],
        });
        const fiberGramsPer100g = yield* _parseOptionalNutrient({
          field: "fiberGramsPer100g",
          input,
          value: normalizedFields[5],
        });
        const proteinGramsPer100g = yield* _parseRequiredNutrient({
          field: "proteinGramsPer100g",
          input,
          label: "protein",
          value: normalizedFields[6],
        });
        const saltGramsPer100g = yield* _parseOptionalNutrient({
          field: "saltGramsPer100g",
          input,
          value: normalizedFields[7],
        });

        return {
          energyKcalPer100g,
          fatGramsPer100g,
          ...(saturatedFatGramsPer100g === undefined
            ? {}
            : { saturatedFatGramsPer100g }),
          carbsGramsPer100g,
          ...(sugarGramsPer100g === undefined ? {} : { sugarGramsPer100g }),
          ...(fiberGramsPer100g === undefined ? {} : { fiberGramsPer100g }),
          proteinGramsPer100g,
          ...(saltGramsPer100g === undefined ? {} : { saltGramsPer100g }),
        };
      });

  return yield* Schema.decodeEffect(FoodQuickInput)({
    name,
    ...(brand === undefined ? {} : { brand }),
    ...nutrients,
  }).pipe(
    Effect.mapError(
      () =>
        new FoodQuickInputParseError({
          input,
          message: "Food quick input did not match the food schema.",
          reason: "schema-error",
        })
    )
  );
});

function _parseRequiredNutrient({
  field,
  input,
  label,
  value,
}: {
  readonly field: FoodQuickInputFieldName;
  readonly input: string;
  readonly label: string;
  readonly value: string | undefined;
}) {
  return Effect.gen(function* () {
    const trimmedValue = value?.trim() ?? "";

    if (trimmedValue === "") {
      return yield* new FoodQuickInputParseError({
        field,
        input,
        message: `Food quick input is missing required ${label}.`,
        reason: "missing-required-nutrient",
      });
    }

    return yield* _parseNutrientNumber({ field, input, value: trimmedValue });
  });
}

function _parseOptionalNutrient({
  field,
  input,
  value,
}: {
  readonly field: FoodQuickInputFieldName;
  readonly input: string;
  readonly value: string | undefined;
}) {
  const trimmedValue = value?.trim() ?? "";

  return trimmedValue === ""
    ? Effect.succeed(undefined)
    : _parseNutrientNumber({ field, input, value: trimmedValue });
}

function _parseNutrientNumber({
  field,
  input,
  value,
}: {
  readonly field: FoodQuickInputFieldName;
  readonly input: string;
  readonly value: string | undefined;
}) {
  const trimmedValue = value?.trim() ?? "";
  const parsedValue = Number(trimmedValue);

  if (
    trimmedValue === "" ||
    !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(trimmedValue) ||
    !Number.isFinite(parsedValue) ||
    parsedValue < 0
  ) {
    return new FoodQuickInputParseError({
      field,
      input,
      message: "Food quick input contains an invalid nutrient number.",
      reason: "invalid-number",
    });
  }

  return Effect.succeed(parsedValue);
}

function _requireTaggedNutrient({
  field,
  input,
  label,
  value,
}: {
  readonly field: FoodQuickInputFieldName;
  readonly input: string;
  readonly label: string;
  readonly value: number | undefined;
}) {
  return value === undefined
    ? new FoodQuickInputParseError({
        field,
        input,
        message: `Food quick input is missing required ${label}.`,
        reason: "missing-required-nutrient",
      })
    : Effect.succeed(value);
}

function _fieldNameFromTag({
  tag,
}: {
  readonly tag: FoodQuickInputNutrientTag;
}): FoodQuickInputFieldName {
  if (tag === "k") {
    return "energyKcalPer100g";
  }

  if (tag === "f") {
    return "fatGramsPer100g";
  }

  if (tag === "sf") {
    return "saturatedFatGramsPer100g";
  }

  if (tag === "c") {
    return "carbsGramsPer100g";
  }

  if (tag === "su") {
    return "sugarGramsPer100g";
  }

  if (tag === "fi") {
    return "fiberGramsPer100g";
  }

  if (tag === "p") {
    return "proteinGramsPer100g";
  }

  return "saltGramsPer100g";
}

function _optionalTrimmedString({
  value,
}: {
  readonly value: string | undefined;
}) {
  const trimmedValue = value?.trim() ?? "";

  return trimmedValue === "" ? undefined : trimmedValue;
}
