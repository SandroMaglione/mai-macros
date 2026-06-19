import type { Food } from "@mai/nutrition";
import { Link } from "@tanstack/react-router";
import { Apple, Plus, Save, X } from "lucide-react";
import { useRef, type FocusEvent } from "react";

import { FoodBarcodeImport } from "./food-barcode-import.tsx";

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
  readonly step: "0.1" | "0.01";
  readonly unit: "g" | "kcal";
};

const foodFieldClassName =
  "min-h-10 w-full rounded-md border border-[#37373b] bg-[#111113] px-3 text-sm font-bold text-[#f0f0f2] outline-none transition placeholder:text-[#77777e] focus:border-[#ff5a51] focus:ring-2 focus:ring-[#ff5a51]/25 disabled:cursor-not-allowed disabled:opacity-50";
const foodFieldLabelClassName =
  "grid min-w-0 gap-1.5 text-sm font-black leading-tight text-[#d9d9de]";
const secondaryActionClassName =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#3d2827] bg-[#201717] px-4 text-sm font-black text-[#ff5a51] no-underline transition-colors hover:bg-[#2a1c1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff5a51]/45 sm:w-fit";

const macroFields: readonly FoodNutrientField[] = [
  {
    accentClassName: "text-[#4c7dff]",
    label: "Calories",
    name: "energyKcalPer100g",
    placeholder: "62",
    required: true,
    step: "0.1",
    unit: "kcal",
  },
  {
    accentClassName: "text-[#4c7dff]",
    label: "Protein",
    name: "proteinGramsPer100g",
    placeholder: "10",
    required: true,
    step: "0.1",
    unit: "g",
  },
  {
    accentClassName: "text-[#ff4f8b]",
    label: "Carbs",
    name: "carbsGramsPer100g",
    placeholder: "3.6",
    required: true,
    step: "0.1",
    unit: "g",
  },
  {
    accentClassName: "text-[#ffbd35]",
    label: "Fat",
    name: "fatGramsPer100g",
    placeholder: "0.4",
    required: true,
    step: "0.1",
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
    step: "0.1",
    unit: "g",
  },
  {
    accentClassName: "text-[#ff4f8b]",
    label: "Sugar",
    name: "sugarGramsPer100g",
    placeholder: "3.2",
    required: false,
    step: "0.1",
    unit: "g",
  },
  {
    accentClassName: "text-[#ffbd35]",
    label: "Saturated fat",
    name: "saturatedFatGramsPer100g",
    placeholder: "0.1",
    required: false,
    step: "0.1",
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
  dateKey,
  disabled,
  hasFailed,
  initialFood,
  onSubmit,
}: {
  readonly action: FoodFormAction;
  readonly dateKey: string | undefined;
  readonly disabled: boolean;
  readonly hasFailed: boolean;
  readonly initialFood: Food | null;
  readonly onSubmit: (formData: FormData) => void;
}) {
  const isCreating = action === "create";
  const SubmitIcon = isCreating ? Plus : Save;
  const title = isCreating ? "Create food" : "Edit food";
  const submitText = hasFailed ? "Try again" : isCreating ? title : "Save food";
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <main className="min-h-screen bg-[#090909] text-[#e9e9ed] selection:bg-[#7a2c2a] selection:text-white scheme-dark">
      <section className="mx-auto min-h-screen w-full max-w-[520px] bg-[#090909] pb-6">
        <header className="sticky top-0 z-30 bg-[#ff5a51] pt-[calc(env(safe-area-inset-top)+0.65rem)] shadow-lg shadow-black/25">
          <div className="flex h-16 items-center gap-3 px-4">
            <div className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
              <Apple aria-hidden="true" size={24} strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase leading-none tracking-normal text-white/75">
                Foods
              </p>
              <h1 className="truncate text-2xl font-black leading-tight text-white">
                {title}
              </h1>
            </div>
          </div>
        </header>

        <form
          className="grid gap-4 px-4 py-5"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(new FormData(event.currentTarget));
          }}
          ref={formRef}
        >
          {isCreating ? (
            <FoodBarcodeImport disabled={disabled} formRef={formRef} />
          ) : null}

          <FoodFormFields
            autoFocusName
            disabled={disabled}
            initialFood={initialFood}
          />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#ff5a51] bg-[#ff5a51] px-4 text-sm font-black text-white transition-colors hover:bg-[#ff6a61] disabled:cursor-not-allowed disabled:border-[#74322f] disabled:bg-[#74322f] disabled:opacity-60 sm:w-fit"
              disabled={disabled}
              type="submit"
            >
              <SubmitIcon aria-hidden="true" size={18} strokeWidth={3} />
              {submitText}
            </button>
            <BackToDayLink dateKey={dateKey} />
          </div>
        </form>
      </section>
    </main>
  );
}

export function FoodFormFields({
  autoFocusName,
  disabled,
  initialFood,
}: {
  readonly autoFocusName: boolean;
  readonly disabled: boolean;
  readonly initialFood: Food | null;
}) {
  return (
    <>
      <fieldset className="grid gap-3 rounded-[10px] border-0 bg-[#1b1b1e] p-4 shadow-[0_12px_28px_rgb(0_0_0/0.26)]">
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
              defaultValue={initialFood?.name}
              disabled={disabled}
              name="name"
              onFocus={_selectInputText}
              placeholder="Greek yogurt"
              required
            />
          </label>

          <label className={foodFieldLabelClassName}>
            Brand
            <input
              autoComplete="off"
              className={foodFieldClassName}
              defaultValue={initialFood?.brand ?? ""}
              disabled={disabled}
              name="brand"
              onFocus={_selectInputText}
              placeholder="Mai"
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="grid gap-3 rounded-[10px] border-0 bg-[#1b1b1e] p-4 shadow-[0_12px_28px_rgb(0_0_0/0.26)]">
        <legend className="mb-3 text-sm font-black uppercase leading-tight tracking-normal text-[#aaaab1]">
          Calories and macros per 100g
        </legend>

        <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
          {macroFields.map((field) => (
            <FoodNutrientInput
              disabled={disabled}
              field={field}
              initialFood={initialFood}
              key={field.name}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-3 rounded-[10px] border-0 bg-[#1b1b1e] p-4 shadow-[0_12px_28px_rgb(0_0_0/0.26)]">
        <legend className="mb-3 text-sm font-black uppercase leading-tight tracking-normal text-[#aaaab1]">
          Nutrient details per 100g
        </legend>

        <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2">
          {nutrientFields.map((field) => (
            <FoodNutrientInput
              disabled={disabled}
              field={field}
              initialFood={initialFood}
              key={field.name}
            />
          ))}
        </div>
      </fieldset>
    </>
  );
}

function FoodNutrientInput({
  disabled,
  field,
  initialFood,
}: {
  readonly disabled: boolean;
  readonly field: FoodNutrientField;
  readonly initialFood: Food | null;
}) {
  const unitPaddingClassName = field.unit === "kcal" ? "pr-14" : "pr-9";

  return (
    <label className={foodFieldLabelClassName}>
      <span className={field.accentClassName}>{field.label}</span>
      <span className="relative">
        <input
          className={`${foodFieldClassName} ${unitPaddingClassName}`}
          defaultValue={initialFood?.[field.name] ?? ""}
          disabled={disabled}
          inputMode="decimal"
          min="0"
          name={field.name}
          onFocus={_selectInputText}
          placeholder={field.placeholder}
          required={field.required}
          step={field.step}
          type="number"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-[#aaaab1]">
          {field.unit}
        </span>
      </span>
    </label>
  );
}

function BackToDayLink({ dateKey }: { readonly dateKey: string | undefined }) {
  if (dateKey === undefined) {
    return (
      <Link className={secondaryActionClassName} to="/">
        <X aria-hidden="true" size={17} strokeWidth={3} />
        Cancel
      </Link>
    );
  }

  return (
    <Link
      className={secondaryActionClassName}
      params={{ dateKey }}
      to="/days/$dateKey"
    >
      <X aria-hidden="true" size={17} strokeWidth={3} />
      Cancel
    </Link>
  );
}

function _selectInputText(event: FocusEvent<HTMLInputElement>) {
  event.currentTarget.select();
}
