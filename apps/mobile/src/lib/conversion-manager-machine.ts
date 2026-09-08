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
  initial: "Loading",
  states: {
    Loading: { fields: { foodId: Domain.FoodId } },
    LoadFailed: { fields: { foodId: Domain.FoodId } },
    Loaded: {
      fields: {
        food: Domain.Food,
        form: ConversionForm,
        usage: Foods.FoodEditUsage,
      },
      initial: "Editing",
      states: {
        Editing: {
          initial: "Pristine",
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

export const conversionManagerMachine = Machine.make({
  id: "ConversionManager",
  root: ConversionStates,
  events: ConversionEvents,
  input: Schema.Struct({ foodId: Domain.FoodId }),
  initialConfiguration: (root) =>
    root.resolve(({ input, target }) =>
      target.from((root) => root.Loading.from(input))
    ),
}).handle({
  states: {
    Loading: {
      invoke: (from) =>
        from
          .effect("load", ({ state: { foodId } }) =>
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
            )
          )
          .onDone((to) =>
            to.local.Loaded.initial.from(({ output }) => ({
              ...output,
              form: _formFromFood(output.food),
            }))
          )
          .onFailure((to) =>
            to.local
              .LoadFailed()
              .from(({ state }) => ({ foodId: state.foodId }))
          ),
    },
    LoadFailed: {
      on: {
        retry: (to) =>
          to.local.Loading().from(({ state }) => ({ foodId: state.foodId })),
      },
    },
    Loaded: {
      states: {
        Editing: {
          on: {
            changeMassAmount: (to) =>
              to.branch.Loaded.update.from(({ current, event }) =>
                form.key("massAmount").replace(event.value, current)
              ),
            changeMassUnit: (to) =>
              to.branch.Loaded.update.from(({ current, event }) =>
                form.key("massUnit").replace(event.unit, current)
              ),
            changeVolumeAmount: (to) =>
              to.branch.Loaded.update.from(({ current, event }) =>
                form.key("volumeAmount").replace(event.value, current)
              ),
            changeVolumeUnit: (to) =>
              to.branch.Loaded.update.from(({ current, event }) =>
                form.key("volumeUnit").replace(event.unit, current)
              ),
            submit: (to) =>
              to.branch.Loaded.ChooseSavePath().resolve(({ target }) =>
                target()
              ),
            remove: (to) =>
              to.branch
                .Loaded()
                .resolve(({ containingState, target }) =>
                  target.from(
                    { ...containingState, form: emptyForm },
                    (loaded) => loaded.ChooseSavePath()
                  )
                ),
          },
        },
        ChooseSavePath: {
          choice: (to) =>
            to
              .branches({
                preview: { target: to.local.Previewing() },
                save: { target: to.local.Saving() },
              })
              .resolve(({ containingState, select }) =>
                containingState.usage.mealEntryCount > 0
                  ? select.preview.from()
                  : select.save.from()
              ),
        },
        Previewing: {
          invoke: (from) =>
            from
              .effect("preview", ({ containingState }) =>
                Effect.gen(function* () {
                  const foods = yield* Foods.Foods;
                  return yield* foods.previewFoodMassVolumeConversionEdit({
                    input: _setFoodMassVolumeConversionInput(containingState),
                  });
                }).pipe(
                  Effect.catchDefect((cause) =>
                    Effect.fail(new ConversionDefect({ cause }))
                  )
                )
              )
              .onDone((to) => to.local.Reviewing())
              .onFailure((to) =>
                to.branch.Loaded.Editing.Failure().from(({ error }) => ({
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
                }))
              ),
        },
        Reviewing: {
          on: {
            cancelReview: (to) => to.local.Editing.initial,
            confirm: (to) => to.local.Saving(),
          },
        },
        Saving: {
          invoke: (from) =>
            from
              .effect("save", ({ containingState }) =>
                Effect.gen(function* () {
                  const foods = yield* Foods.Foods;
                  return yield* foods.setFoodMassVolumeConversion({
                    input: _setFoodMassVolumeConversionInput(containingState),
                  });
                }).pipe(
                  Effect.catchDefect((cause) =>
                    Effect.fail(new ConversionDefect({ cause }))
                  )
                )
              )
              .onDone((to) =>
                to.branch.Loaded.Editing.Success()
                  .updating(to.branch.Loaded)
                  .from(({ current, output }) => ({
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
                  }))
              )
              .onFailure((to) =>
                to.branch.Loaded.Editing.Failure().from(({ error }) => ({
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
                }))
              ),
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
