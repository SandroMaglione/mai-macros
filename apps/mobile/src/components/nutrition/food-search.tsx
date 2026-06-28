import { formatNumber } from "@/lib/format";
import { color, radius, spacing, tokens } from "@/theme/tokens";
import { EmptyEvent } from "@mai/machines";
import { Utils, type Domain } from "@mai/nutrition";
import { type FoodSearchMachine } from "@mai/machines";
import { useMachine, useSelector } from "@xstate/react";
import { Array, Schema } from "effect";
import { Check, ChevronDown, Search } from "lucide-react-native";
import {
  ActionSheetIOS,
  Modal,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { setup } from "xstate";

const dominantMacronutrientIndicator = {
  carbs: {
    accessibilityLabel: "mostly carbs",
    color: color.nutritionCarbs,
  },
  fat: {
    accessibilityLabel: "mostly fat",
    color: color.nutritionFat,
  },
  protein: {
    accessibilityLabel: "mostly protein",
    color: color.nutritionProtein,
  },
} satisfies Record<
  Utils.DominantMacronutrient,
  {
    readonly accessibilityLabel: string;
    readonly color: string;
  }
>;

type FoodSearchMacroOrderOption = {
  readonly accessibilityLabel: string;
  readonly color: string;
  readonly key: string;
  readonly label: string;
  readonly macroOrder: FoodSearchMachine.FoodSearchMacroOrder | null;
};

const foodSearchMacroOrderDialogMachine = setup({
  schemas: {
    events: {
      close: Schema.toStandardSchemaV1(EmptyEvent),
      open: Schema.toStandardSchemaV1(EmptyEvent),
    },
  },
  states: {
    Closed: {},
    Open: {},
  },
}).createMachine({
  initial: "Closed",
  states: {
    Closed: {
      on: {
        open: {
          target: "Open",
        },
      },
    },
    Open: {
      on: {
        close: {
          target: "Closed",
        },
      },
    },
  },
});

const foodSearchDefaultMacroOrderOption = {
  accessibilityLabel: "Use default food order",
  color: color.textSubtle,
  key: "default",
  label: "Default",
  macroOrder: null,
} satisfies FoodSearchMacroOrderOption;

const foodSearchMacroOrderOptions = [
  foodSearchDefaultMacroOrderOption,
  {
    accessibilityLabel: "Order foods by calories",
    color: color.nutritionEnergy,
    key: "energy",
    label: "Calories",
    macroOrder: "energy",
  },
  {
    accessibilityLabel: "Order foods by fat",
    color: color.nutritionFat,
    key: "fat",
    label: "Fat",
    macroOrder: "fat",
  },
  {
    accessibilityLabel: "Order foods by saturated fat",
    color: color.nutritionFat,
    key: "saturated-fat",
    label: "Saturated fat",
    macroOrder: "saturatedFat",
  },
  {
    accessibilityLabel: "Order foods by carbs",
    color: color.nutritionCarbs,
    key: "carbs",
    label: "Carbs",
    macroOrder: "carbs",
  },
  {
    accessibilityLabel: "Order foods by sugar",
    color: color.nutritionSugar,
    key: "sugar",
    label: "Sugar",
    macroOrder: "sugar",
  },
  {
    accessibilityLabel: "Order foods by fiber",
    color: color.nutritionFiber,
    key: "fiber",
    label: "Fiber",
    macroOrder: "fiber",
  },
  {
    accessibilityLabel: "Order foods by protein",
    color: color.nutritionProtein,
    key: "protein",
    label: "Protein",
    macroOrder: "protein",
  },
  {
    accessibilityLabel: "Order foods by salt",
    color: color.nutritionSalt,
    key: "salt",
    label: "Salt",
    macroOrder: "salt",
  },
] satisfies readonly FoodSearchMacroOrderOption[];

export function FoodSearch({
  actor,
  disabled = false,
  emptyFoodsText = "No foods available.",
  emptySearchText = "No foods found.",
  getPrimaryLabel,
  getSecondaryLabel,
  placeholder = "Search food or brand",
}: {
  readonly actor: FoodSearchMachine.FoodSearchActorRef;
  readonly disabled?: boolean;
  readonly emptyFoodsText?: string;
  readonly emptySearchText?: string;
  readonly getPrimaryLabel?: (food: Domain.Food) => string;
  readonly getSecondaryLabel?: (food: Domain.Food) => string | undefined;
  readonly placeholder?: string;
}) {
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
  const [dialogSnapshot, , dialogActor] = useMachine(
    foodSearchMacroOrderDialogMachine
  );
  const query = useSelector(actor, (snapshot) => snapshot.context.query);
  const macroOrder = useSelector(
    actor,
    (snapshot) => snapshot.context.macroOrder
  );
  const selectedOrderOption =
    foodSearchMacroOrderOptions.find(
      (option) => option.macroOrder === macroOrder
    ) ?? foodSearchDefaultMacroOrderOption;

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
            type: "changeQuery",
            query: value,
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
      <FoodSearchMacroOrderSelector
        disabled={disabled}
        selectedOption={selectedOrderOption}
        onPress={() => {
          if (Platform.OS === "ios") {
            ActionSheetIOS.showActionSheetWithOptions(
              {
                cancelButtonIndex: foodSearchMacroOrderOptions.length,
                options: [
                  ...foodSearchMacroOrderOptions.map((option) => option.label),
                  "Cancel",
                ],
                title: "Order foods",
                userInterfaceStyle: "dark",
              },
              (buttonIndex) => {
                const option = foodSearchMacroOrderOptions[buttonIndex];

                if (option === undefined) {
                  return;
                }

                actor.send({
                  type: "changeMacroOrder",
                  macroOrder: option.macroOrder,
                });
              }
            );
            return;
          }

          dialogActor.trigger.open();
        }}
      />
      <FoodSearchMacroOrderDialog
        actor={actor}
        selectedOption={selectedOrderOption}
        visible={dialogSnapshot.matches("Open")}
        onClose={() => {
          dialogActor.trigger.close();
        }}
      />
    </View>
  );
}

function FoodSearchMacroOrderSelector({
  disabled,
  onPress,
  selectedOption,
}: {
  readonly disabled: boolean;
  readonly onPress: () => void;
  readonly selectedOption: FoodSearchMacroOrderOption;
}) {
  return (
    <Pressable
      accessibilityLabel={selectedOption.accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={spacing.sm}
      onPress={onPress}
      style={({ pressed }) => [
        styles.orderSelector,
        pressed && !disabled ? styles.orderSelectorPressed : null,
        disabled ? styles.orderSelectorDisabled : null,
      ]}
    >
      <View
        accessible={false}
        style={[
          styles.orderSelectorDot,
          { backgroundColor: selectedOption.color },
        ]}
      />
      <ChevronDown color={color.textSubtle} size={14} strokeWidth={3} />
    </Pressable>
  );
}

function FoodSearchMacroOrderDialog({
  actor,
  onClose,
  selectedOption,
  visible,
}: {
  readonly actor: FoodSearchMachine.FoodSearchActorRef;
  readonly onClose: () => void;
  readonly selectedOption: FoodSearchMacroOrderOption;
  readonly visible: boolean;
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <Pressable
        accessibilityRole="button"
        onPress={onClose}
        style={styles.orderDialogBackdrop}
      >
        <View style={styles.orderDialog} onStartShouldSetResponder={() => true}>
          <Text style={styles.orderDialogTitle}>Order foods</Text>
          {foodSearchMacroOrderOptions.map((option) => (
            <Pressable
              accessibilityLabel={option.accessibilityLabel}
              accessibilityRole="button"
              key={option.key}
              onPress={() => {
                actor.send({
                  type: "changeMacroOrder",
                  macroOrder: option.macroOrder,
                });
                onClose();
              }}
              style={({ pressed }) => [
                styles.orderDialogOption,
                selectedOption.key === option.key
                  ? styles.orderDialogOptionSelected
                  : null,
                pressed ? styles.orderDialogOptionPressed : null,
              ]}
            >
              <View
                accessible={false}
                style={[
                  styles.orderDialogOptionDot,
                  { backgroundColor: option.color },
                ]}
              />
              <Text style={styles.orderDialogOptionLabel}>{option.label}</Text>
              {selectedOption.key === option.key ? (
                <Check color={color.text} size={18} strokeWidth={3} />
              ) : null}
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
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
  readonly getSecondaryLabel?: (food: Domain.Food) => string | undefined;
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
    !Array.isReadonlyArrayNonEmpty(foods) || query.trim() === ""
      ? emptyFoodsText
      : emptySearchText;

  return (
    <FlatList
      data={matchingFoods}
      ItemSeparatorComponent={FoodSearchSeparator}
      keyboardShouldPersistTaps="handled"
      keyExtractor={(food) => food.id}
      ListEmptyComponent={<FoodSearchEmpty text={emptyText} />}
      renderItem={({ item }) => (
        <FoodSearchResult
          disabled={disabled}
          food={item}
          primaryLabel={getPrimaryLabel?.(item)}
          secondaryLabel={getSecondaryLabel?.(item)}
          selected={selectedFoodId === item.id}
          onPress={() => {
            actor.send({
              type: "selectFood",
              foodId: item.id,
            });
          }}
        />
      )}
      style={styles.list}
      contentContainerStyle={
        !Array.isReadonlyArrayNonEmpty(matchingFoods)
          ? styles.emptyContent
          : styles.listContent
      }
    />
  );
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
  const brandLabel =
    food.brand === undefined || food.brand.trim() === "" ? null : food.brand;
  const per100gLabel = `${formatNumber({
    maximumFractionDigits: 0,
    value: food.energyKcalPer100g,
  })} kcal / 100 g`;
  const dominantMacronutrient = Utils.findDominantMacronutrient({ food });
  const dominantMacronutrientMeta =
    dominantMacronutrient === null
      ? undefined
      : dominantMacronutrientIndicator[dominantMacronutrient];
  const isDefaultFood = food.origin === "app-default";
  const isUserFood = food.origin === "user";
  const defaultFoodAccessibilityLabel = isDefaultFood
    ? ", pre-installed food"
    : "";
  const accessibilityLabel = [
    `${food.name}${defaultFoodAccessibilityLabel}`,
    brandLabel,
    dominantMacronutrientMeta?.accessibilityLabel,
    primaryLabel ?? per100gLabel,
    secondaryLabel,
  ]
    .filter(
      (label): label is string =>
        label !== null && label !== undefined && label !== ""
    )
    .join(", ");

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.result,
        isUserFood ? styles.resultUser : null,
        selected ? styles.resultSelected : null,
        pressed && !disabled ? styles.resultPressed : null,
        disabled ? styles.resultDisabled : null,
      ]}
    >
      <View style={styles.resultCopy}>
        <View style={styles.titleRow}>
          <Text numberOfLines={2} style={styles.resultTitle}>
            {food.name}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          {dominantMacronutrientMeta === undefined ? null : (
            <View
              accessible={false}
              style={[
                styles.macronutrientDot,
                { backgroundColor: dominantMacronutrientMeta.color },
              ]}
            />
          )}
          {brandLabel === null ? null : (
            <Text numberOfLines={1} style={styles.resultSummary}>
              {brandLabel}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.resultMetrics}>
        <Text numberOfLines={1} style={styles.primaryMetric}>
          {primaryLabel ?? per100gLabel}
        </Text>
        <Text
          accessible={secondaryLabel !== undefined}
          numberOfLines={1}
          style={styles.secondaryMetric}
        >
          {secondaryLabel}
        </Text>
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

function FoodSearchSeparator() {
  return <View style={styles.separator} />;
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
  orderSelector: {
    minWidth: 44,
    height: 44,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: radius.sm,
  },
  orderSelectorPressed: {
    backgroundColor: color.surfaceRaised,
  },
  orderSelectorDisabled: {
    opacity: 0.5,
  },
  orderSelectorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  orderDialogBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: color.overlay,
  },
  orderDialog: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: color.sheet,
  },
  orderDialogTitle: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    color: color.text,
    fontSize: tokens.type.size.lg,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.lg,
  },
  orderDialogOption: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
  },
  orderDialogOptionSelected: {
    backgroundColor: color.surfaceRaised,
  },
  orderDialogOptionPressed: {
    opacity: 0.86,
  },
  orderDialogOptionDot: {
    width: 10,
    height: 10,
    flexShrink: 0,
    borderRadius: 5,
  },
  orderDialogOptionLabel: {
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
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  resultUser: {
    backgroundColor: color.surface,
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
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#4a4a50",
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
  resultTitle: {
    minWidth: 0,
    flex: 1,
    color: color.text,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.md,
  },
  resultSummary: {
    minWidth: 0,
    flexShrink: 1,
    color: color.textMuted,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.md,
  },
  summaryRow: {
    minHeight: tokens.type.lineHeight.md,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  macronutrientDot: {
    width: 6,
    height: 6,
    flexShrink: 0,
    borderRadius: 3,
  },
  resultMetrics: {
    width: 112,
    flexShrink: 0,
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  primaryMetric: {
    maxWidth: 112,
    color: color.text,
    textAlign: "right",
    fontSize: tokens.type.size.lg,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.lg,
  },
  secondaryMetric: {
    minHeight: tokens.type.lineHeight.md,
    maxWidth: 112,
    color: color.textMuted,
    textAlign: "right",
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.md,
  },
});
