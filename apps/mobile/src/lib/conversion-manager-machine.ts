import { Domain, Foods } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { Data, Effect, Optic, Match, Schema } from "effect";

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

const emptyForm: ConversionForm = {
  massAmount: "",
  massUnit: "kg",
  volumeAmount: "",
  volumeUnit: "l",
};

class ConversionDefect extends Data.TaggedError("ConversionDefect")<{
  readonly cause: unknown;
}> {}

export const ConversionEvents = Machine.events({
  cancelReview: {},
  confirm: {},
  remove: {},
  retry: {},
  submit: {},
  changeMassAmount: { value: Schema.String },
  changeMassUnit: { unit: Domain.MassUnit },
  changeVolumeAmount: { value: Schema.String },
  changeVolumeUnit: { unit: Domain.VolumeUnit },
});

const ConversionStates = Machine.state({
  states: {
    Loading: { fields: { foodId: Domain.FoodId } },
    LoadFailed: { fields: { foodId: Domain.FoodId } },
    Loaded: {
      fields: {
        food: Domain.Food,
        form: ConversionForm,
        usage: Foods.FoodEditUsage,
      },
      states: {
        Editing: {
          states: {
            Pristine: {},
            Success: { fields: { message: Schema.String } },
            Failure: { fields: { message: Schema.String } },
          },
        },
        ChooseSavePath: { type: "choice" },
        Previewing: {},
        Reviewing: {},
        Saving: {},
      },
    },
  },
});

const form =
  Optic.id<Machine.Value<typeof ConversionStates, "Loaded">>().key("form");

const targets = Machine.targets(ConversionStates);

export const conversionManagerMachine = Machine.make({
  id: "ConversionManager",
  root: ConversionStates,
  events: ConversionEvents,
  input: Schema.Struct({ foodId: Domain.FoodId }),
  effects: {
    load: (foodId: Domain.FoodId) =>
      Effect.gen(function* () {
        const foods = yield* Foods.Foods;
        return {
          food: yield* foods.get({ input: { foodId } }),
          usage: yield* foods.inspectEdit({ input: { foodId } }),
        };
      }).pipe(
        Effect.catchDefect((cause) =>
          Effect.fail(new ConversionDefect({ cause }))
        )
      ),
    preview: (input: Foods.SetFoodMassVolumeConversionInput) =>
      Effect.gen(function* () {
        const foods = yield* Foods.Foods;
        return yield* foods.previewFoodMassVolumeConversionEdit({
          input,
        });
      }).pipe(
        Effect.catchDefect((cause) =>
          Effect.fail(new ConversionDefect({ cause }))
        )
      ),
    save: (input: Foods.SetFoodMassVolumeConversionInput) =>
      Effect.gen(function* () {
        const foods = yield* Foods.Foods;
        return yield* foods.setFoodMassVolumeConversion({
          input,
        });
      }).pipe(
        Effect.catchDefect((cause) =>
          Effect.fail(new ConversionDefect({ cause }))
        )
      ),
  },
  branches: {
    removeConversion: { destination: { target: targets.root.Loaded } },
    chooseSavePath: {
      preview: { target: targets.root.Loaded.Previewing },
      save: { target: targets.root.Loaded.Saving },
    },
  },
}).handle({
  initial: { target: targets.root.Loading, data: ({ input }) => input },
  states: {
    Loading: {
      invoke: {
        src: "load",
        input: ({ state }) => state.foodId,
        onDone: {
          target: targets.root.Loaded,
          data: ({ output }) => ({
            ...output,
            form: _formFromFood(output.food),
          }),
        },
        onFailure: {
          target: targets.root.LoadFailed,
          data: ({ state }) => ({ foodId: state.foodId }),
        },
      },
    },
    LoadFailed: {
      on: {
        retry: {
          target: targets.root.Loading,
          data: ({ state }) => ({ foodId: state.foodId }),
        },
      },
    },
    Loaded: {
      initial: { target: targets.root.Loaded.Editing },
      states: {
        Editing: {
          initial: { target: targets.root.Loaded.Editing.Pristine },
          on: {
            changeMassAmount: {
              update: targets.root.Loaded,
              data: ({ ancestors: { Loaded: current }, event }) =>
                form.key("massAmount").replace(event.value, current),
            },
            changeMassUnit: {
              update: targets.root.Loaded,
              data: ({ ancestors: { Loaded: current }, event }) =>
                form.key("massUnit").replace(event.unit, current),
            },
            changeVolumeAmount: {
              update: targets.root.Loaded,
              data: ({ ancestors: { Loaded: current }, event }) =>
                form.key("volumeAmount").replace(event.value, current),
            },
            changeVolumeUnit: {
              update: targets.root.Loaded,
              data: ({ ancestors: { Loaded: current }, event }) =>
                form.key("volumeUnit").replace(event.unit, current),
            },
            submit: { target: targets.root.Loaded.ChooseSavePath },
            remove: {
              branches: "removeConversion",
              resolve: ({ containingState, select: { destination } }) =>
                destination({
                  data: { ...containingState, form: emptyForm },
                  states: { ChooseSavePath: {} },
                }),
            },
          },
        },
        ChooseSavePath: {
          choice: {
            branches: "chooseSavePath",
            resolve: ({ containingState, select }) =>
              containingState.usage.mealEntryCount > 0
                ? select.preview()
                : select.save(),
          },
        },
        Previewing: {
          invoke: {
            src: "preview",
            input: ({ containingState }) =>
              _setFoodMassVolumeConversionInput(containingState),
            onDone: { target: targets.root.Loaded.Reviewing },
            onFailure: {
              target: targets.root.Loaded.Editing.Failure,
              data: ({ error }) => ({
                message: Match.value(error).pipe(
                  Match.tagsExhaustive({
                    IncompatibleFoodMeasurement: () =>
                      "This conversion cannot interpret every previous meal entry.",
                    SchemaError: () =>
                      "Could not save the conversion. Check the values and try again.",
                    FoodNotFound: () => "This food is no longer available.",
                    NutritionStoreError: () =>
                      "Could not access your saved foods. Please try again.",
                    ConversionDefect: () =>
                      "Could not save the conversion. Please try again.",
                  })
                ),
              }),
            },
          },
        },
        Reviewing: {
          on: {
            cancelReview: { target: targets.root.Loaded.Editing },
            confirm: { target: targets.root.Loaded.Saving },
          },
        },
        Saving: {
          invoke: {
            src: "save",
            input: ({ containingState }) =>
              _setFoodMassVolumeConversionInput(containingState),
            onDone: {
              target: targets.root.Loaded.Editing.Success,
              update: targets.root.Loaded,
              data: ({ ancestors: { Loaded: current }, output }) => ({
                target: {
                  message:
                    output.food.massVolumeConversion === undefined
                      ? "Conversion removed."
                      : "Conversion saved.",
                },
                update: {
                  ...current,
                  food: output.food,
                  form: _formFromFood(output.food),
                },
              }),
            },
            onFailure: {
              target: targets.root.Loaded.Editing.Failure,
              data: ({ error }) => ({
                message: Match.value(error).pipe(
                  Match.tagsExhaustive({
                    IncompatibleFoodMeasurement: () =>
                      "This conversion cannot interpret every previous meal entry.",
                    SchemaError: () =>
                      "Could not save the conversion. Check the values and try again.",
                    FoodNotFound: () => "This food is no longer available.",
                    NutritionStoreError: () =>
                      "Could not access your saved foods. Please try again.",
                    ConversionDefect: () =>
                      "Could not save the conversion. Please try again.",
                  })
                ),
              }),
            },
          },
        },
      },
    },
  },
});

function _formFromFood(food: Domain.Food): ConversionForm {
  const conversion = food.massVolumeConversion;
  return conversion === undefined
    ? emptyForm
    : {
        massAmount: `${conversion.mass.amount}`,
        massUnit: conversion.mass.unit,
        volumeAmount: `${conversion.volume.amount}`,
        volumeUnit: conversion.volume.unit,
      };
}

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

function _setFoodMassVolumeConversionInput({
  food,
  form,
}: {
  readonly food: Domain.Food;
  readonly form: ConversionForm;
}): Foods.SetFoodMassVolumeConversionInput {
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
