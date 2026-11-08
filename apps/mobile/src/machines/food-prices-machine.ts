import { Domain, Foods } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { Effect, Schema } from "effect";

const PriceForm = Schema.Struct({
  price: Schema.String,
  quantityAmount: Schema.String,
  quantityUnit: Domain.MeasurementUnit,
});

type PriceForm = typeof PriceForm.Type;

type PriceMutationInput = {
  readonly foodId: Domain.FoodId;
  readonly form: PriceForm;
};

function _emptyForm(): PriceForm {
  return { price: "", quantityAmount: "1", quantityUnit: "kg" };
}

function _priceInput(input: PriceMutationInput) {
  return {
    price: input.form.price.replace(",", "."),
    currency: "EUR" as const,
    foodId: input.foodId,
    referenceQuantity: {
      amount: input.form.quantityAmount.replace(",", "."),
      unit: input.form.quantityUnit,
    },
  };
}

export const FoodPricesData = Schema.Struct({ food: Domain.Food });

export type FoodPricesData = typeof FoodPricesData.Type;

export const FoodPricesLoaderStates = Machine.state({
  fields: { foodId: Domain.FoodId },
  states: {
    Loading: {},
    Failed: { fields: { message: Schema.String } },
    Ready: { fields: { data: FoodPricesData } },
  },
});

export const FoodPricesLoaderEvents = Machine.events({ Retry: {} });

export const FoodPricesLoaderMachine = Machine.make({
  id: "FoodPricesLoader",
  root: FoodPricesLoaderStates,
  events: FoodPricesLoaderEvents,
  input: Schema.Struct({ foodId: Domain.FoodId }),
  effects: {
    load: (foodId: Domain.FoodId) =>
      Effect.gen(function* () {
        const foods = yield* Foods.Foods;

        return { food: yield* foods.get({ input: { foodId } }) };
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
          data: { message: "Could not load prices for this food." },
        },
      },
    },
    Failed: {
      on: { Retry: { target: "Loading" } },
    },
    Ready: {},
  },
});

export const FoodPricesStates = Machine.state({
  fields: {
    food: Domain.Food,
    form: PriceForm,
    message: Schema.NullOr(Schema.String),
    messageTone: Schema.Literals(["danger", "success"]),
  },
  states: {
    Listing: {},
    Adding: { states: { Form: {}, Saving: {} } },
    Editing: {
      fields: { priceId: Domain.FoodPriceId },
      states: { Form: {}, Saving: {} },
    },
    Removing: { fields: { priceId: Domain.FoodPriceId } },
    Selecting: { fields: { priceId: Schema.NullOr(Domain.FoodPriceId) } },
  },
});

export const FoodPricesEvents = Machine.events({
  Add: {},
  Cancel: {},
  ChangePrice: { value: Schema.String },
  ChangeQuantityAmount: { value: Schema.String },
  ChangeQuantityUnit: { unit: Domain.MeasurementUnit },
  ClearCurrent: {},
  Edit: { priceId: Domain.FoodPriceId },
  Remove: { priceId: Domain.FoodPriceId },
  Select: { priceId: Domain.FoodPriceId },
  Submit: {},
});

export const FoodPricesMachine = Machine.make({
  id: "FoodPrices",
  root: FoodPricesStates,
  events: FoodPricesEvents,
  input: FoodPricesData,
  effects: {
    addPrice: (input: PriceMutationInput) =>
      Effect.gen(function* () {
        const foods = yield* Foods.Foods;

        return yield* foods.addFoodPrice({ input: _priceInput(input) });
      }),
    editPrice: (
      input: PriceMutationInput & { readonly priceId: Domain.FoodPriceId }
    ) =>
      Effect.gen(function* () {
        const foods = yield* Foods.Foods;

        return yield* foods.editFoodPrice({
          input: { ..._priceInput(input), priceId: input.priceId },
        });
      }),
    removePrice: (input: {
      readonly foodId: Domain.FoodId;
      readonly priceId: Domain.FoodPriceId;
    }) =>
      Effect.gen(function* () {
        const foods = yield* Foods.Foods;

        return yield* foods.removeFoodPrice({ input });
      }),
    selectPrice: (input: {
      readonly foodId: Domain.FoodId;
      readonly priceId: Domain.FoodPriceId | null;
    }) =>
      Effect.gen(function* () {
        const foods = yield* Foods.Foods;

        return yield* foods.selectCurrentFoodPrice({ input });
      }),
  },
  branches: {
    edit: { editing: { target: "Editing", update: "root" } },
  },
}).handle({
  root: ({ input }) => ({
    food: input.food,
    form: _emptyForm(),
    message: null,
    messageTone: "success",
  }),
  initial: { target: "Listing" },
  on: {
    ChangePrice: {
      update: "root",
      data: ({ root, event }) => ({
        ...root,
        form: { ...root.form, price: event.value },
      }),
    },
    ChangeQuantityAmount: {
      update: "root",
      data: ({ root, event }) => ({
        ...root,
        form: { ...root.form, quantityAmount: event.value },
      }),
    },
    ChangeQuantityUnit: {
      update: "root",
      data: ({ root, event }) => ({
        ...root,
        form: { ...root.form, quantityUnit: event.unit },
      }),
    },
  },
  states: {
    Listing: {
      on: {
        Add: {
          target: "Adding",
          update: "root",
          data: ({ root }) => ({
            target: undefined,
            update: { ...root, form: _emptyForm(), message: null },
          }),
        },
        ClearCurrent: {
          target: "Selecting",
          data: { priceId: null },
        },
        Edit: {
          branches: "edit",
          declinable: true,
          resolve: ({ root, event, select, decline }) => {
            const price = root.food.prices.find(
              (candidate) => candidate.id === event.priceId
            );

            return price === undefined
              ? decline()
              : select.editing({
                  data: { priceId: price.id },
                  update: {
                    data: {
                      ...root,
                      form: {
                        price: `${price.priceMinor / 10 ** (price.currency === "JPY" ? 0 : 2)}`,
                        quantityAmount: `${price.referenceQuantity.amount}`,
                        quantityUnit: price.referenceQuantity.unit,
                      },
                      message: null,
                    },
                  },
                });
          },
        },
        Remove: {
          target: "Removing",
          data: ({ event }) => ({ priceId: event.priceId }),
        },
        Select: {
          target: "Selecting",
          data: ({ event }) => ({ priceId: event.priceId }),
        },
      },
    },
    Adding: {
      initial: { target: "Adding.Form" },
      states: {
        Form: {
          on: {
            Cancel: {
              target: "Listing",
              update: "root",
              data: ({ root }) => ({
                target: undefined,
                update: { ...root, message: null },
              }),
            },
            Submit: { target: "Adding.Saving" },
          },
        },
        Saving: {
          invoke: {
            src: "addPrice",
            input: ({ root }) => ({ foodId: root.food.id, form: root.form }),
            onDone: {
              target: "Listing",
              update: "root",
              data: ({ root, output }) => ({
                target: undefined,
                update: {
                  ...root,
                  food: output.food,
                  message:
                    output.food.prices.length === 1
                      ? "Price added and selected as current."
                      : "Price added.",
                  messageTone: "success",
                },
              }),
            },
            onFailure: {
              target: "Adding.Form",
              update: "root",
              data: ({ root }) => ({
                target: undefined,
                update: { ...root, message: "Could not add this price." },
              }),
            },
          },
        },
      },
    },
    Editing: {
      initial: { target: "Editing.Form" },
      states: {
        Form: {
          on: {
            Cancel: {
              target: "Listing",
              update: "root",
              data: ({ root }) => ({
                target: undefined,
                update: { ...root, message: null },
              }),
            },
            Submit: { target: "Editing.Saving" },
          },
        },
        Saving: {
          invoke: {
            src: "editPrice",
            input: ({ root, containingState }) => ({
              foodId: root.food.id,
              form: root.form,
              priceId: containingState.priceId,
            }),
            onDone: {
              target: "Listing",
              update: "root",
              data: ({ root, output }) => ({
                target: undefined,
                update: {
                  ...root,
                  food: output.food,
                  message: "Price updated.",
                  messageTone: "success",
                },
              }),
            },
            onFailure: {
              target: "Editing.Form",
              update: "root",
              data: ({ root }) => ({
                target: undefined,
                update: { ...root, message: "Could not update this price." },
              }),
            },
          },
        },
      },
    },
    Removing: {
      invoke: {
        src: "removePrice",
        input: ({ root, state }) => ({
          foodId: root.food.id,
          priceId: state.priceId,
        }),
        onDone: {
          target: "Listing",
          update: "root",
          data: ({ root, output }) => ({
            target: undefined,
            update: {
              ...root,
              food: output.food,
              message: "Price deleted.",
              messageTone: "success",
            },
          }),
        },
        onFailure: {
          target: "Listing",
          update: "root",
          data: ({ root }) => ({
            target: undefined,
            update: {
              ...root,
              message: "Could not delete this price.",
              messageTone: "danger",
            },
          }),
        },
      },
    },
    Selecting: {
      invoke: {
        src: "selectPrice",
        input: ({ root, state }) => ({
          foodId: root.food.id,
          priceId: state.priceId,
        }),
        onDone: {
          target: "Listing",
          update: "root",
          data: ({ root, output }) => ({
            target: undefined,
            update: {
              ...root,
              food: output.food,
              message:
                output.food.prices.find((price) => price.isCurrent) ===
                undefined
                  ? "No current price selected."
                  : null,
              messageTone: "success",
            },
          }),
        },
        onFailure: {
          target: "Listing",
          update: "root",
          data: ({ root }) => ({
            target: undefined,
            update: {
              ...root,
              message: "Could not change the current price.",
              messageTone: "danger",
            },
          }),
        },
      },
    },
  },
});
