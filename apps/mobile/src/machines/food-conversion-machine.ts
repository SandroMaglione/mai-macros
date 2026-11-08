import { Domain, Foods } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { Effect, Predicate, Schema } from "effect";

export const ConversionForm = Schema.Struct({
  massAmount: Schema.String,
  massUnit: Domain.MassUnit,
  volumeAmount: Schema.String,
  volumeUnit: Domain.VolumeUnit,
});

export type ConversionForm = typeof ConversionForm.Type;

export type ConversionValue = {
  readonly mass: {
    readonly amount: number;
    readonly unit: Domain.MassUnit;
  };
  readonly volume: {
    readonly amount: number;
    readonly unit: Domain.VolumeUnit;
  };
};

type ConversionMutationInput = {
  readonly food: Domain.Food;
  readonly form: ConversionForm;
};

export function conversionFromForm(form: ConversionForm) {
  if (form.massAmount.trim() === "" && form.volumeAmount.trim() === "") {
    return undefined;
  }
  return {
    mass: {
      amount: Number(form.massAmount.replace(",", ".")),
      unit: form.massUnit,
    },
    volume: {
      amount: Number(form.volumeAmount.replace(",", ".")),
      unit: form.volumeUnit,
    },
  } satisfies ConversionValue;
}

function _emptyForm(): ConversionForm {
  return { massAmount: "", massUnit: "kg", volumeAmount: "", volumeUnit: "l" };
}

function _formFromFood(food: Domain.Food): ConversionForm {
  const conversion = food.massVolumeConversion;
  return conversion === undefined
    ? _emptyForm()
    : {
        massAmount: `${conversion.mass.amount}`,
        massUnit: conversion.mass.unit,
        volumeAmount: `${conversion.volume.amount}`,
        volumeUnit: conversion.volume.unit,
      };
}

function _setFoodMassVolumeConversionInput({
  food,
  form,
}: ConversionMutationInput): Foods.SetFoodMassVolumeConversionInput {
  const conversion = conversionFromForm(form);
  return {
    foodId: food.id,
    ...(conversion === undefined
      ? {}
      : {
          massVolumeConversion: {
            mass: {
              amount: `${conversion.mass.amount}`,
              unit: conversion.mass.unit,
            },
            volume: {
              amount: `${conversion.volume.amount}`,
              unit: conversion.volume.unit,
            },
          },
        }),
  };
}

function _mutationErrorMessage(error: unknown) {
  if (Predicate.isTagged(error, "IncompatibleFoodMeasurement")) {
    return "This conversion cannot interpret every previous meal entry.";
  }
  return "Could not save the conversion. Check the values and try again.";
}

export const FoodConversionData = Schema.Struct({
  food: Domain.Food,
  usage: Foods.FoodEditUsage,
});

export type FoodConversionData = typeof FoodConversionData.Type;

export const FoodConversionLoaderStates = Machine.state({
  fields: { foodId: Domain.FoodId },
  states: {
    Loading: {},
    Failed: { fields: { message: Schema.String } },
    Ready: { fields: { data: FoodConversionData } },
  },
});

export const FoodConversionLoaderEvents = Machine.events({ Retry: {} });

export const FoodConversionLoaderMachine = Machine.make({
  id: "FoodConversionLoader",
  root: FoodConversionLoaderStates,
  events: FoodConversionLoaderEvents,
  input: Schema.Struct({ foodId: Domain.FoodId }),
  effects: {
    load: (foodId: Domain.FoodId) =>
      Effect.gen(function* () {
        const foods = yield* Foods.Foods;

        return {
          food: yield* foods.get({ input: { foodId } }),
          usage: yield* foods.inspectEdit({ input: { foodId } }),
        };
      }),
  },
}).handle({
  root: ({ input }) => ({ foodId: input.foodId }),
  initial: { target: "Loading" },
  states: {
    Loading: {
      invoke: {
        src: "load",
        input: ({ root }) => root.foodId,
        onDone: {
          target: "Ready",
          data: ({ output }) => ({ data: output }),
        },
        onFailure: {
          target: "Failed",
          data: { message: "Could not load this food conversion." },
        },
      },
    },
    Failed: {
      on: { Retry: { target: "Loading" } },
    },
    Ready: {},
  },
});

export const FoodConversionStates = Machine.state({
  fields: {
    food: Domain.Food,
    usage: Foods.FoodEditUsage,
    form: ConversionForm,
    message: Schema.NullOr(Schema.String),
    messageTone: Schema.Literals(["danger", "success"]),
  },
  states: {
    Editing: {},
    Previewing: {},
    Reviewing: {},
    Saving: {},
  },
});

export const FoodConversionEvents = Machine.events({
  CancelReview: {},
  ChangeMassAmount: { value: Schema.String },
  ChangeMassUnit: { unit: Domain.MassUnit },
  ChangeVolumeAmount: { value: Schema.String },
  ChangeVolumeUnit: { unit: Domain.VolumeUnit },
  Confirm: {},
  Remove: {},
  Submit: {},
});

export const FoodConversionMachine = Machine.make({
  id: "FoodConversion",
  root: FoodConversionStates,
  events: FoodConversionEvents,
  input: FoodConversionData,
  effects: {
    preview: (input: ConversionMutationInput) =>
      Effect.gen(function* () {
        const foods = yield* Foods.Foods;

        return yield* foods.previewFoodMassVolumeConversionEdit({
          input: _setFoodMassVolumeConversionInput(input),
        });
      }),
    save: (input: ConversionMutationInput) =>
      Effect.gen(function* () {
        const foods = yield* Foods.Foods;

        return yield* foods.setFoodMassVolumeConversion({
          input: _setFoodMassVolumeConversionInput(input),
        });
      }),
  },
  branches: {
    mutate: {
      preview: {
        target: "Previewing",
        update: "root",
        title: "Food has previous meal entries",
      },
      save: {
        target: "Saving",
        update: "root",
        title: "Food has no previous meal entries",
      },
    },
  },
}).handle({
  root: ({ input }) => ({
    food: input.food,
    usage: input.usage,
    form: _formFromFood(input.food),
    message: null,
    messageTone: "success",
  }),
  initial: { target: "Editing" },
  on: {
    ChangeMassAmount: {
      update: "root",
      data: ({ root, event }) => ({
        ...root,
        form: { ...root.form, massAmount: event.value },
      }),
    },
    ChangeMassUnit: {
      update: "root",
      data: ({ root, event }) => ({
        ...root,
        form: { ...root.form, massUnit: event.unit },
      }),
    },
    ChangeVolumeAmount: {
      update: "root",
      data: ({ root, event }) => ({
        ...root,
        form: { ...root.form, volumeAmount: event.value },
      }),
    },
    ChangeVolumeUnit: {
      update: "root",
      data: ({ root, event }) => ({
        ...root,
        form: { ...root.form, volumeUnit: event.unit },
      }),
    },
  },
  states: {
    Editing: {
      on: {
        Remove: {
          branches: "mutate",
          resolve: ({ root, select }) => {
            const data = { ...root, form: _emptyForm(), message: null };

            return root.usage.mealEntryCount > 0
              ? select.preview({ update: { data } })
              : select.save({ update: { data } });
          },
        },
        Submit: {
          branches: "mutate",
          resolve: ({ root, select }) => {
            const data = { ...root, message: null };

            return root.usage.mealEntryCount > 0
              ? select.preview({ update: { data } })
              : select.save({ update: { data } });
          },
        },
      },
    },
    Previewing: {
      invoke: {
        src: "preview",
        input: ({ root }) => ({ food: root.food, form: root.form }),
        onDone: { target: "Reviewing" },
        onFailure: {
          target: "Editing",
          update: "root",
          data: ({ root, error }) => ({
            target: undefined,
            update: {
              ...root,
              message: _mutationErrorMessage(error),
              messageTone: "danger",
            },
          }),
        },
      },
    },
    Reviewing: {
      on: {
        CancelReview: { target: "Editing" },
        Confirm: { target: "Saving" },
      },
    },
    Saving: {
      invoke: {
        src: "save",
        input: ({ root }) => ({ food: root.food, form: root.form }),
        onDone: {
          target: "Editing",
          update: "root",
          data: ({ root, output }) => ({
            target: undefined,
            update: {
              ...root,
              food: output.food,
              form: _formFromFood(output.food),
              message:
                output.food.massVolumeConversion === undefined
                  ? "Conversion removed."
                  : "Conversion saved.",
              messageTone: "success",
            },
          }),
        },
        onFailure: {
          target: "Editing",
          update: "root",
          data: ({ root, error }) => ({
            target: undefined,
            update: {
              ...root,
              message: _mutationErrorMessage(error),
              messageTone: "danger",
            },
          }),
        },
      },
    },
  },
});
