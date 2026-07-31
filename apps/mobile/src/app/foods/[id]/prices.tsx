import { FoodPriceFields } from "@/components/nutrition/food-price-fields";
import { AppScreen } from "@/components/ui/app-screen";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { LoadingView } from "@/components/ui/loading-view";
import { AppHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { SectionCard } from "@/components/ui/section-card";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { formatCurrencyMinor, formatNumber } from "@/lib/format";
import { MobileAtomRuntime } from "@/lib/runtime-client";
import { color, spacing, tokens } from "@/theme/tokens";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { Domain, Foods } from "@mai/nutrition";
import { Machine } from "@typeonce/effect-machine";
import { AtomMachine } from "@typeonce/effect-machine/reactivity";
import { Array, DateTime, Effect, Option, Schema } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { Redirect, router } from "expo-router";
import {
  Check,
  ChevronLeft,
  CircleOff,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react-native";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

const RouteParams = Schema.Struct({ id: Domain.FoodId });
const PriceForm = Schema.Struct({
  price: Schema.String,
  quantityAmount: Schema.String,
  quantityUnit: Domain.MeasurementUnit,
});
type PriceForm = typeof PriceForm.Type;
const MessageTone = Schema.Literals(["danger", "success"]);

class PricesRoute extends Schema.TaggedClass<PricesRoute>("PricesRoute")(
  "PricesRoute",
  { foodId: Domain.FoodId }
) {}
class Loading extends Schema.TaggedClass<Loading>("Loading")("Loading", {}) {}
class LoadFailed extends Schema.TaggedClass<LoadFailed>("LoadFailed")(
  "LoadFailed",
  { message: Schema.String }
) {}
class Listing extends Schema.TaggedClass<Listing>("Listing")("Listing", {
  food: Domain.Food,
  message: Schema.NullOr(Schema.String),
  messageTone: MessageTone,
}) {}
class Adding extends Schema.TaggedClass<Adding>("Adding")("Adding", {
  food: Domain.Food,
  form: PriceForm,
  message: Schema.NullOr(Schema.String),
}) {}
class SavingAdd extends Schema.TaggedClass<SavingAdd>("SavingAdd")(
  "SavingAdd",
  { food: Domain.Food, form: PriceForm }
) {}
class Editing extends Schema.TaggedClass<Editing>("Editing")("Editing", {
  food: Domain.Food,
  form: PriceForm,
  message: Schema.NullOr(Schema.String),
  priceId: Domain.FoodPriceId,
}) {}
class SavingEdit extends Schema.TaggedClass<SavingEdit>("SavingEdit")(
  "SavingEdit",
  { food: Domain.Food, form: PriceForm, priceId: Domain.FoodPriceId }
) {}
class Removing extends Schema.TaggedClass<Removing>("Removing")("Removing", {
  food: Domain.Food,
  priceId: Domain.FoodPriceId,
}) {}
class Selecting extends Schema.TaggedClass<Selecting>("Selecting")(
  "Selecting",
  { food: Domain.Food, priceId: Schema.NullOr(Domain.FoodPriceId) }
) {}

class Add extends Schema.TaggedClass<Add>("Add")("Add", {}) {}
class Cancel extends Schema.TaggedClass<Cancel>("Cancel")("Cancel", {}) {}
class Retry extends Schema.TaggedClass<Retry>("Retry")("Retry", {}) {}
class Submit extends Schema.TaggedClass<Submit>("Submit")("Submit", {}) {}
class ClearCurrent extends Schema.TaggedClass<ClearCurrent>("ClearCurrent")(
  "ClearCurrent",
  {}
) {}
class ChangePrice extends Schema.TaggedClass<ChangePrice>("ChangePrice")(
  "ChangePrice",
  { value: Schema.String }
) {}
class ChangeQuantityAmount extends Schema.TaggedClass<ChangeQuantityAmount>(
  "ChangeQuantityAmount"
)("ChangeQuantityAmount", { value: Schema.String }) {}
class ChangeQuantityUnit extends Schema.TaggedClass<ChangeQuantityUnit>(
  "ChangeQuantityUnit"
)("ChangeQuantityUnit", { unit: Domain.MeasurementUnit }) {}
class EditPrice extends Schema.TaggedClass<EditPrice>("EditPrice")(
  "EditPrice",
  {
    priceId: Domain.FoodPriceId,
  }
) {}
class RemovePrice extends Schema.TaggedClass<RemovePrice>("RemovePrice")(
  "RemovePrice",
  { priceId: Domain.FoodPriceId }
) {}
class SelectPrice extends Schema.TaggedClass<SelectPrice>("SelectPrice")(
  "SelectPrice",
  { priceId: Domain.FoodPriceId }
) {}
class FoodLoaded extends Schema.TaggedClass<FoodLoaded>("FoodLoaded")(
  "FoodLoaded",
  { food: Domain.Food }
) {}
class OperationSucceeded extends Schema.TaggedClass<OperationSucceeded>(
  "OperationSucceeded"
)("OperationSucceeded", {
  food: Domain.Food,
  message: Schema.NullOr(Schema.String),
}) {}
class OperationFailed extends Schema.TaggedClass<OperationFailed>(
  "OperationFailed"
)("OperationFailed", { message: Schema.String }) {}

const PriceStates = Machine.defineStates({
  Route: {
    schema: PricesRoute,
    initial: "Loading",
    states: {
      Loading,
      LoadFailed,
      Listing,
      Adding,
      SavingAdd,
      Editing,
      SavingEdit,
      Removing,
      Selecting,
    },
  },
});

const priceOperations = {
  input: (foodId: Domain.FoodId, form: PriceForm) => ({
    price: form.price.replace(",", "."),
    currency: "EUR" as const,
    foodId,
    referenceQuantity: {
      amount: form.quantityAmount.replace(",", "."),
      unit: form.quantityUnit,
    },
  }),
  load: (foodId: Domain.FoodId) =>
    Effect.gen(function* () {
      const foods = yield* Foods.Foods;
      return new FoodLoaded({
        food: yield* foods.get({ input: { foodId } }),
      });
    }).pipe(
      Effect.catch(() =>
        Effect.succeed(
          new OperationFailed({
            message: "Could not load prices for this food.",
          })
        )
      )
    ),
  add: (foodId: Domain.FoodId, form: PriceForm) =>
    Effect.gen(function* () {
      const foods = yield* Foods.Foods;
      const result = yield* foods.addFoodPrice({
        input: priceOperations.input(foodId, form),
      });
      return new OperationSucceeded({
        food: result.food,
        message:
          result.food.prices.length === 1
            ? "Price added and selected as current."
            : "Price added.",
      });
    }).pipe(
      Effect.catch(() =>
        Effect.succeed(
          new OperationFailed({ message: "Could not add this price." })
        )
      )
    ),
  edit: (foodId: Domain.FoodId, form: PriceForm, priceId: Domain.FoodPriceId) =>
    Effect.gen(function* () {
      const foods = yield* Foods.Foods;
      const result = yield* foods.editFoodPrice({
        input: { ...priceOperations.input(foodId, form), priceId },
      });
      return new OperationSucceeded({
        food: result.food,
        message: "Price updated.",
      });
    }).pipe(
      Effect.catch(() =>
        Effect.succeed(
          new OperationFailed({ message: "Could not update this price." })
        )
      )
    ),
  remove: (foodId: Domain.FoodId, priceId: Domain.FoodPriceId) =>
    Effect.gen(function* () {
      const foods = yield* Foods.Foods;
      const result = yield* foods.removeFoodPrice({
        input: { foodId, priceId },
      });
      return new OperationSucceeded({
        food: result.food,
        message: "Price deleted.",
      });
    }).pipe(
      Effect.catch(() =>
        Effect.succeed(
          new OperationFailed({ message: "Could not delete this price." })
        )
      )
    ),
  select: (foodId: Domain.FoodId, priceId: Domain.FoodPriceId | null) =>
    Effect.gen(function* () {
      const foods = yield* Foods.Foods;
      const result = yield* foods.selectCurrentFoodPrice({
        input: { foodId, priceId },
      });
      return new OperationSucceeded({
        food: result.food,
        message:
          result.food.prices.find((price) => price.isCurrent) === undefined
            ? "No current price selected."
            : null,
      });
    }).pipe(
      Effect.catch(() =>
        Effect.succeed(
          new OperationFailed({
            message: "Could not change the current price.",
          })
        )
      )
    ),
};

const priceManagerMachine = Machine.make({
  states: PriceStates.states,
  events: [
    Add,
    Cancel,
    Retry,
    Submit,
    ClearCurrent,
    ChangePrice,
    ChangeQuantityAmount,
    ChangeQuantityUnit,
    EditPrice,
    RemovePrice,
    SelectPrice,
    FoodLoaded,
    OperationSucceeded,
    OperationFailed,
  ],
  input: Schema.Struct({ foodId: Domain.FoodId }),
  initial: ({ foodId }) =>
    PriceStates.initial.Route(new PricesRoute({ foodId }), (route) =>
      route.Loading(new Loading())
    ),
}).handle({
  Route: {
    states: {
      Loading: {
        invoke: ({ parents }) =>
          Machine.invoke({
            id: "load-prices",
            src: () =>
              Machine.effect(priceOperations.load(parents.Route.foodId)),
          }),
        on: {
          FoodLoaded: ({ event, target }) =>
            target.local.Listing(
              new Listing({
                food: event.food,
                message: null,
                messageTone: "success",
              })
            ),
          OperationFailed: ({ event, target }) =>
            target.local.LoadFailed(new LoadFailed({ message: event.message })),
        },
      },
      LoadFailed: {
        on: {
          Retry: ({ target }) => target.local.Loading(new Loading()),
        },
      },
      Listing: {
        on: {
          Add: ({ state, target }) =>
            target.local.Adding(
              new Adding({
                food: state.food,
                form: { price: "", quantityAmount: "1", quantityUnit: "kg" },
                message: null,
              })
            ),
          ClearCurrent: ({ state, target }) =>
            target.local.Selecting(
              new Selecting({ food: state.food, priceId: null })
            ),
          EditPrice: ({ event, state, target }) => {
            const price = state.food.prices.find(
              (candidate) => candidate.id === event.priceId
            );
            return price === undefined
              ? undefined
              : target.local.Editing(
                  new Editing({
                    food: state.food,
                    form: {
                      price: `${price.priceMinor / 10 ** (price.currency === "JPY" ? 0 : 2)}`,
                      quantityAmount: `${price.referenceQuantity.amount}`,
                      quantityUnit: price.referenceQuantity.unit,
                    },
                    message: null,
                    priceId: price.id,
                  })
                );
          },
          RemovePrice: ({ event, state, target }) =>
            target.local.Removing(
              new Removing({ food: state.food, priceId: event.priceId })
            ),
          SelectPrice: ({ event, state, target }) =>
            target.local.Selecting(
              new Selecting({ food: state.food, priceId: event.priceId })
            ),
        },
      },
      Adding: {
        on: {
          Cancel: ({ state, target }) =>
            target.local.Listing(
              new Listing({
                food: state.food,
                message: null,
                messageTone: "success",
              })
            ),
          ChangePrice: ({ event, state, target }) =>
            target.local.Adding(
              new Adding({
                ...state,
                form: { ...state.form, price: event.value },
              })
            ),
          ChangeQuantityAmount: ({ event, state, target }) =>
            target.local.Adding(
              new Adding({
                ...state,
                form: { ...state.form, quantityAmount: event.value },
              })
            ),
          ChangeQuantityUnit: ({ event, state, target }) =>
            target.local.Adding(
              new Adding({
                ...state,
                form: { ...state.form, quantityUnit: event.unit },
              })
            ),
          Submit: ({ state, target }) =>
            target.local.SavingAdd(
              new SavingAdd({ food: state.food, form: state.form })
            ),
        },
      },
      SavingAdd: {
        invoke: ({ parents, state }) =>
          Machine.invoke({
            id: "add-price",
            src: () =>
              Machine.effect(
                priceOperations.add(parents.Route.foodId, state.form)
              ),
          }),
        on: {
          OperationSucceeded: ({ event, target }) =>
            target.local.Listing(
              new Listing({
                food: event.food,
                message: event.message,
                messageTone: "success",
              })
            ),
          OperationFailed: ({ event, state, target }) =>
            target.local.Adding(
              new Adding({
                food: state.food,
                form: state.form,
                message: event.message,
              })
            ),
        },
      },
      Editing: {
        on: {
          Cancel: ({ state, target }) =>
            target.local.Listing(
              new Listing({
                food: state.food,
                message: null,
                messageTone: "success",
              })
            ),
          ChangePrice: ({ event, state, target }) =>
            target.local.Editing(
              new Editing({
                ...state,
                form: { ...state.form, price: event.value },
              })
            ),
          ChangeQuantityAmount: ({ event, state, target }) =>
            target.local.Editing(
              new Editing({
                ...state,
                form: { ...state.form, quantityAmount: event.value },
              })
            ),
          ChangeQuantityUnit: ({ event, state, target }) =>
            target.local.Editing(
              new Editing({
                ...state,
                form: { ...state.form, quantityUnit: event.unit },
              })
            ),
          Submit: ({ state, target }) =>
            target.local.SavingEdit(
              new SavingEdit({
                food: state.food,
                form: state.form,
                priceId: state.priceId,
              })
            ),
        },
      },
      SavingEdit: {
        invoke: ({ parents, state }) =>
          Machine.invoke({
            id: "edit-price",
            src: () =>
              Machine.effect(
                priceOperations.edit(
                  parents.Route.foodId,
                  state.form,
                  state.priceId
                )
              ),
          }),
        on: {
          OperationSucceeded: ({ event, target }) =>
            target.local.Listing(
              new Listing({
                food: event.food,
                message: event.message,
                messageTone: "success",
              })
            ),
          OperationFailed: ({ event, state, target }) =>
            target.local.Editing(
              new Editing({
                food: state.food,
                form: state.form,
                message: event.message,
                priceId: state.priceId,
              })
            ),
        },
      },
      Removing: {
        invoke: ({ parents, state }) =>
          Machine.invoke({
            id: "remove-price",
            src: () =>
              Machine.effect(
                priceOperations.remove(parents.Route.foodId, state.priceId)
              ),
          }),
        on: {
          OperationSucceeded: ({ event, target }) =>
            target.local.Listing(
              new Listing({
                food: event.food,
                message: event.message,
                messageTone: "success",
              })
            ),
          OperationFailed: ({ event, state, target }) =>
            target.local.Listing(
              new Listing({
                food: state.food,
                message: event.message,
                messageTone: "danger",
              })
            ),
        },
      },
      Selecting: {
        invoke: ({ parents, state }) =>
          Machine.invoke({
            id: "select-price",
            src: () =>
              Machine.effect(
                priceOperations.select(parents.Route.foodId, state.priceId)
              ),
          }),
        on: {
          OperationSucceeded: ({ event, target }) =>
            target.local.Listing(
              new Listing({
                food: event.food,
                message: event.message,
                messageTone: "success",
              })
            ),
          OperationFailed: ({ event, state, target }) =>
            target.local.Listing(
              new Listing({
                food: state.food,
                message: event.message,
                messageTone: "danger",
              })
            ),
        },
      },
    },
  },
});

export default function FoodPricesRoute() {
  const params = useSchemaLocalSearchParams(RouteParams);
  return Option.isNone(params) ? (
    <Redirect href="/" />
  ) : (
    <FoodPricesScreen foodId={params.value.id} />
  );
}

function FoodPricesScreen({ foodId }: { readonly foodId: Domain.FoodId }) {
  const machineAtom = useMemo(
    () => AtomMachine.make(MobileAtomRuntime, priceManagerMachine, { foodId }),
    [foodId]
  );
  const stateResult = useAtomValue(machineAtom.state);
  const send = useAtomSet(machineAtom.send);

  if (
    !AsyncResult.isSuccess(stateResult) ||
    PriceStates.matches(stateResult.value, "Route.Loading")
  ) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading prices" />
      </AppScreen>
    );
  }

  const failed = PriceStates.get(stateResult.value, "Route.LoadFailed").pipe(
    Option.getOrUndefined
  );
  if (failed !== undefined) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <Notice message={failed.message} tone="danger" />
        <Button icon={RotateCcw} onPress={() => send(new Retry())}>
          Try again
        </Button>
        <Button onPress={() => router.back()} variant="secondary">
          Back
        </Button>
      </AppScreen>
    );
  }

  const adding = PriceStates.get(stateResult.value, "Route.Adding").pipe(
    Option.getOrUndefined
  );
  const savingAdd = PriceStates.get(stateResult.value, "Route.SavingAdd").pipe(
    Option.getOrUndefined
  );
  const editing = PriceStates.get(stateResult.value, "Route.Editing").pipe(
    Option.getOrUndefined
  );
  const savingEdit = PriceStates.get(
    stateResult.value,
    "Route.SavingEdit"
  ).pipe(Option.getOrUndefined);
  const formState = adding ?? savingAdd ?? editing ?? savingEdit;

  if (formState !== undefined) {
    const saving = savingAdd !== undefined || savingEdit !== undefined;
    const isEditing = editing !== undefined || savingEdit !== undefined;
    const formMessage = adding?.message ?? editing?.message;
    const priceValue = Number(formState.form.price.replace(",", "."));
    const quantityAmount = Number(
      formState.form.quantityAmount.replace(",", ".")
    );
    const formIsValid =
      Number.isFinite(priceValue) &&
      priceValue > 0 &&
      Number.isFinite(quantityAmount) &&
      quantityAmount > 0;
    return (
      <PricePage
        food={formState.food}
        title={isEditing ? "Edit price" : "Add price"}
      >
        <Notice
          message="Prices are stored in euros for now. Currency selection will be added later."
          tone="neutral"
        />
        <FoodPriceFields
          disabled={saving}
          price={formState.form.price}
          quantity={formState.form.quantityAmount}
          quantityUnit={formState.form.quantityUnit}
          onPriceChange={(value) => send(new ChangePrice({ value }))}
          onQuantityChange={(value) =>
            send(new ChangeQuantityAmount({ value }))
          }
          onQuantityUnitChange={(unit) =>
            send(new ChangeQuantityUnit({ unit }))
          }
        />
        {formMessage === undefined || formMessage === null ? null : (
          <Notice message={formMessage} tone="danger" />
        )}
        <View style={styles.actions}>
          <Button
            disabled={saving}
            onPress={() => send(new Cancel())}
            style={styles.action}
            variant="secondary"
          >
            Cancel
          </Button>
          <Button
            disabled={!formIsValid}
            icon={Save}
            loading={saving}
            onPress={() => send(new Submit())}
            style={styles.action}
          >
            {isEditing ? "Save price" : "Add price"}
          </Button>
        </View>
      </PricePage>
    );
  }

  const listing = PriceStates.get(stateResult.value, "Route.Listing").pipe(
    Option.getOrUndefined
  );
  const removing = PriceStates.get(stateResult.value, "Route.Removing").pipe(
    Option.getOrUndefined
  );
  const selecting = PriceStates.get(stateResult.value, "Route.Selecting").pipe(
    Option.getOrUndefined
  );
  const food = listing?.food ?? removing?.food ?? selecting?.food;
  if (food === undefined) return null;

  const busy = removing !== undefined || selecting !== undefined;
  const currentPrice = food.prices.find((price) => price.isCurrent);
  return (
    <PricePage food={food} title="Manage prices">
      <Notice
        message="The current price is used to estimate meal and day spending. You may leave every price unselected."
        tone="neutral"
      />
      {listing?.message === null || listing === undefined ? null : (
        <Notice message={listing.message} tone={listing.messageTone} />
      )}
      {!Array.isReadonlyArrayNonEmpty(food.prices) ? (
        <Notice message="No prices have been added yet." tone="neutral" />
      ) : (
        <View style={styles.stack}>
          {food.prices.map((price) => {
            const addedAt = new Intl.DateTimeFormat(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            }).format(new Date(DateTime.toEpochMillis(price.createdAt)));
            return (
              <SectionCard
                key={price.id}
                style={price.isCurrent ? styles.currentPriceCard : undefined}
                subtitle={`${formatNumber({ maximumFractionDigits: 2, value: price.referenceQuantity.amount })} ${price.referenceQuantity.unit} · added ${addedAt}`}
                title={formatCurrencyMinor({
                  currency: price.currency,
                  minorValue: price.priceMinor,
                })}
              >
                <View style={styles.stack}>
                  <Text
                    style={price.isCurrent ? styles.current : styles.metaText}
                  >
                    {price.isCurrent ? "Current price" : "Not selected"}
                  </Text>
                  <View style={styles.actions}>
                    <Button
                      disabled={busy}
                      icon={Pencil}
                      onPress={() => send(new EditPrice({ priceId: price.id }))}
                      style={styles.action}
                      variant="secondary"
                    >
                      Edit
                    </Button>
                    <Button
                      disabled={busy}
                      icon={price.isCurrent ? CircleOff : Check}
                      onPress={() =>
                        send(
                          price.isCurrent
                            ? new ClearCurrent()
                            : new SelectPrice({ priceId: price.id })
                        )
                      }
                      style={styles.action}
                      variant={price.isCurrent ? "secondary" : "safe"}
                    >
                      {price.isCurrent ? "Clear current" : "Use current"}
                    </Button>
                  </View>
                  <Button
                    disabled={busy}
                    icon={Trash2}
                    onPress={() => send(new RemovePrice({ priceId: price.id }))}
                    variant="danger"
                  >
                    Delete price
                  </Button>
                </View>
              </SectionCard>
            );
          })}
        </View>
      )}
      {currentPrice === undefined || busy ? null : (
        <Text style={styles.helpText}>
          Meal history is calculated from the current price and updates when
          this selection changes.
        </Text>
      )}
      <Button disabled={busy} icon={Plus} onPress={() => send(new Add())}>
        {"Add\u00a0price"}
      </Button>
    </PricePage>
  );
}

function PricePage({
  children,
  food,
  title,
}: {
  readonly children: React.ReactNode;
  readonly food: Domain.Food;
  readonly title: string;
}) {
  return (
    <AppScreen
      contentStyle={styles.pageContent}
      safeAreaEdges={["top"]}
      scroll
      topSafeAreaColor={color.primary}
    >
      <AppHeader
        embedded
        leading={
          <IconButton
            accessibilityLabel="Back"
            icon={ChevronLeft}
            onPress={() => router.back()}
            variant="ghost"
          />
        }
        shadow
        title={title}
      />
      <View style={styles.foodHeading}>
        <Text style={styles.foodName}>{food.name}</Text>
        {food.brand === undefined ? null : (
          <Text style={styles.foodBrand}>{food.brand}</Text>
        )}
      </View>
      <View style={styles.body}>{children}</View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  action: { flex: 1 },
  actions: { flexDirection: "row", gap: spacing.sm },
  body: { gap: spacing.lg, paddingHorizontal: spacing.lg },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
    padding: spacing.xl,
  },
  current: {
    color: color.safeText,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.black,
  },
  currentPriceCard: {
    borderWidth: 2,
    borderColor: color.safeBorder,
    backgroundColor: color.safeBg,
  },
  foodBrand: {
    color: color.textMuted,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.semibold,
  },
  foodHeading: { gap: spacing.xs, paddingHorizontal: spacing.lg },
  foodName: {
    color: color.text,
    fontSize: tokens.type.size.xl,
    fontWeight: tokens.type.weight.black,
  },
  helpText: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
  },
  metaText: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
  },
  pageContent: { gap: spacing.lg, paddingHorizontal: 0 },
  stack: { gap: spacing.md },
});
