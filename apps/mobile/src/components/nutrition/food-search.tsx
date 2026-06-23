import { formatNumber } from "@/lib/format";
import { color, radius, spacing, tokens } from "@/theme/tokens";
import { type Domain } from "@mai/nutrition";
import { type FoodSearchMachine } from "@mai/machines";
import { useSelector } from "@xstate/react";
import { Array as EffectArray } from "effect";
import { Search } from "lucide-react-native";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItem,
} from "react-native";

type FoodSearchProps = {
  readonly actor: FoodSearchMachine.FoodSearchActorRef;
  readonly disabled?: boolean;
  readonly emptyFoodsText?: string;
  readonly emptySearchText?: string;
  readonly getPrimaryLabel?: (food: Domain.Food) => string;
  readonly getSecondaryLabel?: (food: Domain.Food) => string;
  readonly placeholder?: string;
};

export function FoodSearch({
  actor,
  disabled = false,
  emptyFoodsText = "No foods available.",
  emptySearchText = "No foods found.",
  getPrimaryLabel,
  getSecondaryLabel,
  placeholder = "Search food or brand",
}: FoodSearchProps) {
  return (
    <View style={styles.root}>
      <FoodSearchField
        actor={actor}
        disabled={disabled}
        placeholder={placeholder}
      />
      <FoodSearchResults
        actor={actor}
        disabled={disabled}
        emptyFoodsText={emptyFoodsText}
        emptySearchText={emptySearchText}
        getPrimaryLabel={getPrimaryLabel}
        getSecondaryLabel={getSecondaryLabel}
      />
    </View>
  );
}

export function FoodSearchField({
  actor,
  autoFocus = false,
  disabled,
  placeholder = "Search food or brand",
}: {
  readonly actor: FoodSearchMachine.FoodSearchActorRef;
  readonly autoFocus?: boolean;
  readonly disabled: boolean;
  readonly placeholder?: string;
}) {
  const query = useSelector(actor, (snapshot) => snapshot.context.query);

  return (
    <View style={styles.searchShell}>
      <Search color={color.textSubtle} size={20} strokeWidth={3} />
      <TextInput
        accessibilityLabel="Food search"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        editable={!disabled}
        inputMode="search"
        onChangeText={(value) => {
          actor.send({
            query: value,
            type: "changeQuery",
          });
        }}
        onSubmitEditing={() => {
          actor.send({
            type: "selectFirstMatchingFood",
          });
        }}
        placeholder={placeholder}
        placeholderTextColor={color.textSubtle}
        returnKeyType="search"
        selectionColor={color.primary}
        style={styles.searchInput}
        value={query}
      />
    </View>
  );
}

export function FoodSearchResults({
  actor,
  disabled,
  emptyFoodsText,
  emptySearchText,
  getPrimaryLabel,
  getSecondaryLabel,
}: {
  readonly actor: FoodSearchMachine.FoodSearchActorRef;
  readonly disabled: boolean;
  readonly emptyFoodsText: string;
  readonly emptySearchText: string;
  readonly getPrimaryLabel?: (food: Domain.Food) => string;
  readonly getSecondaryLabel?: (food: Domain.Food) => string;
}) {
  const foods = useSelector(actor, (snapshot) => snapshot.context.foods);
  const matchingFoods = useSelector(
    actor,
    (snapshot) => snapshot.context.matchingFoods
  );
  const query = useSelector(actor, (snapshot) => snapshot.context.query);
  const selectedFoodId = useSelector(
    actor,
    (snapshot) => snapshot.context.selectedFoodId
  );
  const emptyText =
    !EffectArray.isReadonlyArrayNonEmpty(foods) || query.trim() === ""
      ? emptyFoodsText
      : emptySearchText;

  return (
    <FlatList
      data={matchingFoods}
      keyboardShouldPersistTaps="handled"
      keyExtractor={(food) => food.id}
      ListEmptyComponent={<FoodSearchEmpty text={emptyText} />}
      renderItem={createFoodSearchRenderItem({
        actor,
        disabled,
        getPrimaryLabel,
        getSecondaryLabel,
        selectedFoodId,
      })}
      style={styles.list}
      contentContainerStyle={
        !EffectArray.isReadonlyArrayNonEmpty(matchingFoods)
          ? styles.emptyContent
          : styles.listContent
      }
    />
  );
}

export function createFoodSearchRenderItem({
  actor,
  disabled,
  getPrimaryLabel,
  getSecondaryLabel,
  selectedFoodId,
}: {
  readonly actor: FoodSearchMachine.FoodSearchActorRef;
  readonly disabled: boolean;
  readonly getPrimaryLabel: ((food: Domain.Food) => string) | undefined;
  readonly getSecondaryLabel: ((food: Domain.Food) => string) | undefined;
  readonly selectedFoodId: Domain.Food["id"] | null;
}): ListRenderItem<Domain.Food> {
  return ({ item }) => (
    <FoodSearchResult
      disabled={disabled}
      food={item}
      primaryLabel={getPrimaryLabel?.(item)}
      secondaryLabel={getSecondaryLabel?.(item)}
      selected={selectedFoodId === item.id}
      onPress={() => {
        actor.send({
          foodId: item.id,
          type: "selectFood",
        });
      }}
    />
  );
}

export function FoodDefaultOriginDot({ food }: { readonly food: Domain.Food }) {
  return food.origin === "app-default" ? (
    <View
      accessibilityLabel="Pre-installed food"
      style={styles.defaultDot}
      testID="food-default-origin-dot"
    />
  ) : null;
}

function FoodSearchResult({
  disabled,
  food,
  onPress,
  primaryLabel,
  secondaryLabel,
  selected,
}: {
  readonly disabled: boolean;
  readonly food: Domain.Food;
  readonly onPress: () => void;
  readonly primaryLabel?: string;
  readonly secondaryLabel?: string;
  readonly selected: boolean;
}) {
  const brandLabel = food.brand ?? "/";
  const per100gLabel = `${formatNumber({
    maximumFractionDigits: 0,
    value: food.energyKcalPer100g,
  })} kcal / 100 g`;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.result,
        selected ? styles.resultSelected : null,
        pressed && !disabled ? styles.resultPressed : null,
        disabled ? styles.resultDisabled : null,
      ]}
    >
      <View style={styles.resultCopy}>
        <View style={styles.titleRow}>
          <FoodDefaultOriginDot food={food} />
          <Text numberOfLines={1} style={styles.resultTitle}>
            {food.name}
          </Text>
        </View>
        <Text numberOfLines={1} style={styles.resultSummary}>
          {brandLabel}
        </Text>
      </View>
      <View style={styles.resultMetrics}>
        <Text numberOfLines={1} style={styles.primaryMetric}>
          {primaryLabel ?? per100gLabel}
        </Text>
        {secondaryLabel === undefined ? null : (
          <Text numberOfLines={1} style={styles.secondaryMetric}>
            {secondaryLabel}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function FoodSearchEmpty({ text }: { readonly text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    gap: spacing.lg,
  },
  searchShell: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: color.field,
  },
  searchInput: {
    minWidth: 0,
    flex: 1,
    color: color.text,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.md,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  emptyContent: {
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  emptyText: {
    color: color.textMuted,
    textAlign: "center",
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.sm,
  },
  result: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
  },
  resultSelected: {
    backgroundColor: color.dangerBg,
  },
  resultPressed: {
    opacity: 0.86,
  },
  resultDisabled: {
    opacity: 0.58,
  },
  resultCopy: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xs,
  },
  titleRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  defaultDot: {
    width: 7,
    height: 7,
    flexShrink: 0,
    borderRadius: radius.pill,
    backgroundColor: "#d9bd6f",
  },
  resultTitle: {
    minWidth: 0,
    flex: 1,
    color: color.text,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.md,
  },
  resultSummary: {
    color: color.textMuted,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.md,
  },
  resultMetrics: {
    width: 112,
    flexShrink: 0,
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  primaryMetric: {
    maxWidth: 112,
    color: color.nutritionEnergy,
    textAlign: "right",
    fontSize: tokens.type.size.lg,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.lg,
  },
  secondaryMetric: {
    maxWidth: 112,
    color: color.textMuted,
    textAlign: "right",
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.md,
  },
});
