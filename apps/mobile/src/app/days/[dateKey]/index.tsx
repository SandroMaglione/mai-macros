import { DailyLogRoute } from "@/components/nutrition/daily-log-view";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { Domain } from "@mai/nutrition";
import { Option, Schema } from "effect";
import { Redirect } from "expo-router";

const DayRouteParams = Schema.Struct({
  dateKey: Domain.DateKey,
});

export default function DayScreen() {
  return useSchemaLocalSearchParams(DayRouteParams).pipe(
    Option.match({
      onNone: () => <Redirect href="/" />,
      onSome: ({ dateKey }) => <DailyLogRoute dateKey={dateKey} />,
    })
  );
}
