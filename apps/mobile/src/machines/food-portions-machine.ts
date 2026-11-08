import { Domain, Foods } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { Effect, Predicate, Schema } from "effect";

export const PortionFormValues = Schema.Struct({
  amount: Schema.String,
  name: Schema.String,
  unit: Domain.MeasurementUnit,
});

export type PortionFormValues = typeof PortionFormValues.Type;

const PortionFormField = Schema.Literals(["amount", "name", "unit"]);

export type PortionFormField = typeof PortionFormField.Type;

const MessageTone = Schema.Literals(["danger", "success"]);

type PortionEditInput = {
  readonly foodId: Domain.FoodId;
  readonly form: PortionFormValues;
  readonly portionId: Domain.FoodPortionId;
};

const measurementUnitByValue: Readonly<
  Record<string, Domain.MeasurementUnit | undefined>
> = {
  g: "g",
  kg: "kg",
  l: "l",
  lb: "lb",
  ml: "ml",
  oz: "oz",
};

const loadFailedMessage = "Could not load the portions for this food.";

function _emptyForm(): PortionFormValues {
  return { amount: "", name: "", unit: "g" };
}

function _loadPortions(foodId: Domain.FoodId) {
  return Effect.gen(function* () {
    const foods = yield* Foods.Foods;

    return {
      food: yield* foods.get({ input: { foodId } }),
      usage: yield* foods.inspectEdit({ input: { foodId } }),
    };
  });
}

function _editInput(input: PortionEditInput): Foods.EditFoodPortionInput {
  return {
    foodId: input.foodId,
    portionId: input.portionId,
    name: input.form.name,
    size: { amount: input.form.amount, unit: input.form.unit },
  };
}

function _mutationErrorMessage(error: unknown) {
  if (Predicate.isTagged(error, "FoodPortionNameAlreadyExists")) {
    return "Use a name that is not already assigned to another portion.";
  }
  if (Predicate.isTagged(error, "UsedFoodPortionMutationNotAllowed")) {
    return "This portion is now used and cannot be removed.";
  }
  if (Predicate.isTagged(error, "IncompatibleFoodMeasurement")) {
    return "This unit cannot be applied to the food’s current measurement settings.";
  }
  if (Predicate.isTagged(error, "AppDefaultFoodEditNotAllowed")) {
    return "Pre-installed foods cannot be changed. Create a food copy first.";
  }
  return "Could not save this portion. Review the values and try again.";
}

export const FoodPortionsData = Schema.Struct({
  food: Domain.Food,
  usage: Foods.FoodEditUsage,
});

export type FoodPortionsData = typeof FoodPortionsData.Type;

export const FoodPortionsLoaderStates = Machine.state({
  fields: { foodId: Domain.FoodId },
  states: {
    Loading: {},
    Failed: { fields: { message: Schema.String } },
    Ready: { fields: { data: FoodPortionsData } },
  },
});

export const FoodPortionsLoaderEvents = Machine.events({ Retry: {} });

export const FoodPortionsLoaderMachine = Machine.make({
  id: "FoodPortionsLoader",
  root: FoodPortionsLoaderStates,
  events: FoodPortionsLoaderEvents,
  input: Schema.Struct({ foodId: Domain.FoodId }),
  effects: { load: _loadPortions },
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
          data: { message: loadFailedMessage },
        },
      },
    },
    Failed: {
      on: { Retry: { target: "Loading" } },
    },
    Ready: {},
  },
});

export const FoodPortionsStates = Machine.state({
  fields: { foodId: Domain.FoodId },
  states: {
    Loaded: {
      fields: {
        food: Domain.Food,
        usage: Foods.FoodEditUsage,
        form: PortionFormValues,
        message: Schema.NullOr(Schema.String),
        messageTone: MessageTone,
      },
      states: {
        Listing: {},
        Adding: {
          fields: { portionId: Schema.NullOr(Domain.FoodPortionId) },
        },
        CreatingFromPortion: { fields: { portionId: Domain.FoodPortionId } },
        SavingNew: {
          fields: { portionId: Schema.NullOr(Domain.FoodPortionId) },
        },
        Removing: { fields: { portionId: Domain.FoodPortionId } },
        Edit: {
          fields: { portionId: Domain.FoodPortionId },
          states: {
            Warning: {},
            Form: {},
            Previewing: {},
            Reviewing: {},
            Saving: {},
          },
        },
      },
    },
    Reloading: {
      fields: {
        message: Schema.NullOr(Schema.String),
        messageTone: MessageTone,
      },
    },
    ReloadFailed: { fields: { message: Schema.String } },
  },
});

export const FoodPortionsEvents = Machine.events({
  Add: {},
  Back: {},
  Cancel: {},
  ChangeForm: { field: PortionFormField, value: Schema.String },
  ConfirmChangeEverywhere: {},
  CreateFromPortion: { portionId: Domain.FoodPortionId },
  EditPortion: { portionId: Domain.FoodPortionId },
  RemovePortion: { portionId: Domain.FoodPortionId },
  Retry: {},
  Submit: {},
});

export const FoodPortionsMachine = Machine.make({
  id: "FoodPortions",
  root: FoodPortionsStates,
  events: FoodPortionsEvents,
  input: FoodPortionsData,
  effects: {
    load: _loadPortions,
    addPortion: (input: {
      readonly foodId: Domain.FoodId;
      readonly form: PortionFormValues;
    }) =>
      Effect.gen(function* () {
        const foods = yield* Foods.Foods;

        return yield* foods.addFoodPortion({
          input: {
            foodId: input.foodId,
            name: input.form.name,
            size: { amount: input.form.amount, unit: input.form.unit },
          },
        });
      }),
    previewEdit: (input: PortionEditInput) =>
      Effect.gen(function* () {
        const foods = yield* Foods.Foods;

        return yield* foods.previewFoodPortionEdit({
          input: _editInput(input),
        });
      }),
    editPortion: (input: PortionEditInput) =>
      Effect.gen(function* () {
        const foods = yield* Foods.Foods;

        return yield* foods.editFoodPortionEverywhere({
          input: _editInput(input),
        });
      }),
    removePortion: (input: {
      readonly foodId: Domain.FoodId;
      readonly portionId: Domain.FoodPortionId;
    }) =>
      Effect.gen(function* () {
        const foods = yield* Foods.Foods;

        return yield* foods.removeUnusedFoodPortion({ input });
      }),
  },
  branches: {
    createFromPortion: {
      copy: { target: "Loaded.CreatingFromPortion", update: "Loaded" },
    },
    editPortion: {
      warn: {
        target: "Loaded.Edit",
        update: "Loaded",
        title: "Portion is used by meal entries",
      },
      edit: {
        target: "Loaded.Edit",
        update: "Loaded",
        title: "Portion is unused",
      },
    },
    removePortion: {
      remove: { target: "Loaded.Removing", update: "Loaded" },
    },
    submitEdit: {
      preview: {
        target: "Loaded.Edit.Previewing",
        title: "Portion is used by meal entries",
      },
      save: { target: "Loaded.Edit.Saving", title: "Portion is unused" },
    },
  },
}).handle({
  root: ({ input }) => ({ foodId: input.food.id }),
  initial: {
    target: "Loaded",
    data: ({ input }) => ({
      food: input.food,
      usage: input.usage,
      form: _emptyForm(),
      message: null,
      messageTone: "success",
    }),
  },
  states: {
    Loaded: {
      initial: { target: "Loaded.Listing" },
      on: {
        ChangeForm: {
          update: "Loaded",
          data: ({ state, event }) => ({
            ...state,
            form:
              event.field === "unit"
                ? {
                    ...state.form,
                    unit:
                      measurementUnitByValue[event.value] ?? state.form.unit,
                  }
                : { ...state.form, [event.field]: event.value },
          }),
        },
      },
      states: {
        Listing: {
          on: {
            Add: {
              target: "Loaded.Adding",
              update: "Loaded",
              data: ({ containingState }) => ({
                target: { portionId: null },
                update: {
                  ...containingState,
                  form: _emptyForm(),
                  message: null,
                },
              }),
            },
            CreateFromPortion: {
              branches: "createFromPortion",
              declinable: true,
              resolve: ({ containingState, event, select, decline }) => {
                const portion = containingState.food.portions.find(
                  (candidate) => candidate.id === event.portionId
                );

                return portion === undefined
                  ? decline()
                  : select.copy({
                      data: { portionId: portion.id },
                      update: {
                        data: {
                          ...containingState,
                          form: {
                            amount: `${portion.size.amount}`,
                            name: `${portion.name} copy`,
                            unit: portion.size.unit,
                          },
                          message: null,
                        },
                      },
                    });
              },
            },
            EditPortion: {
              branches: "editPortion",
              declinable: true,
              resolve: ({ containingState, event, select, decline }) => {
                const portion = containingState.food.portions.find(
                  (candidate) => candidate.id === event.portionId
                );
                const portionUsage = containingState.usage.portions.find(
                  (candidate) => candidate.portionId === event.portionId
                );

                if (portion === undefined || portionUsage === undefined) {
                  return decline();
                }

                const update = {
                  data: {
                    ...containingState,
                    form: {
                      amount: `${portion.size.amount}`,
                      name: portion.name,
                      unit: portion.size.unit,
                    },
                    message: null,
                  },
                };

                return portionUsage.mealEntryCount > 0
                  ? select.warn({
                      data: { portionId: portion.id },
                      states: { Warning: {} },
                      update,
                    })
                  : select.edit({
                      data: { portionId: portion.id },
                      states: { Form: {} },
                      update,
                    });
              },
            },
            RemovePortion: {
              branches: "removePortion",
              declinable: true,
              resolve: ({ containingState, event, select, decline }) => {
                const portion = containingState.food.portions.find(
                  (candidate) => candidate.id === event.portionId
                );
                const portionUsage = containingState.usage.portions.find(
                  (candidate) => candidate.portionId === event.portionId
                );

                return portion === undefined ||
                  portionUsage === undefined ||
                  portionUsage.mealEntryCount > 0
                  ? decline()
                  : select.remove({
                      data: { portionId: portion.id },
                      update: {
                        data: {
                          ...containingState,
                          form: {
                            amount: `${portion.size.amount}`,
                            name: portion.name,
                            unit: portion.size.unit,
                          },
                          message: null,
                        },
                      },
                    });
              },
            },
          },
        },
        Adding: {
          on: {
            Cancel: {
              target: "Loaded.Listing",
              update: "Loaded",
              data: ({ containingState }) => ({
                target: undefined,
                update: { ...containingState, message: null },
              }),
            },
            Submit: {
              target: "Loaded.SavingNew",
              data: ({ state }) => ({ portionId: state.portionId }),
            },
          },
        },
        CreatingFromPortion: {
          on: {
            Cancel: {
              target: "Loaded.Listing",
              update: "Loaded",
              data: ({ containingState }) => ({
                target: undefined,
                update: { ...containingState, message: null },
              }),
            },
            Submit: {
              target: "Loaded.SavingNew",
              data: ({ state }) => ({ portionId: state.portionId }),
            },
          },
        },
        SavingNew: {
          invoke: {
            src: "addPortion",
            input: ({ root, containingState }) => ({
              foodId: root.foodId,
              form: containingState.form,
            }),
            onDone: {
              target: "Reloading",
              data: {
                message: "Portion added. Previous entries were unchanged.",
                messageTone: "success",
              },
            },
            onFailure: {
              target: "Loaded.Adding",
              update: "Loaded",
              data: ({ containingState, state, error }) => ({
                target: { portionId: state.portionId },
                update: {
                  ...containingState,
                  message: _mutationErrorMessage(error),
                },
              }),
            },
          },
        },
        Removing: {
          invoke: {
            src: "removePortion",
            input: ({ root, state }) => ({
              foodId: root.foodId,
              portionId: state.portionId,
            }),
            onDone: {
              target: "Reloading",
              data: {
                message: "Unused portion removed.",
                messageTone: "success",
              },
            },
            onFailure: {
              target: "Loaded.Listing",
              update: "Loaded",
              data: ({ containingState, error }) => ({
                target: undefined,
                update: {
                  ...containingState,
                  message: _mutationErrorMessage(error),
                  messageTone: "danger",
                },
              }),
            },
          },
        },
        Edit: {
          initial: { target: "Loaded.Edit.Form" },
          states: {
            Warning: {
              on: {
                Back: { target: "Loaded.Listing" },
                ConfirmChangeEverywhere: { target: "Loaded.Edit.Form" },
              },
            },
            Form: {
              on: {
                Cancel: {
                  target: "Loaded.Listing",
                  update: "Loaded",
                  data: ({ ancestors }) => ({
                    target: undefined,
                    update: { ...ancestors.Loaded, message: null },
                  }),
                },
                Submit: {
                  branches: "submitEdit",
                  resolve: ({ ancestors, select }) => {
                    const portionUsage = ancestors.Loaded.usage.portions.find(
                      (candidate) =>
                        candidate.portionId ===
                        ancestors["Loaded.Edit"].portionId
                    );

                    return (portionUsage?.mealEntryCount ?? 0) > 0
                      ? select.preview()
                      : select.save();
                  },
                },
              },
            },
            Previewing: {
              invoke: {
                src: "previewEdit",
                input: ({ root, ancestors }) => ({
                  foodId: root.foodId,
                  form: ancestors.Loaded.form,
                  portionId: ancestors["Loaded.Edit"].portionId,
                }),
                onDone: {
                  target: "Loaded.Edit.Reviewing",
                  update: "Loaded",
                  data: ({ ancestors }) => ({
                    target: undefined,
                    update: { ...ancestors.Loaded, message: null },
                  }),
                },
                onFailure: {
                  target: "Loaded.Edit.Form",
                  update: "Loaded",
                  data: ({ ancestors, error }) => ({
                    target: undefined,
                    update: {
                      ...ancestors.Loaded,
                      message: _mutationErrorMessage(error),
                    },
                  }),
                },
              },
            },
            Reviewing: {
              on: {
                Back: { target: "Loaded.Edit.Form" },
                ConfirmChangeEverywhere: { target: "Loaded.Edit.Saving" },
              },
            },
            Saving: {
              invoke: {
                src: "editPortion",
                input: ({ root, ancestors }) => ({
                  foodId: root.foodId,
                  form: ancestors.Loaded.form,
                  portionId: ancestors["Loaded.Edit"].portionId,
                }),
                onDone: {
                  target: "Reloading",
                  data: ({ output }) => ({
                    message:
                      output.revisedMealEntryCount === 0
                        ? "Unused portion updated. No previous entry changed."
                        : `Portion updated across ${output.revisedMealEntryCount} previous meal ${output.revisedMealEntryCount === 1 ? "entry" : "entries"}.`,
                    messageTone: "success",
                  }),
                },
                onFailure: {
                  target: "Loaded.Edit.Form",
                  update: "Loaded",
                  data: ({ ancestors, error }) => ({
                    target: undefined,
                    update: {
                      ...ancestors.Loaded,
                      message: _mutationErrorMessage(error),
                    },
                  }),
                },
              },
            },
          },
        },
      },
    },
    Reloading: {
      invoke: {
        src: "load",
        input: ({ root }) => root.foodId,
        onDone: {
          target: "Loaded",
          data: ({ state, output }) => ({
            food: output.food,
            usage: output.usage,
            form: _emptyForm(),
            message: state.message,
            messageTone: state.messageTone,
          }),
        },
        onFailure: {
          target: "ReloadFailed",
          data: { message: loadFailedMessage },
        },
      },
    },
    ReloadFailed: {
      on: {
        Retry: {
          target: "Reloading",
          data: { message: null, messageTone: "success" },
        },
      },
    },
  },
});
