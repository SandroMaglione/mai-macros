import {
  parseFoodQuickInput,
  type Food,
  type FoodQuickInput,
  type FoodQuickInputParseError,
} from "@mai/nutrition";
import { Link } from "@tanstack/react-router";
import { useMachine } from "@xstate/react";
import { Effect, Result } from "effect";
import { Apple, Plus, Rows3, Save, TextCursorInput, X } from "lucide-react";
import { useMemo, useRef, type FocusEvent } from "react";
import { assign, setup } from "xstate";

import type { CreateFoodInput } from "../services/foods.ts";
import {
  createFoodInputFromFoodQuickInput,
  createFoodInputFromFormData,
} from "../utils.ts";
import { FoodBarcodeImport } from "./food-barcode-import.tsx";
import {
  FoodNutrientOverview,
  formatFoodNutrientNumber,
  foodQuickInputNutrients,
} from "./food-nutrient-overview.tsx";

type FoodFormAction = "create" | "edit";
type FoodCreateMode = "manual" | "quick";
type FoodQuickInputParseState =
  | {
      readonly status: "empty";
    }
  | {
      readonly error: FoodQuickInputParseError;
      readonly status: "failure";
    }
  | {
      readonly createInput: CreateFoodInput;
      readonly food: FoodQuickInput;
      readonly status: "success";
    };

type FoodFormMachineContext = {
  readonly createMode: FoodCreateMode;
  readonly quickInput: string;
};

type FoodFormMachineEvent =
  | {
      readonly mode: FoodCreateMode;
      readonly type: "selectCreateMode";
    }
  | {
      readonly input: string;
      readonly type: "changeQuickInput";
    };

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

const foodFormMachine = setup({
  types: {
    context: {} as FoodFormMachineContext,
    events: {} as FoodFormMachineEvent,
  },
}).createMachine({
  context: {
    createMode: "manual",
    quickInput: "",
  },
  on: {
    changeQuickInput: {
      actions: assign(({ event }) => ({
        quickInput: event.input,
      })),
    },
    selectCreateMode: {
      actions: assign(({ event }) => ({
        createMode: event.mode,
      })),
    },
  },
});

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
  readonly onSubmit: (input: CreateFoodInput) => void;
}) {
  const isCreating = action === "create";
  const SubmitIcon = isCreating ? Plus : Save;
  const title = isCreating ? "Create food" : "Edit food";
  const submitText = hasFailed ? "Try again" : isCreating ? title : "Save food";
  const formRef = useRef<HTMLFormElement>(null);
  const [snapshot, send] = useMachine(foodFormMachine);
  const createMode = snapshot.context.createMode;

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

            onSubmit(
              createFoodInputFromFormData({
                formData: new FormData(event.currentTarget),
              })
            );
          }}
          ref={formRef}
        >
          {isCreating ? (
            <FoodCreateModeSwitch
              disabled={disabled}
              mode={createMode}
              onChange={(mode) => {
                send({
                  type: "selectCreateMode",
                  mode,
                });
              }}
            />
          ) : null}

          {isCreating && createMode === "quick" ? (
            <FoodQuickInputForm
              dateKey={dateKey}
              disabled={disabled}
              hasFailed={hasFailed}
              input={snapshot.context.quickInput}
              onChangeInput={(input) => {
                send({
                  type: "changeQuickInput",
                  input,
                });
              }}
              onSubmit={onSubmit}
            />
          ) : (
            <>
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
            </>
          )}
        </form>
      </section>
    </main>
  );
}

function FoodCreateModeSwitch({
  disabled,
  mode,
  onChange,
}: {
  readonly disabled: boolean;
  readonly mode: FoodCreateMode;
  readonly onChange: (mode: FoodCreateMode) => void;
}) {
  return (
    <div
      aria-label="Food creation mode"
      className="grid grid-cols-2 gap-2 rounded-[10px] bg-[#161618] p-1"
      role="group"
    >
      <FoodCreateModeButton
        disabled={disabled}
        icon="manual"
        isSelected={mode === "manual"}
        label="Manual"
        onClick={() => {
          onChange("manual");
        }}
      />
      <FoodCreateModeButton
        disabled={disabled}
        icon="quick"
        isSelected={mode === "quick"}
        label="Text"
        onClick={() => {
          onChange("quick");
        }}
      />
    </div>
  );
}

function FoodCreateModeButton({
  disabled,
  icon,
  isSelected,
  label,
  onClick,
}: {
  readonly disabled: boolean;
  readonly icon: FoodCreateMode;
  readonly isSelected: boolean;
  readonly label: string;
  readonly onClick: () => void;
}) {
  const Icon = icon === "manual" ? Rows3 : TextCursorInput;

  return (
    <button
      aria-pressed={isSelected}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-transparent px-3 text-sm font-black text-[#aaaab1] transition-colors hover:bg-[#202024] aria-pressed:border-[#3d2827] aria-pressed:bg-[#201717] aria-pressed:text-[#ff5a51] disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden="true" size={16} strokeWidth={3} />
      {label}
    </button>
  );
}

function FoodQuickInputForm({
  dateKey,
  disabled,
  hasFailed,
  input,
  onChangeInput,
  onSubmit,
}: {
  readonly dateKey: string | undefined;
  readonly disabled: boolean;
  readonly hasFailed: boolean;
  readonly input: string;
  readonly onChangeInput: (input: string) => void;
  readonly onSubmit: (input: CreateFoodInput) => void;
}) {
  const parseState = useMemo<FoodQuickInputParseState>(() => {
    if (input.trim() === "") {
      return { status: "empty" };
    }

    const result = Effect.runSync(
      Effect.result(parseFoodQuickInput({ input }))
    );

    return Result.match(result, {
      onFailure: (error) => ({
        error,
        status: "failure" as const,
      }),
      onSuccess: (food) => ({
        createInput: createFoodInputFromFoodQuickInput({ food }),
        food,
        status: "success" as const,
      }),
    });
  }, [input]);
  const canSubmit = parseState.status === "success";

  return (
    <div className="grid gap-4">
      <label className={foodFieldLabelClassName}>
        Food text
        <textarea
          autoComplete="off"
          autoFocus
          className={`${foodFieldClassName} min-h-28 resize-y py-3 leading-relaxed`}
          disabled={disabled}
          onChange={(event) => {
            onChangeInput(event.currentTarget.value);
          }}
          placeholder="Yogurt greco 0%, Fage, k59 f0.4 sf0.1 c3.6 su3.2 fi0 p10 sa0.1"
          value={input}
        />
      </label>

      <FoodQuickInputPreview parseState={parseState} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#ff5a51] bg-[#ff5a51] px-4 text-sm font-black text-white transition-colors hover:bg-[#ff6a61] disabled:cursor-not-allowed disabled:border-[#74322f] disabled:bg-[#74322f] disabled:opacity-60 sm:w-fit"
          disabled={disabled || !canSubmit}
          onClick={() => {
            if (parseState.status === "success") {
              onSubmit(parseState.createInput);
            }
          }}
          type="button"
        >
          <Plus aria-hidden="true" size={18} strokeWidth={3} />
          {hasFailed ? "Try again" : "Create food"}
        </button>
        <BackToDayLink dateKey={dateKey} />
      </div>
    </div>
  );
}

function FoodQuickInputPreview({
  parseState,
}: {
  readonly parseState: FoodQuickInputParseState;
}) {
  if (parseState.status === "empty") {
    return (
      <div className="rounded-[10px] bg-[#1b1b1e] p-4 shadow-[0_12px_28px_rgb(0_0_0/0.26)]">
        <p className="text-sm font-bold leading-relaxed text-[#aaaab1]">
          No food text yet.
        </p>
      </div>
    );
  }

  if (parseState.status === "failure") {
    return <FoodQuickInputError error={parseState.error} />;
  }

  return (
    <div className="rounded-[10px] bg-[#1b1b1e] p-4 shadow-[0_12px_28px_rgb(0_0_0/0.26)]">
      <FoodNutrientOverview
        brand={parseState.food.brand}
        name={parseState.food.name}
        nutrients={foodQuickInputNutrients({ food: parseState.food })}
        primaryLabel={`${formatFoodNutrientNumber({
          value: parseState.food.energyKcalPer100g,
        })} kcal`}
        secondaryLabel="per 100g"
      />
    </div>
  );
}

function FoodQuickInputError({
  error,
}: {
  readonly error: FoodQuickInputParseError;
}) {
  return (
    <div className="grid gap-3 rounded-[10px] border border-[#74322f] bg-[#201717] p-4 shadow-[0_12px_28px_rgb(0_0_0/0.26)]">
      <div className="grid gap-1">
        <p className="text-sm font-black leading-tight text-[#ff5a51]">
          {error.message}
        </p>
        <p className="text-xs font-bold uppercase leading-tight tracking-normal text-[#d79a95]">
          {error.reason}
        </p>
      </div>
      {error.field === undefined ? null : (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 text-sm leading-tight">
          <dt className="font-bold text-[#aaaab1]">Field</dt>
          <dd className="min-w-0 font-black text-[#f0f0f2] wrap-anywhere">
            {error.field}
          </dd>
        </dl>
      )}
    </div>
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
