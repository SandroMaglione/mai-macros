import { MacroDetailsRoute } from "@/components/nutrition/macro-details-view";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { Domain } from "@mai/nutrition";
import { Option, Schema } from "effect";
import { Redirect } from "expo-router";

const DayDetailsRouteParams = Schema.Struct({
  dateKey: Domain.DateKey,
});

export default function DayDetailsScreen() {
  return useSchemaLocalSearchParams(DayDetailsRouteParams).pipe(
    Option.match({
      onNone: () => <Redirect href="/" />,
      onSome: ({ dateKey }) => (
        <MacroDetailsRoute dateKey={dateKey} meal={undefined} />
      ),
    })
  );
}
