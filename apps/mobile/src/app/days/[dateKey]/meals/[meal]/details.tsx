import { MacroDetailsRoute } from "@/components/nutrition/macro-details-view";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { Domain } from "@mai/nutrition";
import { Option, Schema } from "effect";
import { Redirect } from "expo-router";

const MealDetailsRouteParams = Schema.Struct({
  dateKey: Domain.DateKey,
  meal: Domain.Meal,
});

export default function MealDetailsScreen() {
  return useSchemaLocalSearchParams(MealDetailsRouteParams).pipe(
    Option.match({
      onNone: () => <Redirect href="/" />,
      onSome: ({ dateKey, meal }) => (
        <MacroDetailsRoute dateKey={dateKey} meal={meal} />
      ),
    })
  );
}
