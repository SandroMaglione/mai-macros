import { SearchField } from "@/components/ui";
import { formatNumber } from "@/lib/format";
import { color, radius, spacing, type } from "@/theme/tokens";
import type { Food } from "@mai/nutrition";
import {
  getFoodCategoryLabel,
  type FoodSearchActorRef,
} from "@mai/machines/foods";
import { useSelector } from "@xstate/react";
import { Array as EffectArray } from "effect";
import { Search } from "lucide-react-native";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from "react-native";

type FoodSearchProps = {
  readonly actor: FoodSearchActorRef;
  readonly disabled?: boolean;
  readonly emptyFoodsText?: string;
  readonly emptySearchText?: string;
  readonly getPrimaryLabel?: (food: Food) => string;
  readonly getSecondaryLabel?: (food: Food) => string;
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
    <View style={styles.root}>
      <SearchField
        accessibilityLabel="Food search"
        editable={!disabled}
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
        rightElement={
          <Search color={color.textSubtle} size={18} strokeWidth={2.6} />
        }
        value={query}
      />
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
    </View>
  );
}

export function createFoodSearchRenderItem({
  actor,
  disabled,
  getPrimaryLabel,
  getSecondaryLabel,
  selectedFoodId,
}: {
  readonly actor: FoodSearchActorRef;
  readonly disabled: boolean;
  readonly getPrimaryLabel: ((food: Food) => string) | undefined;
  readonly getSecondaryLabel: ((food: Food) => string) | undefined;
  readonly selectedFoodId: Food["id"] | null;
}): ListRenderItem<Food> {
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

export function FoodDefaultOriginDot({ food }: { readonly food: Food }) {
  return food.origin === "app-default" ? (
    <View
      accessibilityLabel="Default food"
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
  readonly food: Food;
  readonly onPress: () => void;
  readonly primaryLabel?: string;
  readonly secondaryLabel?: string;
  readonly selected: boolean;
}) {
  const metadata = [
    food.brand,
    food.category === undefined
      ? undefined
      : getFoodCategoryLabel({ category: food.category }),
  ].filter((value): value is string => value !== undefined);
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
          {!EffectArray.isReadonlyArrayNonEmpty(metadata)
            ? per100gLabel
            : metadata.join(" • ")}
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
    gap: spacing.sm,
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: spacing.xs,
    paddingBottom: spacing.xl,
  },
  emptyContent: {
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.md,
    padding: spacing.xl,
    backgroundColor: color.sheet,
  },
  emptyText: {
    color: color.textMuted,
    textAlign: "center",
    fontSize: type.size.sm,
    fontWeight: type.weight.semibold,
    lineHeight: type.lineHeight.sm,
  },
  result: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: color.sheet,
  },
  resultSelected: {
    borderColor: color.primary,
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
    width: 8,
    height: 8,
    flexShrink: 0,
    borderRadius: radius.pill,
    backgroundColor: color.primary,
  },
  resultTitle: {
    minWidth: 0,
    flex: 1,
    color: color.text,
    fontSize: type.size.md,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.md,
  },
  resultSummary: {
    color: color.textMuted,
    fontSize: type.size.sm,
    fontWeight: type.weight.semibold,
    lineHeight: type.lineHeight.sm,
  },
  resultMetrics: {
    width: 96,
    flexShrink: 0,
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  primaryMetric: {
    maxWidth: 96,
    color: color.text,
    textAlign: "right",
    fontSize: type.size.sm,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.sm,
  },
  secondaryMetric: {
    maxWidth: 96,
    color: color.textSubtle,
    textAlign: "right",
    fontSize: type.size.xs,
    fontWeight: type.weight.semibold,
    lineHeight: type.lineHeight.xs,
  },
});
