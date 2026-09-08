import "react-native-gesture-handler";

import { RegistryProvider } from "@effect/atom-react";

import { color } from "@/theme/tokens";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Appearance, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

Appearance.setColorScheme("dark");

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <RegistryProvider>
        <KeyboardProvider>
          <Stack
            screenOptions={{
              animation: "none",
              headerShown: false,
              contentStyle: { backgroundColor: color.bg },
            }}
          />
          <StatusBar style="light" />
        </KeyboardProvider>
      </RegistryProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.bg,
  },
});
