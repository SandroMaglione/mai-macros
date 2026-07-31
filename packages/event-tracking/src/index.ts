import * as RecordableEventsService from "./services/recordable-events.ts";
import * as RecordedEventsService from "./services/recorded-events.ts";
import * as StoreService from "./services/store.ts";
import * as TimeZoneService from "./services/time-zone.ts";

export * as Domain from "./domain.ts";
export {
  RecordableEventsService as RecordableEvents,
  RecordedEventsService as RecordedEvents,
  StoreService as Store,
  TimeZoneService as TimeZone,
};

export const Service = {
  RecordableEvents: RecordableEventsService,
  RecordedEvents: RecordedEventsService,
  Store: StoreService,
  TimeZone: TimeZoneService,
} as const;

export type Service = typeof Service;
