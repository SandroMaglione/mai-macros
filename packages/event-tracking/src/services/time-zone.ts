import { Context, DateTime, Effect, Layer } from "effect";

export class EventTrackingTimeZone extends Context.Service<
  EventTrackingTimeZone,
  {
    readonly current: Effect.Effect<DateTime.TimeZone>;
  }
>()("@mai/event-tracking/EventTrackingTimeZone") {
  static readonly layerLocal = Layer.succeed(this, {
    current: Effect.sync(() =>
      DateTime.zoneMakeOffset(-new Date().getTimezoneOffset() * 60_000)
    ),
  });
}
