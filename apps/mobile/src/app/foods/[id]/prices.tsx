import { FoodPriceFields } from "@/components/nutrition/food-price-fields";
import { AppScreen } from "@/components/ui/app-screen";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { LoadingView } from "@/components/ui/loading-view";
import { AppHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { SectionCard } from "@/components/ui/section-card";
import { useMachine } from "@/hooks/use-machine";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { formatCurrencyMinor, formatNumber } from "@/lib/format";
import { MachineAtoms } from "@/lib/machine-runtime";
import {
  FoodPricesEvents,
  FoodPricesLoaderEvents,
  FoodPricesLoaderMachine,
  FoodPricesMachine,
  FoodPricesStates,
  type FoodPricesData,
} from "@/machines/food-prices-machine";
import { color, spacing, tokens } from "@/theme/tokens";
import { Domain, Measurements } from "@mai/nutrition";
import { Array, DateTime, Option, Schema } from "effect";
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

const RouteParams = Schema.Struct({ id: Domain.FoodId });

export default function FoodPricesRoute() {
  const params = useSchemaLocalSearchParams(RouteParams);
  return Option.isNone(params) ? (
    <Redirect href="/" />
  ) : (
    <FoodPricesLoader foodId={params.value.id} />
  );
}

function FoodPricesLoader({ foodId }: { readonly foodId: Domain.FoodId }) {
  const [snapshot, send] = useMachine(() =>
    MachineAtoms.make(FoodPricesLoaderMachine, { foodId })
  );
  const state = snapshot.state;

  if (state.path === "Loading") {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading prices" />
      </AppScreen>
    );
  }
  if (state.path === "Failed") {
    return (
      <AppScreen contentStyle={styles.centered}>
        <Notice message={state.value.message} tone="danger" />
        <Button
          icon={RotateCcw}
          onPress={() => {
            send(FoodPricesLoaderEvents.Retry());
          }}
        >
          Try again
        </Button>
        <Button onPress={() => router.back()} variant="secondary">
          Back
        </Button>
      </AppScreen>
    );
  }

  return <FoodPricesScreen data={state.value.data} />;
}

function FoodPricesScreen({ data }: { readonly data: FoodPricesData }) {
  const [snapshot, send] = useMachine(() =>
    MachineAtoms.make(FoodPricesMachine, data)
  );
  const { food, form, message, messageTone } = snapshot.value;

  if (
    FoodPricesStates.matches(snapshot, "Adding") ||
    FoodPricesStates.matches(snapshot, "Editing")
  ) {
    const saving =
      FoodPricesStates.matches(snapshot, "Adding.Saving") ||
      FoodPricesStates.matches(snapshot, "Editing.Saving");
    const editing = FoodPricesStates.matches(snapshot, "Editing");
    const priceValue = Number(form.price.replace(",", "."));
    const quantityAmount = Number(form.quantityAmount.replace(",", "."));
    const formIsValid =
      Number.isFinite(priceValue) &&
      priceValue > 0 &&
      Number.isFinite(quantityAmount) &&
      quantityAmount > 0;
    const needsMassVolumeConversion =
      Measurements.isMassUnit(food.nutritionReference.unit) !==
        Measurements.isMassUnit(form.quantityUnit) &&
      food.massVolumeConversion === undefined;
    return (
      <PricePage food={food} title={editing ? "Edit price" : "Add price"}>
        <Notice
          message="Prices are stored in euros for now. Currency selection will be added later."
          tone="neutral"
        />
        <FoodPriceFields
          disabled={saving}
          price={form.price}
          quantity={form.quantityAmount}
          quantityUnit={form.quantityUnit}
          onPriceChange={(value) => {
            send(FoodPricesEvents.ChangePrice({ value }));
          }}
          onQuantityChange={(value) => {
            send(FoodPricesEvents.ChangeQuantityAmount({ value }));
          }}
          onQuantityUnitChange={(unit) => {
            send(FoodPricesEvents.ChangeQuantityUnit({ unit }));
          }}
        />
        {needsMassVolumeConversion ? (
          <Notice
            message="This price uses volume while the food uses weight, or vice versa. Add a weight and volume conversion in the food details so spending can be calculated."
            title="Conversion needed"
            tone="warning"
          />
        ) : null}
        {message === null ? null : <Notice message={message} tone="danger" />}
        <View style={styles.actions}>
          <Button
            disabled={saving}
            onPress={() => {
              send(FoodPricesEvents.Cancel());
            }}
            style={styles.action}
            variant="secondary"
          >
            Cancel
          </Button>
          <Button
            disabled={!formIsValid}
            icon={Save}
            loading={saving}
            onPress={() => {
              send(FoodPricesEvents.Submit());
            }}
            style={styles.action}
          >
            {editing ? "Save price" : "Add price"}
          </Button>
        </View>
      </PricePage>
    );
  }

  const busy =
    FoodPricesStates.matches(snapshot, "Removing") ||
    FoodPricesStates.matches(snapshot, "Selecting");
  const currentPrice = food.prices.find((price) => price.isCurrent);
  return (
    <PricePage food={food} title="Manage prices">
      <Notice
        message="The current price is used to estimate meal and day spending. You may leave every price unselected."
        tone="neutral"
      />
      {message === null ? null : (
        <Notice message={message} tone={messageTone} />
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
                      onPress={() => {
                        send(FoodPricesEvents.Edit({ priceId: price.id }));
                      }}
                      style={styles.action}
                      variant="secondary"
                    >
                      Edit
                    </Button>
                    <Button
                      disabled={busy}
                      icon={price.isCurrent ? CircleOff : Check}
                      onPress={() => {
                        send(
                          price.isCurrent
                            ? FoodPricesEvents.ClearCurrent()
                            : FoodPricesEvents.Select({ priceId: price.id })
                        );
                      }}
                      style={styles.action}
                      variant={price.isCurrent ? "secondary" : "safe"}
                    >
                      {price.isCurrent ? "Clear current" : "Use current"}
                    </Button>
                  </View>
                  <Button
                    disabled={busy}
                    icon={Trash2}
                    onPress={() => {
                      send(FoodPricesEvents.Remove({ priceId: price.id }));
                    }}
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
      <Button
        disabled={busy}
        icon={Plus}
        onPress={() => {
          send(FoodPricesEvents.Add());
        }}
      >
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
      topSafeAreaColor={color.header}
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
    fontWeight: tokens.type.weight.semibold,
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
    fontWeight: tokens.type.weight.semibold,
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
