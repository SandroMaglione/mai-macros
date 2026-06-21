import "tsx/cjs";
import type { ExpoConfig } from "expo/config";

const primary700 = "#df5819";
const appBackground = "#ffffff";
const appVersion = "1.0.0";

export default {
  name: "Mai",
  slug: "mai-mobile",
  version: appVersion,
  platforms: ["ios", "android"],
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "mai",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "app.mai.mobile",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: "app.mai.mobile",
    adaptiveIcon: {
      backgroundColor: primary700,
      foregroundImage: "./assets/images/android-icon-foreground.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  androidStatusBar: {
    backgroundColor: primary700,
    barStyle: "light-content",
    translucent: false,
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        backgroundColor: appBackground,
        image: "./assets/images/splash-icon.png",
        imageWidth: 76,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    router: {},
  },
} satisfies ExpoConfig;
