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
import { RuntimeClient } from "@/lib/runtime-client";
import { color, spacing, tokens } from "@/theme/tokens";
import { EmptyEvent } from "@mai/machines";
import { Domain, Foods, Measurements } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { Array, DateTime, Effect, Option, Schema } from "effect";
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
import { StyleSheet, Text, View } from "react-native";
import { createAsyncLogic, setup } from "xstate";

const RouteParams = Schema.Struct({ id: Domain.FoodId });

const PriceForm = Schema.Struct({
  price: Schema.String,
  quantityAmount: Schema.String,
  quantityUnit: Domain.MeasurementUnit,
});

const Context = Schema.Struct({
  food: Schema.NullOr(Domain.Food),
  foodId: Domain.FoodId,
  form: PriceForm,
  message: Schema.NullOr(Schema.String),
  messageTone: Schema.Literals(["danger", "success"]),
  selectedPriceId: Schema.NullOr(Domain.FoodPriceId),
});

const PriceIdEvent = Schema.Struct({ priceId: Domain.FoodPriceId });
const ChangeTextEvent = Schema.Struct({ value: Schema.String });
const ChangeUnitEvent = Schema.Struct({ unit: Domain.MeasurementUnit });
const PriceMutationInput = Schema.Struct({
  foodId: Domain.FoodId,
  form: PriceForm,
});
const PriceEditInput = Schema.Struct({
  foodId: Domain.FoodId,
  form: PriceForm,
  priceId: Domain.FoodPriceId,
});
const PriceSelectionInput = Schema.Struct({
  foodId: Domain.FoodId,
  priceId: Schema.NullOr(Domain.FoodPriceId),
});

const foodOutput = Schema.Struct({ food: Domain.Food });

const priceManagerMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(Context),
    events: {
      add: Schema.toStandardSchemaV1(EmptyEvent),
      cancel: Schema.toStandardSchemaV1(EmptyEvent),
      changePrice: Schema.toStandardSchemaV1(ChangeTextEvent),
      changeQuantityAmount: Schema.toStandardSchemaV1(ChangeTextEvent),
      changeQuantityUnit: Schema.toStandardSchemaV1(ChangeUnitEvent),
      clearCurrent: Schema.toStandardSchemaV1(EmptyEvent),
      edit: Schema.toStandardSchemaV1(PriceIdEvent),
      remove: Schema.toStandardSchemaV1(PriceIdEvent),
      retry: Schema.toStandardSchemaV1(EmptyEvent),
      select: Schema.toStandardSchemaV1(PriceIdEvent),
      submit: Schema.toStandardSchemaV1(EmptyEvent),
    },
    input: Schema.toStandardSchemaV1(Schema.Struct({ foodId: Domain.FoodId })),
  },
  actorSources: {
    load: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(
          Schema.Struct({ foodId: Domain.FoodId })
        ),
        output: Schema.toStandardSchemaV1(foodOutput),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const foods = yield* Foods.Foods;
            return { food: yield* foods.get({ input }) };
          })
        ),
    }),
    addPrice: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(PriceMutationInput),
        output: Schema.toStandardSchemaV1(foodOutput),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const foods = yield* Foods.Foods;
            const result = yield* foods.addFoodPrice({
              input: _priceInput(input),
            });
            return { food: result.food };
          })
        ),
    }),
    editPrice: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(PriceEditInput),
        output: Schema.toStandardSchemaV1(foodOutput),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const foods = yield* Foods.Foods;
            const result = yield* foods.editFoodPrice({
              input: { ..._priceInput(input), priceId: input.priceId },
            });
            return { food: result.food };
          })
        ),
    }),
    removePrice: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(
          Schema.Struct({
            foodId: Domain.FoodId,
            priceId: Domain.FoodPriceId,
          })
        ),
        output: Schema.toStandardSchemaV1(foodOutput),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const foods = yield* Foods.Foods;
            const result = yield* foods.removeFoodPrice({ input });
            return { food: result.food };
          })
        ),
    }),
    selectPrice: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(PriceSelectionInput),
        output: Schema.toStandardSchemaV1(foodOutput),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const foods = yield* Foods.Foods;
            const result = yield* foods.selectCurrentFoodPrice({ input });
            return { food: result.food };
          })
        ),
    }),
  },
}).createMachine({
  context: ({ input }) => ({
    food: null,
    foodId: input.foodId,
    form: { price: "", quantityAmount: "1", quantityUnit: "kg" },
    message: null,
    messageTone: "success",
    selectedPriceId: null,
  }),
  initial: "Loading",
  on: {
    changePrice: ({ context, event }) => ({
      context: { form: { ...context.form, price: event.value } },
    }),
    changeQuantityAmount: ({ context, event }) => ({
      context: { form: { ...context.form, quantityAmount: event.value } },
    }),
    changeQuantityUnit: ({ context, event }) => ({
      context: { form: { ...context.form, quantityUnit: event.unit } },
    }),
  },
  states: {
    Loading: {
      invoke: {
        src: "load",
        input: ({ context }) => ({ foodId: context.foodId }),
        onDone: ({ event }) => ({
          target: "Listing",
          context: { food: event.output.food },
        }),
        onError: {
          target: "LoadFailed",
          context: { message: "Could not load prices for this food." },
        },
      },
    },
    LoadFailed: {
      on: { retry: { target: "Loading", context: { message: null } } },
    },
    Listing: {
      on: {
        add: {
          target: "Adding",
          context: {
            form: { price: "", quantityAmount: "1", quantityUnit: "kg" },
            message: null,
            selectedPriceId: null,
          },
        },
        clearCurrent: {
          target: "Selecting",
          context: { selectedPriceId: null },
        },
        edit: ({ context, event }) => {
          const price = context.food?.prices.find(
            (candidate) => candidate.id === event.priceId
          );
          if (price === undefined) return;
          return {
            target: "Editing",
            context: {
              form: {
                price: `${price.priceMinor / 10 ** (price.currency === "JPY" ? 0 : 2)}`,
                quantityAmount: `${price.referenceQuantity.amount}`,
                quantityUnit: price.referenceQuantity.unit,
              },
              message: null,
              selectedPriceId: price.id,
            },
          };
        },
        remove: {
          target: "Removing",
          context: ({ event }) => ({ selectedPriceId: event.priceId }),
        },
        select: {
          target: "Selecting",
          context: ({ event }) => ({ selectedPriceId: event.priceId }),
        },
      },
    },
    Adding: {
      on: {
        cancel: { target: "Listing", context: { message: null } },
        submit: { target: "SavingAdd" },
      },
    },
    Editing: {
      on: {
        cancel: { target: "Listing", context: { message: null } },
        submit: { target: "SavingEdit" },
      },
    },
    SavingAdd: {
      invoke: {
        src: "addPrice",
        input: ({ context }) => ({
          foodId: context.foodId,
          form: context.form,
        }),
        onDone: ({ event }) => ({
          target: "Listing",
          context: {
            food: event.output.food,
            message:
              event.output.food.prices.length === 1
                ? "Price added and selected as current."
                : "Price added.",
            messageTone: "success",
          },
        }),
        onError: {
          target: "Adding",
          context: { message: "Could not add this price." },
        },
      },
    },
    SavingEdit: {
      invoke: {
        src: "editPrice",
        input: ({ context }) => ({
          foodId: context.foodId,
          form: context.form,
          priceId: _selectedPriceId(context),
        }),
        onDone: ({ event }) => ({
          target: "Listing",
          context: {
            food: event.output.food,
            message: "Price updated.",
            messageTone: "success",
          },
        }),
        onError: {
          target: "Editing",
          context: { message: "Could not update this price." },
        },
      },
    },
    Removing: {
      invoke: {
        src: "removePrice",
        input: ({ context }) => ({
          foodId: context.foodId,
          priceId: _selectedPriceId(context),
        }),
        onDone: ({ event }) => ({
          target: "Listing",
          context: {
            food: event.output.food,
            message: "Price deleted.",
            messageTone: "success",
            selectedPriceId: null,
          },
        }),
        onError: {
          target: "Listing",
          context: {
            message: "Could not delete this price.",
            messageTone: "danger",
          },
        },
      },
    },
    Selecting: {
      invoke: {
        src: "selectPrice",
        input: ({ context }) => ({
          foodId: context.foodId,
          priceId: context.selectedPriceId,
        }),
        onDone: ({ event }) => ({
          target: "Listing",
          context: {
            food: event.output.food,
            message:
              event.output.food.prices.find((price) => price.isCurrent) ===
              undefined
                ? "No current price selected."
                : null,
            messageTone: "success",
            selectedPriceId: null,
          },
        }),
        onError: {
          target: "Listing",
          context: {
            message: "Could not change the current price.",
            messageTone: "danger",
          },
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
  const [snapshot, , actor] = useMachine(priceManagerMachine, {
    input: { foodId },
  });
  const food = snapshot.context.food;

  if (snapshot.matches("Loading")) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading prices" />
      </AppScreen>
    );
  }
  if (snapshot.matches("LoadFailed") || food === null) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <Notice
          message={snapshot.context.message ?? "Could not load prices."}
          tone="danger"
        />
        <Button icon={RotateCcw} onPress={actor.trigger.retry}>
          Try again
        </Button>
        <Button onPress={() => router.back()} variant="secondary">
          Back
        </Button>
      </AppScreen>
    );
  }

  if (
    snapshot.matches("Adding") ||
    snapshot.matches("Editing") ||
    snapshot.matches("SavingAdd") ||
    snapshot.matches("SavingEdit")
  ) {
    const saving =
      snapshot.matches("SavingAdd") || snapshot.matches("SavingEdit");
    const editing =
      snapshot.matches("Editing") || snapshot.matches("SavingEdit");
    const priceValue = Number(snapshot.context.form.price.replace(",", "."));
    const quantityAmount = Number(
      snapshot.context.form.quantityAmount.replace(",", ".")
    );
    const formIsValid =
      Number.isFinite(priceValue) &&
      priceValue > 0 &&
      Number.isFinite(quantityAmount) &&
      quantityAmount > 0;
    const needsMassVolumeConversion =
      Measurements.isMassUnit(food.nutritionReference.unit) !==
        Measurements.isMassUnit(snapshot.context.form.quantityUnit) &&
      food.massVolumeConversion === undefined;
    return (
      <PricePage food={food} title={editing ? "Edit price" : "Add price"}>
        <Notice
          message="Prices are stored in euros for now. Currency selection will be added later."
          tone="neutral"
        />
        <FoodPriceFields
          disabled={saving}
          price={snapshot.context.form.price}
          quantity={snapshot.context.form.quantityAmount}
          quantityUnit={snapshot.context.form.quantityUnit}
          onPriceChange={(value) => actor.send({ type: "changePrice", value })}
          onQuantityChange={(value) =>
            actor.send({ type: "changeQuantityAmount", value })
          }
          onQuantityUnitChange={(unit) =>
            actor.send({ type: "changeQuantityUnit", unit })
          }
        />
        {needsMassVolumeConversion ? (
          <Notice
            message="This price uses volume while the food uses weight, or vice versa. Add a weight and volume conversion in the food details so spending can be calculated."
            title="Conversion needed"
            tone="warning"
          />
        ) : null}
        {snapshot.context.message === null ? null : (
          <Notice message={snapshot.context.message} tone="danger" />
        )}
        <View style={styles.actions}>
          <Button
            disabled={saving}
            onPress={actor.trigger.cancel}
            style={styles.action}
            variant="secondary"
          >
            Cancel
          </Button>
          <Button
            disabled={!formIsValid}
            icon={Save}
            loading={saving}
            onPress={actor.trigger.submit}
            style={styles.action}
          >
            {editing ? "Save price" : "Add price"}
          </Button>
        </View>
      </PricePage>
    );
  }

  const busy = snapshot.matches("Removing") || snapshot.matches("Selecting");
  const currentPrice = food.prices.find((price) => price.isCurrent);
  return (
    <PricePage food={food} title="Manage prices">
      <Notice
        message="The current price is used to estimate meal and day spending. You may leave every price unselected."
        tone="neutral"
      />
      {snapshot.context.message === null ? null : (
        <Notice
          message={snapshot.context.message}
          tone={snapshot.context.messageTone}
        />
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
                      onPress={() =>
                        actor.send({ type: "edit", priceId: price.id })
                      }
                      style={styles.action}
                      variant="secondary"
                    >
                      Edit
                    </Button>
                    <Button
                      disabled={busy}
                      icon={price.isCurrent ? CircleOff : Check}
                      onPress={() =>
                        price.isCurrent
                          ? actor.trigger.clearCurrent()
                          : actor.send({ type: "select", priceId: price.id })
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
                    onPress={() =>
                      actor.send({ type: "remove", priceId: price.id })
                    }
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
      <Button disabled={busy} icon={Plus} onPress={actor.trigger.add}>
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

function _priceInput(input: typeof PriceMutationInput.Type) {
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

function _selectedPriceId(context: typeof Context.Type) {
  if (context.selectedPriceId === null) {
    throw new Error("Expected a selected price.");
  }
  return context.selectedPriceId;
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
