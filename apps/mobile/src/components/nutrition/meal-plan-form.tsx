import type { Plan } from "@mai/nutrition";
import { calculateMacronutrientEnergyKcal } from "@mai/nutrition";
import type { CreateMealPlanInput } from "@mai/nutrition/services/meal-plans";
import { formatNumber } from "@/lib/format";
import { color, radius, shadow, spacing, type } from "@/theme/tokens";
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
import { useMachine } from "@xstate/react";
import { ChevronLeft, Plus, Save } from "lucide-react-native";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { assign, setup } from "xstate";

type MealPlanFormAction = "create" | "edit";
type MealPlanFormLayout = "screen" | "embedded";

type PlanTargetFieldName =
  | "proteinTargetGrams"
  | "carbsTargetGrams"
  | "fatTargetGrams"
  | "fiberTargetGrams"
  | "sugarTargetGrams"
  | "saturatedFatTargetGrams"
  | "saltTargetGrams";

type MealPlanFormValues = {
  readonly name: string;
} & Record<PlanTargetFieldName, string>;

type PlanTargetField = {
  readonly accentColor: string;
  readonly label: string;
  readonly name: PlanTargetFieldName;
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

const mealPlanFormMachine = setup({
  types: {
    context: {} as {
      readonly values: MealPlanFormValues;
    },
    events: {} as {
      readonly name: keyof MealPlanFormValues;
      readonly type: "changeField";
      readonly value: string;
    },
    input: {} as {
      readonly initialPlan: Plan | null;
    },
  },
}).createMachine({
  context: ({ input }) => ({
    values: {
      name: input.initialPlan?.name ?? "",
      proteinTargetGrams: _stringFromOptionalNumber(
        input.initialPlan?.proteinTargetGrams
      ),
      carbsTargetGrams: _stringFromOptionalNumber(
        input.initialPlan?.carbsTargetGrams
      ),
      fatTargetGrams: _stringFromOptionalNumber(
        input.initialPlan?.fatTargetGrams
      ),
      fiberTargetGrams: _stringFromOptionalNumber(
        input.initialPlan?.fiberTargetGrams
      ),
      sugarTargetGrams: _stringFromOptionalNumber(
        input.initialPlan?.sugarTargetGrams
      ),
      saturatedFatTargetGrams: _stringFromOptionalNumber(
        input.initialPlan?.saturatedFatTargetGrams
      ),
      saltTargetGrams: _stringFromOptionalNumber(
        input.initialPlan?.saltTargetGrams
      ),
    },
  }),
  on: {
    changeField: {
      actions: assign(({ context, event }) => ({
        values: {
          ...context.values,
          [event.name]: event.value,
        },
      })),
    },
  },
});

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
  readonly action: MealPlanFormAction;
  readonly canNavigateBack?: boolean;
  readonly errorMessage?: string;
  readonly initialPlan: Plan | null;
  readonly isSubmitting: boolean;
  readonly layout?: MealPlanFormLayout;
  readonly onBack: () => void;
  readonly onSubmit: (input: CreateMealPlanInput) => void;
}) {
  const [snapshot, send] = useMachine(mealPlanFormMachine, {
    input: { initialPlan },
  });
  const { values } = snapshot.context;
  const isCreating = action === "create";
  const title = isCreating ? "Create plan" : "Edit plan";
  const submitText = isCreating ? "Create plan" : "Save revised plan";
  const SubmitIcon = isCreating ? Plus : Save;
  const energyKcal = calculateMealPlanEnergyKcalFromValues({ values });
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
    </View>
  );
  const submitButton = (
    <Button
      disabled={isSubmitting}
      icon={SubmitIcon}
      loading={isSubmitting}
      onPress={() => {
        onSubmit(createMealPlanInputFromValues({ values }));
      }}
      style={styles.footerButton}
    >
      {submitText}
    </Button>
  );

  if (layout === "embedded") {
    return (
      <ScrollView
        alwaysBounceVertical={false}
        contentContainerStyle={styles.embeddedContent}
        keyboardShouldPersistTaps="handled"
        style={styles.embeddedScroll}
      >
        {form}
        <View style={styles.inlineSubmit}>{submitButton}</View>
      </ScrollView>
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

export function createMealPlanInputFromValues({
  values,
}: {
  readonly values: MealPlanFormValues;
}): CreateMealPlanInput {
  const fiberTargetGrams = _optionalFormString(values.fiberTargetGrams);
  const sugarTargetGrams = _optionalFormString(values.sugarTargetGrams);
  const saturatedFatTargetGrams = _optionalFormString(
    values.saturatedFatTargetGrams
  );
  const saltTargetGrams = _optionalFormString(values.saltTargetGrams);

  return {
    name: values.name.trim(),
    proteinTargetGrams: values.proteinTargetGrams,
    carbsTargetGrams: values.carbsTargetGrams,
    fatTargetGrams: values.fatTargetGrams,
    ...(fiberTargetGrams === undefined ? {} : { fiberTargetGrams }),
    ...(sugarTargetGrams === undefined ? {} : { sugarTargetGrams }),
    ...(saturatedFatTargetGrams === undefined
      ? {}
      : { saturatedFatTargetGrams }),
    ...(saltTargetGrams === undefined ? {} : { saltTargetGrams }),
  };
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

export function calculateMealPlanEnergyKcalFromValues({
  values,
}: {
  readonly values: MealPlanFormValues;
}) {
  return calculateMacronutrientEnergyKcal({
    carbsGrams: _formNonNegativeNumber(values.carbsTargetGrams),
    fatGrams: _formNonNegativeNumber(values.fatTargetGrams),
    proteinGrams: _formNonNegativeNumber(values.proteinTargetGrams),
  });
}

function _stringFromOptionalNumber(value: number | undefined) {
  return value === undefined ? "" : String(value);
}

function _optionalFormString(value: string) {
  const trimmedValue = value.trim();

  return trimmedValue === "" ? undefined : trimmedValue;
}

function _formNonNegativeNumber(value: string) {
  const parsedValue = Number(value.replace(",", "."));

  return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : 0;
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
  targetField: {
    flex: 1,
    gap: spacing.xs,
  },
  targetLabel: {
    fontSize: type.size.sm,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.sm,
  },
  unit: {
    color: color.textMuted,
    fontSize: type.size.xs,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xs,
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
    fontSize: type.size.sm,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.sm,
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
    fontSize: type.size.xxl,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xxl,
  },
  energyUnit: {
    color: color.textMuted,
    fontSize: type.size.xs,
    fontWeight: type.weight.black,
    lineHeight: type.lineHeight.xs,
    textTransform: "uppercase",
  },
  footerButton: {
    flex: 1,
  },
});
