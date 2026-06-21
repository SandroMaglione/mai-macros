import {
  type Food,
  type FoodQuickInputParseIssue,
  type FoodQuickInputParseResult,
} from "@mai/nutrition";
import {
  type FoodFormActorRef,
  type FoodFormSnapshot,
  type FoodFormValues,
  type FoodNumberWarning,
  type FoodNutrientFieldName,
} from "@mai/machines/foods";
import { Link } from "@tanstack/react-router";
import { useSelector } from "@xstate/react";
import { Array } from "effect";
import { AlertTriangle, ChevronLeft, Plus, Save } from "lucide-react";
import { type FocusEvent } from "react";

import { AppHeader, appHeaderActionClassName } from "./app-header.tsx";
import {
  FoodNutrientOverview,
  foodQuickInputNutrientOverviewOrder,
  foodQuickInputNutrients,
  formatFoodNutrientNumber,
} from "./food-nutrient-overview.tsx";

export { foodFormMachine, type FoodFormSubmitEvent } from "@mai/machines/foods";

type FoodFormAction = "create" | "edit";

type FoodNutrientField = {
  readonly accentClassName: string;
  readonly label: string;
  readonly name: FoodNutrientFieldName;
  readonly placeholder: string;
  readonly required: boolean;
  readonly step: "0.01";
  readonly unit: "g" | "kcal";
};

const foodFieldClassName =
  "min-h-10 w-full rounded-md border border-[#37373b] bg-[#111113] px-3 text-sm font-bold text-[#f0f0f2] outline-none transition placeholder:text-[#77777e] focus:border-[#ff5a51] focus:ring-2 focus:ring-[#ff5a51]/25 disabled:cursor-not-allowed disabled:opacity-50";
const foodFieldLabelClassName =
  "grid min-w-0 gap-1.5 text-sm font-black leading-tight text-[#d9d9de]";

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

function _selectInputText(event: FocusEvent<HTMLInputElement>) {
  event.currentTarget.select();
}
