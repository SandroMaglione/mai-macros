import { AppScreen } from "@/components/ui/app-screen";
import { BottomActionBar } from "@/components/ui/bottom-action-bar";
import { Button } from "@/components/ui/button";
import { DisclosureCard } from "@/components/ui/disclosure-card";
import { Field, NumberField, TextArea } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { AppHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { SectionCard } from "@/components/ui/section-card";
import {
  foodNutrientOverviewFromFormValues,
  foodNutrientOverviewPrimaryLabel,
} from "@/lib/format";
import { measurementUnitFromValue } from "@/lib/food-measurements";
import { color, radius, shadow, spacing, tokens } from "@/theme/tokens";
import { FoodFormMachine } from "@mai/machines";
import type { FoodQuickInput, Foods } from "@mai/nutrition";
import { useSelector } from "@xstate/react";
import { Array } from "effect";
import type { ReactNode } from "react";
import {
  ChevronLeft,
  Plus,
  RotateCcw,
  Save,
  Scale,
  Trash2,
} from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { FoodNutrientOverview } from "./food-nutrient-overview";
import { MeasurementUnitSelect } from "./measurement-unit-select";

type FoodNutrientField = {
  readonly accentColor: string;
  readonly label: string;
  readonly name: FoodFormMachine.FoodNutrientFieldName;
  readonly placeholder: string;
  readonly required: boolean;
  readonly unit: "g" | "kcal";
};

const nutritionFields: readonly FoodNutrientField[] = [
  {
    accentColor: color.nutritionEnergy,
    label: "Calories",
    name: "energyKcal",
    placeholder: "62",
    required: true,
    unit: "kcal",
  },
  {
    accentColor: color.nutritionFat,
    label: "Fat",
    name: "fatGrams",
    placeholder: "0.4",
    required: true,
    unit: "g",
  },
  {
    accentColor: color.nutritionFat,
    label: "Saturated fat",
    name: "saturatedFatGrams",
    placeholder: "0.1",
    required: false,
    unit: "g",
  },
  {
    accentColor: color.nutritionCarbs,
    label: "Carbs",
    name: "carbsGrams",
    placeholder: "3.6",
    required: true,
    unit: "g",
  },
  {
    accentColor: color.nutritionCarbs,
    label: "Sugar",
    name: "sugarGrams",
    placeholder: "3.2",
    required: false,
    unit: "g",
  },
  {
    accentColor: color.nutritionCarbs,
    label: "Fiber",
    name: "fiberGrams",
    placeholder: "0",
    required: false,
    unit: "g",
  },
  {
    accentColor: color.nutritionEnergy,
    label: "Protein",
    name: "proteinGrams",
    placeholder: "10",
    required: true,
    unit: "g",
  },
  {
    accentColor: color.nutritionSalt,
    label: "Salt",
    name: "saltGrams",
    placeholder: "0.1",
    required: false,
    unit: "g",
  },
];

export function FoodForm({
  action,
  disabled,
  feedback,
  hasFailed,
  heading,
  actor,
  layout = "screen",
  onBack,
  portionUsage = [],
  showPortions = true,
  submitLabel,
  intro,
}: {
  readonly action: "create" | "edit";
  readonly actor: FoodFormMachine.FoodFormActorRef;
  readonly disabled: boolean;
  readonly feedback?: {
    readonly message: string;
    readonly title?: string;
    readonly tone: "danger" | "neutral" | "success";
  };
  readonly hasFailed: boolean;
  readonly heading?: string;
  readonly intro?: ReactNode;
  readonly layout?: "screen" | "embedded";
  readonly onBack: () => void;
  readonly portionUsage?: readonly Foods.FoodPortionUsage[];
  readonly showPortions?: boolean;
  readonly submitLabel?: string;
}) {
  const snapshot = useSelector(
    actor,
    (state): FoodFormMachine.FoodFormSnapshot => state
  );
  const {
    formValues,
    numberWarnings,
    portions,
    quickInput,
    quickInputParseResult,
  } = snapshot.context;
  const isCreating = action === "create";
  const portionsAreValid = FoodFormMachine.foodPortionFormValuesAreValid({
    portions,
  });
  const title = heading ?? (isCreating ? "Create food" : "Edit food");
  const submitText =
    submitLabel ??
    (hasFailed ? "Try again" : isCreating ? title : "Review changes");
  const SubmitIcon = hasFailed ? RotateCcw : isCreating ? Plus : Save;
  const form = (
    <View style={styles.form}>
      {isCreating ? (
        <FoodQuickInputTextField
          actor={actor}
          disabled={disabled}
          input={quickInput}
        />
      ) : null}

      {intro}

      <FoodFormFields
        actor={actor}
        disabled={disabled}
        portions={portions}
        portionUsage={portionUsage}
        showPortions={showPortions}
        values={formValues}
      />

      <View style={styles.reviewSection}>
        <View style={styles.reviewDivider} />
        <FoodFormOverview values={formValues} />
      </View>

      <FoodNumberWarnings warnings={numberWarnings} />

      {isCreating ? (
        <FoodQuickInputFeedback parseResult={quickInputParseResult} />
      ) : null}

      {feedback === undefined ? null : (
        <Notice
          message={feedback.message}
          title={feedback.title}
          tone={feedback.tone}
        />
      )}
    </View>
  );
  const submitButton = (
    <Button
      disabled={disabled || !portionsAreValid}
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
        topSafeAreaColor={color.primary}
        scrollProps={{
          keyboardShouldPersistTaps: "handled",
        }}
      >
        <AppHeader
          embedded
          leading={
            <IconButton
              accessibilityLabel="Back"
              icon={ChevronLeft}
              onPress={onBack}
              variant="ghost"
            />
          }
          shadow
          title={isCreating ? undefined : title}
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
          type: "changeQuickInput",
          input: value,
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
  portions,
  portionUsage,
  showPortions,
  values,
}: {
  readonly actor: FoodFormMachine.FoodFormActorRef;
  readonly disabled: boolean;
  readonly portions: readonly FoodFormMachine.FoodPortionFormValue[];
  readonly portionUsage: readonly Foods.FoodPortionUsage[];
  readonly showPortions: boolean;
  readonly values: FoodFormMachine.FoodFormValues;
}) {
  const portionErrors = FoodFormMachine.foodPortionFormErrorsFromValues({
    portions,
  });
  const portionsAreValid = FoodFormMachine.foodPortionFormValuesAreValid({
    portions,
  });

  return (
    <>
      <SectionCard style={styles.card}>
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

      <SectionCard style={styles.card}>
        <View style={styles.fieldGroup}>
          <NumberField
            editable={!disabled}
            label="Nutrition values per"
            onChangeText={(value) => {
              _sendFoodFormValueChange({
                actor,
                name: "nutritionReferenceAmount",
                value,
              });
            }}
            placeholder="100"
            rightElement={
              <MeasurementUnitSelect
                disabled={disabled}
                onSelect={(unit) => {
                  _sendFoodFormValueChange({
                    actor,
                    name: "nutritionReferenceUnit",
                    value: unit,
                  });
                }}
                selectedUnit={measurementUnitFromValue({
                  fallback: "g",
                  value: values.nutritionReferenceUnit,
                })}
                title="Nutrition reference unit"
                units={["g", "kg", "oz", "lb", "ml", "l"]}
              />
            }
            value={values.nutritionReferenceAmount}
          />
          {nutritionFields.map((field) => (
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

      {showPortions ? (
        <SectionCard
          style={styles.card}
          subtitle="Define any name you use for this food and the physical amount that one portion represents."
          title="Custom portions"
        >
          <View style={styles.fieldGroup}>
            {portions.map((portion, index) => {
              const usage =
                portion.id === undefined
                  ? undefined
                  : portionUsage.find(
                      (candidate) => candidate.portionId === portion.id
                    );
              const isUsed = (usage?.mealEntryCount ?? 0) > 0;

              return (
                <View
                  key={portion.id ?? `new-${index}`}
                  style={styles.portionCard}
                >
                  {isUsed ? (
                    <Notice
                      message={`Used in ${usage?.mealEntryCount ?? 0} meal ${usage?.mealEntryCount === 1 ? "entry" : "entries"}. This portion cannot be changed or removed.`}
                      tone="neutral"
                    />
                  ) : portion.id === undefined ? null : (
                    <Notice
                      message="Never used. You can edit or remove this portion freely."
                      tone="neutral"
                    />
                  )}
                  <Field
                    editable={!disabled && !isUsed}
                    error={portionErrors[index]?.name}
                    label="Portion name"
                    onChangeText={(value) => {
                      actor.send({
                        type: "changePortion",
                        field: "name",
                        index,
                        value,
                      });
                    }}
                    placeholder="X"
                    value={portion.name}
                  />
                  <NumberField
                    editable={!disabled && !isUsed}
                    error={portionErrors[index]?.amount}
                    label={`One ${portion.name.trim() || "portion"} equals`}
                    onChangeText={(value) => {
                      actor.send({
                        type: "changePortion",
                        field: "amount",
                        index,
                        value,
                      });
                    }}
                    placeholder="250"
                    rightElement={
                      <MeasurementUnitSelect
                        disabled={disabled || isUsed}
                        onSelect={(unit) => {
                          actor.send({
                            type: "changePortion",
                            field: "unit",
                            index,
                            value: unit,
                          });
                        }}
                        selectedUnit={portion.unit}
                        title={`${portion.name.trim() || "Portion"} unit`}
                        units={["g", "kg", "oz", "lb", "ml", "l"]}
                      />
                    }
                    value={portion.amount}
                  />
                  {isUsed ? null : (
                    <Button
                      disabled={disabled}
                      icon={Trash2}
                      onPress={() => {
                        actor.send({ type: "removePortion", index });
                      }}
                      variant="ghost"
                    >
                      Remove portion
                    </Button>
                  )}
                </View>
              );
            })}
            <Button
              disabled={disabled || !portionsAreValid}
              icon={Plus}
              onPress={() => {
                actor.send({ type: "addPortion" });
              }}
              variant="secondary"
            >
              Add portion
            </Button>
          </View>
        </SectionCard>
      ) : null}

      <DisclosureCard icon={Scale} title="Weight and volume conversion">
        <View style={styles.disclosureContent}>
          <Text style={styles.helperText}>
            Optional. Add this when you want to enter the same food using both a
            scale and a volume measure.
          </Text>
          <View style={styles.fieldGroup}>
            <NumberField
              editable={!disabled}
              label="Mass amount"
              onChangeText={(value) => {
                _sendFoodFormValueChange({
                  actor,
                  name: "conversionMassAmount",
                  value,
                });
              }}
              placeholder="103"
              rightElement={
                <MeasurementUnitSelect
                  disabled={disabled}
                  onSelect={(unit) => {
                    _sendFoodFormValueChange({
                      actor,
                      name: "conversionMassUnit",
                      value: unit,
                    });
                  }}
                  selectedUnit={measurementUnitFromValue({
                    fallback: "g",
                    value: values.conversionMassUnit,
                  })}
                  title="Mass unit"
                  units={["g", "kg", "oz", "lb"]}
                />
              }
              value={values.conversionMassAmount}
            />
            <NumberField
              editable={!disabled}
              label="Equivalent volume"
              onChangeText={(value) => {
                _sendFoodFormValueChange({
                  actor,
                  name: "conversionVolumeAmount",
                  value,
                });
              }}
              placeholder="100"
              rightElement={
                <MeasurementUnitSelect
                  disabled={disabled}
                  onSelect={(unit) => {
                    _sendFoodFormValueChange({
                      actor,
                      name: "conversionVolumeUnit",
                      value: unit,
                    });
                  }}
                  selectedUnit={measurementUnitFromValue({
                    fallback: "ml",
                    value: values.conversionVolumeUnit,
                  })}
                  title="Volume unit"
                  units={["ml", "l"]}
                />
              }
              value={values.conversionVolumeAmount}
            />
          </View>
        </View>
      </DisclosureCard>
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
  if (!Array.isReadonlyArrayNonEmpty(warnings)) {
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
      secondaryLabel={`per ${values.nutritionReferenceAmount || "…"} ${values.nutritionReferenceUnit}`}
    />
  );
}

function FoodQuickInputIssues({
  issues,
}: {
  readonly issues: readonly FoodQuickInput.FoodQuickInputParseIssue[];
}) {
  if (!Array.isReadonlyArrayNonEmpty(issues)) {
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
    type: "changeFormValue",
    name,
    value,
  });
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
    paddingHorizontal: spacing.lg,
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
  disclosureContent: {
    gap: spacing.xl,
  },
  helperText: {
    color: color.textSubtle,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.sm,
  },
  portionCard: {
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: color.divider,
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
  reviewSection: {
    gap: spacing.xxl,
    paddingTop: spacing.xl,
  },
  reviewDivider: {
    height: 1,
    backgroundColor: color.divider,
  },
  footerButton: {
    flex: 1,
  },
});
