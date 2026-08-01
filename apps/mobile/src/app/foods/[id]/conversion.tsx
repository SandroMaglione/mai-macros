import { MeasurementUnitSelect } from "@/components/nutrition/measurement-unit-select";
import { AppScreen } from "@/components/ui/app-screen";
import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { LoadingView } from "@/components/ui/loading-view";
import { AppHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { SectionCard } from "@/components/ui/section-card";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { formatNumber, formatShortDate } from "@/lib/format";
import { RuntimeClient } from "@/lib/runtime-client";
import { color, radius, spacing, tokens } from "@/theme/tokens";
import { EmptyEvent } from "@mai/machines";
import { Domain, Foods, Measurements } from "@mai/nutrition";
import { useMachine } from "@xstate/react";
import { Effect, Option, Predicate, Schema } from "effect";
import { Redirect, router } from "expo-router";
import {
  ChevronLeft,
  RotateCcw,
  Save,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react-native";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { createAsyncLogic, setup } from "xstate";

const RouteParams = Schema.Struct({ id: Domain.FoodId });

const ConversionForm = Schema.Struct({
  massAmount: Schema.String,
  massUnit: Domain.MassUnit,
  volumeAmount: Schema.String,
  volumeUnit: Domain.VolumeUnit,
});
type ConversionForm = typeof ConversionForm.Type;
type ConversionValue = {
  readonly mass: {
    readonly amount: number;
    readonly unit: Domain.MassUnit;
  };
  readonly volume: {
    readonly amount: number;
    readonly unit: Domain.VolumeUnit;
  };
};

const LoadOutput = Schema.Struct({
  food: Domain.Food,
  usage: Foods.FoodEditUsage,
});
const Context = Schema.Struct({
  food: Schema.NullOr(Domain.Food),
  foodId: Domain.FoodId,
  form: ConversionForm,
  message: Schema.NullOr(Schema.String),
  messageTone: Schema.Literals(["danger", "success"]),
  usage: Schema.NullOr(Foods.FoodEditUsage),
});
const ChangeTextEvent = Schema.Struct({ value: Schema.String });
const ChangeMassUnitEvent = Schema.Struct({ unit: Domain.MassUnit });
const ChangeVolumeUnitEvent = Schema.Struct({ unit: Domain.VolumeUnit });
const ConversionMutationInput = Schema.Struct({
  food: Domain.Food,
  form: ConversionForm,
});
const ConversionMutationOutput = Schema.Struct({
  food: Domain.Food,
  revisedMealEntryCount: Schema.Number,
});

const conversionManagerMachine = setup({
  schemas: {
    context: Schema.toStandardSchemaV1(Context),
    events: {
      cancelReview: Schema.toStandardSchemaV1(EmptyEvent),
      changeMassAmount: Schema.toStandardSchemaV1(ChangeTextEvent),
      changeMassUnit: Schema.toStandardSchemaV1(ChangeMassUnitEvent),
      changeVolumeAmount: Schema.toStandardSchemaV1(ChangeTextEvent),
      changeVolumeUnit: Schema.toStandardSchemaV1(ChangeVolumeUnitEvent),
      confirm: Schema.toStandardSchemaV1(EmptyEvent),
      remove: Schema.toStandardSchemaV1(EmptyEvent),
      retry: Schema.toStandardSchemaV1(EmptyEvent),
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
        output: Schema.toStandardSchemaV1(LoadOutput),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const foods = yield* Foods.Foods;
            return {
              food: yield* foods.get({ input }),
              usage: yield* foods.inspectEdit({ input }),
            };
          })
        ),
    }),
    preview: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(ConversionMutationInput),
        output: Schema.toStandardSchemaV1(Foods.FoodEditPreview),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const foods = yield* Foods.Foods;
            return yield* foods.previewFoodMassVolumeConversionEdit({
              input: _setFoodMassVolumeConversionInput(input),
            });
          })
        ),
    }),
    save: createAsyncLogic({
      schemas: {
        input: Schema.toStandardSchemaV1(ConversionMutationInput),
        output: Schema.toStandardSchemaV1(ConversionMutationOutput),
      },
      run: ({ input }) =>
        RuntimeClient.runPromise(
          Effect.gen(function* () {
            const foods = yield* Foods.Foods;
            const result = yield* foods.setFoodMassVolumeConversion({
              input: _setFoodMassVolumeConversionInput(input),
            });
            return {
              food: result.food,
              revisedMealEntryCount: result.revisedMealEntryCount,
            };
          })
        ),
    }),
  },
}).createMachine({
  context: ({ input }) => ({
    food: null,
    foodId: input.foodId,
    form: _emptyForm(),
    message: null,
    messageTone: "success",
    usage: null,
  }),
  initial: "Loading",
  on: {
    changeMassAmount: ({ context, event }) => ({
      context: { form: { ...context.form, massAmount: event.value } },
    }),
    changeMassUnit: ({ context, event }) => ({
      context: { form: { ...context.form, massUnit: event.unit } },
    }),
    changeVolumeAmount: ({ context, event }) => ({
      context: { form: { ...context.form, volumeAmount: event.value } },
    }),
    changeVolumeUnit: ({ context, event }) => ({
      context: { form: { ...context.form, volumeUnit: event.unit } },
    }),
  },
  states: {
    Loading: {
      invoke: {
        src: "load",
        input: ({ context }) => ({ foodId: context.foodId }),
        onDone: ({ event }) => ({
          target: "Editing",
          context: {
            food: event.output.food,
            form: _formFromFood(event.output.food),
            usage: event.output.usage,
          },
        }),
        onError: {
          target: "LoadFailed",
          context: { message: "Could not load this food conversion." },
        },
      },
    },
    LoadFailed: {
      on: {
        retry: { target: "Loading", context: { message: null } },
      },
    },
    Editing: {
      on: {
        remove: ({ context }) => ({
          target:
            (context.usage?.mealEntryCount ?? 0) > 0 ? "Previewing" : "Saving",
          context: { form: _emptyForm(), message: null },
        }),
        submit: ({ context }) => ({
          target:
            (context.usage?.mealEntryCount ?? 0) > 0 ? "Previewing" : "Saving",
          context: { message: null },
        }),
      },
    },
    Previewing: {
      invoke: {
        src: "preview",
        input: ({ context }) => _mutationInput(context),
        onDone: { target: "Reviewing" },
        onError: ({ event }) => ({
          target: "Editing",
          context: {
            message: _mutationErrorMessage(event.error),
            messageTone: "danger",
          },
        }),
      },
    },
    Reviewing: {
      on: {
        cancelReview: { target: "Editing" },
        confirm: { target: "Saving" },
      },
    },
    Saving: {
      invoke: {
        src: "save",
        input: ({ context }) => _mutationInput(context),
        onDone: ({ event }) => ({
          target: "Editing",
          context: {
            food: event.output.food,
            form: _formFromFood(event.output.food),
            message:
              event.output.food.massVolumeConversion === undefined
                ? "Conversion removed."
                : "Conversion saved.",
            messageTone: "success",
          },
        }),
        onError: ({ event }) => ({
          target: "Editing",
          context: {
            message: _mutationErrorMessage(event.error),
            messageTone: "danger",
          },
        }),
      },
    },
  },
});

export default function FoodConversionRoute() {
  const params = useSchemaLocalSearchParams(RouteParams);
  return Option.isNone(params) ? (
    <Redirect href="/" />
  ) : (
    <FoodConversionScreen foodId={params.value.id} />
  );
}

function FoodConversionScreen({ foodId }: { readonly foodId: Domain.FoodId }) {
  const [snapshot, , actor] = useMachine(conversionManagerMachine, {
    input: { foodId },
  });
  const { food, form, usage } = snapshot.context;

  if (snapshot.matches("Loading")) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading conversion" />
      </AppScreen>
    );
  }

  if (snapshot.matches("LoadFailed") || food === null || usage === null) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <Notice
          message={snapshot.context.message ?? "Could not load conversion."}
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

  const busy = snapshot.matches("Previewing") || snapshot.matches("Saving");
  const massBlank = form.massAmount.trim() === "";
  const volumeBlank = form.volumeAmount.trim() === "";
  const massAmount = Number(form.massAmount.replace(",", "."));
  const volumeAmount = Number(form.volumeAmount.replace(",", "."));
  const formIsValid =
    massBlank || volumeBlank
      ? massBlank && volumeBlank
      : Number.isFinite(massAmount) &&
        massAmount > 0 &&
        Number.isFinite(volumeAmount) &&
        volumeAmount > 0;
  const currentConversion = food.massVolumeConversion;
  const nextConversion = _conversionFromForm(form);
  const hasChanges =
    currentConversion === undefined || nextConversion === undefined
      ? currentConversion !== nextConversion
      : currentConversion.mass.amount !== nextConversion.mass.amount ||
        currentConversion.mass.unit !== nextConversion.mass.unit ||
        currentConversion.volume.amount !== nextConversion.volume.amount ||
        currentConversion.volume.unit !== nextConversion.volume.unit;
  const conversionLabel = _conversionLabel(food.massVolumeConversion);

  return (
    <>
      <ConversionPage food={food}>
        <Notice
          message="Define one real weight-to-volume equivalence for this food. It will be used whenever logged quantities and prices use different measurement types."
          tone="neutral"
        />
        {usage.mealEntryCount === 0 ? null : (
          <Notice
            message={`Changing this conversion can recalculate ${usage.mealEntryCount} previous meal ${usage.mealEntryCount === 1 ? "entry" : "entries"}${_usageDateRange(usage)}.`}
            tone="warning"
          />
        )}
        {snapshot.context.message === null ? null : (
          <Notice
            message={snapshot.context.message}
            tone={snapshot.context.messageTone}
          />
        )}
        <SectionCard
          subtitle={
            conversionLabel === null
              ? "No conversion has been defined yet."
              : `Current conversion: ${conversionLabel}`
          }
          title="Weight and volume conversion"
        >
          <View style={styles.stack}>
            <NumberField
              editable={!busy}
              label="Mass amount"
              onChangeText={(value) =>
                actor.send({ type: "changeMassAmount", value })
              }
              placeholder="1.03"
              rightElement={
                <MeasurementUnitSelect
                  disabled={busy}
                  onSelect={(unit) => {
                    if (Measurements.isMassUnit(unit)) {
                      actor.send({ type: "changeMassUnit", unit });
                    }
                  }}
                  selectedUnit={form.massUnit}
                  title="Mass unit"
                  units={["g", "kg", "oz", "lb"]}
                />
              }
              value={form.massAmount}
            />
            <NumberField
              editable={!busy}
              label="Equivalent volume"
              onChangeText={(value) =>
                actor.send({ type: "changeVolumeAmount", value })
              }
              placeholder="1"
              rightElement={
                <MeasurementUnitSelect
                  disabled={busy}
                  onSelect={(unit) => {
                    if (Measurements.isVolumeUnit(unit)) {
                      actor.send({ type: "changeVolumeUnit", unit });
                    }
                  }}
                  selectedUnit={form.volumeUnit}
                  title="Volume unit"
                  units={["ml", "l"]}
                />
              }
              value={form.volumeAmount}
            />
            <Text style={styles.helpText}>
              Example: for a density of 1.03 kg/L, enter 1.03 kg = 1 L.
            </Text>
          </View>
        </SectionCard>
        <Button
          disabled={busy || !formIsValid || !hasChanges}
          icon={Save}
          loading={busy}
          onPress={actor.trigger.submit}
        >
          Save conversion
        </Button>
        {food.massVolumeConversion === undefined ? null : (
          <Button
            disabled={busy}
            icon={Trash2}
            onPress={actor.trigger.remove}
            variant="danger"
          >
            Remove conversion
          </Button>
        )}
      </ConversionPage>
      <ReviewDialog
        food={food}
        form={form}
        loading={snapshot.matches("Saving")}
        onCancel={actor.trigger.cancelReview}
        onConfirm={actor.trigger.confirm}
        usage={usage}
        visible={snapshot.matches("Reviewing") || snapshot.matches("Saving")}
      />
    </>
  );
}

function ConversionPage({
  children,
  food,
}: {
  readonly children: React.ReactNode;
  readonly food: Domain.Food;
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
        title="Manage conversion"
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

function ReviewDialog({
  food,
  form,
  loading,
  onCancel,
  onConfirm,
  usage,
  visible,
}: {
  readonly food: Domain.Food;
  readonly form: ConversionForm;
  readonly loading: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly usage: Foods.FoodEditUsage;
  readonly visible: boolean;
}) {
  const previousLabel = _conversionLabel(food.massVolumeConversion);
  const nextLabel = _conversionLabel(_conversionFromForm(form));
  return (
    <Modal
      animationType="fade"
      onRequestClose={onCancel}
      transparent
      visible={visible}
    >
      <Pressable onPress={onCancel} style={styles.dialogBackdrop}>
        <View style={styles.dialog} onStartShouldSetResponder={() => true}>
          <View style={styles.dialogHeader}>
            <ShieldAlert
              color={color.warningText}
              size={26}
              strokeWidth={2.5}
            />
            <Text style={styles.dialogTitle}>Review conversion change</Text>
            <IconButton
              accessibilityLabel="Close review"
              icon={X}
              iconColor={color.textMuted}
              iconSize={20}
              onPress={onCancel}
              variant="ghost"
            />
          </View>
          <ScrollView
            contentContainerStyle={styles.dialogScrollContent}
            style={styles.dialogScroll}
          >
            <Text style={styles.dialogMessage}>
              This will recalculate {usage.mealEntryCount} previous meal{" "}
              {usage.mealEntryCount === 1 ? "entry" : "entries"}
              {_usageDateRange(usage)}.
            </Text>
            <Text style={styles.dialogChange}>
              {previousLabel ?? "No conversion"} →{" "}
              {nextLabel ?? "No conversion"}
            </Text>
            <Text style={styles.dialogMessage}>
              This operation cannot be undone.
            </Text>
          </ScrollView>
          <View style={styles.actions}>
            <Button
              disabled={loading}
              onPress={onCancel}
              style={styles.action}
              variant="secondary"
            >
              Back
            </Button>
            <Button
              loading={loading}
              onPress={onConfirm}
              style={styles.action}
              variant="danger"
            >
              Confirm change
            </Button>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

function _emptyForm(): ConversionForm {
  return { massAmount: "", massUnit: "kg", volumeAmount: "", volumeUnit: "l" };
}

function _formFromFood(food: Domain.Food): ConversionForm {
  const conversion = food.massVolumeConversion;
  return conversion === undefined
    ? _emptyForm()
    : {
        massAmount: `${conversion.mass.amount}`,
        massUnit: conversion.mass.unit,
        volumeAmount: `${conversion.volume.amount}`,
        volumeUnit: conversion.volume.unit,
      };
}

function _conversionFromForm(form: ConversionForm) {
  if (form.massAmount.trim() === "" && form.volumeAmount.trim() === "") {
    return undefined;
  }
  return {
    mass: {
      amount: Number(form.massAmount.replace(",", ".")),
      unit: form.massUnit,
    },
    volume: {
      amount: Number(form.volumeAmount.replace(",", ".")),
      unit: form.volumeUnit,
    },
  } satisfies ConversionValue;
}

function _setFoodMassVolumeConversionInput({
  food,
  form,
}: typeof ConversionMutationInput.Type): Foods.SetFoodMassVolumeConversionInput {
  const conversion = _conversionFromForm(form);
  return {
    foodId: food.id,
    ...(conversion === undefined
      ? {}
      : {
          massVolumeConversion: {
            mass: {
              amount: `${conversion.mass.amount}`,
              unit: conversion.mass.unit,
            },
            volume: {
              amount: `${conversion.volume.amount}`,
              unit: conversion.volume.unit,
            },
          },
        }),
  };
}

function _mutationInput(context: typeof Context.Type) {
  if (context.food === null) {
    throw new Error("Expected a loaded food.");
  }
  return { food: context.food, form: context.form };
}

function _conversionLabel(conversion: ConversionValue | undefined) {
  return conversion === undefined
    ? null
    : `${formatNumber({ maximumFractionDigits: 3, value: conversion.mass.amount })} ${conversion.mass.unit} = ${formatNumber({ maximumFractionDigits: 3, value: conversion.volume.amount })} ${conversion.volume.unit}`;
}

function _usageDateRange(usage: Foods.FoodEditUsage) {
  if (usage.firstDateKey === undefined || usage.lastDateKey === undefined) {
    return "";
  }
  const firstDate = formatShortDate({ dateKey: usage.firstDateKey });
  return usage.firstDateKey === usage.lastDateKey
    ? ` on ${firstDate}`
    : ` between ${firstDate} and ${formatShortDate({ dateKey: usage.lastDateKey })}`;
}

function _mutationErrorMessage(error: unknown) {
  if (Predicate.isTagged(error, "IncompatibleFoodMeasurement")) {
    return "This conversion cannot interpret every previous meal entry.";
  }
  return "Could not save the conversion. Check the values and try again.";
}

const styles = StyleSheet.create({
  action: { minWidth: 0, flex: 1 },
  actions: { flexDirection: "row", gap: spacing.md },
  body: { gap: spacing.lg, paddingHorizontal: spacing.lg },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
    padding: spacing.xl,
  },
  dialog: {
    width: "100%",
    maxHeight: "88%",
    maxWidth: 480,
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: color.warningBorder,
    borderRadius: radius.md,
    padding: spacing.lg,
    backgroundColor: color.sheet,
  },
  dialogBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: color.overlay,
  },
  dialogChange: {
    color: color.text,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.md,
  },
  dialogHeader: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dialogMessage: {
    color: color.textMuted,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.md,
  },
  dialogScroll: { flexShrink: 1 },
  dialogScrollContent: { gap: spacing.lg },
  dialogTitle: {
    minWidth: 0,
    flex: 1,
    color: color.text,
    fontSize: tokens.type.size.lg,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.lg,
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
    lineHeight: tokens.type.lineHeight.sm,
  },
  pageContent: { gap: spacing.lg, paddingHorizontal: 0 },
  stack: { gap: spacing.md },
});
