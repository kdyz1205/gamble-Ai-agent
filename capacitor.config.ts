import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.summonworld.app",
  appName: "Summon World",
  webDir: "ios-shell",
  loggingBehavior: "production",
  ios: {
    scheme: "SummonWorld",
    contentInset: "always",
    limitsNavigationsToAppBoundDomains: true,
  },
  server: {
    // Once the /app route is released, launch the actual product rather than /enter.
    url: process.env.SUM_IOS_APP_URL || "https://summoner.world/app",
    cleartext: false,
    iosScheme: "summonworld",
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
