import * as EventDomain from "@mai/event-tracking/domain";
import * as RecordableEventsService from "@mai/event-tracking/services/recordable-events";
import * as RecordedEventsService from "@mai/event-tracking/services/recorded-events";
import { Machine } from "@typeonce/effect-machine";
import {
  Array,
  Clock,
  DateTime,
  Effect,
  HashMap,
  Option,
  Schema,
  Stream,
} from "effect";

import { dateKeyFromDate } from "../lib/date-keys.ts";
import { AppActivity } from "./services/app-activity.ts";

export const EventTimelinePageSize = 30;

const TrackerNotice = Schema.Struct({
  message: Schema.String,
  tone: Schema.Literals(["danger", "neutral", "success"]),
});

export const EventTrackerData = Schema.Struct({
  loadedStartDateKey: EventDomain.DateKey,
  recordableEvents: Schema.Array(EventDomain.RecordableEvent),
  recordedEvents: Schema.Array(EventDomain.RecordedEvent),
});

export type EventTrackerData = typeof EventTrackerData.Type;

const RecordEventInput = Schema.Struct({
  recordableEventId: EventDomain.RecordableEventId,
});

const RecordPastEventsInput = Schema.Struct({
  dateKey: EventDomain.DateKey,
  recordableEventIds: Schema.Array(EventDomain.RecordableEventId).check(
    Schema.isNonEmpty()
  ),
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

const PastEventSelection = Schema.Struct({
  count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  recordableEventId: EventDomain.RecordableEventId,
});

export type PastEventSelection = typeof PastEventSelection.Type;

export const sortRecordableEvents = ({
  recordableEvents,
}: {
  readonly recordableEvents: readonly EventDomain.RecordableEvent[];
}) =>
  [...recordableEvents].sort((left, right) => {
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

export const sortRecordedEvents = ({
  recordedEvents,
}: {
  readonly recordedEvents: readonly EventDomain.RecordedEvent[];
}) =>
  [...recordedEvents].sort((left, right) => {
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

export const shiftEventDateKey = ({
  dateKey,
  days,
}: {
  readonly dateKey: EventDomain.DateKey;
  readonly days: number;
}) => {
  const [yearString, monthString, dayString] = dateKey.split("-");
  const targetDate = new Date(
    Number(yearString),
    Number(monthString) - 1,
    Number(dayString) + days
  );

  return Schema.decodeOption(EventDomain.DateKey)(
    dateKeyFromDate({ date: targetDate })
  ).pipe(Option.getOrElse(() => dateKey));
};

const _mergeRecordedEvents = ({
  current,
  incoming,
}: {
  readonly current: readonly EventDomain.RecordedEvent[];
  readonly incoming: readonly EventDomain.RecordedEvent[];
}) =>
  sortRecordedEvents({
    recordedEvents: globalThis.Array.from(
      HashMap.values(
        HashMap.fromIterable(
          [...current, ...incoming].map(
            (recordedEvent) => [recordedEvent.id, recordedEvent] as const
          )
        )
      )
    ),
  });

const _upsertRecordableEvent = ({
  data,
  recordableEvent,
}: {
  readonly data: EventTrackerData;
  readonly recordableEvent: EventDomain.RecordableEvent;
}) => ({
  ...data,
  recordableEvents: sortRecordableEvents({
    recordableEvents: data.recordableEvents.some(
      (candidate) => candidate.id === recordableEvent.id
    )
      ? data.recordableEvents.map((candidate) =>
          candidate.id === recordableEvent.id ? recordableEvent : candidate
        )
      : [...data.recordableEvents, recordableEvent],
  }),
});

const _danger = (message: string) => ({
  message,
  tone: "danger" as const,
});

const _loadRecordedEventRange = ({
  endDateKey,
}: {
  readonly endDateKey: EventDomain.DateKey;
}) =>
  Effect.gen(function* () {
    const recordedEvents = yield* RecordedEventsService.RecordedEvents;
    const startDateKey = shiftEventDateKey({
      dateKey: endDateKey,
      days: -(EventTimelinePageSize - 1),
    });

    return {
      loadedStartDateKey: startDateKey,
      recordedEvents: yield* recordedEvents.listRange({
        input: { endDateKey, startDateKey },
      }),
    };
  });

export const EventTrackerStates = Machine.state({
  fields: { todayDateKey: EventDomain.DateKey },
  states: {
    Loading: {},
    Failure: { fields: { message: Schema.String } },
    Loaded: {
      fields: {
        data: EventTrackerData,
        detailDateKey: Schema.NullOr(EventDomain.DateKey),
        detailRecordableEventId: Schema.NullOr(EventDomain.RecordableEventId),
        editingDateKey: Schema.NullOr(EventDomain.DateKey),
        editingRecordableEventId: Schema.NullOr(EventDomain.RecordableEventId),
        emojiInput: Schema.String,
        nameInput: Schema.String,
        notice: Schema.NullOr(TrackerNotice),
        pastEventSelections: Schema.Array(PastEventSelection),
      },
      states: {
        Ready: {},
        LoadingOlder: {},
        RecordingNow: { fields: RecordEventInput.fields },
        RecordingPastEvents: { fields: RecordPastEventsInput.fields },
        DeletingRecordedEvent: { fields: DeleteRecordedEventInput.fields },
        SavingRecordableEvent: { fields: { input: SaveRecordableEventInput } },
        TogglingRecordableEvent: { fields: ToggleRecordableEventInput.fields },
      },
    },
  },
});

export const EventTrackerEvents = Machine.events({
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
  UnarchiveRecordableEvent: RecordEventInput.fields,
});

export const EventTrackerMachine = Machine.make({
  id: "EventTracker",
  root: EventTrackerStates,
  events: EventTrackerEvents,
  input: Schema.Struct({ todayDateKey: EventDomain.DateKey }),
  effects: {
    loadEventTracker: (todayDateKey: EventDomain.DateKey) =>
      Effect.gen(function* () {
        const recordableEvents =
          yield* RecordableEventsService.RecordableEvents;
        const loadedRecordableEvents = yield* recordableEvents.list();
        const range = yield* _loadRecordedEventRange({
          endDateKey: todayDateKey,
        });

        return { ...range, recordableEvents: loadedRecordableEvents };
      }),
    loadOlderEvents: (loadedStartDateKey: EventDomain.DateKey) =>
      _loadRecordedEventRange({
        endDateKey: shiftEventDateKey({
          dateKey: loadedStartDateKey,
          days: -1,
        }),
      }),
    deleteRecordedEvent: (input: typeof DeleteRecordedEventInput.Type) =>
      Effect.gen(function* () {
        const recordedEvents = yield* RecordedEventsService.RecordedEvents;
        const deleted = yield* recordedEvents.delete({ input });

        return {
          _tag: "Deleted" as const,
          recordedEvent: deleted.recordedEvent,
        };
      }).pipe(
        Effect.catchTags({
          RecordedEventNotFound: () =>
            Effect.succeed({
              _tag: "Failed" as const,
              message: "This recorded event no longer exists.",
            }),
          SchemaError: () =>
            Effect.succeed({
              _tag: "Failed" as const,
              message: "The recorded event could not be validated.",
            }),
        }),
        Effect.catch(() =>
          Effect.succeed({
            _tag: "Failed" as const,
            message: "Could not delete the recorded event. Please try again.",
          })
        )
      ),
    recordNow: (input: typeof RecordEventInput.Type) =>
      Effect.gen(function* () {
        const recordedEvents = yield* RecordedEventsService.RecordedEvents;
        const recorded = yield* recordedEvents.recordNow({ input });

        return {
          _tag: "Recorded" as const,
          recordableEvent: recorded.recordableEvent,
          recordedEvent: recorded.recordedEvent,
        };
      }).pipe(
        Effect.catchTags({
          RecordableEventArchived: () =>
            Effect.succeed({
              _tag: "Failed" as const,
              message: "This event is archived and cannot be recorded.",
            }),
          RecordableEventNotFound: () =>
            Effect.succeed({
              _tag: "Failed" as const,
              message: "This event no longer exists.",
            }),
          SchemaError: () =>
            Effect.succeed({
              _tag: "Failed" as const,
              message: "The event could not be validated.",
            }),
        }),
        Effect.tapCause((cause) =>
          Effect.logError("Could not record event", cause)
        ),
        Effect.catch(() =>
          Effect.succeed({
            _tag: "Failed" as const,
            message: "Could not record the event. Please try again.",
          })
        )
      ),
    recordPastEvents: (input: typeof RecordPastEventsInput.Type) =>
      Effect.gen(function* () {
        const recordedEvents = yield* RecordedEventsService.RecordedEvents;
        const recorded = yield* recordedEvents.recordManyOnPastDay({
          input,
        });

        return {
          _tag: "Recorded" as const,
          recordedEvents: recorded.recordedEvents,
        };
      }).pipe(
        Effect.catchTags({
          RecordableEventArchived: () =>
            Effect.succeed({
              _tag: "Failed" as const,
              message: "This event is archived and cannot be recorded.",
            }),
          RecordableEventNotFound: () =>
            Effect.succeed({
              _tag: "Failed" as const,
              message: "This event no longer exists.",
            }),
          RecordedEventDateNotInPast: () =>
            Effect.succeed({
              _tag: "Failed" as const,
              message: "Choose a real day before today.",
            }),
          SchemaError: () =>
            Effect.succeed({
              _tag: "Failed" as const,
              message: "The event or date could not be validated.",
            }),
        }),
        Effect.catch(() =>
          Effect.succeed({
            _tag: "Failed" as const,
            message: "Could not record the past event. Please try again.",
          })
        )
      ),
    saveRecordableEvent: (input: typeof SaveRecordableEventInput.Type) =>
      Effect.gen(function* () {
        const recordableEvents =
          yield* RecordableEventsService.RecordableEvents;

        if (input._tag === "Create") {
          const created = yield* recordableEvents.create({
            input: {
              emoji: input.emoji,
              name: input.name,
            },
          });

          return {
            _tag: "Saved" as const,
            action: "created" as const,
            recordableEvent: created.recordableEvent,
          };
        }

        const updated = yield* recordableEvents.update({
          input: {
            emoji: input.emoji,
            name: input.name,
            position: input.position,
            recordableEventId: input.recordableEventId,
          },
        });

        return {
          _tag: "Saved" as const,
          action: "updated" as const,
          recordableEvent: updated.recordableEvent,
        };
      }).pipe(
        Effect.catchTags({
          RecordableEventNameAlreadyExists: () =>
            Effect.succeed({
              _tag: "Failed" as const,
              message: "An event with this name already exists.",
            }),
          RecordableEventNotFound: () =>
            Effect.succeed({
              _tag: "Failed" as const,
              message: "This event no longer exists.",
            }),
          SchemaError: () =>
            Effect.succeed({
              _tag: "Failed" as const,
              message: "Enter a name and exactly one emoji.",
            }),
        }),
        Effect.catch(() =>
          Effect.succeed({
            _tag: "Failed" as const,
            message: "Could not save the event. Please try again.",
          })
        )
      ),
    toggleRecordableEvent: (input: typeof ToggleRecordableEventInput.Type) =>
      Effect.gen(function* () {
        const recordableEvents =
          yield* RecordableEventsService.RecordableEvents;
        const toggled = yield* input.action === "archive"
          ? recordableEvents.archive({
              input: { recordableEventId: input.recordableEventId },
            })
          : recordableEvents.unarchive({
              input: { recordableEventId: input.recordableEventId },
            });

        return {
          _tag: "Toggled" as const,
          action:
            input.action === "archive"
              ? ("archived" as const)
              : ("unarchived" as const),
          recordableEvent: toggled.recordableEvent,
        };
      }).pipe(
        Effect.catchTags({
          RecordableEventAlreadyArchived: () =>
            Effect.succeed({
              _tag: "Failed" as const,
              message: "This event is already archived.",
            }),
          RecordableEventNotArchived: () =>
            Effect.succeed({
              _tag: "Failed" as const,
              message: "This event is already active.",
            }),
          RecordableEventNotFound: () =>
            Effect.succeed({
              _tag: "Failed" as const,
              message: "This event no longer exists.",
            }),
          SchemaError: () =>
            Effect.succeed({
              _tag: "Failed" as const,
              message: "The event could not be validated.",
            }),
        }),
        Effect.catch(() =>
          Effect.succeed({
            _tag: "Failed" as const,
            message: "Could not update the event. Please try again.",
          })
        )
      ),
  },
  streams: {
    trackToday: Stream.unwrap(
      Effect.gen(function* () {
        const appActivity = yield* AppActivity;

        return Stream.merge(
          Stream.tick("1 minute"),
          appActivity.activations
        ).pipe(
          Stream.mapEffect(() => Clock.currentTimeMillis),
          Stream.map((millis) =>
            Schema.decodeOption(EventDomain.DateKey)(
              dateKeyFromDate({ date: new Date(millis) })
            )
          ),
          Stream.filter(Option.isSome),
          Stream.map(({ value }) => value)
        );
      })
    ),
  },
  branches: {
    saveRecordableEvent: {
      saving: {
        target: "Loaded.SavingRecordableEvent",
        update: "Loaded",
      },
    },
  },
}).handle({
  root: ({ input }) => ({ todayDateKey: input.todayDateKey }),
  initial: { target: "Loading" },
  states: {
    Loading: {
      invoke: {
        src: "loadEventTracker",
        input: ({ root }) => root.todayDateKey,
        onDone: {
          target: "Loaded",
          data: ({ output }) => ({
            data: output,
            detailDateKey: null,
            detailRecordableEventId: null,
            editingDateKey: null,
            editingRecordableEventId: null,
            emojiInput: "",
            nameInput: "",
            notice: null,
            pastEventSelections: [],
          }),
        },
        onFailure: {
          target: "Failure",
          data: { message: "Could not load events. Please try again." },
        },
      },
    },
    Failure: {
      on: { Reload: { target: "Loading" } },
    },
    Loaded: {
      initial: { target: "Loaded.Ready" },
      states: {
        Ready: {
          invoke: {
            src: "trackToday",
            onElement: {
              update: "root",
              data: ({ element }) => ({ todayDateKey: element }),
            },
            onDone: { none: true },
          },
          on: {
            ArchiveRecordableEvent: {
              target: "Loaded.TogglingRecordableEvent",
              update: "Loaded",
              data: ({ event, ancestors }) => ({
                target: {
                  action: "archive" as const,
                  recordableEventId: event.recordableEventId,
                },
                update: { ...ancestors.Loaded, notice: null },
              }),
            },
            BeginCreate: {
              update: "Loaded",
              data: ({ ancestors }) => ({
                ...ancestors.Loaded,
                editingRecordableEventId: null,
                emojiInput: "",
                nameInput: "",
                notice: null,
              }),
            },
            CancelEdit: {
              update: "Loaded",
              data: ({ ancestors }) => ({
                ...ancestors.Loaded,
                editingRecordableEventId: null,
                emojiInput: "",
                nameInput: "",
              }),
            },
            ChangeEmoji: {
              update: "Loaded",
              data: ({ ancestors, event }) => ({
                ...ancestors.Loaded,
                emojiInput: event.value,
              }),
            },
            ChangeName: {
              update: "Loaded",
              data: ({ ancestors, event }) => ({
                ...ancestors.Loaded,
                nameInput: event.value,
              }),
            },
            CloseDayEditor: {
              update: "Loaded",
              data: ({ ancestors }) => ({
                ...ancestors.Loaded,
                editingDateKey: null,
                pastEventSelections: [],
              }),
            },
            CloseEventDetails: {
              update: "Loaded",
              data: ({ ancestors }) => ({
                ...ancestors.Loaded,
                detailDateKey: null,
                detailRecordableEventId: null,
              }),
            },
            DecrementPastEvent: {
              update: "Loaded",
              data: ({ ancestors, event }) => ({
                ...ancestors.Loaded,
                pastEventSelections:
                  ancestors.Loaded.pastEventSelections.flatMap((selection) =>
                    selection.recordableEventId !== event.recordableEventId
                      ? [selection]
                      : selection.count <= 1
                        ? []
                        : [{ ...selection, count: selection.count - 1 }]
                  ),
              }),
            },
            DeleteRecordedEvent: {
              target: "Loaded.DeletingRecordedEvent",
              update: "Loaded",
              data: ({ event, ancestors }) => ({
                target: { recordedEventId: event.recordedEventId },
                update: { ...ancestors.Loaded, notice: null },
              }),
            },
            EditRecordableEvent: {
              update: "Loaded",
              data: ({ ancestors, event }) =>
                Array.findFirst(
                  ancestors.Loaded.data.recordableEvents,
                  (candidate) => candidate.id === event.recordableEventId
                ).pipe(
                  Option.match({
                    onNone: () => ({
                      ...ancestors.Loaded,
                      notice: _danger("This event no longer exists."),
                    }),
                    onSome: (recordableEvent) => ({
                      ...ancestors.Loaded,
                      editingRecordableEventId: recordableEvent.id,
                      emojiInput: recordableEvent.emoji,
                      nameInput: recordableEvent.name,
                      notice: null,
                    }),
                  })
                ),
            },
            IncrementPastEvent: {
              update: "Loaded",
              data: ({ ancestors, event }) => ({
                ...ancestors.Loaded,
                pastEventSelections: ancestors.Loaded.pastEventSelections.some(
                  (selection) =>
                    selection.recordableEventId === event.recordableEventId
                )
                  ? ancestors.Loaded.pastEventSelections.map((selection) =>
                      selection.recordableEventId === event.recordableEventId
                        ? { ...selection, count: selection.count + 1 }
                        : selection
                    )
                  : [
                      ...ancestors.Loaded.pastEventSelections,
                      { count: 1, recordableEventId: event.recordableEventId },
                    ],
              }),
            },
            LoadOlder: { target: "Loaded.LoadingOlder" },
            OpenDayEditor: {
              update: "Loaded",
              guard: ({ event, root }) => event.dateKey < root.todayDateKey,
              data: ({ ancestors, event }) => ({
                ...ancestors.Loaded,
                editingDateKey: event.dateKey,
                pastEventSelections: [],
              }),
            },
            OpenEventDetails: {
              update: "Loaded",
              data: ({ ancestors, event }) => ({
                ...ancestors.Loaded,
                detailDateKey: event.dateKey,
                detailRecordableEventId: event.recordableEventId,
              }),
            },
            RecordNow: {
              target: "Loaded.RecordingNow",
              update: "Loaded",
              data: ({ event, ancestors }) => ({
                target: { recordableEventId: event.recordableEventId },
                update: { ...ancestors.Loaded, notice: null },
              }),
            },
            RecordPastEvents: {
              target: "Loaded.RecordingPastEvents",
              update: "Loaded",
              data: ({ event, ancestors }) => ({
                target: {
                  dateKey: event.dateKey,
                  recordableEventIds: event.recordableEventIds,
                },
                update: {
                  ...ancestors.Loaded,
                  editingDateKey: null,
                  notice: null,
                  pastEventSelections: [],
                },
              }),
            },
            SaveRecordableEvent: {
              branches: "saveRecordableEvent",
              declinable: true,
              resolve: ({ ancestors, decline, select }) => {
                const loaded = ancestors.Loaded;
                const update = { data: { ...loaded, notice: null } };

                if (loaded.editingRecordableEventId === null) {
                  return select.saving({
                    data: {
                      input: {
                        _tag: "Create",
                        emoji: loaded.emojiInput,
                        name: loaded.nameInput,
                      },
                    },
                    update,
                  });
                }

                return Array.findFirst(
                  loaded.data.recordableEvents,
                  (candidate) =>
                    candidate.id === loaded.editingRecordableEventId
                ).pipe(
                  Option.match({
                    onNone: () => decline(),
                    onSome: (recordableEvent) =>
                      select.saving({
                        data: {
                          input: {
                            _tag: "Update",
                            emoji: loaded.emojiInput,
                            name: loaded.nameInput,
                            position: recordableEvent.position,
                            recordableEventId: recordableEvent.id,
                          },
                        },
                        update,
                      }),
                  })
                );
              },
            },
            UnarchiveRecordableEvent: {
              target: "Loaded.TogglingRecordableEvent",
              update: "Loaded",
              data: ({ event, ancestors }) => ({
                target: {
                  action: "unarchive" as const,
                  recordableEventId: event.recordableEventId,
                },
                update: { ...ancestors.Loaded, notice: null },
              }),
            },
          },
        },
        LoadingOlder: {
          invoke: {
            src: "loadOlderEvents",
            input: ({ ancestors }) => ancestors.Loaded.data.loadedStartDateKey,
            onDone: {
              target: "Loaded.Ready",
              update: "Loaded",
              data: ({ ancestors, output }) => ({
                target: undefined,
                update: {
                  ...ancestors.Loaded,
                  data: {
                    ...ancestors.Loaded.data,
                    loadedStartDateKey: output.loadedStartDateKey,
                    recordedEvents: _mergeRecordedEvents({
                      current: ancestors.Loaded.data.recordedEvents,
                      incoming: output.recordedEvents,
                    }),
                  },
                },
              }),
            },
            onFailure: {
              target: "Loaded.Ready",
              update: "Loaded",
              data: ({ ancestors }) => ({
                target: undefined,
                update: {
                  ...ancestors.Loaded,
                  notice: _danger(
                    "Could not load older days. Scroll down to try again."
                  ),
                },
              }),
            },
          },
        },
        RecordingNow: {
          invoke: {
            src: "recordNow",
            input: ({ state }) => ({
              recordableEventId: state.recordableEventId,
            }),
            onDone: {
              target: "Loaded.Ready",
              update: "Loaded",
              data: ({ ancestors, output }) => ({
                target: undefined,
                update:
                  output._tag === "Failed"
                    ? { ...ancestors.Loaded, notice: _danger(output.message) }
                    : {
                        ...ancestors.Loaded,
                        data: {
                          ...ancestors.Loaded.data,
                          recordedEvents: _mergeRecordedEvents({
                            current: ancestors.Loaded.data.recordedEvents,
                            incoming: [output.recordedEvent],
                          }),
                        },
                        notice: null,
                      },
              }),
            },
          },
        },
        RecordingPastEvents: {
          invoke: {
            src: "recordPastEvents",
            input: ({ state }) => ({
              dateKey: state.dateKey,
              recordableEventIds: state.recordableEventIds,
            }),
            onDone: {
              target: "Loaded.Ready",
              update: "Loaded",
              data: ({ ancestors, output }) => ({
                target: undefined,
                update:
                  output._tag === "Failed"
                    ? { ...ancestors.Loaded, notice: _danger(output.message) }
                    : {
                        ...ancestors.Loaded,
                        data: {
                          ...ancestors.Loaded.data,
                          recordedEvents: _mergeRecordedEvents({
                            current: ancestors.Loaded.data.recordedEvents,
                            incoming: output.recordedEvents,
                          }),
                        },
                        notice: null,
                      },
              }),
            },
          },
        },
        DeletingRecordedEvent: {
          invoke: {
            src: "deleteRecordedEvent",
            input: ({ state }) => ({ recordedEventId: state.recordedEventId }),
            onDone: {
              target: "Loaded.Ready",
              update: "Loaded",
              data: ({ ancestors, output }) => ({
                target: undefined,
                update:
                  output._tag === "Failed"
                    ? { ...ancestors.Loaded, notice: _danger(output.message) }
                    : {
                        ...ancestors.Loaded,
                        data: {
                          ...ancestors.Loaded.data,
                          recordedEvents:
                            ancestors.Loaded.data.recordedEvents.filter(
                              (candidate) =>
                                candidate.id !== output.recordedEvent.id
                            ),
                        },
                        notice: null,
                      },
              }),
            },
          },
        },
        SavingRecordableEvent: {
          invoke: {
            src: "saveRecordableEvent",
            input: ({ state }) => state.input,
            onDone: {
              target: "Loaded.Ready",
              update: "Loaded",
              data: ({ ancestors, output }) => ({
                target: undefined,
                update:
                  output._tag === "Failed"
                    ? { ...ancestors.Loaded, notice: _danger(output.message) }
                    : {
                        ...ancestors.Loaded,
                        data: _upsertRecordableEvent({
                          data: ancestors.Loaded.data,
                          recordableEvent: output.recordableEvent,
                        }),
                        editingRecordableEventId: null,
                        emojiInput: "",
                        nameInput: "",
                        notice: null,
                      },
              }),
            },
          },
        },
        TogglingRecordableEvent: {
          invoke: {
            src: "toggleRecordableEvent",
            input: ({ state }) => ({
              action: state.action,
              recordableEventId: state.recordableEventId,
            }),
            onDone: {
              target: "Loaded.Ready",
              update: "Loaded",
              data: ({ ancestors, output }) => ({
                target: undefined,
                update:
                  output._tag === "Failed"
                    ? { ...ancestors.Loaded, notice: _danger(output.message) }
                    : {
                        ...ancestors.Loaded,
                        data: _upsertRecordableEvent({
                          data: ancestors.Loaded.data,
                          recordableEvent: output.recordableEvent,
                        }),
                        editingRecordableEventId: null,
                        emojiInput: "",
                        nameInput: "",
                        notice: null,
                      },
              }),
            },
          },
        },
      },
    },
  },
});
