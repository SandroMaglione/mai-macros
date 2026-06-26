import { Effect, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import migration001 from "./001-initial.ts";
import migration002 from "./002-custom-plan-meals.ts";

const EmptyRequest = Schema.Struct({});

const LatestMigrationRow = Schema.Struct({
  migrationId: Schema.Number,
});

export const SqliteMigrationLoader: readonly {
  readonly effect: Effect.Effect<void, unknown, SqlClient.SqlClient>;
  readonly id: number;
  readonly name: string;
}[] = [
  {
    effect: migration001,
    id: 1,
    name: "initial",
  },
  {
    effect: migration002,
    id: 2,
    name: "custom-plan-meals",
  },
];

export const runSqliteMigrations = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const findLatestMigration = SqlSchema.findAll({
    Request: EmptyRequest,
    Result: LatestMigrationRow,
    execute: () =>
      sql`
        SELECT migration_id AS migrationId
        FROM mai_migrations
        ORDER BY migration_id DESC
        LIMIT 1
      `,
  });

  const run = Effect.gen(function* () {
    yield* sql`
      CREATE TABLE IF NOT EXISTS mai_migrations (
        migration_id integer PRIMARY KEY NOT NULL,
        created_at datetime NOT NULL DEFAULT current_timestamp,
        name VARCHAR(255) NOT NULL
      )
    `;

    const latestMigrationRows = yield* findLatestMigration({});
    const latestMigrationId = latestMigrationRows[0]?.migrationId ?? 0;
    const pendingMigrations = SqliteMigrationLoader.filter(
      (migration) => migration.id > latestMigrationId
    );

    yield* Effect.forEach(
      pendingMigrations,
      (migration) =>
        Effect.gen(function* () {
          yield* migration.effect;
          yield* sql`
            INSERT INTO mai_migrations ${sql.insert({
              migration_id: migration.id,
              name: migration.name,
            })}
          `;
        }),
      { discard: true }
    );
  });

  yield* sql.withTransaction(run);
});
