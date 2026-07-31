import * as RecordableEvents from "@mai/event-tracking/services/recordable-events";
import * as RecordedEvents from "@mai/event-tracking/services/recorded-events";
import * as EventTimeZone from "@mai/event-tracking/services/time-zone";
import * as BodyWeights from "@mai/nutrition/services/body-weights";
import * as DailyLogs from "@mai/nutrition/services/daily-logs";
import * as Foods from "@mai/nutrition/services/foods";
import * as MealEntries from "@mai/nutrition/services/meal-entries";
import * as MealPlans from "@mai/nutrition/services/meal-plans";
import * as ReactNativeSqlite from "@mai/sqlite/layers/react-native-sqlite";
import { Layer, ManagedRuntime } from "effect";

import { ReactNativeCryptoLayer } from "./react-native-crypto.ts";

const MobileStoreLayer = ReactNativeSqlite.ReactNativeSqliteLayer({
  filename: "mai.db",
});

const MobileServicesLayer = Layer.mergeAll(
  BodyWeights.BodyWeights.layer,
  RecordableEvents.RecordableEvents.layer,
  RecordedEvents.RecordedEvents.layer,
  MealPlans.MealPlans.layer,
  DailyLogs.DailyLogs.layer,
  Foods.Foods.layer,
  MealEntries.MealEntries.layer
);

const MobileLayer = MobileServicesLayer.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      MobileStoreLayer,
      ReactNativeCryptoLayer,
      EventTimeZone.EventTrackingTimeZone.layerLocal
    )
  )
);

export const RuntimeClient = ManagedRuntime.make(MobileLayer);

export type RuntimeClient = typeof RuntimeClient;
