import { AppScreen } from "@/components/ui/app-screen";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { LoadingOverlay, LoadingView } from "@/components/ui/loading-view";
import { AppHeader } from "@/components/ui/mai-header";
import { Notice } from "@/components/ui/notice";
import { PagerTabs } from "@/components/ui/pager-tabs";
import { SectionCard } from "@/components/ui/section-card";
import { useSchemaLocalSearchParams } from "@/hooks/use-schema-local-search-params";
import { dateKeyFromDate } from "@/lib/date-keys";
import { MobileMachine, RuntimeClient } from "@/lib/runtime-client";
import { color, radius, spacing, tokens } from "@/theme/tokens";
import * as EventDomain from "@mai/event-tracking/domain";
import * as RecordableEventsService from "@mai/event-tracking/services/recordable-events";
import * as RecordedEventsService from "@mai/event-tracking/services/recorded-events";
import * as NutritionDomain from "@mai/nutrition/domain";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { Machine } from "@typeonce/effect-machine";
import {
  Array,
  DateTime,
  Effect,
  HashMap,
  Match,
  Option,
  Schema,
} from "effect";
import { Redirect, router } from "expo-router";
import {
  Archive,
  ArchiveRestore,
  ChevronLeft,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react-native";
import { AsyncResult } from "effect/unstable/reactivity";
import { memo, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

const EventsSearchParams = Schema.Struct({
  dateKey: Schema.optionalKey(NutritionDomain.DateKey),
});

const EventTrackerTabIndex = Schema.Literals([0, 1]);
const EventTimelinePageSize = 30;

const TrackerNotice = Schema.Struct({
  message: Schema.String,
  tone: Schema.Literals(["danger", "neutral", "success"]),
});

const EventTrackerData = Schema.Struct({
  loadedStartDateKey: EventDomain.DateKey,
  recordableEvents: Schema.Array(EventDomain.RecordableEvent),
  recordedEvents: Schema.Array(EventDomain.RecordedEvent),
});

type EventTrackerData = typeof EventTrackerData.Type;

const RecordEventInput = Schema.Struct({
  recordableEventId: EventDomain.RecordableEventId,
});

const RecordPastEventsInput = Schema.Struct({
  dateKey: EventDomain.DateKey,
  recordableEventIds: Schema.Array(EventDomain.RecordableEventId).check(
    Schema.isNonEmpty()
  ),
});

const LoadEventRangeInput = Schema.Struct({
  endDateKey: EventDomain.DateKey,
  startDateKey: EventDomain.DateKey,
});

const DeleteRecordedEventInput = Schema.Struct({
  recordedEventId: EventDomain.RecordedEventId,
});

const SaveRecordableEventInput = Schema.Union([
  Schema.TaggedStruct("Create", {
    emoji: Schema.String,
    name: Schema.String,
  }),
  Schema.TaggedStruct("Update", {
    emoji: Schema.String,
    name: Schema.String,
    position: EventDomain.RecordableEventPosition,
    recordableEventId: EventDomain.RecordableEventId,
  }),
]);

const ToggleRecordableEventInput = Schema.Struct({
  action: Schema.Literals(["archive", "unarchive"]),
  recordableEventId: EventDomain.RecordableEventId,
});

const RecordEventResult = Schema.Union([
  Schema.TaggedStruct("Recorded", {
    recordableEvent: EventDomain.RecordableEvent,
    recordedEvent: EventDomain.RecordedEvent,
  }),
  Schema.TaggedStruct("Failed", {
    message: Schema.String,
  }),
]);

const RecordPastEventsResult = Schema.Union([
  Schema.TaggedStruct("Recorded", {
    recordedEvents: Schema.Array(EventDomain.RecordedEvent),
  }),
  Schema.TaggedStruct("Failed", {
    message: Schema.String,
  }),
]);

const LoadOlderEventsResult = Schema.Struct({
  loadedStartDateKey: EventDomain.DateKey,
  recordedEvents: Schema.Array(EventDomain.RecordedEvent),
});

const PastEventSelection = Schema.Struct({
  count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  recordableEventId: EventDomain.RecordableEventId,
});

type PastEventSelection = typeof PastEventSelection.Type;

const DeleteRecordedEventResult = Schema.Union([
  Schema.TaggedStruct("Deleted", {
    recordedEvent: EventDomain.RecordedEvent,
  }),
  Schema.TaggedStruct("Failed", {
    message: Schema.String,
  }),
]);

const SaveRecordableEventResult = Schema.Union([
  Schema.TaggedStruct("Saved", {
    action: Schema.Literals(["created", "updated"]),
    recordableEvent: EventDomain.RecordableEvent,
  }),
  Schema.TaggedStruct("Failed", {
    message: Schema.String,
  }),
]);

const ToggleRecordableEventResult = Schema.Union([
  Schema.TaggedStruct("Toggled", {
    action: Schema.Literals(["archived", "unarchived"]),
    recordableEvent: EventDomain.RecordableEvent,
  }),
  Schema.TaggedStruct("Failed", {
    message: Schema.String,
  }),
]);

const EventTrackerOperation = Schema.TaggedUnion({
  LoadOlder: { input: LoadEventRangeInput },
  RecordNow: { input: RecordEventInput },
  RecordPastEvents: { input: RecordPastEventsInput },
  DeleteRecordedEvent: { input: DeleteRecordedEventInput },
  SaveRecordableEvent: { input: SaveRecordableEventInput },
  ToggleRecordableEvent: { input: ToggleRecordableEventInput },
});

const EventTrackerOperationResult = Schema.TaggedUnion({
  OlderLoaded: LoadOlderEventsResult.fields,
  NowRecorded: { result: RecordEventResult },
  PastRecorded: { result: RecordPastEventsResult },
  RecordedEventDeleted: { result: DeleteRecordedEventResult },
  RecordableEventSaved: { result: SaveRecordableEventResult },
  RecordableEventToggled: { result: ToggleRecordableEventResult },
  OperationFailed: { message: Schema.String },
});

const EventTrackerState = Schema.TaggedUnion({
  Loading: { todayDateKey: EventDomain.DateKey },
  Failure: {
    notice: TrackerNotice,
    todayDateKey: EventDomain.DateKey,
  },
  Ready: {
    activeTab: EventTrackerTabIndex,
    data: EventTrackerData,
    detailDateKey: Schema.NullOr(EventDomain.DateKey),
    detailRecordableEventId: Schema.NullOr(EventDomain.RecordableEventId),
    editingDateKey: Schema.NullOr(EventDomain.DateKey),
    editingRecordableEventId: Schema.NullOr(EventDomain.RecordableEventId),
    emojiInput: Schema.String,
    nameInput: Schema.String,
    notice: Schema.NullOr(TrackerNotice),
    pastEventSelections: Schema.Array(PastEventSelection),
    todayDateKey: EventDomain.DateKey,
  },
  Idle: {},
  Working: {
    operation: EventTrackerOperation,
  },
});

const EventTrackerEvent = Schema.TaggedUnion({
  ArchiveRecordableEvent: RecordEventInput.fields,
  BeginCreate: {},
  CancelEdit: {},
  ChangeEmoji: { value: Schema.String },
  ChangeName: { value: Schema.String },
  CloseDayEditor: {},
  CloseEventDetails: {},
  DecrementPastEvent: RecordEventInput.fields,
  DeleteRecordedEvent: DeleteRecordedEventInput.fields,
  EditRecordableEvent: RecordEventInput.fields,
  IncrementPastEvent: RecordEventInput.fields,
  LoadOlder: {},
  OpenDayEditor: { dateKey: EventDomain.DateKey },
  OpenEventDetails: {
    dateKey: EventDomain.DateKey,
    recordableEventId: EventDomain.RecordableEventId,
  },
  RecordNow: RecordEventInput.fields,
  RecordPastEvents: RecordPastEventsInput.fields,
  Reload: {},
  SaveRecordableEvent: {},
  SelectTab: { index: EventTrackerTabIndex },
  UnarchiveRecordableEvent: RecordEventInput.fields,
});

const EventTrackerInternalEvent = Schema.TaggedUnion({
  InitialLoadSucceeded: { data: EventTrackerData },
  InitialLoadFailed: {},
  RefreshToday: { todayDateKey: EventDomain.DateKey },
  OperationCompleted: {
    result: EventTrackerOperationResult,
  },
});

const EventTrackerStates = Machine.defineStates({
  Loading: EventTrackerState.cases.Loading,
  Failure: EventTrackerState.cases.Failure,
  Ready: {
    schema: EventTrackerState.cases.Ready,
    initial: "Idle",
    states: {
      Idle: EventTrackerState.cases.Idle,
      Working: EventTrackerState.cases.Working,
    },
  },
});

const EventTrackerOperations = {
  load: (input: typeof LoadEventRangeInput.Type) =>
    Effect.gen(function* () {
      const recordableEvents = yield* RecordableEventsService.RecordableEvents;
      const recordedEvents = yield* RecordedEventsService.RecordedEvents;
      return {
        loadedStartDateKey: input.startDateKey,
        recordableEvents: yield* recordableEvents.list(),
        recordedEvents: yield* recordedEvents.listRange({ input }),
      };
    }),

  run: (operation: typeof EventTrackerOperation.Type) =>
    Match.value(operation).pipe(
      Match.tagsExhaustive({
        LoadOlder: ({ input }) =>
          Effect.gen(function* () {
            const recordedEvents = yield* RecordedEventsService.RecordedEvents;
            return EventTrackerInternalEvent.cases.OperationCompleted.make({
              result: EventTrackerOperationResult.cases.OlderLoaded.make({
                loadedStartDateKey: input.startDateKey,
                recordedEvents: yield* recordedEvents.listRange({ input }),
              }),
            });
          }),
        RecordNow: ({ input }) =>
          Effect.gen(function* () {
            const service = yield* RecordedEventsService.RecordedEvents;
            const recorded = yield* service.recordNow({ input });
            return RecordEventResult.make({
              _tag: "Recorded",
              recordableEvent: recorded.recordableEvent,
              recordedEvent: recorded.recordedEvent,
            });
          }).pipe(
            Effect.catchTags({
              RecordableEventArchived: () =>
                Effect.succeed(
                  RecordEventResult.make({
                    _tag: "Failed",
                    message: "This event is archived and cannot be recorded.",
                  })
                ),
              RecordableEventNotFound: () =>
                Effect.succeed(
                  RecordEventResult.make({
                    _tag: "Failed",
                    message: "This event no longer exists.",
                  })
                ),
              SchemaError: () =>
                Effect.succeed(
                  RecordEventResult.make({
                    _tag: "Failed",
                    message: "The event could not be validated.",
                  })
                ),
            }),
            Effect.catch(() =>
              Effect.succeed(
                RecordEventResult.make({
                  _tag: "Failed",
                  message: "Could not record the event. Please try again.",
                })
              )
            ),
            Effect.map((result) =>
              EventTrackerInternalEvent.cases.OperationCompleted.make({
                result: EventTrackerOperationResult.cases.NowRecorded.make({
                  result,
                }),
              })
            )
          ),
        RecordPastEvents: ({ input }) =>
          Effect.gen(function* () {
            const service = yield* RecordedEventsService.RecordedEvents;
            const recorded = yield* service.recordManyOnPastDay({ input });
            return RecordPastEventsResult.make({
              _tag: "Recorded",
              recordedEvents: recorded.recordedEvents,
            });
          }).pipe(
            Effect.catchTags({
              RecordableEventArchived: () =>
                Effect.succeed(
                  RecordPastEventsResult.make({
                    _tag: "Failed",
                    message: "This event is archived and cannot be recorded.",
                  })
                ),
              RecordableEventNotFound: () =>
                Effect.succeed(
                  RecordPastEventsResult.make({
                    _tag: "Failed",
                    message: "This event no longer exists.",
                  })
                ),
              RecordedEventDateNotInPast: () =>
                Effect.succeed(
                  RecordPastEventsResult.make({
                    _tag: "Failed",
                    message: "Choose a real day before today.",
                  })
                ),
              SchemaError: () =>
                Effect.succeed(
                  RecordPastEventsResult.make({
                    _tag: "Failed",
                    message: "The event or date could not be validated.",
                  })
                ),
            }),
            Effect.catch(() =>
              Effect.succeed(
                RecordPastEventsResult.make({
                  _tag: "Failed",
                  message: "Could not record the past event. Please try again.",
                })
              )
            ),
            Effect.map((result) =>
              EventTrackerInternalEvent.cases.OperationCompleted.make({
                result: EventTrackerOperationResult.cases.PastRecorded.make({
                  result,
                }),
              })
            )
          ),
        DeleteRecordedEvent: ({ input }) =>
          Effect.gen(function* () {
            const service = yield* RecordedEventsService.RecordedEvents;
            const deleted = yield* service.delete({ input });
            return DeleteRecordedEventResult.make({
              _tag: "Deleted",
              recordedEvent: deleted.recordedEvent,
            });
          }).pipe(
            Effect.catch(() =>
              Effect.succeed(
                DeleteRecordedEventResult.make({
                  _tag: "Failed",
                  message:
                    "Could not delete the recorded event. Please try again.",
                })
              )
            ),
            Effect.map((result) =>
              EventTrackerInternalEvent.cases.OperationCompleted.make({
                result:
                  EventTrackerOperationResult.cases.RecordedEventDeleted.make({
                    result,
                  }),
              })
            )
          ),
        SaveRecordableEvent: ({ input }) =>
          Effect.gen(function* () {
            const service = yield* RecordableEventsService.RecordableEvents;
            if (input._tag === "Create") {
              const created = yield* service.create({
                input: { emoji: input.emoji, name: input.name },
              });
              return SaveRecordableEventResult.make({
                _tag: "Saved",
                action: "created",
                recordableEvent: created.recordableEvent,
              });
            }
            const updated = yield* service.update({ input });
            return SaveRecordableEventResult.make({
              _tag: "Saved",
              action: "updated",
              recordableEvent: updated.recordableEvent,
            });
          }).pipe(
            Effect.catchTags({
              RecordableEventNameAlreadyExists: () =>
                Effect.succeed(
                  SaveRecordableEventResult.make({
                    _tag: "Failed",
                    message: "An event with this name already exists.",
                  })
                ),
              RecordableEventNotFound: () =>
                Effect.succeed(
                  SaveRecordableEventResult.make({
                    _tag: "Failed",
                    message: "This event no longer exists.",
                  })
                ),
              SchemaError: () =>
                Effect.succeed(
                  SaveRecordableEventResult.make({
                    _tag: "Failed",
                    message: "Enter a name and exactly one emoji.",
                  })
                ),
            }),
            Effect.catch(() =>
              Effect.succeed(
                SaveRecordableEventResult.make({
                  _tag: "Failed",
                  message: "Could not save the event. Please try again.",
                })
              )
            ),
            Effect.map((result) =>
              EventTrackerInternalEvent.cases.OperationCompleted.make({
                result:
                  EventTrackerOperationResult.cases.RecordableEventSaved.make({
                    result,
                  }),
              })
            )
          ),
        ToggleRecordableEvent: ({ input }) =>
          Effect.gen(function* () {
            const service = yield* RecordableEventsService.RecordableEvents;
            const toggled = yield* input.action === "archive"
              ? service.archive({
                  input: { recordableEventId: input.recordableEventId },
                })
              : service.unarchive({
                  input: { recordableEventId: input.recordableEventId },
                });
            return ToggleRecordableEventResult.make({
              _tag: "Toggled",
              action: input.action === "archive" ? "archived" : "unarchived",
              recordableEvent: toggled.recordableEvent,
            });
          }).pipe(
            Effect.catch(() =>
              Effect.succeed(
                ToggleRecordableEventResult.make({
                  _tag: "Failed",
                  message: "Could not update the event. Please try again.",
                })
              )
            ),
            Effect.map((result) =>
              EventTrackerInternalEvent.cases.OperationCompleted.make({
                result:
                  EventTrackerOperationResult.cases.RecordableEventToggled.make(
                    {
                      result,
                    }
                  ),
              })
            )
          ),
      })
    ),
};

const eventTrackerMachine = Machine.make({
  states: EventTrackerStates.states,
  events: [
    EventTrackerEvent.cases.ArchiveRecordableEvent,
    EventTrackerEvent.cases.BeginCreate,
    EventTrackerEvent.cases.CancelEdit,
    EventTrackerEvent.cases.ChangeEmoji,
    EventTrackerEvent.cases.ChangeName,
    EventTrackerEvent.cases.CloseDayEditor,
    EventTrackerEvent.cases.CloseEventDetails,
    EventTrackerEvent.cases.DecrementPastEvent,
    EventTrackerEvent.cases.DeleteRecordedEvent,
    EventTrackerEvent.cases.EditRecordableEvent,
    EventTrackerEvent.cases.IncrementPastEvent,
    EventTrackerEvent.cases.LoadOlder,
    EventTrackerEvent.cases.OpenDayEditor,
    EventTrackerEvent.cases.OpenEventDetails,
    EventTrackerEvent.cases.RecordNow,
    EventTrackerEvent.cases.RecordPastEvents,
    EventTrackerEvent.cases.Reload,
    EventTrackerEvent.cases.SaveRecordableEvent,
    EventTrackerEvent.cases.SelectTab,
    EventTrackerEvent.cases.UnarchiveRecordableEvent,
  ],
  internalEvents: [
    EventTrackerInternalEvent.cases.InitialLoadSucceeded,
    EventTrackerInternalEvent.cases.InitialLoadFailed,
    EventTrackerInternalEvent.cases.RefreshToday,
    EventTrackerInternalEvent.cases.OperationCompleted,
  ],
  input: Schema.Struct({ todayDateKey: EventDomain.DateKey }),
  initial: ({ todayDateKey }) =>
    EventTrackerStates.initial.Loading(
      EventTrackerState.cases.Loading.make({ todayDateKey })
    ),
}).handle({
  Loading: {
    invoke: ({ state }) =>
      Machine.invokeEffect({
        id: "load-event-tracker",
        effect: EventTrackerOperations.load({
          endDateKey: state.todayDateKey,
          startDateKey: _shiftDateKey({
            dateKey: state.todayDateKey,
            days: -(EventTimelinePageSize - 1),
          }),
        }),
        onSuccess: (data) =>
          EventTrackerInternalEvent.cases.InitialLoadSucceeded.make({ data }),
        onFailure: () =>
          EventTrackerInternalEvent.cases.InitialLoadFailed.make({}),
      }),
    on: {
      InitialLoadSucceeded: ({ event, state, target }) =>
        target.full.Ready(
          EventTrackerState.cases.Ready.make({
            activeTab: 0,
            data: event.data,
            detailDateKey: null,
            detailRecordableEventId: null,
            editingDateKey: null,
            editingRecordableEventId: null,
            emojiInput: "",
            nameInput: "",
            notice: null,
            pastEventSelections: [],
            todayDateKey: state.todayDateKey,
          }),
          (ready) => ready.Idle(EventTrackerState.cases.Idle.make({}))
        ),
      InitialLoadFailed: ({ state, target }) =>
        target.full.Failure(
          EventTrackerState.cases.Failure.make({
            notice: {
              message: "Could not load events. Please try again.",
              tone: "danger",
            },
            todayDateKey: state.todayDateKey,
          })
        ),
    },
  },
  Failure: {
    on: {
      Reload: ({ state, target }) =>
        target.full.Loading(
          EventTrackerState.cases.Loading.make({
            todayDateKey: state.todayDateKey,
          })
        ),
    },
  },
  Ready: {
    invoke: Machine.invoke({
      id: "track-today",
      src: () =>
        Machine.logic({
          initial: undefined,
          run: ({ sendParent }) =>
            Effect.gen(function* () {
              const refreshToday = () => {
                Schema.decodeOption(EventDomain.DateKey)(
                  dateKeyFromDate({ date: new Date() })
                ).pipe(
                  Option.map((todayDateKey) =>
                    RuntimeClient.runFork(
                      sendParent(
                        EventTrackerInternalEvent.cases.RefreshToday.make({
                          todayDateKey,
                        })
                      )
                    )
                  )
                );
              };
              yield* Effect.acquireRelease(
                Effect.sync(() => {
                  const subscription = AppState.addEventListener(
                    "change",
                    (state) => {
                      if (state === "active") refreshToday();
                    }
                  );
                  const interval = globalThis.setInterval(refreshToday, 60_000);
                  refreshToday();
                  return { interval, subscription };
                }),
                ({ interval, subscription }) =>
                  Effect.sync(() => {
                    subscription.remove();
                    globalThis.clearInterval(interval);
                  })
              );
              return yield* Effect.never;
            }).pipe(Effect.scoped),
        }),
    }),
    states: {
      Idle: {
        on: {
          BeginCreate: ({ parent, target }) =>
            target.local.with(
              EventTrackerState.cases.Ready.make({
                ...parent,
                editingRecordableEventId: null,
                emojiInput: "",
                nameInput: "",
                notice: null,
              }),
              (ready) => ready.Idle(EventTrackerState.cases.Idle.make({}))
            ),
          CancelEdit: ({ parent, target }) =>
            target.local.with(
              EventTrackerState.cases.Ready.make({
                ...parent,
                editingRecordableEventId: null,
                emojiInput: "",
                nameInput: "",
              }),
              (ready) => ready.Idle(EventTrackerState.cases.Idle.make({}))
            ),
          ChangeEmoji: ({ event, parent, target }) =>
            target.local.with(
              EventTrackerState.cases.Ready.make({
                ...parent,
                emojiInput: event.value,
              }),
              (ready) => ready.Idle(EventTrackerState.cases.Idle.make({}))
            ),
          ChangeName: ({ event, parent, target }) =>
            target.local.with(
              EventTrackerState.cases.Ready.make({
                ...parent,
                nameInput: event.value,
              }),
              (ready) => ready.Idle(EventTrackerState.cases.Idle.make({}))
            ),
          CloseDayEditor: ({ parent, target }) =>
            target.local.with(
              EventTrackerState.cases.Ready.make({
                ...parent,
                editingDateKey: null,
                pastEventSelections: [],
              }),
              (ready) => ready.Idle(EventTrackerState.cases.Idle.make({}))
            ),
          CloseEventDetails: ({ parent, target }) =>
            target.local.with(
              EventTrackerState.cases.Ready.make({
                ...parent,
                detailDateKey: null,
                detailRecordableEventId: null,
              }),
              (ready) => ready.Idle(EventTrackerState.cases.Idle.make({}))
            ),
          DecrementPastEvent: ({ event, parent, target }) =>
            target.local.with(
              EventTrackerState.cases.Ready.make({
                ...parent,
                pastEventSelections: parent.pastEventSelections.flatMap(
                  (selection) =>
                    selection.recordableEventId !== event.recordableEventId
                      ? [selection]
                      : selection.count <= 1
                        ? []
                        : [{ ...selection, count: selection.count - 1 }]
                ),
              }),
              (ready) => ready.Idle(EventTrackerState.cases.Idle.make({}))
            ),
          IncrementPastEvent: ({ event, parent, target }) => {
            const selected = parent.pastEventSelections.find(
              (item) => item.recordableEventId === event.recordableEventId
            );
            const pastEventSelections =
              selected === undefined
                ? [
                    ...parent.pastEventSelections,
                    { count: 1, recordableEventId: event.recordableEventId },
                  ]
                : parent.pastEventSelections.map((item) =>
                    item.recordableEventId === event.recordableEventId
                      ? { ...item, count: item.count + 1 }
                      : item
                  );
            return target.local.with(
              EventTrackerState.cases.Ready.make({
                ...parent,
                pastEventSelections,
              }),
              (ready) => ready.Idle(EventTrackerState.cases.Idle.make({}))
            );
          },
          OpenDayEditor: ({ event, parent, target }) =>
            event.dateKey >= parent.todayDateKey
              ? undefined
              : target.local.with(
                  EventTrackerState.cases.Ready.make({
                    ...parent,
                    editingDateKey: event.dateKey,
                    pastEventSelections: [],
                  }),
                  (ready) => ready.Idle(EventTrackerState.cases.Idle.make({}))
                ),
          OpenEventDetails: ({ event, parent, target }) =>
            target.local.with(
              EventTrackerState.cases.Ready.make({
                ...parent,
                detailDateKey: event.dateKey,
                detailRecordableEventId: event.recordableEventId,
              }),
              (ready) => ready.Idle(EventTrackerState.cases.Idle.make({}))
            ),
          SelectTab: ({ event, parent, target }) =>
            target.local.with(
              EventTrackerState.cases.Ready.make({
                ...parent,
                activeTab: event.index,
              }),
              (ready) => ready.Idle(EventTrackerState.cases.Idle.make({}))
            ),
          RefreshToday: ({ event, parent, target }) =>
            target.local.with(
              EventTrackerState.cases.Ready.make({
                ...parent,
                todayDateKey: event.todayDateKey,
              }),
              (ready) => ready.Idle(EventTrackerState.cases.Idle.make({}))
            ),
          EditRecordableEvent: ({ event, parent, target }) => {
            const item = parent.data.recordableEvents.find(
              (candidate) => candidate.id === event.recordableEventId
            );
            return target.local.with(
              EventTrackerState.cases.Ready.make(
                item === undefined
                  ? {
                      ...parent,
                      notice: {
                        message: "This event no longer exists.",
                        tone: "danger",
                      },
                    }
                  : {
                      ...parent,
                      activeTab: 1,
                      editingRecordableEventId: item.id,
                      emojiInput: item.emoji,
                      nameInput: item.name,
                      notice: null,
                    }
              ),
              (ready) => ready.Idle(EventTrackerState.cases.Idle.make({}))
            );
          },
          LoadOlder: ({ parent, target }) => {
            const endDateKey = _shiftDateKey({
              dateKey: parent.data.loadedStartDateKey,
              days: -1,
            });
            return target.local.Working(
              EventTrackerState.cases.Working.make({
                operation: EventTrackerOperation.cases.LoadOlder.make({
                  input: {
                    endDateKey,
                    startDateKey: _shiftDateKey({
                      dateKey: endDateKey,
                      days: -(EventTimelinePageSize - 1),
                    }),
                  },
                }),
              })
            );
          },
          RecordNow: ({ event, target }) =>
            target.local.Working(
              EventTrackerState.cases.Working.make({
                operation: EventTrackerOperation.cases.RecordNow.make({
                  input: { recordableEventId: event.recordableEventId },
                }),
              })
            ),
          RecordPastEvents: ({ event, target }) =>
            target.local.Working(
              EventTrackerState.cases.Working.make({
                operation: EventTrackerOperation.cases.RecordPastEvents.make({
                  input: {
                    dateKey: event.dateKey,
                    recordableEventIds: event.recordableEventIds,
                  },
                }),
              })
            ),
          DeleteRecordedEvent: ({ event, target }) =>
            target.local.Working(
              EventTrackerState.cases.Working.make({
                operation: EventTrackerOperation.cases.DeleteRecordedEvent.make(
                  { input: { recordedEventId: event.recordedEventId } }
                ),
              })
            ),
          ArchiveRecordableEvent: ({ event, target }) =>
            target.local.Working(
              EventTrackerState.cases.Working.make({
                operation:
                  EventTrackerOperation.cases.ToggleRecordableEvent.make({
                    input: {
                      action: "archive",
                      recordableEventId: event.recordableEventId,
                    },
                  }),
              })
            ),
          UnarchiveRecordableEvent: ({ event, target }) =>
            target.local.Working(
              EventTrackerState.cases.Working.make({
                operation:
                  EventTrackerOperation.cases.ToggleRecordableEvent.make({
                    input: {
                      action: "unarchive",
                      recordableEventId: event.recordableEventId,
                    },
                  }),
              })
            ),
          SaveRecordableEvent: ({ parent, target }) => {
            const recordable =
              parent.editingRecordableEventId === null
                ? undefined
                : parent.data.recordableEvents.find(
                    (item) => item.id === parent.editingRecordableEventId
                  );
            if (
              parent.editingRecordableEventId !== null &&
              recordable === undefined
            ) {
              return target.local.with(
                EventTrackerState.cases.Ready.make({
                  ...parent,
                  notice: {
                    message: "This event no longer exists.",
                    tone: "danger",
                  },
                }),
                (ready) => ready.Idle(EventTrackerState.cases.Idle.make({}))
              );
            }
            const input =
              recordable === undefined
                ? SaveRecordableEventInput.make({
                    _tag: "Create",
                    emoji: parent.emojiInput,
                    name: parent.nameInput,
                  })
                : SaveRecordableEventInput.make({
                    _tag: "Update",
                    emoji: parent.emojiInput,
                    name: parent.nameInput,
                    position: recordable.position,
                    recordableEventId: recordable.id,
                  });
            return target.local.Working(
              EventTrackerState.cases.Working.make({
                operation: EventTrackerOperation.cases.SaveRecordableEvent.make(
                  { input }
                ),
              })
            );
          },
        },
      },
      Working: {
        invoke: ({ state }) =>
          Machine.invokeEffect({
            id: "event-tracker-operation",
            effect: EventTrackerOperations.run(state.operation),
            onSuccess: (event) => event,
            onFailure: () =>
              EventTrackerInternalEvent.cases.OperationCompleted.make({
                result: EventTrackerOperationResult.cases.OperationFailed.make({
                  message: "Could not update events. Please try again.",
                }),
              }),
          }),
        on: {
          RefreshToday: ({ event, parent, state, target }) =>
            target.local.with(
              EventTrackerState.cases.Ready.make({
                ...parent,
                todayDateKey: event.todayDateKey,
              }),
              (ready) => ready.Working(state)
            ),
          OperationCompleted: ({ event, parent, target }) => {
            let next = EventTrackerState.cases.Ready.make({ ...parent });
            Match.value(event.result).pipe(
              Match.tagsExhaustive({
                OlderLoaded: (result) => {
                  next = EventTrackerState.cases.Ready.make({
                    ...parent,
                    data: {
                      ...parent.data,
                      loadedStartDateKey: result.loadedStartDateKey,
                      recordedEvents: _mergeRecordedEvents({
                        current: parent.data.recordedEvents,
                        incoming: result.recordedEvents,
                      }),
                    },
                  });
                },
                NowRecorded: ({ result }) => {
                  next =
                    result._tag === "Failed"
                      ? EventTrackerState.cases.Ready.make({
                          ...parent,
                          notice: { message: result.message, tone: "danger" },
                        })
                      : EventTrackerState.cases.Ready.make({
                          ...parent,
                          notice: null,
                          data: {
                            ...parent.data,
                            recordedEvents: _mergeRecordedEvents({
                              current: parent.data.recordedEvents,
                              incoming: [result.recordedEvent],
                            }),
                          },
                        });
                },
                PastRecorded: ({ result }) => {
                  next =
                    result._tag === "Failed"
                      ? EventTrackerState.cases.Ready.make({
                          ...parent,
                          notice: { message: result.message, tone: "danger" },
                        })
                      : EventTrackerState.cases.Ready.make({
                          ...parent,
                          editingDateKey: null,
                          pastEventSelections: [],
                          notice: null,
                          data: {
                            ...parent.data,
                            recordedEvents: _mergeRecordedEvents({
                              current: parent.data.recordedEvents,
                              incoming: result.recordedEvents,
                            }),
                          },
                        });
                },
                RecordedEventDeleted: ({ result }) => {
                  next =
                    result._tag === "Failed"
                      ? EventTrackerState.cases.Ready.make({
                          ...parent,
                          notice: { message: result.message, tone: "danger" },
                        })
                      : EventTrackerState.cases.Ready.make({
                          ...parent,
                          notice: null,
                          data: {
                            ...parent.data,
                            recordedEvents: parent.data.recordedEvents.filter(
                              (item) => item.id !== result.recordedEvent.id
                            ),
                          },
                        });
                },
                RecordableEventSaved: ({ result }) => {
                  next =
                    result._tag === "Failed"
                      ? EventTrackerState.cases.Ready.make({
                          ...parent,
                          notice: { message: result.message, tone: "danger" },
                        })
                      : EventTrackerState.cases.Ready.make({
                          ...parent,
                          data:
                            _upsertRecordableEvent({
                              data: parent.data,
                              recordableEvent: result.recordableEvent,
                            }) ?? parent.data,
                          editingRecordableEventId: null,
                          emojiInput: "",
                          nameInput: "",
                          notice: null,
                        });
                },
                RecordableEventToggled: ({ result }) => {
                  next =
                    result._tag === "Failed"
                      ? EventTrackerState.cases.Ready.make({
                          ...parent,
                          notice: { message: result.message, tone: "danger" },
                        })
                      : EventTrackerState.cases.Ready.make({
                          ...parent,
                          data:
                            _upsertRecordableEvent({
                              data: parent.data,
                              recordableEvent: result.recordableEvent,
                            }) ?? parent.data,
                          editingRecordableEventId: null,
                          emojiInput: "",
                          nameInput: "",
                          notice: null,
                        });
                },
                OperationFailed: ({ message }) => {
                  next = EventTrackerState.cases.Ready.make({
                    ...parent,
                    notice: { message, tone: "danger" },
                  });
                },
              })
            );
            return target.local.with(next, (ready) =>
              ready.Idle(EventTrackerState.cases.Idle.make({}))
            );
          },
        },
      },
    },
  },
});

export default function EventsScreen() {
  const search = useSchemaLocalSearchParams(EventsSearchParams);
  const today = Schema.decodeOption(EventDomain.DateKey)(
    dateKeyFromDate({ date: new Date() })
  );

  if (Option.isNone(search) || Option.isNone(today)) {
    return <Redirect href="/" />;
  }

  return (
    <EventTrackerRoute
      originDateKey={search.value.dateKey}
      todayDateKey={today.value}
    />
  );
}

function EventTrackerRoute({
  originDateKey,
  todayDateKey,
}: {
  readonly originDateKey: NutritionDomain.DateKey | undefined;
  readonly todayDateKey: EventDomain.DateKey;
}) {
  const machineAtom = useMemo(
    () => MobileMachine.make(eventTrackerMachine, { todayDateKey }),
    [todayDateKey]
  );
  const stateResult = useAtomValue(machineAtom.result);
  const send = useAtomSet(machineAtom.send);

  if (
    AsyncResult.isInitial(stateResult) ||
    AsyncResult.isFailure(stateResult)
  ) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading events" />
      </AppScreen>
    );
  }

  const snapshot = stateResult.value;
  const loading = EventTrackerStates.get(snapshot, "Loading").pipe(
    Option.getOrUndefined
  );
  const failure = EventTrackerStates.get(snapshot, "Failure").pipe(
    Option.getOrUndefined
  );
  const ready = EventTrackerStates.get(snapshot, "Ready").pipe(
    Option.getOrUndefined
  );

  if (loading !== undefined) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading events" />
      </AppScreen>
    );
  }

  if (failure !== undefined) {
    return (
      <AppScreen contentStyle={styles.stateScreen}>
        <AppHeader
          embedded
          leading={<EventTrackerBackButton originDateKey={originDateKey} />}
          shadow
          title="Events"
        />
        <Notice
          message={failure.notice.message}
          title="Events unavailable"
          tone="danger"
        />
        <Button
          icon={RotateCcw}
          onPress={() => {
            send(EventTrackerEvent.cases.Reload.make({}));
          }}
          variant="secondary"
        >
          Retry
        </Button>
      </AppScreen>
    );
  }

  if (ready === undefined) {
    return (
      <AppScreen contentStyle={styles.centered}>
        <LoadingView message="Loading events" />
      </AppScreen>
    );
  }

  const working = EventTrackerStates.get(snapshot, "Ready.Working").pipe(
    Option.getOrUndefined
  );
  const loadingOlder = working?.operation._tag === "LoadOlder";
  const busy = working !== undefined && !loadingOlder;
  const activeRecordableEvents = _sortRecordableEvents({
    recordableEvents: ready.data.recordableEvents,
  }).filter((recordableEvent) => recordableEvent.archivedAt === undefined);
  const tabs = [
    {
      accessibilityLabel: "Record events",
      key: "record",
      label: "Record",
    },
    {
      accessibilityLabel: "Manage events",
      key: "manage",
      label: "Manage",
    },
  ] as const;

  return (
    <View style={styles.screen}>
      <AppScreen
        contentStyle={styles.content}
        safeAreaEdges={["top", "bottom"]}
      >
        <AppHeader
          embedded
          leading={<EventTrackerBackButton originDateKey={originDateKey} />}
          shadow
          title="Events"
        />

        {ready.notice === null ? null : (
          <Notice message={ready.notice.message} tone={ready.notice.tone} />
        )}

        <PagerTabs
          activeIndex={ready.activeTab}
          onActiveIndexChange={(index) => {
            send(
              EventTrackerEvent.cases.SelectTab.make({
                index: index === 0 ? 0 : 1,
              })
            );
          }}
          tabBarPosition="bottom"
          tabs={[
            {
              ...tabs[0],
              content: (
                <RecordEventsPanel
                  activeRecordableEvents={activeRecordableEvents}
                  busy={busy}
                  detailDateKey={ready.detailDateKey}
                  detailRecordableEventId={ready.detailRecordableEventId}
                  editingDateKey={ready.editingDateKey}
                  loadedStartDateKey={ready.data.loadedStartDateKey}
                  loadingOlder={loadingOlder}
                  onCloseDayEditor={() => {
                    send(EventTrackerEvent.cases.CloseDayEditor.make({}));
                  }}
                  onCloseEventDetails={() => {
                    send(EventTrackerEvent.cases.CloseEventDetails.make({}));
                  }}
                  onDecrementPastEvent={(recordableEventId) => {
                    send(
                      EventTrackerEvent.cases.DecrementPastEvent.make({
                        recordableEventId,
                      })
                    );
                  }}
                  onDeleteRecordedEvent={(recordedEventId) => {
                    send(
                      EventTrackerEvent.cases.DeleteRecordedEvent.make({
                        recordedEventId,
                      })
                    );
                  }}
                  onLoadOlder={() => {
                    send(EventTrackerEvent.cases.LoadOlder.make({}));
                  }}
                  onIncrementPastEvent={(recordableEventId) => {
                    send(
                      EventTrackerEvent.cases.IncrementPastEvent.make({
                        recordableEventId,
                      })
                    );
                  }}
                  onOpenDayEditor={(dateKey) => {
                    send(
                      EventTrackerEvent.cases.OpenDayEditor.make({ dateKey })
                    );
                  }}
                  onOpenEventDetails={(input) => {
                    send(EventTrackerEvent.cases.OpenEventDetails.make(input));
                  }}
                  onRecordNow={(recordableEventId) => {
                    send(
                      EventTrackerEvent.cases.RecordNow.make({
                        recordableEventId,
                      })
                    );
                  }}
                  onRecordPastEvents={(input) => {
                    send(EventTrackerEvent.cases.RecordPastEvents.make(input));
                  }}
                  pastEventSelections={ready.pastEventSelections}
                  recordableEvents={ready.data.recordableEvents}
                  recordedEvents={ready.data.recordedEvents}
                  todayDateKey={ready.todayDateKey}
                />
              ),
            },
            {
              ...tabs[1],
              content: (
                <ManageEventsPanel
                  busy={busy}
                  editingRecordableEventId={ready.editingRecordableEventId}
                  emojiInput={ready.emojiInput}
                  nameInput={ready.nameInput}
                  onArchive={(recordableEventId) => {
                    send(
                      EventTrackerEvent.cases.ArchiveRecordableEvent.make({
                        recordableEventId,
                      })
                    );
                  }}
                  onBeginCreate={() => {
                    send(EventTrackerEvent.cases.BeginCreate.make({}));
                  }}
                  onCancelEdit={() => {
                    send(EventTrackerEvent.cases.CancelEdit.make({}));
                  }}
                  onChangeEmoji={(value) => {
                    send(EventTrackerEvent.cases.ChangeEmoji.make({ value }));
                  }}
                  onChangeName={(value) => {
                    send(EventTrackerEvent.cases.ChangeName.make({ value }));
                  }}
                  onEdit={(recordableEventId) => {
                    send(
                      EventTrackerEvent.cases.EditRecordableEvent.make({
                        recordableEventId,
                      })
                    );
                  }}
                  onSave={() => {
                    send(EventTrackerEvent.cases.SaveRecordableEvent.make({}));
                  }}
                  onUnarchive={(recordableEventId) => {
                    send(
                      EventTrackerEvent.cases.UnarchiveRecordableEvent.make({
                        recordableEventId,
                      })
                    );
                  }}
                  recordableEvents={ready.data.recordableEvents}
                />
              ),
            },
          ]}
        />
      </AppScreen>

      <LoadingOverlay
        message={EventTrackerViewModel.pendingMessage({
          state: working?.operation._tag,
        })}
        visible={busy}
      />
    </View>
  );
}

function EventTrackerBackButton({
  originDateKey,
}: {
  readonly originDateKey: NutritionDomain.DateKey | undefined;
}) {
  return (
    <IconButton
      accessibilityLabel="Back to day"
      icon={ChevronLeft}
      onPress={() => {
        if (router.canGoBack()) {
          router.back();
          return;
        }

        if (originDateKey === undefined) {
          router.replace("/");
          return;
        }

        router.replace({
          pathname: "/days/[dateKey]",
          params: { dateKey: originDateKey },
        });
      }}
      variant="ghost"
    />
  );
}

function RecordEventsPanel({
  activeRecordableEvents,
  busy,
  detailDateKey,
  detailRecordableEventId,
  editingDateKey,
  loadedStartDateKey,
  loadingOlder,
  onCloseDayEditor,
  onCloseEventDetails,
  onDecrementPastEvent,
  onDeleteRecordedEvent,
  onIncrementPastEvent,
  onLoadOlder,
  onOpenDayEditor,
  onOpenEventDetails,
  onRecordNow,
  onRecordPastEvents,
  pastEventSelections,
  recordableEvents,
  recordedEvents,
  todayDateKey,
}: {
  readonly activeRecordableEvents: readonly EventDomain.RecordableEvent[];
  readonly busy: boolean;
  readonly detailDateKey: EventDomain.DateKey | null;
  readonly detailRecordableEventId: EventDomain.RecordableEventId | null;
  readonly editingDateKey: EventDomain.DateKey | null;
  readonly loadedStartDateKey: EventDomain.DateKey;
  readonly loadingOlder: boolean;
  readonly onCloseDayEditor: () => void;
  readonly onCloseEventDetails: () => void;
  readonly onDecrementPastEvent: (
    recordableEventId: EventDomain.RecordableEventId
  ) => void;
  readonly onDeleteRecordedEvent: (
    recordedEventId: EventDomain.RecordedEventId
  ) => void;
  readonly onIncrementPastEvent: (
    recordableEventId: EventDomain.RecordableEventId
  ) => void;
  readonly onLoadOlder: () => void;
  readonly onOpenDayEditor: (dateKey: EventDomain.DateKey) => void;
  readonly onOpenEventDetails: (input: {
    readonly dateKey: EventDomain.DateKey;
    readonly recordableEventId: EventDomain.RecordableEventId;
  }) => void;
  readonly onRecordNow: (
    recordableEventId: EventDomain.RecordableEventId
  ) => void;
  readonly onRecordPastEvents: (input: {
    readonly dateKey: EventDomain.DateKey;
    readonly recordableEventIds: readonly EventDomain.RecordableEventId[];
  }) => void;
  readonly pastEventSelections: readonly PastEventSelection[];
  readonly recordableEvents: readonly EventDomain.RecordableEvent[];
  readonly recordedEvents: readonly EventDomain.RecordedEvent[];
  readonly todayDateKey: EventDomain.DateKey;
}) {
  const timelineDays = useMemo(
    () =>
      EventTrackerViewModel.makeTimelineDays({
        endDateKey: todayDateKey,
        recordedEvents,
        startDateKey: loadedStartDateKey,
      }),
    [loadedStartDateKey, recordedEvents, todayDateKey]
  );
  const detailRecordableEvent =
    detailRecordableEventId === null
      ? undefined
      : recordableEvents.find(
          (recordableEvent) => recordableEvent.id === detailRecordableEventId
        );
  const detailRecordedEvents =
    detailDateKey === null || detailRecordableEventId === null
      ? []
      : recordedEvents.filter(
          (recordedEvent) =>
            recordedEvent.dateKey === detailDateKey &&
            recordedEvent.recordableEventId === detailRecordableEventId
        );

  return (
    <View style={styles.timelinePanel}>
      <FlatList
        contentContainerStyle={styles.timelineListContent}
        data={timelineDays}
        keyExtractor={(day) => day.dateKey}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={
          <View style={styles.timelineFooter}>
            {loadingOlder ? (
              <>
                <ActivityIndicator color={color.primary} size="small" />
                <Text style={styles.timelineFooterText}>
                  Loading earlier days
                </Text>
              </>
            ) : (
              <Text style={styles.timelineFooterText}>
                Scroll for earlier days
              </Text>
            )}
          </View>
        }
        onEndReached={() => {
          if (!busy && !loadingOlder) {
            onLoadOlder();
          }
        }}
        onEndReachedThreshold={0.45}
        renderItem={({ item }) => (
          <EventTimelineDayRow
            busy={busy}
            day={item}
            hasActiveRecordableEvents={Array.isReadonlyArrayNonEmpty(
              activeRecordableEvents
            )}
            onOpenDay={() => {
              onOpenDayEditor(item.dateKey);
            }}
            onOpenEvent={(recordableEventId) => {
              onOpenEventDetails({
                dateKey: item.dateKey,
                recordableEventId,
              });
            }}
            recordableEvents={recordableEvents}
            todayDateKey={todayDateKey}
          />
        )}
        showsVerticalScrollIndicator={false}
        style={styles.timelineList}
      />

      <View style={styles.quickRecordDock}>
        {Array.isReadonlyArrayNonEmpty(activeRecordableEvents) ? (
          <ScrollView
            contentContainerStyle={styles.quickEventRow}
            horizontal
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
          >
            {activeRecordableEvents.map((recordableEvent) => (
              <QuickRecordEventButton
                disabled={busy}
                key={recordableEvent.id}
                onPress={() => {
                  onRecordNow(recordableEvent.id);
                }}
                recordableEvent={recordableEvent}
              />
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.emptyText}>
            Create an event in Manage to start recording.
          </Text>
        )}
      </View>

      {editingDateKey === null ? null : (
        <DayEventPickerDialog
          activeRecordableEvents={activeRecordableEvents}
          busy={busy}
          dateKey={editingDateKey}
          key={editingDateKey}
          onClose={onCloseDayEditor}
          onCommit={(recordableEventIds) => {
            onRecordPastEvents({
              dateKey: editingDateKey,
              recordableEventIds,
            });
          }}
          onDecrement={onDecrementPastEvent}
          onIncrement={onIncrementPastEvent}
          selections={pastEventSelections}
        />
      )}

      {detailDateKey === null ||
      detailRecordableEvent === undefined ||
      !Array.isReadonlyArrayNonEmpty(detailRecordedEvents) ? null : (
        <EventDetailsDialog
          busy={busy}
          dateKey={detailDateKey}
          onClose={onCloseEventDetails}
          onDelete={onDeleteRecordedEvent}
          recordableEvent={detailRecordableEvent}
          recordedEvents={detailRecordedEvents}
        />
      )}
    </View>
  );
}

type EventTimelineDay = {
  readonly dateKey: EventDomain.DateKey;
  readonly recordedEvents: readonly EventDomain.RecordedEvent[];
};

type EventTimelineDayRowProps = {
  readonly busy: boolean;
  readonly day: EventTimelineDay;
  readonly hasActiveRecordableEvents: boolean;
  readonly onOpenDay: () => void;
  readonly onOpenEvent: (
    recordableEventId: EventDomain.RecordableEventId
  ) => void;
  readonly recordableEvents: readonly EventDomain.RecordableEvent[];
  readonly todayDateKey: EventDomain.DateKey;
};

const EventTimelineDayRow = memo(
  function EventTimelineDayRow({
    busy,
    day,
    hasActiveRecordableEvents,
    onOpenDay,
    onOpenEvent,
    recordableEvents,
    todayDateKey,
  }: EventTimelineDayRowProps) {
    const isToday = day.dateKey === todayDateKey;
    const eventGroups = [
      ...EventTrackerViewModel.groupDayEvents({
        recordedEvents: day.recordedEvents,
      }),
    ].sort((left, right) => {
      const leftPosition =
        recordableEvents.find(
          (recordableEvent) => recordableEvent.id === left.recordableEventId
        )?.position ?? Number.MAX_SAFE_INTEGER;
      const rightPosition =
        recordableEvents.find(
          (recordableEvent) => recordableEvent.id === right.recordableEventId
        )?.position ?? Number.MAX_SAFE_INTEGER;

      return leftPosition - rightPosition;
    });
    const dayLabel = EventTrackerViewModel.formatTimelineDay({
      dateKey: day.dateKey,
      todayDateKey,
    });
    const dayDisabled = busy || isToday || !hasActiveRecordableEvents;

    return (
      <Pressable
        accessibilityLabel={
          isToday ? dayLabel.full : `Add events to ${dayLabel.full}`
        }
        accessibilityRole="button"
        accessibilityState={{ disabled: dayDisabled }}
        disabled={busy}
        onPress={() => {
          if (!dayDisabled) {
            onOpenDay();
          }
        }}
        style={({ pressed }) => [
          styles.timelineDay,
          isToday ? styles.timelineDayToday : null,
          pressed && !dayDisabled ? styles.timelineDayPressed : null,
          dayDisabled && !isToday ? styles.disabled : null,
        ]}
      >
        <View style={styles.timelineDate}>
          <View style={styles.timelineDateCopy}>
            <Text style={styles.timelineWeekday}>{dayLabel.weekday}</Text>
            <Text style={styles.timelineDateLabel}>{dayLabel.date}</Text>
          </View>
          <Text style={styles.timelineDayCount}>
            {day.recordedEvents.length}{" "}
            {day.recordedEvents.length === 1 ? "event" : "events"}
          </Text>
        </View>

        {Array.isReadonlyArrayNonEmpty(eventGroups) ? (
          <>
            <View style={styles.timelineDivider} />
            <View style={styles.timelineEvents}>
              {eventGroups.map((group) => {
                const recordableEvent = recordableEvents.find(
                  (candidate) => candidate.id === group.recordableEventId
                );

                return (
                  <Pressable
                    accessibilityLabel={`${recordableEvent?.name ?? "Event"}, recorded ${group.recordedEvents.length} ${group.recordedEvents.length === 1 ? "time" : "times"}`}
                    accessibilityRole="button"
                    disabled={busy}
                    key={group.recordableEventId}
                    onPress={(event) => {
                      event.stopPropagation();
                      onOpenEvent(group.recordableEventId);
                    }}
                    style={({ pressed }) => [
                      styles.timelineEvent,
                      pressed && !busy ? styles.pressed : null,
                      busy ? styles.disabled : null,
                    ]}
                  >
                    <Text style={styles.timelineEventEmoji}>
                      {recordableEvent?.emoji ?? "•"}
                    </Text>
                    {group.recordedEvents.length > 1 ? (
                      <View style={styles.timelineEventCount}>
                        <Text style={styles.timelineEventCountText}>
                          {group.recordedEvents.length}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}
      </Pressable>
    );
  },
  (...[previous, next]: [EventTimelineDayRowProps, EventTimelineDayRowProps]) =>
    previous.busy === next.busy &&
    previous.day === next.day &&
    previous.hasActiveRecordableEvents === next.hasActiveRecordableEvents &&
    previous.recordableEvents === next.recordableEvents &&
    previous.todayDateKey === next.todayDateKey
);

function DayEventPickerDialog({
  activeRecordableEvents,
  busy,
  dateKey,
  onClose,
  onCommit,
  onDecrement,
  onIncrement,
  selections,
}: {
  readonly activeRecordableEvents: readonly EventDomain.RecordableEvent[];
  readonly busy: boolean;
  readonly dateKey: EventDomain.DateKey;
  readonly onClose: () => void;
  readonly onCommit: (
    recordableEventIds: readonly EventDomain.RecordableEventId[]
  ) => void;
  readonly onDecrement: (
    recordableEventId: EventDomain.RecordableEventId
  ) => void;
  readonly onIncrement: (
    recordableEventId: EventDomain.RecordableEventId
  ) => void;
  readonly selections: readonly PastEventSelection[];
}) {
  const total = selections.reduce((sum, selection) => sum + selection.count, 0);

  return (
    <Modal
      animationType="fade"
      onRequestClose={() => {
        if (!busy) {
          onClose();
        }
      }}
      transparent
      visible
    >
      <Pressable
        accessibilityLabel="Close event picker"
        accessibilityRole="button"
        disabled={busy}
        onPress={onClose}
        style={styles.dialogBackdrop}
      >
        <View style={styles.eventDialog} onStartShouldSetResponder={() => true}>
          <View style={styles.dialogHeader}>
            <View style={styles.dialogTitleCopy}>
              <Text style={styles.dialogTitle}>
                {EventTrackerViewModel.formatDateHeading({ dateKey })}
              </Text>
              <Text style={styles.dialogSubtitle}>
                Use + more than once to record repeats.
              </Text>
            </View>
            <IconButton
              accessibilityLabel="Close event picker"
              disabled={busy}
              icon={X}
              onPress={onClose}
              variant="ghost"
            />
          </View>

          <ScrollView
            contentContainerStyle={styles.eventPickerList}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {activeRecordableEvents.map((recordableEvent) => {
              const count =
                selections.find(
                  (selection) =>
                    selection.recordableEventId === recordableEvent.id
                )?.count ?? 0;

              return (
                <View
                  key={recordableEvent.id}
                  style={[
                    styles.eventPickerTile,
                    busy ? styles.disabled : null,
                  ]}
                >
                  <View style={styles.eventPickerIdentity}>
                    <Text style={styles.eventPickerEmoji}>
                      {recordableEvent.emoji}
                    </Text>
                    <Text numberOfLines={2} style={styles.eventPickerName}>
                      {recordableEvent.name}
                    </Text>
                    {count > 0 ? (
                      <View
                        pointerEvents="none"
                        style={styles.eventPickerCountBadge}
                      >
                        <Text style={styles.eventPickerCount}>{count}</Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.eventPickerActions}>
                    <Pressable
                      accessibilityLabel={`Remove one ${recordableEvent.name}`}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: busy || count === 0 }}
                      disabled={busy || count === 0}
                      onPress={() => {
                        onDecrement(recordableEvent.id);
                      }}
                      style={({ pressed }) => [
                        styles.eventPickerAction,
                        styles.eventPickerRemove,
                        pressed && !busy && count > 0 ? styles.pressed : null,
                        count === 0 ? styles.disabled : null,
                      ]}
                    >
                      <Minus color={color.text} size={18} />
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`Add one ${recordableEvent.name}`}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: busy }}
                      disabled={busy}
                      onPress={() => {
                        onIncrement(recordableEvent.id);
                      }}
                      style={({ pressed }) => [
                        styles.eventPickerAction,
                        pressed && !busy ? styles.pressed : null,
                      ]}
                    >
                      <Plus color={color.text} size={18} />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.dialogActions}>
            <Button
              disabled={busy}
              onPress={onClose}
              style={styles.dialogAction}
              variant="secondary"
            >
              Cancel
            </Button>
            <Button
              disabled={busy || total === 0}
              onPress={() => {
                const recordableEventIds = activeRecordableEvents.flatMap(
                  (recordableEvent) =>
                    globalThis.Array.from(
                      {
                        length:
                          selections.find(
                            (selection) =>
                              selection.recordableEventId === recordableEvent.id
                          )?.count ?? 0,
                      },
                      () => recordableEvent.id
                    )
                );

                onCommit(recordableEventIds);
              }}
              style={styles.dialogAction}
            >
              Add {total === 0 ? "events" : total}
            </Button>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

function QuickRecordEventButton({
  disabled,
  onPress,
  recordableEvent,
}: {
  readonly disabled: boolean;
  readonly onPress: () => void;
  readonly recordableEvent: EventDomain.RecordableEvent;
}) {
  return (
    <Pressable
      accessibilityLabel={`Record ${recordableEvent.name} now`}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickEvent,
        pressed && !disabled ? styles.quickEventPressed : null,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <Text style={styles.quickEventEmoji}>{recordableEvent.emoji}</Text>
      <Text numberOfLines={1} style={styles.quickEventName}>
        {recordableEvent.name}
      </Text>
    </Pressable>
  );
}

function EventDetailsDialog({
  busy,
  dateKey,
  onClose,
  onDelete,
  recordableEvent,
  recordedEvents,
}: {
  readonly busy: boolean;
  readonly dateKey: EventDomain.DateKey;
  readonly onClose: () => void;
  readonly onDelete: (recordedEventId: EventDomain.RecordedEventId) => void;
  readonly recordableEvent: EventDomain.RecordableEvent;
  readonly recordedEvents: readonly EventDomain.RecordedEvent[];
}) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={() => {
        if (!busy) {
          onClose();
        }
      }}
      transparent
      visible
    >
      <Pressable
        accessibilityLabel="Close event details"
        accessibilityRole="button"
        disabled={busy}
        onPress={onClose}
        style={styles.dialogBackdrop}
      >
        <View style={styles.eventDialog} onStartShouldSetResponder={() => true}>
          <View style={styles.dialogHeader}>
            <View style={styles.dialogTitleCopy}>
              <View style={styles.eventDetailTitleRow}>
                <Text style={styles.eventDetailEmoji}>
                  {recordableEvent.emoji}
                </Text>
                <Text numberOfLines={1} style={styles.dialogTitle}>
                  {recordableEvent.name}
                </Text>
              </View>
              <Text style={styles.dialogSubtitle}>
                Recorded {recordedEvents.length}{" "}
                {recordedEvents.length === 1 ? "time" : "times"} on{" "}
                {EventTrackerViewModel.formatShortDate({ dateKey })}
              </Text>
            </View>
            <IconButton
              accessibilityLabel="Close event details"
              disabled={busy}
              icon={X}
              onPress={onClose}
              variant="ghost"
            />
          </View>

          <View style={styles.eventOccurrenceList}>
            {recordedEvents.map((recordedEvent, index) => (
              <View key={recordedEvent.id} style={styles.eventOccurrenceRow}>
                <View style={styles.eventOccurrenceCopy}>
                  <Text style={styles.eventOccurrenceLabel}>
                    Recording {index + 1}
                  </Text>
                  <Text style={styles.eventOccurrenceTime}>
                    {EventTrackerViewModel.formatOccurrenceTime({
                      recordedEvent,
                    }) ?? "No exact time"}
                  </Text>
                </View>
                <IconButton
                  accessibilityLabel={`Remove recording ${index + 1} of ${recordableEvent.name}`}
                  disabled={busy}
                  icon={Trash2}
                  iconColor={color.dangerText}
                  iconSize={18}
                  onPress={() => {
                    Alert.alert(
                      "Remove this recording?",
                      `${recordableEvent.emoji} ${recordableEvent.name} will be removed from ${EventTrackerViewModel.formatDateHeading({ dateKey })}.`,
                      [
                        { style: "cancel", text: "Cancel" },
                        {
                          onPress: () => {
                            onDelete(recordedEvent.id);
                          },
                          style: "destructive",
                          text: "Remove",
                        },
                      ]
                    );
                  }}
                  style={styles.eventOccurrenceDelete}
                />
              </View>
            ))}
          </View>

          <Button disabled={busy} onPress={onClose} variant="secondary">
            Close
          </Button>
        </View>
      </Pressable>
    </Modal>
  );
}

function ManageEventsPanel({
  busy,
  editingRecordableEventId,
  emojiInput,
  nameInput,
  onArchive,
  onBeginCreate,
  onCancelEdit,
  onChangeEmoji,
  onChangeName,
  onEdit,
  onSave,
  onUnarchive,
  recordableEvents,
}: {
  readonly busy: boolean;
  readonly editingRecordableEventId: EventDomain.RecordableEventId | null;
  readonly emojiInput: string;
  readonly nameInput: string;
  readonly onArchive: (
    recordableEventId: EventDomain.RecordableEventId
  ) => void;
  readonly onBeginCreate: () => void;
  readonly onCancelEdit: () => void;
  readonly onChangeEmoji: (value: string) => void;
  readonly onChangeName: (value: string) => void;
  readonly onEdit: (recordableEventId: EventDomain.RecordableEventId) => void;
  readonly onSave: () => void;
  readonly onUnarchive: (
    recordableEventId: EventDomain.RecordableEventId
  ) => void;
  readonly recordableEvents: readonly EventDomain.RecordableEvent[];
}) {
  const sortedRecordableEvents = _sortRecordableEvents({ recordableEvents });
  const activeRecordableEvents = sortedRecordableEvents.filter(
    (recordableEvent) => recordableEvent.archivedAt === undefined
  );
  const archivedRecordableEvents = sortedRecordableEvents.filter(
    (recordableEvent) => recordableEvent.archivedAt !== undefined
  );
  const nameValid = Option.isSome(
    Schema.decodeOption(EventDomain.RecordableEventName)(nameInput)
  );
  const emojiValid = Option.isSome(
    Schema.decodeOption(EventDomain.EventEmoji)(emojiInput)
  );
  const editing = editingRecordableEventId !== null;

  return (
    <KeyboardAwareScrollView
      alwaysBounceVertical={false}
      bottomOffset={spacing.lg}
      contentContainerStyle={styles.panelContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={styles.panelScroll}
    >
      <SectionCard
        subtitle="Names must be unique. Use exactly one emoji from your device keyboard."
        title={editing ? "Edit event" : "Create event"}
      >
        <View style={styles.formStack}>
          <Field
            autoCapitalize="words"
            autoCorrect={false}
            editable={!busy}
            label="Name"
            onChangeText={onChangeName}
            placeholder="Morning walk"
            value={nameInput}
          />
          <Field
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            error={
              emojiInput.length > 0 && !emojiValid
                ? "Enter exactly one emoji."
                : undefined
            }
            helperText="Open your device emoji keyboard and choose one emoji."
            label="Emoji"
            onChangeText={onChangeEmoji}
            placeholder="🚶"
            value={emojiInput}
          />
          <View style={styles.formActions}>
            {editing ? (
              <Button
                disabled={busy}
                icon={X}
                onPress={onCancelEdit}
                style={styles.formAction}
                variant="secondary"
              >
                Cancel
              </Button>
            ) : null}
            <Button
              disabled={busy || !nameValid || !emojiValid}
              icon={editing ? Save : Plus}
              onPress={onSave}
              style={styles.formAction}
            >
              {editing ? "Save changes" : "Create event"}
            </Button>
          </View>
        </View>
      </SectionCard>

      <View style={styles.sectionStack}>
        <View style={styles.manageSectionHeading}>
          <View style={styles.manageHeadingCopy}>
            <Text style={styles.sectionTitle}>Active events</Text>
            <Text style={styles.sectionSubtitle}>
              Active events keep their order when edited or archived.
            </Text>
          </View>
          {editing ? (
            <Button
              disabled={busy}
              icon={Plus}
              onPress={onBeginCreate}
              variant="ghost"
            >
              New
            </Button>
          ) : null}
        </View>

        {!Array.isReadonlyArrayNonEmpty(activeRecordableEvents) ? (
          <Notice
            message="Create an event above or restore one from the archive."
            title="No active events"
            tone="neutral"
          />
        ) : (
          <View style={styles.definitionList}>
            {activeRecordableEvents.map((recordableEvent) => (
              <RecordableEventRow
                archived={false}
                busy={busy}
                key={recordableEvent.id}
                onArchive={() => {
                  onArchive(recordableEvent.id);
                }}
                onEdit={() => {
                  onEdit(recordableEvent.id);
                }}
                onUnarchive={() => {
                  onUnarchive(recordableEvent.id);
                }}
                recordableEvent={recordableEvent}
                selected={editingRecordableEventId === recordableEvent.id}
              />
            ))}
          </View>
        )}
      </View>

      <View style={styles.sectionStack}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Archived events</Text>
          <Text style={styles.sectionSubtitle}>
            Archived events stay in history and can be restored.
          </Text>
        </View>

        {!Array.isReadonlyArrayNonEmpty(archivedRecordableEvents) ? (
          <Text style={styles.emptyText}>No archived events.</Text>
        ) : (
          <View style={styles.definitionList}>
            {archivedRecordableEvents.map((recordableEvent) => (
              <RecordableEventRow
                archived
                busy={busy}
                key={recordableEvent.id}
                onArchive={() => {
                  onArchive(recordableEvent.id);
                }}
                onEdit={() => {
                  onEdit(recordableEvent.id);
                }}
                onUnarchive={() => {
                  onUnarchive(recordableEvent.id);
                }}
                recordableEvent={recordableEvent}
                selected={editingRecordableEventId === recordableEvent.id}
              />
            ))}
          </View>
        )}
      </View>
    </KeyboardAwareScrollView>
  );
}

function RecordableEventRow({
  archived,
  busy,
  onArchive,
  onEdit,
  onUnarchive,
  recordableEvent,
  selected,
}: {
  readonly archived: boolean;
  readonly busy: boolean;
  readonly onArchive: () => void;
  readonly onEdit: () => void;
  readonly onUnarchive: () => void;
  readonly recordableEvent: EventDomain.RecordableEvent;
  readonly selected: boolean;
}) {
  return (
    <View
      accessibilityLabel={`${recordableEvent.name}, ${archived ? "archived" : "active"}`}
      style={[
        styles.definitionRow,
        selected ? styles.definitionRowSelected : null,
      ]}
    >
      <Text style={styles.definitionEmoji}>{recordableEvent.emoji}</Text>
      <View style={styles.definitionCopy}>
        <Text numberOfLines={1} style={styles.definitionName}>
          {recordableEvent.name}
        </Text>
        <Text style={styles.definitionPosition}>
          Position {recordableEvent.position + 1}
        </Text>
      </View>
      <View style={styles.definitionActions}>
        <IconButton
          accessibilityLabel={`Edit ${recordableEvent.name}`}
          disabled={busy}
          icon={Pencil}
          iconSize={18}
          onPress={onEdit}
          strokeWidth={2.6}
        />
        <IconButton
          accessibilityLabel={`${archived ? "Restore" : "Archive"} ${recordableEvent.name}`}
          disabled={busy}
          icon={archived ? ArchiveRestore : Archive}
          iconColor={archived ? color.safeText : color.warningText}
          iconSize={18}
          onPress={archived ? onUnarchive : onArchive}
          strokeWidth={2.6}
        />
      </View>
    </View>
  );
}

function _mergeRecordedEvents({
  current,
  incoming,
}: {
  readonly current: readonly EventDomain.RecordedEvent[];
  readonly incoming: readonly EventDomain.RecordedEvent[];
}) {
  const recordedEventsById = HashMap.fromIterable(
    [...current, ...incoming].map(
      (recordedEvent) => [recordedEvent.id, recordedEvent] as const
    )
  );

  return _sortRecordedEvents({
    recordedEvents: globalThis.Array.from(HashMap.values(recordedEventsById)),
  });
}

function _upsertRecordableEvent({
  data,
  recordableEvent,
}: {
  readonly data: EventTrackerData | null;
  readonly recordableEvent: EventDomain.RecordableEvent;
}) {
  if (data === null) {
    return null;
  }

  const existing = data.recordableEvents.some(
    (candidate) => candidate.id === recordableEvent.id
  );
  const recordableEvents = existing
    ? data.recordableEvents.map((candidate) =>
        candidate.id === recordableEvent.id ? recordableEvent : candidate
      )
    : [...data.recordableEvents, recordableEvent];

  return {
    ...data,
    recordableEvents: _sortRecordableEvents({ recordableEvents }),
  };
}

function _sortRecordableEvents({
  recordableEvents,
}: {
  readonly recordableEvents: readonly EventDomain.RecordableEvent[];
}) {
  return [...recordableEvents].sort((left, right) => {
    const positionOrder = left.position - right.position;

    if (positionOrder !== 0) {
      return positionOrder;
    }

    const createdAtOrder =
      DateTime.toEpochMillis(left.createdAt) -
      DateTime.toEpochMillis(right.createdAt);

    return createdAtOrder === 0
      ? left.id.localeCompare(right.id)
      : createdAtOrder;
  });
}

function _sortRecordedEvents({
  recordedEvents,
}: {
  readonly recordedEvents: readonly EventDomain.RecordedEvent[];
}) {
  return [...recordedEvents].sort((left, right) => {
    const dateOrder = right.dateKey.localeCompare(left.dateKey);

    if (dateOrder !== 0) {
      return dateOrder;
    }

    const leftOccurrence =
      left.occurredAt === undefined
        ? null
        : DateTime.toEpochMillis(left.occurredAt);
    const rightOccurrence =
      right.occurredAt === undefined
        ? null
        : DateTime.toEpochMillis(right.occurredAt);

    if (leftOccurrence !== null && rightOccurrence !== null) {
      const occurrenceOrder = rightOccurrence - leftOccurrence;

      if (occurrenceOrder !== 0) {
        return occurrenceOrder;
      }
    } else if (leftOccurrence !== null) {
      return -1;
    } else if (rightOccurrence !== null) {
      return 1;
    }

    const createdAtOrder =
      DateTime.toEpochMillis(right.createdAt) -
      DateTime.toEpochMillis(left.createdAt);

    return createdAtOrder === 0
      ? right.id.localeCompare(left.id)
      : createdAtOrder;
  });
}

function _shiftDateKey({
  dateKey,
  days,
}: {
  readonly dateKey: EventDomain.DateKey;
  readonly days: number;
}) {
  const date = EventTrackerViewModel.dateFromDateKey({ dateKey });
  const targetDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + days
  );

  return Schema.decodeOption(EventDomain.DateKey)(
    dateKeyFromDate({ date: targetDate })
  ).pipe(Option.getOrElse(() => dateKey));
}

const EventTrackerViewModel = {
  dateFromDateKey({ dateKey }: { readonly dateKey: EventDomain.DateKey }) {
    const [yearString, monthString, dayString] = dateKey.split("-");

    return new Date(
      Number(yearString),
      Number(monthString) - 1,
      Number(dayString)
    );
  },
  formatDateHeading({ dateKey }: { readonly dateKey: EventDomain.DateKey }) {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "long",
      weekday: "long",
      year: "numeric",
    }).format(EventTrackerViewModel.dateFromDateKey({ dateKey }));
  },
  formatOccurrenceTime({
    recordedEvent,
  }: {
    readonly recordedEvent: EventDomain.RecordedEvent;
  }) {
    if (recordedEvent.occurredAt === undefined) {
      return null;
    }

    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(DateTime.toEpochMillis(recordedEvent.occurredAt)));
  },
  formatShortDate({ dateKey }: { readonly dateKey: EventDomain.DateKey }) {
    return new Intl.DateTimeFormat(undefined, {
      day: "numeric",
      month: "short",
    }).format(EventTrackerViewModel.dateFromDateKey({ dateKey }));
  },
  formatTimelineDay({
    dateKey,
    todayDateKey,
  }: {
    readonly dateKey: EventDomain.DateKey;
    readonly todayDateKey: EventDomain.DateKey;
  }) {
    const date = EventTrackerViewModel.dateFromDateKey({ dateKey });

    return {
      date: new Intl.DateTimeFormat(undefined, {
        day: "numeric",
        month: "short",
      }).format(date),
      full: EventTrackerViewModel.formatDateHeading({ dateKey }),
      isToday: dateKey === todayDateKey,
      weekday: new Intl.DateTimeFormat(undefined, {
        weekday: "short",
      }).format(date),
    };
  },
  groupDayEvents({
    recordedEvents,
  }: {
    readonly recordedEvents: readonly EventDomain.RecordedEvent[];
  }): readonly {
    readonly recordableEventId: EventDomain.RecordableEventId;
    readonly recordedEvents: readonly EventDomain.RecordedEvent[];
  }[] {
    return _sortRecordedEvents({ recordedEvents }).reduce<
      readonly {
        readonly recordableEventId: EventDomain.RecordableEventId;
        readonly recordedEvents: readonly EventDomain.RecordedEvent[];
      }[]
    >((groups, recordedEvent) => {
      const existingGroup = groups.find(
        (group) => group.recordableEventId === recordedEvent.recordableEventId
      );

      return existingGroup === undefined
        ? [
            ...groups,
            {
              recordableEventId: recordedEvent.recordableEventId,
              recordedEvents: [recordedEvent],
            },
          ]
        : groups.map((group) =>
            group.recordableEventId === recordedEvent.recordableEventId
              ? {
                  ...group,
                  recordedEvents: [...group.recordedEvents, recordedEvent],
                }
              : group
          );
    }, []);
  },
  makeTimelineDays({
    endDateKey,
    recordedEvents,
    startDateKey,
  }: {
    readonly endDateKey: EventDomain.DateKey;
    readonly recordedEvents: readonly EventDomain.RecordedEvent[];
    readonly startDateKey: EventDomain.DateKey;
  }): readonly EventTimelineDay[] {
    const recordedEventsByDate = recordedEvents.reduce(
      (eventsByDate, recordedEvent) =>
        HashMap.modifyAt(
          eventsByDate,
          recordedEvent.dateKey,
          Option.match({
            onNone: () => Option.some([recordedEvent]),
            onSome: (dayEvents) => Option.some([...dayEvents, recordedEvent]),
          })
        ),
      HashMap.empty<EventDomain.DateKey, readonly EventDomain.RecordedEvent[]>()
    );

    const days: EventTimelineDay[] = [];
    let currentDateKey = endDateKey;

    while (currentDateKey >= startDateKey) {
      days.push({
        dateKey: currentDateKey,
        recordedEvents: _sortRecordedEvents({
          recordedEvents: HashMap.get(
            recordedEventsByDate,
            currentDateKey
          ).pipe(Option.getOrElse(() => [])),
        }),
      });

      const previousDateKey = _shiftDateKey({
        dateKey: currentDateKey,
        days: -1,
      });

      if (previousDateKey === currentDateKey) {
        break;
      }

      currentDateKey = previousDateKey;
    }

    return days;
  },
  pendingMessage({ state }: { readonly state: unknown }) {
    if (state === "RecordNow") {
      return "Recording event";
    }

    if (state === "RecordPastEvents") {
      return "Recording past events";
    }

    if (state === "DeleteRecordedEvent") {
      return "Deleting recorded event";
    }

    if (state === "SaveRecordableEvent") {
      return "Saving event";
    }

    return "Updating event";
  },
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: color.bg,
  },
  content: {
    flex: 1,
    gap: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: 0,
  },
  centered: {
    justifyContent: "center",
  },
  stateScreen: {
    gap: spacing.lg,
  },
  timelinePanel: {
    minHeight: 0,
    flex: 1,
    gap: spacing.sm,
  },
  timelineList: {
    flex: 1,
  },
  timelineListContent: {
    gap: spacing.xs,
    paddingBottom: spacing.lg,
  },
  timelineDay: {
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    overflow: "hidden",
  },
  timelineDayToday: {
    borderColor: color.primary,
    borderWidth: 2,
  },
  timelineDayPressed: {
    borderColor: color.primary,
    backgroundColor: color.primarySoft,
  },
  timelineDate: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  timelineDateCopy: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  timelineDivider: {
    height: 1,
    backgroundColor: color.sheetBorder,
  },
  timelineWeekday: {
    color: color.textSubtle,
    textTransform: "uppercase",
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xs,
  },
  timelineDateLabel: {
    color: color.text,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.md,
  },
  timelineDayCount: {
    flexShrink: 0,
    color: color.textSubtle,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.xs,
  },
  timelineEvents: {
    minHeight: 60,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  timelineEvent: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: color.fieldBorder,
    borderRadius: radius.pill,
    backgroundColor: color.field,
  },
  timelineEventEmoji: {
    fontSize: 21,
    lineHeight: 27,
  },
  timelineEventCount: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 19,
    height: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: color.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xxs,
    backgroundColor: color.primary,
  },
  timelineEventCountText: {
    color: color.white,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xs,
  },
  timelineFooter: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  timelineFooterText: {
    color: color.textSubtle,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.xs,
  },
  quickRecordDock: {
    borderTopWidth: 1,
    borderTopColor: color.sheetBorder,
    paddingTop: spacing.sm,
    backgroundColor: color.bg,
  },
  dialogBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  eventDialog: {
    width: "100%",
    maxHeight: "82%",
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.lg,
    padding: spacing.lg,
    backgroundColor: color.surface,
  },
  dialogHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  dialogTitleCopy: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xs,
  },
  dialogTitle: {
    minWidth: 0,
    flexShrink: 1,
    color: color.text,
    fontSize: tokens.type.size.lg,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.lg,
  },
  dialogSubtitle: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.sm,
  },
  eventPickerList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    padding: spacing.xs,
  },
  eventPickerTile: {
    width: "30%",
    minHeight: 124,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: color.fieldBorder,
    borderRadius: radius.md,
    backgroundColor: color.field,
  },
  eventPickerIdentity: {
    position: "relative",
    minHeight: 88,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    padding: spacing.sm,
  },
  eventPickerCountBadge: {
    position: "absolute",
    top: spacing.xs,
    right: spacing.xs,
    minWidth: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    backgroundColor: color.primary,
  },
  eventPickerActions: {
    height: 36,
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: color.fieldBorder,
  },
  eventPickerAction: {
    minWidth: 0,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  eventPickerRemove: {
    borderRightWidth: 1,
    borderRightColor: color.fieldBorder,
  },
  eventPickerEmoji: {
    textAlign: "center",
    fontSize: 24,
    lineHeight: 30,
  },
  eventPickerName: {
    width: "100%",
    color: color.text,
    textAlign: "center",
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.sm,
  },
  eventPickerCount: {
    color: color.white,
    textAlign: "center",
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.xs,
  },
  dialogActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  dialogAction: {
    minWidth: 0,
    flex: 1,
  },
  eventDetailTitleRow: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  eventDetailEmoji: {
    flexShrink: 0,
    fontSize: 30,
    lineHeight: 38,
  },
  eventOccurrenceList: {
    gap: spacing.sm,
  },
  eventOccurrenceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: color.fieldBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: color.field,
  },
  eventOccurrenceCopy: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xxs,
  },
  eventOccurrenceLabel: {
    color: color.text,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.sm,
  },
  eventOccurrenceTime: {
    color: color.textMuted,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.xs,
  },
  eventOccurrenceDelete: {
    flexShrink: 0,
    borderColor: color.dangerBorder,
    backgroundColor: color.dangerBg,
  },
  noticeStack: {
    gap: spacing.sm,
  },
  noticeActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  noticeAction: {
    minWidth: 112,
  },
  panelScroll: {
    flex: 1,
  },
  panelContent: {
    gap: spacing.xxl,
    paddingBottom: spacing.xxl,
  },
  sectionStack: {
    gap: spacing.md,
  },
  sectionHeading: {
    gap: spacing.xs,
  },
  sectionTitle: {
    color: color.text,
    fontSize: tokens.type.size.lg,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.lg,
  },
  sectionSubtitle: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.sm,
  },
  quickEventRow: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  quickEvent: {
    width: 82,
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxs,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: radius.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: color.primarySoft,
  },
  quickEventPressed: {
    borderColor: color.primary,
  },
  quickEventEmoji: {
    fontSize: 27,
    lineHeight: 34,
  },
  quickEventName: {
    color: color.text,
    textAlign: "center",
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.sm,
  },
  backdateStack: {
    gap: spacing.xl,
  },
  pastEventRow: {
    gap: spacing.sm,
  },
  pastEventOption: {
    minWidth: 104,
    maxWidth: 160,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: color.fieldBorder,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: color.field,
  },
  pastEventOptionSelected: {
    borderColor: color.primary,
    backgroundColor: color.primarySoft,
  },
  pastEventEmoji: {
    fontSize: 20,
    lineHeight: 24,
  },
  pastEventName: {
    minWidth: 0,
    flexShrink: 1,
    color: color.text,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.bold,
    lineHeight: tokens.type.lineHeight.sm,
  },
  emptyText: {
    color: color.textMuted,
    fontSize: tokens.type.size.sm,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.sm,
  },
  historyStack: {
    gap: spacing.md,
  },
  historyRows: {
    gap: spacing.md,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  historyEmoji: {
    width: 34,
    textAlign: "center",
    fontSize: 25,
    lineHeight: 32,
  },
  historyCopy: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xxs,
  },
  historyName: {
    color: color.text,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.md,
  },
  historyTime: {
    color: color.textMuted,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.xs,
  },
  historyDelete: {
    flexShrink: 0,
    borderColor: color.dangerBorder,
    backgroundColor: color.dangerBg,
  },
  formStack: {
    gap: spacing.lg,
  },
  formActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  formAction: {
    minWidth: 0,
    flex: 1,
  },
  manageSectionHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  manageHeadingCopy: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xs,
  },
  definitionList: {
    gap: spacing.sm,
  },
  definitionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: color.sheetBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: color.surface,
  },
  definitionRowSelected: {
    borderColor: color.primary,
    backgroundColor: color.primarySoft,
  },
  definitionEmoji: {
    width: 38,
    textAlign: "center",
    fontSize: 28,
    lineHeight: 36,
  },
  definitionCopy: {
    minWidth: 0,
    flex: 1,
    gap: spacing.xxs,
  },
  definitionName: {
    color: color.text,
    fontSize: tokens.type.size.md,
    fontWeight: tokens.type.weight.black,
    lineHeight: tokens.type.lineHeight.md,
  },
  definitionPosition: {
    color: color.textSubtle,
    fontSize: tokens.type.size.xs,
    fontWeight: tokens.type.weight.semibold,
    lineHeight: tokens.type.lineHeight.xs,
  },
  definitionActions: {
    flexShrink: 0,
    flexDirection: "row",
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.84,
  },
  disabled: {
    opacity: 0.5,
  },
});
