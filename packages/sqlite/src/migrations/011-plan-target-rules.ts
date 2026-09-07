import { Effect } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE plans ADD COLUMN energy_target_rule TEXT NOT NULL DEFAULT 'minimum' CHECK (energy_target_rule IN ('minimum', 'maximum'))`;
  yield* sql`ALTER TABLE plans ADD COLUMN protein_target_rule TEXT NOT NULL DEFAULT 'minimum' CHECK (protein_target_rule IN ('minimum', 'maximum'))`;
  yield* sql`ALTER TABLE plans ADD COLUMN carbs_target_rule TEXT NOT NULL DEFAULT 'minimum' CHECK (carbs_target_rule IN ('minimum', 'maximum'))`;
  yield* sql`ALTER TABLE plans ADD COLUMN fat_target_rule TEXT NOT NULL DEFAULT 'minimum' CHECK (fat_target_rule IN ('minimum', 'maximum'))`;
  yield* sql`ALTER TABLE plans ADD COLUMN fiber_target_rule TEXT NOT NULL DEFAULT 'minimum' CHECK (fiber_target_rule IN ('minimum', 'maximum'))`;
  yield* sql`ALTER TABLE plans ADD COLUMN sugar_target_rule TEXT NOT NULL DEFAULT 'maximum' CHECK (sugar_target_rule IN ('minimum', 'maximum'))`;
  yield* sql`ALTER TABLE plans ADD COLUMN saturated_fat_target_rule TEXT NOT NULL DEFAULT 'maximum' CHECK (saturated_fat_target_rule IN ('minimum', 'maximum'))`;
  yield* sql`ALTER TABLE plans ADD COLUMN salt_target_rule TEXT NOT NULL DEFAULT 'maximum' CHECK (salt_target_rule IN ('minimum', 'maximum'))`;
});
