import { Dialogs } from "@/machines/services/dialogs";
import { Effect, Layer } from "effect";
import { Alert } from "react-native";

export const DialogsLayer = Layer.succeed(Dialogs, {
  alert: ({ message, title }) =>
    Effect.sync(() => {
      Alert.alert(title, message);
    }),
});
