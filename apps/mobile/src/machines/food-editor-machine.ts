import { FoodFormMachine } from "@mai/machines";
import { Domain, Foods } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { Effect, Schema } from "effect";

const _foodDetailsFromDraft = ({
  draft,
}: {
  readonly draft: FoodFormMachine.FoodFormSubmitInput;
}) => {
  const {
    initialPrice: _initialPrice,
    portions: _portions,
    ...details
  } = draft;

  return details;
};

const _foodMutationErrorMessage = ({
  error,
}: {
  readonly error: { readonly _tag: string };
}) => {
  if (error._tag === "UsedFoodPortionMutationNotAllowed") {
    return "A used portion was changed or removed. Restore it before saving.";
  }
  if (error._tag === "IncompatibleFoodMeasurement") {
    return "The edited measurement settings cannot interpret every previous entry.";
  }
  if (error._tag === "AppDefaultFoodEditNotAllowed") {
    return "Pre-installed foods cannot be edited. Create a copy instead.";
  }
  return "Could not save this food. Please review the values and try again.";
};

export const foodEditorLoadFailedMessage = "Could not load this food.";

export const FoodEditorStates = Machine.state({
  fields: {
    foodId: Domain.FoodId,
    message: Schema.NullOr(Schema.String),
  },
  states: {
    Editor: {
      states: {
        Loading: {},
        LoadFailed: {},
        Deleted: {},
        Completed: { fields: { food: Domain.Food } },
        Loaded: {
          fields: {
            food: Domain.Food,
            foods: Schema.Array(Domain.Food),
            usage: Foods.FoodEditUsage,
          },
          states: {
            ChoosingAction: {},
            Deleting: {},
            EditFormWarning: {},
            CopyForm: {},
            EditForm: {
              fields: {
                draft: Schema.NullOr(FoodFormMachine.FoodFormSubmitInput),
              },
            },
            PreviewingEdit: {
              fields: { draft: FoodFormMachine.FoodFormSubmitInput },
            },
            ReviewingEdit: {
              fields: { draft: FoodFormMachine.FoodFormSubmitInput },
            },
            Editing: {
              fields: { draft: FoodFormMachine.FoodFormSubmitInput },
            },
            ReviewingCopy: {
              fields: { draft: FoodFormMachine.FoodFormSubmitInput },
            },
            Copying: {
              fields: { draft: FoodFormMachine.FoodFormSubmitInput },
            },
          },
        },
      },
    },
  },
});

export const FoodEditorEvents = Machine.events({
  AcknowledgeEdit: {},
  Apply: {},
  BackToChoice: {},
  BackToForm: {},
  ChooseCopy: {},
  ChooseEdit: {},
  ConfirmEdit: {},
  DeleteFood: {},
  Refresh: {},
  Retry: {},
});

export const FoodEditorMachine = Machine.make({
  id: "FoodEditor",
  root: FoodEditorStates,
  events: Machine.eventsFromSchemas(
    FoodEditorEvents,
    FoodFormMachine.FoodFormParentEvents
  ),
  input: Schema.Struct({ foodId: Domain.FoodId }),
  children: { foodForm: FoodFormMachine.FoodFormChild },
  effects: {
    load: (foodId: Domain.FoodId) =>
      Effect.gen(function* () {
        const foods = yield* Foods.Foods;
        const food = yield* foods.get({ input: { foodId } });

        return {
          food,
          foods: yield* foods.list(),
          usage: yield* foods.inspectEdit({ input: { foodId } }),
        };
      }),
    deleteFood: (foodId: Domain.FoodId) =>
      Effect.gen(function* () {
        const foods = yield* Foods.Foods;

        yield* foods.deleteUnused({ input: { foodId } });
      }),
    previewEdit: ({
      draft,
      foodId,
    }: {
      readonly draft: FoodFormMachine.FoodFormSubmitInput;
      readonly foodId: Domain.FoodId;
    }) =>
      Effect.gen(function* () {
        const foods = yield* Foods.Foods;

        return yield* foods.previewFoodDetailsEdit({
          input: { ..._foodDetailsFromDraft({ draft }), foodId },
        });
      }),
    copyFood: ({
      draft,
      sourceFoodId,
    }: {
      readonly draft: FoodFormMachine.FoodFormSubmitInput;
      readonly sourceFoodId: Domain.FoodId;
    }) =>
      Effect.gen(function* () {
        const foods = yield* Foods.Foods;
        const result = yield* foods.copy({
          input: { ..._foodDetailsFromDraft({ draft }), sourceFoodId },
        });

        return result.food;
      }),
    editFood: ({
      draft,
      foodId,
    }: {
      readonly draft: FoodFormMachine.FoodFormSubmitInput;
      readonly foodId: Domain.FoodId;
    }) =>
      Effect.gen(function* () {
        const foods = yield* Foods.Foods;

        return yield* foods.editFoodDetails({
          input: { ..._foodDetailsFromDraft({ draft }), foodId },
        });
      }),
  },
  branches: {
    chooseCopy: {
      copy: { target: "Editor.Loaded.CopyForm", update: "root" },
    },
    chooseEdit: {
      edit: { target: "Editor.Loaded.EditFormWarning", update: "root" },
    },
  },
}).handle({
  root: ({ input }) => ({ foodId: input.foodId, message: null }),
  initial: { target: "Editor" },
  states: {
    Editor: {
      initial: { target: "Editor.Loading" },
      invoke: {
        src: "foodForm",
        input: () => ({ initialFood: null, syncQuickInputFromFields: true }),
      },
      states: {
        Loading: {
          invoke: {
            src: "load",
            input: ({ root }) => root.foodId,
            onDone: {
              target: "Editor.Loaded",
              data: ({ output }) => output,
            },
            onFailure: {
              target: "Editor.LoadFailed",
              update: "root",
              data: ({ root }) => ({
                target: undefined,
                update: { ...root, message: foodEditorLoadFailedMessage },
              }),
            },
          },
        },
        LoadFailed: {
          on: {
            Retry: {
              target: "Editor.Loading",
              update: "root",
              data: ({ root }) => ({
                target: undefined,
                update: { ...root, message: null },
              }),
            },
          },
        },
        Deleted: {},
        Completed: {},
        Loaded: {
          initial: { target: "Editor.Loaded.ChoosingAction" },
          states: {
            ChoosingAction: {
              on: {
                DeleteFood: {
                  target: "Editor.Loaded.Deleting",
                  update: "root",
                  guard: ({ ancestors }) =>
                    ancestors["Editor.Loaded"].food.origin === "user" &&
                    ancestors["Editor.Loaded"].usage.mealEntryCount === 0,
                  data: ({ root }) => ({
                    target: undefined,
                    update: { ...root, message: null },
                  }),
                },
                Refresh: { target: "Editor.Loading" },
                ChooseCopy: {
                  branches: "chooseCopy",
                  resolve: ({ ancestors, root, select }, enqueue) => {
                    enqueue.sendTo(
                      FoodFormMachine.FoodFormChild,
                      FoodFormMachine.FoodFormEvents.LoadFood({
                        food: ancestors["Editor.Loaded"].food,
                      })
                    );

                    return select.copy({
                      update: { data: { ...root, message: null } },
                    });
                  },
                },
                ChooseEdit: {
                  branches: "chooseEdit",
                  declinable: true,
                  resolve: ({ ancestors, root, select, decline }, enqueue) => {
                    const { food } = ancestors["Editor.Loaded"];

                    if (food.origin === "app-default") {
                      return decline();
                    }

                    enqueue.sendTo(
                      FoodFormMachine.FoodFormChild,
                      FoodFormMachine.FoodFormEvents.LoadFood({ food })
                    );

                    return select.edit({
                      update: { data: { ...root, message: null } },
                    });
                  },
                },
              },
            },
            Deleting: {
              invoke: {
                src: "deleteFood",
                input: ({ root }) => root.foodId,
                onDone: { target: "Editor.Deleted" },
                onFailure: {
                  target: "Editor.Loading",
                  update: "root",
                  data: ({ root }) => ({
                    target: undefined,
                    update: {
                      ...root,
                      message:
                        "Could not delete this food. Only unused foods you created can be removed.",
                    },
                  }),
                },
              },
            },
            EditFormWarning: {
              on: {
                BackToChoice: { target: "Editor.Loaded.ChoosingAction" },
                AcknowledgeEdit: {
                  target: "Editor.Loaded.EditForm",
                  update: "root",
                  data: ({ root }) => ({
                    target: { draft: null },
                    update: { ...root, message: null },
                  }),
                },
              },
            },
            CopyForm: {
              on: {
                BackToChoice: {
                  target: "Editor.Loaded.ChoosingAction",
                  update: "root",
                  data: ({ root }) => ({
                    target: undefined,
                    update: { ...root, message: null },
                  }),
                },
                FoodFormSubmitted: {
                  target: "Editor.Loaded.ReviewingCopy",
                  update: "root",
                  data: ({ event, root }) => ({
                    target: { draft: event.input },
                    update: { ...root, message: null },
                  }),
                },
              },
            },
            EditForm: {
              on: {
                BackToChoice: {
                  target: "Editor.Loaded.ChoosingAction",
                  update: "root",
                  data: ({ root }) => ({
                    target: undefined,
                    update: { ...root, message: null },
                  }),
                },
                FoodFormSubmitted: {
                  target: "Editor.Loaded.PreviewingEdit",
                  update: "root",
                  data: ({ event, root }) => ({
                    target: { draft: event.input },
                    update: { ...root, message: null },
                  }),
                },
              },
            },
            PreviewingEdit: {
              invoke: {
                src: "previewEdit",
                input: ({ root, state }) => ({
                  draft: state.draft,
                  foodId: root.foodId,
                }),
                onDone: {
                  target: "Editor.Loaded.ReviewingEdit",
                  update: "root",
                  data: ({ root, state }) => ({
                    target: { draft: state.draft },
                    update: { ...root, message: null },
                  }),
                },
                onFailure: {
                  target: "Editor.Loaded.EditForm",
                  update: "root",
                  data: ({ error, root, state }) => ({
                    target: { draft: state.draft },
                    update: {
                      ...root,
                      message: _foodMutationErrorMessage({ error }),
                    },
                  }),
                },
              },
            },
            ReviewingEdit: {
              on: {
                BackToForm: {
                  target: "Editor.Loaded.EditForm",
                  data: ({ state }) => ({ draft: state.draft }),
                },
                ConfirmEdit: {
                  target: "Editor.Loaded.Editing",
                  data: ({ state }) => ({ draft: state.draft }),
                },
              },
            },
            Editing: {
              invoke: {
                src: "editFood",
                input: ({ root, state }) => ({
                  draft: state.draft,
                  foodId: root.foodId,
                }),
                onDone: {
                  target: "Editor.Completed",
                  update: "root",
                  data: ({ output, root }) => ({
                    target: { food: output.food },
                    update: {
                      ...root,
                      message:
                        output.revisedMealEntryCount === 0
                          ? "Food updated. No previous meal entries changed."
                          : `Food updated across ${output.revisedMealEntryCount} previous meal ${output.revisedMealEntryCount === 1 ? "entry" : "entries"}.`,
                    },
                  }),
                },
                onFailure: {
                  target: "Editor.Loaded.EditForm",
                  update: "root",
                  data: ({ error, root, state }) => ({
                    target: { draft: state.draft },
                    update: {
                      ...root,
                      message: _foodMutationErrorMessage({ error }),
                    },
                  }),
                },
              },
            },
            ReviewingCopy: {
              on: {
                BackToForm: { target: "Editor.Loaded.CopyForm" },
                Apply: {
                  target: "Editor.Loaded.Copying",
                  data: ({ state }) => ({ draft: state.draft }),
                },
              },
            },
            Copying: {
              invoke: {
                src: "copyFood",
                input: ({ root, state }) => ({
                  draft: state.draft,
                  sourceFoodId: root.foodId,
                }),
                onDone: {
                  target: "Editor.Completed",
                  update: "root",
                  data: ({ output, root }) => ({
                    target: { food: output },
                    update: {
                      ...root,
                      message:
                        "Food copy created. Previous meal entries were unchanged.",
                    },
                  }),
                },
                onFailure: {
                  target: "Editor.Loaded.ReviewingCopy",
                  update: "root",
                  data: ({ error, root, state }) => ({
                    target: { draft: state.draft },
                    update: {
                      ...root,
                      message: _foodMutationErrorMessage({ error }),
                    },
                  }),
                },
              },
            },
          },
        },
      },
    },
  },
});
