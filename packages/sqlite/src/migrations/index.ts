import { Effect, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

const EmptyRequest = Schema.Struct({});

const LatestMigrationRow = Schema.Struct({
  migrationId: Schema.Number,
});

const SqliteMigrationLoader: readonly {
  readonly id: number;
  readonly load: () => Promise<{
    readonly default: Effect.Effect<void, unknown, SqlClient.SqlClient>;
  }>;
  readonly name: string;
}[] = [
  {
    id: 1,
    load: () => import("./001-initial.ts"),
    name: "initial",
  },
  {
    id: 2,
    load: () => import("./002-custom-plan-meals.ts"),
    name: "custom-plan-meals",
  },
  {
    id: 3,
    load: () => import("./003-body-weight-entries.ts"),
    name: "body-weight-entries",
  },
  {
    id: 4,
    load: () => import("./004-food-measurements.ts"),
    name: "food-measurements",
  },
  {
    id: 5,
    load: () => import("./005-food-prices.ts"),
    name: "food-prices",
  },
  {
    id: 6,
    load: () => import("./006-event-tracking.ts"),
    name: "event-tracking",
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
          const migrationModule = yield* Effect.tryPromise(migration.load);

          yield* migrationModule.default;
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
