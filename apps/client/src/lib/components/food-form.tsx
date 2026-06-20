import {
  parseFoodQuickInput,
  type Food,
  type FoodQuickInputParseIssue,
  type FoodQuickInputParseResult,
} from "@mai/nutrition";
import { Link } from "@tanstack/react-router";
import { useSelector } from "@xstate/react";
import { Array, Effect } from "effect";
import { AlertTriangle, ChevronLeft, Plus, Save } from "lucide-react";
import { type FocusEvent } from "react";
import {
  assign,
  sendParent,
  setup,
  type ActorRefFrom,
  type SnapshotFrom,
} from "xstate";

import type { CreateFoodInput } from "../services/foods.ts";
import { AppHeader, appHeaderActionClassName } from "./app-header.tsx";
import {
  FoodNutrientOverview,
  foodQuickInputNutrientOverviewOrder,
  foodQuickInputNutrients,
  formatFoodNutrientNumber,
} from "./food-nutrient-overview.tsx";

type FoodFormAction = "create" | "edit";

type FoodNutrientFieldName =
  | "energyKcalPer100g"
  | "proteinGramsPer100g"
  | "carbsGramsPer100g"
  | "fatGramsPer100g"
  | "fiberGramsPer100g"
  | "sugarGramsPer100g"
  | "saturatedFatGramsPer100g"
  | "saltGramsPer100g";

type FoodNutrientField = {
  readonly accentClassName: string;
  readonly label: string;
  readonly name: FoodNutrientFieldName;
  readonly placeholder: string;
  readonly required: boolean;
  readonly step: "0.01";
  readonly unit: "g" | "kcal";
};

type FoodFormValues = Record<"brand" | "name" | FoodNutrientFieldName, string>;

type FoodNumberWarning = {
  readonly field?: FoodNutrientFieldName;
  readonly message: string;
};

type FoodFormMachineContext = {
  readonly formValues: FoodFormValues;
  readonly numberWarnings: readonly FoodNumberWarning[];
  readonly quickInput: string;
  readonly quickInputParseResult: FoodQuickInputParseResult;
  readonly syncQuickInputFromFields: boolean;
};

type FoodFormMachineEvent =
  | {
      readonly input: string;
      readonly type: "changeQuickInput";
    }
  | {
      readonly name: keyof FoodFormValues;
      readonly type: "changeFormValue";
      readonly value: string;
    }
  | {
      readonly type: "submit";
    };

const foodFieldClassName =
  "min-h-10 w-full rounded-md border border-[#37373b] bg-[#111113] px-3 text-sm font-bold text-[#f0f0f2] outline-none transition placeholder:text-[#77777e] focus:border-[#ff5a51] focus:ring-2 focus:ring-[#ff5a51]/25 disabled:cursor-not-allowed disabled:opacity-50";
const foodFieldLabelClassName =
  "grid min-w-0 gap-1.5 text-sm font-black leading-tight text-[#d9d9de]";

export type FoodFormSubmitEvent = {
  readonly input: CreateFoodInput;
  readonly type: "submit";
};

export const foodFormMachine = setup({
  types: {
    context: {} as FoodFormMachineContext,
    events: {} as FoodFormMachineEvent,
    input: {} as {
      readonly initialFood: Food | null;
      readonly syncQuickInputFromFields: boolean;
    },
  },
}).createMachine({
  context: ({ input }) => {
    const food = input.initialFood;
    const formValues = {
      name: food?.name ?? "",
      brand: food?.brand ?? "",
      energyKcalPer100g: food === null ? "" : `${food.energyKcalPer100g}`,
      proteinGramsPer100g: food === null ? "" : `${food.proteinGramsPer100g}`,
      carbsGramsPer100g: food === null ? "" : `${food.carbsGramsPer100g}`,
      fatGramsPer100g: food === null ? "" : `${food.fatGramsPer100g}`,
      fiberGramsPer100g:
        food?.fiberGramsPer100g === undefined
          ? ""
          : `${food.fiberGramsPer100g}`,
      sugarGramsPer100g:
        food?.sugarGramsPer100g === undefined
          ? ""
          : `${food.sugarGramsPer100g}`,
      saturatedFatGramsPer100g:
        food?.saturatedFatGramsPer100g === undefined
          ? ""
          : `${food.saturatedFatGramsPer100g}`,
      saltGramsPer100g:
        food?.saltGramsPer100g === undefined ? "" : `${food.saltGramsPer100g}`,
    } satisfies FoodFormValues;
    const quickInput = "";

    return {
      formValues,
      numberWarnings: _foodNumberWarningsFromFormValues({ formValues }),
      quickInput,
      quickInputParseResult: Effect.runSync(
        parseFoodQuickInput({ input: quickInput })
      ),
      syncQuickInputFromFields: input.syncQuickInputFromFields,
    };
  },
  on: {
    submit: {
      actions: sendParent(({ context }) => {
        return {
          type: "submit",
          input: _createFoodInputFromFormValues({
            formValues: context.formValues,
          }),
        } satisfies FoodFormSubmitEvent;
      }),
    },
    changeFormValue: {
      actions: assign(({ context, event }) => {
        const formValues = {
          ...context.formValues,
          [event.name]: event.value,
        };
        const name = formValues.name.trim();
        const brand = formValues.brand.trim();
        const nutrients = [
          _quickNutrientTag({
            tag: "k",
            value: formValues.energyKcalPer100g,
          }),
          _quickNutrientTag({
            tag: "f",
            value: formValues.fatGramsPer100g,
          }),
          _quickNutrientTag({
            tag: "sf",
            value: formValues.saturatedFatGramsPer100g,
          }),
          _quickNutrientTag({
            tag: "c",
            value: formValues.carbsGramsPer100g,
          }),
          _quickNutrientTag({
            tag: "su",
            value: formValues.sugarGramsPer100g,
          }),
          _quickNutrientTag({
            tag: "fi",
            value: formValues.fiberGramsPer100g,
          }),
          _quickNutrientTag({
            tag: "p",
            value: formValues.proteinGramsPer100g,
          }),
          _quickNutrientTag({
            tag: "sa",
            value: formValues.saltGramsPer100g,
          }),
        ].filter((value): value is string => value !== undefined);
        const quickInput = context.syncQuickInputFromFields
          ? [name, brand, nutrients.join(" ")]
              .join(", ")
              .replace(/(?:, )+$/g, "")
          : context.quickInput;

        return {
          formValues,
          numberWarnings: _foodNumberWarningsFromFormValues({ formValues }),
          quickInput,
          quickInputParseResult: context.syncQuickInputFromFields
            ? Effect.runSync(parseFoodQuickInput({ input: quickInput }))
            : context.quickInputParseResult,
        };
      }),
    },
    changeQuickInput: {
      actions: assign(({ event }) => {
        const quickInputParseResult = Effect.runSync(
          parseFoodQuickInput({ input: event.input })
        );
        const { partial } = quickInputParseResult;
        const formValues = {
          name: partial.name ?? "",
          brand: partial.brand ?? "",
          energyKcalPer100g:
            partial.energyKcalPer100g === undefined
              ? ""
              : `${partial.energyKcalPer100g}`,
          proteinGramsPer100g:
            partial.proteinGramsPer100g === undefined
              ? ""
              : `${partial.proteinGramsPer100g}`,
          carbsGramsPer100g:
            partial.carbsGramsPer100g === undefined
              ? ""
              : `${partial.carbsGramsPer100g}`,
          fatGramsPer100g:
            partial.fatGramsPer100g === undefined
              ? ""
              : `${partial.fatGramsPer100g}`,
          fiberGramsPer100g:
            partial.fiberGramsPer100g === undefined
              ? ""
              : `${partial.fiberGramsPer100g}`,
          sugarGramsPer100g:
            partial.sugarGramsPer100g === undefined
              ? ""
              : `${partial.sugarGramsPer100g}`,
          saturatedFatGramsPer100g:
            partial.saturatedFatGramsPer100g === undefined
              ? ""
              : `${partial.saturatedFatGramsPer100g}`,
          saltGramsPer100g:
            partial.saltGramsPer100g === undefined
              ? ""
              : `${partial.saltGramsPer100g}`,
        } satisfies FoodFormValues;

        return {
          formValues,
          numberWarnings: _foodNumberWarningsFromFormValues({ formValues }),
          quickInput: event.input,
          quickInputParseResult,
        };
      }),
    },
  },
});

export type FoodFormActorRef = ActorRefFrom<typeof foodFormMachine>;
type FoodFormSnapshot = SnapshotFrom<typeof foodFormMachine>;

const macroFields: readonly FoodNutrientField[] = [
  {
    accentClassName: "text-[#4c7dff]",
    label: "Calories",
    name: "energyKcalPer100g",
    placeholder: "62",
    required: true,
    step: "0.01",
    unit: "kcal",
  },
  {
    accentClassName: "text-[#4c7dff]",
    label: "Protein",
    name: "proteinGramsPer100g",
    placeholder: "10",
    required: true,
    step: "0.01",
    unit: "g",
  },
  {
    accentClassName: "text-[#ff4f8b]",
    label: "Carbs",
    name: "carbsGramsPer100g",
    placeholder: "3.6",
    required: true,
    step: "0.01",
    unit: "g",
  },
  {
    accentClassName: "text-[#ffbd35]",
    label: "Fat",
    name: "fatGramsPer100g",
    placeholder: "0.4",
    required: true,
    step: "0.01",
    unit: "g",
  },
];

const nutrientFields: readonly FoodNutrientField[] = [
  {
    accentClassName: "text-[#ff4f8b]",
    label: "Fiber",
    name: "fiberGramsPer100g",
    placeholder: "0",
    required: false,
    step: "0.01",
    unit: "g",
  },
  {
    accentClassName: "text-[#ff4f8b]",
    label: "Sugar",
    name: "sugarGramsPer100g",
    placeholder: "3.2",
    required: false,
    step: "0.01",
    unit: "g",
  },
  {
    accentClassName: "text-[#ffbd35]",
    label: "Saturated fat",
    name: "saturatedFatGramsPer100g",
    placeholder: "0.1",
    required: false,
    step: "0.01",
    unit: "g",
  },
  {
    accentClassName: "text-[#aaaab1]",
    label: "Salt",
    name: "saltGramsPer100g",
    placeholder: "0.1",
    required: false,
    step: "0.01",
    unit: "g",
  },
];

export function FoodForm({
  action,
  actor,
  dateKey,
  disabled,
  hasFailed,
}: {
  readonly action: FoodFormAction;
  readonly actor: FoodFormActorRef;
  readonly dateKey: string | undefined;
  readonly disabled: boolean;
  readonly hasFailed: boolean;
}) {
  const isCreating = action === "create";
  const SubmitIcon = isCreating ? Plus : Save;
  const title = isCreating ? "Create food" : "Edit food";
  const submitText = hasFailed ? "Try again" : isCreating ? title : "Save food";
  const snapshot = useSelector(actor, (state): FoodFormSnapshot => state);
  const { formValues, numberWarnings, quickInput, quickInputParseResult } =
    snapshot.context;

  return (
    <main className="min-h-screen bg-[#090909] text-[#e9e9ed] selection:bg-[#7a2c2a] selection:text-white scheme-dark">
      <section className="mx-auto min-h-screen w-full max-w-[520px] bg-[#090909] pb-6">
        <AppHeader
          leading={<BackToDayIconLink dateKey={dateKey} />}
          shadow={true}
          sticky={true}
          title={title}
        />

        <form
          className="grid gap-4 px-4 py-5"
          onSubmit={(event) => {
            event.preventDefault();

            actor.send({ type: "submit" });
          }}
        >
          {isCreating ? (
            <FoodQuickInputTextField
              actor={actor}
              disabled={disabled}
              input={quickInput}
            />
          ) : null}

          <FoodFormFields
            actor={actor}
            autoFocusName={false}
            disabled={disabled}
            initialFood={null}
            values={formValues}
          />

          <FoodNumberWarnings warnings={numberWarnings} />

          {isCreating ? (
            <FoodQuickInputFeedback parseResult={quickInputParseResult} />
          ) : null}

          {isCreating ? null : (
            <p className="rounded-md border border-[#343438] bg-[#111113] p-3 text-sm font-bold leading-snug text-[#aaaab1]">
              Saving replaces this food when it is unused. If previous logs
              already use it, Mai keeps those logs on the original food and
              creates a revised copy for future use.
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              className="btn-primary sm:w-fit"
              disabled={disabled}
              type="submit"
            >
              <SubmitIcon aria-hidden="true" size={18} strokeWidth={3} />
              {submitText}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

function FoodQuickInputTextField({
  actor,
  disabled,
  input,
}: {
  readonly actor: FoodFormActorRef;
  readonly disabled: boolean;
  readonly input: string;
}) {
  return (
    <label className={foodFieldLabelClassName}>
      Food text
      <textarea
        autoComplete="off"
        className={`${foodFieldClassName} resize-none py-2.5 leading-relaxed`}
        disabled={disabled}
        onChange={(event) => {
          actor.send({
            type: "changeQuickInput",
            input: event.currentTarget.value,
          });
        }}
        placeholder="Yogurt greco 0%, Fage, k59 f0.4 sf0.1 c3.6 su3.2 fi0 p10 sa0.1"
        rows={2}
        value={input}
      />
    </label>
  );
}

function FoodQuickInputFeedback({
  parseResult,
}: {
  readonly parseResult: FoodQuickInputParseResult;
}) {
  return (
    <div className="grid gap-4">
      <FoodQuickInputPreview parseResult={parseResult} />
      <FoodQuickInputIssues issues={parseResult.issues} />
    </div>
  );
}

function FoodQuickInputPreview({
  parseResult,
}: {
  readonly parseResult: FoodQuickInputParseResult;
}) {
  if (parseResult.status === "empty") {
    return (
      <div className="rounded-lg bg-[#1b1b1e] p-4 shadow-[0_12px_28px_rgb(0_0_0/0.26)]">
        <p className="text-sm font-bold leading-relaxed text-[#aaaab1]">
          No food text yet.
        </p>
      </div>
    );
  }

  const food =
    parseResult.status === "complete" ? parseResult.food : parseResult.partial;
  const energyKcalPer100g = food.energyKcalPer100g;

  return (
    <div className="rounded-lg bg-[#1b1b1e] p-4 shadow-[0_12px_28px_rgb(0_0_0/0.26)]">
      <FoodNutrientOverview
        brand={food.brand}
        name={food.name ?? "Unnamed food"}
        nutrients={foodQuickInputNutrients({ food })}
        nutrientOrder={foodQuickInputNutrientOverviewOrder}
        primaryLabel={
          energyKcalPer100g === undefined
            ? "Partial"
            : `${formatFoodNutrientNumber({
                value: energyKcalPer100g,
              })} kcal`
        }
        secondaryLabel="per 100g"
      />
    </div>
  );
}

function FoodQuickInputIssues({
  issues,
}: {
  readonly issues: readonly FoodQuickInputParseIssue[];
}) {
  const firstIssue = issues[0];

  if (firstIssue === undefined) {
    return null;
  }

  return (
    <div className="rounded-lg border border-[#74322f] bg-[#201717] p-4 shadow-[0_12px_28px_rgb(0_0_0/0.26)]">
      {issues.map((issue) => (
        <FoodQuickInputIssue
          issue={issue}
          key={`${issue.reason}:${issue.field ?? "input"}:${issue.message}`}
        />
      ))}
    </div>
  );
}

function FoodQuickInputIssue({
  issue,
}: {
  readonly issue: FoodQuickInputParseIssue;
}) {
  return (
    <div className="border-b border-[#3d2827] py-2 first:pt-0 last:border-b-0 last:pb-0">
      <p className="text-sm font-black leading-tight text-[#ff5a51]">
        {issue.message}
      </p>
    </div>
  );
}

function FoodNumberWarnings({
  warnings,
}: {
  readonly warnings: readonly FoodNumberWarning[];
}) {
  if (!Array.isReadonlyArrayNonEmpty(warnings)) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className="grid gap-2 rounded-lg border border-[#5a4720] bg-[#1f1a0d] p-4 shadow-[0_12px_28px_rgb(0_0_0/0.26)]"
    >
      {warnings.map((warning) => (
        <div
          className="flex min-w-0 items-start gap-2 border-b border-[#5a4720] pb-2 last:border-b-0 last:pb-0"
          key={`${warning.field ?? "food"}:${warning.message}`}
        >
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-[#ffbd35]"
            size={16}
            strokeWidth={3}
          />
          <p className="min-w-0 text-sm font-bold leading-snug text-[#d9bd6f]">
            {warning.message}
          </p>
        </div>
      ))}
    </div>
  );
}

export function FoodFormFields({
  actor,
  autoFocusName,
  disabled,
  initialFood,
  values,
}: {
  readonly actor?: FoodFormActorRef;
  readonly autoFocusName: boolean;
  readonly disabled: boolean;
  readonly initialFood: Food | null;
  readonly values?: FoodFormValues;
}) {
  return (
    <>
      <fieldset className="grid gap-3 rounded-lg border-0 bg-[#1b1b1e] p-4 shadow-[0_12px_28px_rgb(0_0_0/0.26)]">
        <legend className="mb-3 text-sm font-black uppercase leading-tight tracking-normal text-[#aaaab1]">
          Details
        </legend>
        <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
          <label className={foodFieldLabelClassName}>
            Name
            <input
              autoComplete="off"
              autoFocus={autoFocusName}
              className={foodFieldClassName}
              disabled={disabled}
              name="name"
              onChange={(event) => {
                _sendFoodFormValueChange({
                  actor,
                  name: "name",
                  value: event.currentTarget.value,
                });
              }}
              onFocus={_selectInputText}
              placeholder="Greek yogurt"
              required
              {...(values === undefined
                ? { defaultValue: initialFood?.name }
                : { value: values.name })}
            />
          </label>

          <label className={foodFieldLabelClassName}>
            Brand
            <input
              autoComplete="off"
              className={foodFieldClassName}
              disabled={disabled}
              name="brand"
              onChange={(event) => {
                _sendFoodFormValueChange({
                  actor,
                  name: "brand",
                  value: event.currentTarget.value,
                });
              }}
              onFocus={_selectInputText}
              placeholder="Mai"
              {...(values === undefined
                ? { defaultValue: initialFood?.brand ?? "" }
                : { value: values.brand })}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="grid gap-3 rounded-lg border-0 bg-[#1b1b1e] p-4 shadow-[0_12px_28px_rgb(0_0_0/0.26)]">
        <legend className="mb-3 text-sm font-black uppercase leading-tight tracking-normal text-[#aaaab1]">
          Calories and macros per 100g
        </legend>

        <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
          {macroFields.map((field) => (
            <FoodNutrientInput
              actor={actor}
              disabled={disabled}
              field={field}
              initialFood={initialFood}
              key={field.name}
              values={values}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-3 rounded-lg border-0 bg-[#1b1b1e] p-4 shadow-[0_12px_28px_rgb(0_0_0/0.26)]">
        <legend className="mb-3 text-sm font-black uppercase leading-tight tracking-normal text-[#aaaab1]">
          Nutrient details per 100g
        </legend>

        <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
          {nutrientFields.map((field) => (
            <FoodNutrientInput
              actor={actor}
              disabled={disabled}
              field={field}
              initialFood={initialFood}
              key={field.name}
              values={values}
            />
          ))}
        </div>
      </fieldset>
    </>
  );
}

function FoodNutrientInput({
  actor,
  disabled,
  field,
  initialFood,
  values,
}: {
  readonly actor?: FoodFormActorRef;
  readonly disabled: boolean;
  readonly field: FoodNutrientField;
  readonly initialFood: Food | null;
  readonly values?: FoodFormValues;
}) {
  const unitPaddingClassName = field.unit === "kcal" ? "pr-14" : "pr-9";

  return (
    <label className={foodFieldLabelClassName}>
      <span className={field.accentClassName}>{field.label}</span>
      <span className="relative">
        <input
          className={`${foodFieldClassName} ${unitPaddingClassName}`}
          disabled={disabled}
          inputMode="decimal"
          min="0"
          name={field.name}
          onChange={(event) => {
            _sendFoodFormValueChange({
              actor,
              name: field.name,
              value: event.currentTarget.value,
            });
          }}
          onFocus={_selectInputText}
          placeholder={field.placeholder}
          required={field.required}
          step={field.step}
          type="number"
          {...(values === undefined
            ? { defaultValue: initialFood?.[field.name] ?? "" }
            : { value: values[field.name] })}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-[#aaaab1]">
          {field.unit}
        </span>
      </span>
    </label>
  );
}

function BackToDayIconLink({
  dateKey,
}: {
  readonly dateKey: string | undefined;
}) {
  if (dateKey === undefined) {
    return (
      <Link
        aria-label="Back to today"
        className={appHeaderActionClassName}
        title="Back to today"
        to="/"
      >
        <ChevronLeft aria-hidden="true" size={31} strokeWidth={2.6} />
      </Link>
    );
  }

  return (
    <Link
      aria-label="Back to day"
      className={appHeaderActionClassName}
      params={{ dateKey }}
      title={`Back to ${dateKey}`}
      to="/days/$dateKey"
    >
      <ChevronLeft aria-hidden="true" size={31} strokeWidth={2.6} />
    </Link>
  );
}

function _foodNumberWarningsFromFormValues({
  formValues,
}: {
  readonly formValues: FoodFormValues;
}) {
  const warnings: FoodNumberWarning[] = [];
  const energyKcal = _formNumber(formValues.energyKcalPer100g);
  const proteinGrams = _formNumber(formValues.proteinGramsPer100g);
  const carbsGrams = _formNumber(formValues.carbsGramsPer100g);
  const fatGrams = _formNumber(formValues.fatGramsPer100g);
  const sugarGrams = _formNumber(formValues.sugarGramsPer100g);
  const saturatedFatGrams = _formNumber(formValues.saturatedFatGramsPer100g);
  const saltGrams = _formNumber(formValues.saltGramsPer100g);
  const macroTotalGrams =
    (proteinGrams ?? 0) + (carbsGrams ?? 0) + (fatGrams ?? 0);
  const macroEnergyKcal =
    (proteinGrams ?? 0) * 4 + (carbsGrams ?? 0) * 4 + (fatGrams ?? 0) * 9;

  if (macroTotalGrams > 100) {
    warnings.push({
      message: "Protein, carbs, and fat add up to more than 100g per 100g.",
    });
  }

  if (energyKcal !== undefined && energyKcal > 900) {
    warnings.push({
      field: "energyKcalPer100g",
      message: "Calories are above 900 kcal per 100g.",
    });
  }

  if (energyKcal !== undefined && macroEnergyKcal > 0) {
    const difference = Math.abs(energyKcal - macroEnergyKcal);
    const threshold = Math.max(50, energyKcal * 0.35);

    if (difference > threshold) {
      warnings.push({
        message:
          "Calories do not closely match the energy from protein, carbs, and fat.",
      });
    }
  }

  if (
    sugarGrams !== undefined &&
    carbsGrams !== undefined &&
    sugarGrams > carbsGrams
  ) {
    warnings.push({
      field: "sugarGramsPer100g",
      message: "Sugar is greater than total carbs.",
    });
  }

  if (
    saturatedFatGrams !== undefined &&
    fatGrams !== undefined &&
    saturatedFatGrams > fatGrams
  ) {
    warnings.push({
      field: "saturatedFatGramsPer100g",
      message: "Saturated fat is greater than total fat.",
    });
  }

  if (saltGrams !== undefined && saltGrams > 20) {
    warnings.push({
      field: "saltGramsPer100g",
      message: "Salt is above 20g per 100g.",
    });
  }

  return warnings;
}

function _quickNutrientTag({
  tag,
  value,
}: {
  readonly tag: string;
  readonly value: string;
}) {
  const trimmedValue = value.trim();

  return trimmedValue === "" ? undefined : `${tag}${trimmedValue}`;
}

function _sendFoodFormValueChange({
  actor,
  name,
  value,
}: {
  readonly actor: FoodFormActorRef | undefined;
  readonly name: keyof FoodFormValues;
  readonly value: string;
}) {
  if (actor === undefined) {
    return;
  }

  actor.send({
    type: "changeFormValue",
    name,
    value,
  });
}

function _createFoodInputFromFormValues({
  formValues,
}: {
  readonly formValues: FoodFormValues;
}): CreateFoodInput {
  const brand = formValues.brand.trim();
  const fiberGramsPer100g = _optionalFormValue(formValues.fiberGramsPer100g);
  const sugarGramsPer100g = _optionalFormValue(formValues.sugarGramsPer100g);
  const saturatedFatGramsPer100g = _optionalFormValue(
    formValues.saturatedFatGramsPer100g
  );
  const saltGramsPer100g = _optionalFormValue(formValues.saltGramsPer100g);

  return {
    name: formValues.name.trim(),
    ...(brand === "" ? {} : { brand }),
    energyKcalPer100g: formValues.energyKcalPer100g,
    proteinGramsPer100g: formValues.proteinGramsPer100g,
    carbsGramsPer100g: formValues.carbsGramsPer100g,
    fatGramsPer100g: formValues.fatGramsPer100g,
    ...(fiberGramsPer100g === undefined ? {} : { fiberGramsPer100g }),
    ...(sugarGramsPer100g === undefined ? {} : { sugarGramsPer100g }),
    ...(saturatedFatGramsPer100g === undefined
      ? {}
      : { saturatedFatGramsPer100g }),
    ...(saltGramsPer100g === undefined ? {} : { saltGramsPer100g }),
  };
}

function _optionalFormValue(value: string) {
  const trimmedValue = value.trim();

  return trimmedValue === "" ? undefined : trimmedValue;
}

function _formNumber(value: string) {
  const trimmedValue = value.trim();

  if (trimmedValue === "") {
    return undefined;
  }

  const parsedValue = Number(trimmedValue);

  return Number.isFinite(parsedValue) ? parsedValue : undefined;
}

function _selectInputText(event: FocusEvent<HTMLInputElement>) {
  event.currentTarget.select();
}
