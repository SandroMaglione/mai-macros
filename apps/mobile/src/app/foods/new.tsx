import { FoodForm } from "@/components/nutrition/food-form";
import { useMachine } from "@/hooks/use-machine";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { MachineAtoms } from "@/lib/machine-runtime";
import {
  CreateFoodMachine,
  createFoodCreatedNotice,
  type CreateFoodRouteMode,
} from "@/machines/create-food-machine";
import { FoodFormMachine } from "@mai/machines";
import { Domain } from "@mai/nutrition";
import { Option, Schema } from "effect";
import { useRouter } from "expo-router";

const SearchParams = Schema.Struct({
  dateKey: Schema.optionalKey(Domain.DateKey),
  source: Schema.optionalKey(Schema.Literal("foods")),
});

export default function NewFoodScreen() {
  const expoRouter = useRouter();
  const search = useSchemaLocalSearchParams(SearchParams).pipe(
    Option.match({
      onNone: () => ({
        _tag: "Invalid" as const,
      }),
      onSome: (decodedSearch) => ({
        _tag: "Valid" as const,
        dateKey: decodedSearch.dateKey,
        source: decodedSearch.source,
      }),
    })
  ) satisfies
    | {
        readonly _tag: "Valid";
        readonly dateKey: Domain.DateKey | undefined;
        readonly source: "foods" | undefined;
      }
    | {
        readonly _tag: "Invalid";
      };
  const dateKey = search._tag === "Valid" ? search.dateKey : undefined;
  return (
    <CreateFoodPanel
      dateKey={dateKey}
      initialNotice={
        search._tag === "Invalid"
          ? "The target date was not valid. Saving will return to today."
          : null
      }
      mode="screen"
      returnToFoods={search._tag === "Valid" && search.source === "foods"}
      onBack={() => {
        if (search._tag === "Valid" && search.source === "foods") {
          if (expoRouter.canGoBack()) {
            expoRouter.back();
          } else {
            expoRouter.replace({
              pathname: "/foods",
              params: dateKey === undefined ? {} : { dateKey },
            });
          }
          return;
        }

        if (dateKey === undefined) {
          expoRouter.replace("/");
          return;
        }

        expoRouter.replace({
          pathname: "/days/[dateKey]",
          params: {
            dateKey,
          },
        });
      }}
    />
  );
}

export function CreateFoodPanel({
  dateKey,
  initialNotice,
  mode,
  onBack,
  returnToFoods = false,
}: {
  readonly dateKey: Domain.DateKey | undefined;
  readonly initialNotice: string | null;
  readonly mode: CreateFoodRouteMode;
  readonly onBack: () => void;
  readonly returnToFoods?: boolean;
}) {
  const [snapshot, , machine] = useMachine(() =>
    MachineAtoms.make(CreateFoodMachine, {
      dateKey,
      initialNotice,
      mode,
      returnToFoods,
    })
  );
  const routeState = snapshot.state.state;
  const isSubmitting =
    routeState.path === "Form.Submitting" || routeState.path === "Form.Created";
  const notice =
    routeState.path === "Form.Idle" || routeState.path === "Form.Failure"
      ? routeState.value.notice
      : null;
  const feedback =
    notice === null
      ? undefined
      : routeState.path === "Form.Failure"
        ? {
            message: notice,
            title: "Food not saved",
            tone: "danger" as const,
          }
        : notice === createFoodCreatedNotice
          ? {
              message: notice,
              tone: "success" as const,
            }
          : {
              message: notice,
              tone: "neutral" as const,
            };

  return (
    <FoodForm
      action="create"
      disabled={isSubmitting}
      feedback={feedback}
      foodForm={machine.child(FoodFormMachine.FoodFormChild)}
      hasFailed={routeState.path === "Form.Failure"}
      layout={mode}
      onBack={onBack}
    />
  );
}
