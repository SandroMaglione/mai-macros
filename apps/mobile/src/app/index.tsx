import { color } from "@/theme/tokens";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function IndexScreen() {
  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <View style={styles.body}>
        <View style={styles.kicker}>
          <Text style={styles.kickerText}>Mobile scaffold</Text>
        </View>
        <Text style={styles.title}>Mai</Text>
        <Text style={styles.copy}>
          The Expo runtime, router, native shell, and theme tokens are ready for
          the first layout pass.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: color.bg,
  },
  body: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  kicker: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: color.statusNeutralSoft,
  },
  kickerText: {
    color: color.inkMuted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  title: {
    marginTop: 18,
    color: color.ink,
    fontSize: 42,
    fontWeight: "300",
    lineHeight: 50,
  },
  copy: {
    marginTop: 12,
    maxWidth: 320,
    color: color.inkMuted,
    fontSize: 17,
    lineHeight: 26,
  },
});
