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
  TextArea,
} from "@/components/ui";
import { color, radius, shadow, spacing, tokens } from "@/theme/tokens";
import type { FoodFormMachine } from "@mai/machines";
import type { FoodQuickInput } from "@mai/nutrition";
import { useSelector } from "@xstate/react";
import { Array as EffectArray } from "effect";
import { ChevronLeft, Plus, RotateCcw, Save } from "lucide-react-native";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import {
  FoodNutrientOverview,
  formatFoodNutrientNumber,
  type FoodNutrientOverviewNutrients,
} from "./food-nutrient-overview";

type FoodFormAction = "create" | "edit";
type FoodFormLayout = "screen" | "embedded";

type FoodNutrientField = {
  readonly accentColor: string;
  readonly label: string;
  readonly name: FoodFormMachine.FoodNutrientFieldName;
  readonly placeholder: string;
  readonly required: boolean;
  readonly unit: "g" | "kcal";
};

const macroFields: readonly FoodNutrientField[] = [
  {
    accentColor: color.nutritionEnergy,
    label: "Calories",
    name: "energyKcalPer100g",
    placeholder: "62",
    required: true,
    unit: "kcal",
  },
  {
    accentColor: color.nutritionProtein,
    label: "Protein",
    name: "proteinGramsPer100g",
    placeholder: "10",
    required: true,
    unit: "g",
  },
  {
    accentColor: color.nutritionCarbs,
    label: "Carbs",
    name: "carbsGramsPer100g",
    placeholder: "3.6",
    required: true,
    unit: "g",
  },
  {
    accentColor: color.nutritionFat,
    label: "Fat",
    name: "fatGramsPer100g",
    placeholder: "0.4",
    required: true,
    unit: "g",
  },
];

const nutrientFields: readonly FoodNutrientField[] = [
  {
    accentColor: color.nutritionFiber,
    label: "Fiber",
    name: "fiberGramsPer100g",
    placeholder: "0",
    required: false,
    unit: "g",
  },
  {
    accentColor: color.nutritionSugar,
    label: "Sugar",
    name: "sugarGramsPer100g",
    placeholder: "3.2",
    required: false,
    unit: "g",
  },
  {
    accentColor: color.nutritionFat,
    label: "Saturated fat",
    name: "saturatedFatGramsPer100g",
    placeholder: "0.1",
    required: false,
    unit: "g",
  },
  {
    accentColor: color.nutritionSalt,
    label: "Salt",
    name: "saltGramsPer100g",
    placeholder: "0.1",
    required: false,
    unit: "g",
  },
];

export function FoodForm({
  action,
  disabled,
  errorMessage,
  hasFailed,
  actor,
  layout = "screen",
  onBack,
}: {
  readonly action: FoodFormAction;
  readonly actor: FoodFormMachine.FoodFormActorRef;
  readonly disabled: boolean;
  readonly errorMessage?: string;
  readonly hasFailed: boolean;
  readonly layout?: FoodFormLayout;
  readonly onBack: () => void;
}) {
  const snapshot = useSelector(
    actor,
    (state): FoodFormMachine.FoodFormSnapshot => state
  );
  const { formValues, numberWarnings, quickInput, quickInputParseResult } =
    snapshot.context;
  const isCreating = action === "create";
  const title = isCreating ? "Create food" : "Edit food";
  const submitText = hasFailed ? "Try again" : isCreating ? title : "Save food";
  const SubmitIcon = hasFailed ? RotateCcw : isCreating ? Plus : Save;
  const form = (
    <View style={styles.form}>
      {errorMessage === undefined ? null : (
        <Notice message={errorMessage} title="Food not saved" tone="danger" />
      )}

      {isCreating ? (
        <FoodQuickInputTextField
          actor={actor}
          disabled={disabled}
          input={quickInput}
        />
      ) : null}

      <FoodFormFields actor={actor} disabled={disabled} values={formValues} />

      <FoodFormOverview values={formValues} />

      <FoodNumberWarnings warnings={numberWarnings} />

      {isCreating ? (
        <FoodQuickInputFeedback parseResult={quickInputParseResult} />
      ) : null}

      {isCreating ? null : (
        <Notice
          message="Saving replaces this food when it is unused. Existing logs stay on the original food and future logs use the revised copy."
          tone="neutral"
        />
      )}
    </View>
  );
  const submitButton = (
    <Button
      disabled={disabled}
      icon={SubmitIcon}
      loading={disabled}
      onPress={() => {
        actor.send({
          type: "submit",
        });
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
            <IconButton
              accessibilityLabel="Back"
              icon={ChevronLeft}
              onPress={onBack}
              variant="ghost"
            />
          }
          title={title}
        />

        {form}
      </AppScreen>

      <BottomActionBar>{submitButton}</BottomActionBar>
    </View>
  );
}

function FoodQuickInputTextField({
  actor,
  disabled,
  input,
}: {
  readonly actor: FoodFormMachine.FoodFormActorRef;
  readonly disabled: boolean;
  readonly input: string;
}) {
  return (
    <TextArea
      autoCapitalize="sentences"
      autoCorrect={false}
      editable={!disabled}
      label="Food text"
      onChangeText={(value) => {
        actor.send({
          input: value,
          type: "changeQuickInput",
        });
      }}
      placeholder="Yogurt greco 0%, Fage, k59 f0.4 sf0.1 c3.6 su3.2 fi0 p10 sa0.1"
      returnKeyType="default"
      value={input}
    />
  );
}

function FoodFormFields({
  actor,
  disabled,
  values,
}: {
  readonly actor: FoodFormMachine.FoodFormActorRef;
  readonly disabled: boolean;
  readonly values: FoodFormMachine.FoodFormValues;
}) {
  return (
    <>
      <SectionCard style={styles.card} title="Details">
        <View style={styles.fieldGroup}>
          <Field
            autoCapitalize="words"
            autoCorrect={false}
            editable={!disabled}
            label="Name"
            onChangeText={(value) => {
              _sendFoodFormValueChange({
                actor,
                name: "name",
                value,
              });
            }}
            placeholder="Greek yogurt"
            returnKeyType="next"
            value={values.name}
          />
          <Field
            autoCapitalize="words"
            autoCorrect={false}
            editable={!disabled}
            label="Brand"
            onChangeText={(value) => {
              _sendFoodFormValueChange({
                actor,
                name: "brand",
                value,
              });
            }}
            placeholder="Mai"
            returnKeyType="next"
            value={values.brand}
          />
        </View>
      </SectionCard>

      <SectionCard style={styles.card} title="Calories and macros per 100g">
        <View style={styles.fieldGroup}>
          {macroFields.map((field) => (
            <FoodNutrientInput
              actor={actor}
              disabled={disabled}
              field={field}
              key={field.name}
              value={values[field.name]}
            />
          ))}
        </View>
      </SectionCard>

      <SectionCard style={styles.card} title="Nutrient details per 100g">
        <View style={styles.fieldGroup}>
          {nutrientFields.map((field) => (
            <FoodNutrientInput
              actor={actor}
              disabled={disabled}
              field={field}
              key={field.name}
              value={values[field.name]}
            />
          ))}
        </View>
      </SectionCard>
    </>
  );
}

function FoodNutrientInput({
  actor,
  disabled,
  field,
  value,
}: {
  readonly actor: FoodFormMachine.FoodFormActorRef;
  readonly disabled: boolean;
  readonly field: FoodNutrientField;
  readonly value: string;
}) {
  return (
    <View style={styles.nutrientField}>
      <Text style={[styles.nutrientLabel, { color: field.accentColor }]}>
        {field.label}
      </Text>
      <NumberField
        editable={!disabled}
        onChangeText={(nextValue) => {
          _sendFoodFormValueChange({
            actor,
            name: field.name,
            value: nextValue,
          });
        }}
        placeholder={field.placeholder}
        rightElement={<Text style={styles.unit}>{field.unit}</Text>}
        value={value}
      />
    </View>
  );
}

function FoodNumberWarnings({
  warnings,
}: {
  readonly warnings: readonly FoodFormMachine.FoodNumberWarning[];
}) {
  if (!EffectArray.isReadonlyArrayNonEmpty(warnings)) {
    return null;
  }

  return (
    <View style={styles.noticeStack}>
      {warnings.map((warning) => (
        <Notice
          key={`${warning.field ?? "food"}:${warning.message}`}
          message={warning.message}
          tone="warning"
        />
      ))}
    </View>
  );
}

function FoodQuickInputFeedback({
  parseResult,
}: {
  readonly parseResult: FoodQuickInput.FoodQuickInputParseResult;
}) {
  return <FoodQuickInputIssues issues={parseResult.issues} />;
}

function FoodFormOverview({
  values,
}: {
  readonly values: FoodFormMachine.FoodFormValues;
}) {
  return (
    <FoodNutrientOverview
      brand={_optionalTrimmedText(values.brand)}
      name={_optionalTrimmedText(values.name) ?? "Unnamed food"}
      nutrients={foodNutrientOverviewFromFormValues({ values })}
      primaryLabel={foodNutrientOverviewPrimaryLabel({ values })}
      secondaryLabel="per 100g"
    />
  );
}

function FoodQuickInputIssues({
  issues,
}: {
  readonly issues: readonly FoodQuickInput.FoodQuickInputParseIssue[];
}) {
  if (!EffectArray.isReadonlyArrayNonEmpty(issues)) {
    return null;
  }

  return (
    <View style={styles.noticeStack}>
      {issues.map((issue) => (
        <Notice
          key={`${issue.reason}:${issue.field ?? "input"}:${issue.message}`}
          message={issue.message}
          tone="danger"
        />
      ))}
    </View>
  );
}

function _sendFoodFormValueChange({
  actor,
  name,
  value,
}: {
  readonly actor: FoodFormMachine.FoodFormActorRef;
  readonly name: keyof FoodFormMachine.FoodFormValues;
  readonly value: string;
}) {
  actor.send({
    name,
    type: "changeFormValue",
    value,
  });
}

export function foodNutrientOverviewFromFormValues({
  values,
}: {
  readonly values: FoodFormMachine.FoodFormValues;
}): FoodNutrientOverviewNutrients {
  return {
    carbsGrams: _nonNegativeFormNumber(values.carbsGramsPer100g),
    energyKcal: _nonNegativeFormNumber(values.energyKcalPer100g),
    fatGrams: _nonNegativeFormNumber(values.fatGramsPer100g),
    fiberGrams: _nonNegativeFormNumber(values.fiberGramsPer100g),
    proteinGrams: _nonNegativeFormNumber(values.proteinGramsPer100g),
    saltGrams: _nonNegativeFormNumber(values.saltGramsPer100g),
    saturatedFatGrams: _nonNegativeFormNumber(values.saturatedFatGramsPer100g),
    sugarGrams: _nonNegativeFormNumber(values.sugarGramsPer100g),
  };
}

export function foodNutrientOverviewPrimaryLabel({
  values,
}: {
  readonly values: FoodFormMachine.FoodFormValues;
}) {
  const energyKcal = _nonNegativeFormNumber(values.energyKcalPer100g);

  return energyKcal === undefined
    ? "Partial"
    : `${formatFoodNutrientNumber({ value: energyKcal })} kcal`;
}

function _nonNegativeFormNumber(value: string) {
  const trimmedValue = value.trim();

  if (trimmedValue === "") {
    return undefined;
  }

  const parsedValue = Number(trimmedValue.replace(",", "."));

  return Number.isFinite(parsedValue) && parsedValue >= 0
    ? parsedValue
    : undefined;
}

function _optionalTrimmedText(value: string) {
  const trimmedValue = value.trim();

  return trimmedValue === "" ? undefined : trimmedValue;
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
  fieldGroup: {
    gap: spacing.md,
  },
  nutrientField: {
    gap: spacing.xs,
  },
  nutrientLabel: {
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
  noticeStack: {
    gap: spacing.sm,
  },
  footerButton: {
    flex: 1,
  },
});
