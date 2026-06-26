import { MealPlanFormMachine } from "@mai/machines";
import type { Domain, MealPlans } from "@mai/nutrition";
import { formatNumber } from "@/lib/format";
import { color, radius, shadow, spacing, tokens } from "@/theme/tokens";
import {
  AppScreen,
  BottomActionBar,
  Button,
  Field,
  IconButton,
  MaiHeader,
  Notice,
  NumberField,
  SectionCard,
} from "@/components/ui";
import { useMachine, useSelector } from "@xstate/react";
import { ChevronLeft, Plus, Save, Trash2 } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

type PlanTargetField = {
  readonly accentColor: string;
  readonly label: string;
  readonly name: MealPlanFormMachine.MealPlanTargetFieldName;
  readonly placeholder: string;
  readonly required: boolean;
};

const macroTargetFields: readonly PlanTargetField[] = [
  {
    accentColor: color.nutritionProtein,
    label: "Protein",
    name: "proteinTargetGrams",
    placeholder: "160",
    required: true,
  },
  {
    accentColor: color.nutritionCarbs,
    label: "Carbs",
    name: "carbsTargetGrams",
    placeholder: "220",
    required: true,
  },
  {
    accentColor: color.nutritionFat,
    label: "Fat",
    name: "fatTargetGrams",
    placeholder: "70",
    required: true,
  },
];

const nutrientTargetFields: readonly PlanTargetField[] = [
  {
    accentColor: color.nutritionFiber,
    label: "Fiber",
    name: "fiberTargetGrams",
    placeholder: "30",
    required: false,
  },
  {
    accentColor: color.nutritionSugar,
    label: "Sugar",
    name: "sugarTargetGrams",
    placeholder: "50",
    required: false,
  },
  {
    accentColor: color.nutritionFat,
    label: "Saturated fat",
    name: "saturatedFatTargetGrams",
    placeholder: "20",
    required: false,
  },
  {
    accentColor: color.nutritionSalt,
    label: "Salt",
    name: "saltTargetGrams",
    placeholder: "6",
    required: false,
  },
];

export function MealPlanForm({
  action,
  canNavigateBack = true,
  errorMessage,
  initialPlan,
  isSubmitting,
  layout = "screen",
  onBack,
  onSubmit,
}: {
  readonly action: "create" | "edit";
  readonly canNavigateBack?: boolean;
  readonly errorMessage?: string;
  readonly initialPlan: Domain.Plan | null;
  readonly isSubmitting: boolean;
  readonly layout?: "screen" | "embedded";
  readonly onBack: () => void;
  readonly onSubmit: (input: MealPlans.CreateMealPlanInput) => void;
}) {
  const [snapshot, send] = useMachine(MealPlanFormMachine.mealPlanFormMachine, {
    input: { initialPlan },
  });
  const { values } = snapshot.context;
  const { mealsActor } = snapshot.context;
  const meals = useSelector(mealsActor, (state) => state.context.meals);
  const isCreating = action === "create";
  const title = isCreating ? "Create plan" : "Edit plan";
  const submitText = isCreating ? "Create plan" : "Save revised plan";
  const SubmitIcon = isCreating ? Plus : Save;
  const energyKcal = MealPlanFormMachine.calculateMealPlanEnergyKcalFromValues({
    values,
  });
  const form = (
    <View style={styles.form}>
      {errorMessage === undefined ? null : (
        <Notice message={errorMessage} title="Plan not saved" tone="danger" />
      )}

      <Field
        autoCapitalize="words"
        autoCorrect={false}
        editable={!isSubmitting}
        label="Name"
        onChangeText={(value) =>
          send({ type: "changeField", name: "name", value })
        }
        placeholder="Training day"
        returnKeyType="next"
        value={values.name}
      />

      <SectionCard style={styles.card} title="Macros">
        <View style={styles.macroGrid}>
          {macroTargetFields.map((field) => (
            <PlanTargetInput
              field={field}
              isSubmitting={isSubmitting}
              key={field.name}
              onChangeText={(value) =>
                send({ type: "changeField", name: field.name, value })
              }
              value={values[field.name]}
            />
          ))}
        </View>

        <View style={styles.energyPanel}>
          <Text style={styles.energyLabel}>Calories</Text>
          <View style={styles.energyValueGroup}>
            <Text
              adjustsFontSizeToFit
              numberOfLines={1}
              style={styles.energyValue}
            >
              {formatNumber({
                maximumFractionDigits: 2,
                value: energyKcal,
              })}
            </Text>
            <Text style={styles.energyUnit}>kcal</Text>
          </View>
        </View>
      </SectionCard>

      <SectionCard style={styles.card} title="Nutrient limits">
        <View style={styles.nutrientGrid}>
          {nutrientTargetFields.map((field) => (
            <PlanTargetInput
              field={field}
              isSubmitting={isSubmitting}
              key={field.name}
              onChangeText={(value) =>
                send({ type: "changeField", name: field.name, value })
              }
              value={values[field.name]}
            />
          ))}
        </View>
      </SectionCard>

      <SectionCard style={styles.card} title="Meals">
        <View style={styles.mealSection}>
          {meals.map((meal, index) => (
            <View key={meal.id ?? index} style={styles.mealItem}>
              <View style={styles.mealRow}>
                <Field
                  autoCapitalize="words"
                  autoCorrect={false}
                  editable={!isSubmitting}
                  onChangeText={(value) => {
                    mealsActor.send({
                      type: "changeMealName",
                      index,
                      value,
                    });
                  }}
                  placeholder="Meal name"
                  returnKeyType="next"
                  style={styles.mealNameField}
                  value={meal.name}
                />
                <MealRemoveButton
                  disabled={isSubmitting}
                  index={index}
                  onPress={() => {
                    mealsActor.send({
                      type: "removeMeal",
                      index,
                    });
                  }}
                />
              </View>
              <View style={styles.mealDivider} />
            </View>
          ))}
          <Button
            disabled={isSubmitting}
            icon={Plus}
            onPress={() => {
              mealsActor.send({
                type: "addMeal",
              });
            }}
            variant="secondary"
          >
            Add meal
          </Button>
        </View>
      </SectionCard>
    </View>
  );
  const submitButton = (
    <Button
      disabled={isSubmitting}
      icon={SubmitIcon}
      loading={isSubmitting}
      onPress={() => {
        onSubmit(
          MealPlanFormMachine.createMealPlanInputFromValues({
            meals,
            values,
          })
        );
      }}
      style={styles.footerButton}
    >
      {submitText}
    </Button>
  );

  if (layout === "embedded") {
    return (
      <KeyboardAwareScrollView
        alwaysBounceVertical={false}
        bottomOffset={spacing.lg}
        contentContainerStyle={styles.embeddedContent}
        keyboardShouldPersistTaps="handled"
        style={styles.embeddedScroll}
      >
        {form}
        <View style={styles.inlineSubmit}>{submitButton}</View>
      </KeyboardAwareScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      <AppScreen
        safeAreaEdges={["top"]}
        scroll
        contentStyle={styles.content}
        scrollProps={{
          keyboardShouldPersistTaps: "handled",
        }}
      >
        <MaiHeader
          action={
            canNavigateBack ? (
              <IconButton
                accessibilityLabel="Back"
                icon={ChevronLeft}
                onPress={onBack}
                variant="ghost"
              />
            ) : undefined
          }
          title={title}
        />

        {form}
      </AppScreen>

      <BottomActionBar>{submitButton}</BottomActionBar>
    </View>
  );
}

function PlanTargetInput({
  field,
  isSubmitting,
  onChangeText,
  value,
}: {
  readonly field: PlanTargetField;
  readonly isSubmitting: boolean;
  readonly onChangeText: (value: string) => void;
  readonly value: string;
}) {
  return (
    <View style={styles.targetField}>
      <Text style={[styles.targetLabel, { color: field.accentColor }]}>
        {field.label}
      </Text>
      <NumberField
        editable={!isSubmitting}
        onChangeText={onChangeText}
        placeholder={field.placeholder}
        rightElement={<Text style={styles.unit}>g</Text>}
        value={value}
      />
    </View>
  );
}

function MealRemoveButton({
  disabled,
  index,
  onPress,
}: {
  readonly disabled: boolean;
  readonly index: number;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`Remove meal ${index + 1}`}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.mealRemoveButton,
        pressed && !disabled ? styles.mealRemoveButtonPressed : null,
        disabled ? styles.mealRemoveButtonDisabled : null,
      ]}
    >
      <Trash2 color={color.dangerText} size={18} strokeWidth={2.6} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.bg,
  },
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  form: {
    gap: spacing.lg,
  },
  embeddedScroll: {
    flex: 1,
  },
  embeddedContent: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  inlineSubmit: {
    flexDirection: "row",
  },
  card: {
    borderRadius: radius.md,
    backgroundColor: color.surface,
    ...shadow.card,
  },
  macroGrid: {
    gap: spacing.md,
  },
  nutrientGrid: {
    gap: spacing.md,
  },
  mealSection: {
    gap: spacing.md,
  },
  mealItem: {
    gap: spacing.md,
  },
  mealRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  mealNameField: {
    minWidth: 0,
    flex: 1,
  },
  mealRemoveButton: {
    width: 36,
    height: 36,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: color.dangerBorder,
    borderRadius: radius.pill,
    backgroundColor: color.dangerBg,
  },
  mealRemoveButtonPressed: {
    opacity: 0.84,
  },
  mealRemoveButtonDisabled: {
    opacity: 0.48,
  },
  mealDivider: {
    height: 1,
    backgroundColor: color.sheetBorder,
  },
  targetField: {
    flex: 1,
    gap: spacing.xs,
  },
  targetLabel: {
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.sm,
  },
  unit: {
    color: color.textMuted,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xs,
  },
  energyPanel: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: color.field,
  },
  energyLabel: {
    color: color.nutritionEnergy,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.sm,
    textTransform: "uppercase",
  },
  energyValueGroup: {
    minWidth: 0,
    flexShrink: 1,
    alignItems: "flex-end",
  },
  energyValue: {
    maxWidth: 190,
    color: color.nutritionEnergy,
    fontSize: tokens.type.size.xxl,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xxl,
  },
  energyUnit: {
    color: color.textMuted,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xs,
    textTransform: "uppercase",
  },
  footerButton: {
    flex: 1,
  },
});
