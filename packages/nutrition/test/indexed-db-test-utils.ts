import { IndexedDb } from "@effect/platform-browser";
import { Effect, Layer } from "effect";
import { IDBKeyRange, indexedDB as fakeIndexedDb } from "fake-indexeddb";

export const layerFakeIndexedDb = Layer.succeed(
  IndexedDb.IndexedDb,
  IndexedDb.make({ indexedDB: fakeIndexedDb, IDBKeyRange })
);

export const deleteFakeDatabase = ({
  databaseName,
}: {
  readonly databaseName: string;
}) =>
  Effect.gen(function* () {
    const indexedDbService = yield* IndexedDb.IndexedDb;

    yield* Effect.callback<void>((resume) => {
      const request = indexedDbService.indexedDB.deleteDatabase(databaseName);

      request.onerror = () => {
        resume(
          Effect.die(
            request.error ??
              new Error(`Could not delete IndexedDB database ${databaseName}.`)
          )
        );
      };
      request.onblocked = () => {
        resume(
          Effect.die(
            new Error(
              `Could not delete blocked IndexedDB database ${databaseName}.`
            )
          )
        );
      };
      request.onsuccess = () => {
        resume(Effect.void);
      };
    });
  }).pipe(Effect.provide(layerFakeIndexedDb));
