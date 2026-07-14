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
    url: "https://summoner.world",
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
