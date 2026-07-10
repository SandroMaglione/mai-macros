import { Array, Data, Effect, Schema } from "effect";

import { NonEmptyString, NonNegativeNumber } from "./domain.ts";

const nutrientNumberPattern = /^(?:\d+(?:\.\d+)?|\.\d+)$/;

const positionalNutrientFields = [
  "energyKcal",
  "fatGrams",
  "saturatedFatGrams",
  "carbsGrams",
  "sugarGrams",
  "fiberGrams",
  "proteinGrams",
  "saltGrams",
] satisfies readonly FoodQuickInputNutrientFieldName[];

const nutrientFieldCount = positionalNutrientFields.length;

const requiredNutrients = [
  {
    field: "energyKcal",
    label: "calories",
  },
  {
    field: "fatGrams",
    label: "fat",
  },
  {
    field: "carbsGrams",
    label: "carbs",
  },
  {
    field: "proteinGrams",
    label: "protein",
  },
] satisfies readonly {
  readonly field: Extract<
    FoodQuickInputNutrientFieldName,
    "carbsGrams" | "energyKcal" | "fatGrams" | "proteinGrams"
  >;
  readonly label: string;
}[];

const taggedNutrientFieldsByTag: Record<
  string,
  FoodQuickInputNutrientFieldName | undefined
> = {
  c: "carbsGrams",
  f: "fatGrams",
  fi: "fiberGrams",
  k: "energyKcal",
  p: "proteinGrams",
  sa: "saltGrams",
  sf: "saturatedFatGrams",
  su: "sugarGrams",
};

const taggedNutrientPattern =
  /(^|[\s,]+)(sf|su|fi|sa|k|f|c|p)\s*(\d+(?:\.\d+)?|\.\d+)/g;

export type FoodQuickInput = typeof FoodQuickInput.Type;

export type FoodQuickInputParseStatus =
  | "complete"
  | "empty"
  | "incomplete"
  | "invalid";

export type FoodQuickInputParseErrorReason =
  | "duplicate-tag"
  | "invalid-number"
  | "missing-name"
  | "missing-required-nutrient"
  | "schema-error"
  | "too-many-fields"
  | "unrecognized-token";

export type FoodQuickInputFieldName =
  | "brand"
  | "carbsGrams"
  | "energyKcal"
  | "fatGrams"
  | "fiberGrams"
  | "name"
  | "proteinGrams"
  | "saltGrams"
  | "saturatedFatGrams"
  | "sugarGrams";

export type FoodQuickInputPartial = {
  readonly name?: string;
  readonly brand?: string;
  readonly energyKcal?: number;
  readonly proteinGrams?: number;
  readonly carbsGrams?: number;
  readonly fatGrams?: number;
  readonly fiberGrams?: number;
  readonly sugarGrams?: number;
  readonly saturatedFatGrams?: number;
  readonly saltGrams?: number;
};

export type FoodQuickInputParseIssue = {
  readonly field?: FoodQuickInputFieldName;
  readonly input: string;
  readonly message: string;
  readonly reason: FoodQuickInputParseErrorReason;
};

export type FoodQuickInputParseResult =
  | {
      readonly food?: never;
      readonly input: string;
      readonly issues: readonly FoodQuickInputParseIssue[];
      readonly partial: FoodQuickInputPartial;
      readonly status: Exclude<FoodQuickInputParseStatus, "complete">;
    }
  | {
      readonly food: FoodQuickInput;
      readonly input: string;
      readonly issues: readonly FoodQuickInputParseIssue[];
      readonly partial: FoodQuickInputPartial;
      readonly status: "complete";
    };

type FoodQuickInputNutrientFieldName = Exclude<
  FoodQuickInputFieldName,
  "brand" | "name"
>;

export const FoodQuickInput = Schema.Struct({
  name: NonEmptyString,
  brand: Schema.optional(NonEmptyString),
  energyKcal: NonNegativeNumber,
  proteinGrams: NonNegativeNumber,
  carbsGrams: NonNegativeNumber,
  fatGrams: NonNegativeNumber,
  fiberGrams: Schema.optional(NonNegativeNumber),
  sugarGrams: Schema.optional(NonNegativeNumber),
  saturatedFatGrams: Schema.optional(NonNegativeNumber),
  saltGrams: Schema.optional(NonNegativeNumber),
});

export class FoodQuickInputParseError extends Data.TaggedError(
  "FoodQuickInputParseError"
)<FoodQuickInputParseIssue> {}

export const parseFoodQuickInput = Effect.fn("parseFoodQuickInput")(function* ({
  input,
}: {
  readonly input: string;
}) {
  const fields = input.split(",");
  const partial: {
    name?: string;
    brand?: string;
    energyKcal?: number;
    proteinGrams?: number;
    carbsGrams?: number;
    fatGrams?: number;
    fiberGrams?: number;
    sugarGrams?: number;
    saturatedFatGrams?: number;
    saltGrams?: number;
  } = {};
  const issues: FoodQuickInputParseIssue[] = [];

  if (input.trim() === "") {
    return {
      input,
      issues: [],
      partial,
      status: "empty",
    } satisfies FoodQuickInputParseResult;
  }

  const name = _optionalTrimmedString({ value: fields[0] });

  if (name === undefined) {
    issues.push(
      _parseIssue({
        field: "name",
        input,
        message: "Food quick input is missing a food name.",
        reason: "missing-name",
      })
    );
  } else {
    partial.name = name;
  }

  const brand = _optionalTrimmedString({ value: fields[1] });

  if (brand !== undefined) {
    partial.brand = brand;
  }

  const nutrientInput = fields.slice(2).join(",");
  taggedNutrientPattern.lastIndex = 0;
  const hasTaggedNutrients = taggedNutrientPattern.test(nutrientInput);

  if (hasTaggedNutrients) {
    taggedNutrientPattern.lastIndex = 0;

    for (const match of nutrientInput.matchAll(taggedNutrientPattern)) {
      const matchedTag = match[2];
      const field =
        matchedTag === undefined
          ? undefined
          : taggedNutrientFieldsByTag[matchedTag];

      if (field === undefined) {
        issues.push(
          _parseIssue({
            input,
            message: "Food quick input contains an unsupported nutrient tag.",
            reason: "unrecognized-token",
          })
        );
        continue;
      }

      const tag = matchedTag;
      const existingValue = partial[field];

      if (existingValue !== undefined) {
        issues.push(
          _parseIssue({
            field,
            input,
            message: `Food quick input repeats the ${tag} nutrient tag.`,
            reason: "duplicate-tag",
          })
        );
        continue;
      }

      const result = _parseNutrientNumber({
        field,
        input,
        value: match[3],
      });

      if (result.status === "failure") {
        issues.push(result.issue);
      } else {
        partial[field] = result.value;
      }
    }

    taggedNutrientPattern.lastIndex = 0;
    const unparsedInput = nutrientInput
      .replace(taggedNutrientPattern, " ")
      .replaceAll(/[,\s]/g, "");

    if (unparsedInput !== "") {
      issues.push(
        _parseIssue({
          input,
          message: "Food quick input contains unrecognized tagged nutrients.",
          reason: "unrecognized-token",
        })
      );
    }
  } else {
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
      issues.push(
        _parseIssue({
          input,
          message: "Food quick input has too many positional nutrient fields.",
          reason: "too-many-fields",
        })
      );
    }

    for (const [index, field] of positionalNutrientFields.entries()) {
      const trimmedValue = normalizedFields[index]?.trim() ?? "";

      if (trimmedValue === "") {
        continue;
      }

      const result = _parseNutrientNumber({
        field,
        input,
        value: trimmedValue,
      });

      if (result.status === "failure") {
        issues.push(result.issue);
      } else {
        partial[field] = result.value;
      }
    }
  }

  for (const nutrient of requiredNutrients) {
    if (
      partial[nutrient.field] === undefined &&
      !issues.some((issue) => issue.field === nutrient.field)
    ) {
      issues.push(
        _parseIssue({
          field: nutrient.field,
          input,
          message: `Food quick input is missing required ${nutrient.label}.`,
          reason: "missing-required-nutrient",
        })
      );
    }
  }

  const decodedFood = yield* Schema.decodeUnknownEffect(FoodQuickInput)(
    partial
  ).pipe(
    Effect.match({
      onFailure: () => undefined,
      onSuccess: (food) => food,
    })
  );

  const hasIssues = Array.isArrayNonEmpty(issues);

  if (!hasIssues && decodedFood !== undefined) {
    return {
      food: decodedFood,
      input,
      issues: [],
      partial: decodedFood,
      status: "complete",
    } satisfies FoodQuickInputParseResult;
  }

  const resultIssues = hasIssues
    ? issues
    : [
        _parseIssue({
          input,
          message: "Food quick input did not match the food schema.",
          reason: "schema-error",
        }),
      ];
  const status = resultIssues.some(
    (issue) =>
      issue.reason !== "missing-name" &&
      issue.reason !== "missing-required-nutrient"
  )
    ? "invalid"
    : "incomplete";

  return {
    input,
    issues: resultIssues,
    partial,
    status,
  } satisfies FoodQuickInputParseResult;
});

function _parseNutrientNumber({
  field,
  input,
  value,
}: {
  readonly field: FoodQuickInputNutrientFieldName;
  readonly input: string;
  readonly value: string | undefined;
}):
  | {
      readonly issue: FoodQuickInputParseIssue;
      readonly status: "failure";
    }
  | {
      readonly status: "success";
      readonly value: number;
    } {
  const trimmedValue = value?.trim() ?? "";
  const parsedValue = Number(trimmedValue);

  if (
    trimmedValue === "" ||
    !nutrientNumberPattern.test(trimmedValue) ||
    !Number.isFinite(parsedValue) ||
    parsedValue < 0
  ) {
    return {
      issue: _parseIssue({
        field,
        input,
        message: "Food quick input contains an invalid nutrient number.",
        reason: "invalid-number",
      }),
      status: "failure",
    };
  }

  return {
    status: "success",
    value: parsedValue,
  };
}

function _parseIssue({
  field,
  input,
  message,
  reason,
}: FoodQuickInputParseIssue): FoodQuickInputParseIssue {
  return {
    ...(field === undefined ? {} : { field }),
    input,
    message,
    reason,
  };
}

function _optionalTrimmedString({
  value,
}: {
  readonly value: string | undefined;
}) {
  const trimmedValue = value?.trim() ?? "";

  return trimmedValue === "" ? undefined : trimmedValue;
}
