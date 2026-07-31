import { Effect } from "effect";
import { assert, describe, it } from "vitest";

import { TimeZone } from "../src/index.ts";

describe("EventTrackingTimeZone", () => {
  it("uses the device's current numeric UTC offset without named-zone Intl formatting", async () => {
    const timeZone = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* TimeZone.EventTrackingTimeZone;

        return yield* service.current;
      }).pipe(Effect.provide(TimeZone.EventTrackingTimeZone.layerLocal))
    );

    assert.equal(timeZone._tag, "Offset");

    if (timeZone._tag === "Offset") {
      assert.equal(timeZone.offset, -new Date().getTimezoneOffset() * 60_000);
    }
  });
});
