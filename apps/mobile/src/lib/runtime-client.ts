import * as RecordableEvents from "@mai/event-tracking/services/recordable-events";
import * as RecordedEvents from "@mai/event-tracking/services/recorded-events";
import * as EventTimeZone from "@mai/event-tracking/services/time-zone";
import {
  Backup,
  BodyWeightReports,
  BodyWeights,
  DailyLogs,
  FoodCatalogTransfer,
  Foods,
  MealEntries,
  MealPlans,
  NutritionReports,
} from "@mai/nutrition";
import { Gzip, QrCode } from "@mai/services";
import { ReactNativeSqlite } from "@mai/sqlite";
import { Machine } from "@typeonce/effect-machine";
import { AtomMachine } from "@typeonce/effect-machine/reactivity";
import { Layer, ManagedRuntime, Schema } from "effect";
import { Atom } from "effect/unstable/reactivity";

import { ExpoBackupFileTransferLayer } from "./expo-backup-file-transfer.ts";
import { ReactNativeCryptoLayer } from "./react-native-crypto.ts";

const MobileStoreLayer = ReactNativeSqlite.ReactNativeSqliteLayer({
  filename: "mai.db",
});

const MobileServicesLayer = Layer.mergeAll(
  Backup.Backups.layer,
  BodyWeights.BodyWeights.layer,
  BodyWeightReports.BodyWeightReports.layer,
  RecordableEvents.RecordableEvents.layer,
  RecordedEvents.RecordedEvents.layer,
  MealPlans.MealPlans.layer,
  DailyLogs.DailyLogs.layer,
  Foods.Foods.layer,
  FoodCatalogTransfer.FoodCatalogTransfers.layer,
  MealEntries.MealEntries.layer,
  NutritionReports.NutritionReports.layer,
  ExpoBackupFileTransferLayer,
  Gzip.Gzip.Default,
  QrCode.QrCode.Default
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

export const MobileAtomRuntime = Atom.runtime(MobileLayer);
export const RuntimeClient = ManagedRuntime.make(MobileLayer);
export type RuntimeClient = typeof RuntimeClient;

const BoundMobileMachine = AtomMachine.bind(MobileAtomRuntime);

export class MobileMachine {
  static make<M extends Machine.Machine.Any>(
    machine: M,
    ...args: Exclude<M["input"], undefined> extends infer Input extends
      Schema.Top
      ? Machine.Machine.InputArgs<Input>
      : []
  ): AtomMachine.MachineAtom<
    Machine.Machine.Snapshot<M["states"]>,
    Schema.Schema.Type<M["events"][number]>,
    unknown,
    unknown,
    unknown
  >;
  static make(machine: Machine.Machine.Any, ...args: readonly unknown[]) {
    return Reflect.apply(BoundMobileMachine.make, BoundMobileMachine, [
      machine,
      ...args,
    ]);
  }
}
