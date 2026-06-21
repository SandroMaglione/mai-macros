import { DailyLogRoute } from "@/components/nutrition/daily-log-view";
import { useLocalSearchParams } from "expo-router";

export default function DayScreen() {
  const params = useLocalSearchParams();
  const dateKey = Array.isArray(params.dateKey)
    ? params.dateKey[0]
    : params.dateKey;

  return <DailyLogRoute dateKey={dateKey ?? ""} />;
}
