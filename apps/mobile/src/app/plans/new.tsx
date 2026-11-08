import { MealPlanForm } from "@/components/nutrition/meal-plan-form";
import { AppScreen } from "@/components/ui/app-screen";
import { LoadingView } from "@/components/ui/loading-view";
import { MaiHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { useMachine } from "@/hooks/use-machine";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { MachineAtoms } from "@/lib/machine-runtime";
import {
  NewPlanEvents,
  NewPlanMachine,
  NewPlanSource,
  NewPlanStates,
} from "@/machines/new-plan-machine";
import { spacing } from "@/theme/tokens";
import { Domain } from "@mai/nutrition";
import { Option, Schema } from "effect";
import { StyleSheet } from "react-native";

const SearchParams = Schema.Struct({
  dateKey: Schema.optionalKey(Domain.DateKey),
  returnDateKey: Schema.optionalKey(Domain.DateKey),
  source: Schema.optionalKey(NewPlanSource),
});

export default function NewPlanScreen() {
  const search = useSchemaLocalSearchParams(SearchParams).pipe(
    Option.match({
      onNone: () => ({
        _tag: "Invalid" as const,
      }),
      onSome: (params) => ({
        _tag: "Valid" as const,
        dateKey: params.dateKey,
        returnDateKey: params.returnDateKey,
        source: params.source,
      }),
    })
  );
  const [snapshot, send] = useMachine(() =>
    MachineAtoms.make(NewPlanMachine, { search })
  );
  const failed = NewPlanStates.get(snapshot, "Screen.Failed");

  if (Option.isSome(failed)) {
    return (
      <AppScreen contentStyle={styles.stateScreen}>
        <MaiHeader title="Create plan" />
        <Notice
          message={failed.value.message}
          title="Plans unavailable"
          tone="danger"
        />
      </AppScreen>
    );
  }

  return Option.match(NewPlanStates.get(snapshot, "Screen.Form"), {
    onNone: () => (
      <AppScreen contentStyle={styles.loadingScreen}>
        <LoadingView message="Loading plans" />
      </AppScreen>
    ),
    onSome: ({ hasExistingPlan }) => (
      <MealPlanForm
        action="create"
        canNavigateBack={
          hasExistingPlan || snapshot.value.source === "settings"
        }
        errorMessage={Option.match(
          NewPlanStates.get(snapshot, "Screen.Form.Ready"),
          {
            onNone: () => undefined,
            onSome: ({ errorMessage }) => errorMessage,
          }
        )}
        initialPlan={null}
        isSubmitting={NewPlanStates.matches(snapshot, "Screen.Form.Submitting")}
        onBack={() => {
          send(NewPlanEvents.Back());
        }}
        onSubmit={(input) => {
          send(NewPlanEvents.Submit({ input }));
        }}
      />
    ),
  });
}

const styles = StyleSheet.create({
  loadingScreen: {
    justifyContent: "center",
  },
  stateScreen: {
    gap: spacing.lg,
  },
});
