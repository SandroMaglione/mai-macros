import { MealPlanForm } from "@/components/nutrition/meal-plan-form";
import { AppScreen } from "@/components/ui/app-screen";
import { LoadingView } from "@/components/ui/loading-view";
import { MaiHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { useMachine } from "@/hooks/use-machine";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { MachineAtoms } from "@/lib/machine-runtime";
import {
  EditPlanEvents,
  EditPlanMachine,
  EditPlanStates,
} from "@/machines/edit-plan-machine";
import { spacing } from "@/theme/tokens";
import { Domain } from "@mai/nutrition";
import { Option, Schema } from "effect";
import { StyleSheet } from "react-native";

const EditRouteParams = Schema.Struct({
  dateKey: Schema.optionalKey(Domain.DateKey),
  planId: Domain.PlanId,
});

export default function EditPlanScreen() {
  const routeParams = useSchemaLocalSearchParams(EditRouteParams).pipe(
    Option.match({
      onNone: () => ({
        _tag: "Invalid" as const,
      }),
      onSome: (params) => ({
        _tag: "Valid" as const,
        dateKey: params.dateKey,
        planId: params.planId,
      }),
    })
  );
  const [snapshot, send] = useMachine(() =>
    MachineAtoms.make(EditPlanMachine, { routeParams })
  );
  const failed = EditPlanStates.get(snapshot, "Screen.Failed");

  if (Option.isSome(failed)) {
    return (
      <AppScreen contentStyle={styles.stateScreen}>
        <MaiHeader title="Edit plan" />
        <Notice
          message={failed.value.message}
          title="Plan unavailable"
          tone="danger"
        />
      </AppScreen>
    );
  }

  return Option.match(EditPlanStates.get(snapshot, "Screen.Form"), {
    onNone: () => (
      <AppScreen contentStyle={styles.loadingScreen}>
        <LoadingView message="Loading plan" />
      </AppScreen>
    ),
    onSome: ({ plan }) => (
      <MealPlanForm
        action="edit"
        errorMessage={Option.match(
          EditPlanStates.get(snapshot, "Screen.Form.Ready"),
          {
            onNone: () => undefined,
            onSome: ({ errorMessage }) => errorMessage,
          }
        )}
        initialPlan={plan}
        isSubmitting={EditPlanStates.matches(
          snapshot,
          "Screen.Form.Submitting"
        )}
        onBack={() => {
          send(EditPlanEvents.Back());
        }}
        onSubmit={(input) => {
          send(EditPlanEvents.Submit({ input }));
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
