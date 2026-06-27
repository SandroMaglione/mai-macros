import { Schema } from "effect";

export const EmptyEvent = Schema.Struct({}).annotate({
  description: "An empty event",
  message: "Empty event",
});
