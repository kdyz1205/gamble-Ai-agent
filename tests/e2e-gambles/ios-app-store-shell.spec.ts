import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

async function readText(relativePath: string) {
  return readFile(path.join(root, relativePath), "utf8");
}

test.describe("iOS App Store shell", () => {
  test("has a native iOS project, production Capacitor config, and App Store privacy basics", async () => {
    const packageJson = JSON.parse(await readText("package.json")) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

    expect(dependencies["@capacitor/core"]).toBeTruthy();
    expect(dependencies["@capacitor/ios"]).toBeTruthy();
    expect(dependencies["@capacitor/cli"]).toBeTruthy();
    expect(packageJson.scripts?.["ios:sync"]).toContain("cap sync ios");
    expect(packageJson.scripts?.["ios:open"]).toContain("cap open ios");
    expect(packageJson.scripts?.["ios:archive"]).toContain("xcodebuild");
    expect(packageJson.scripts?.["ios:export"]).toContain("-exportArchive");

    const capacitorConfig = await readText("capacitor.config.ts");
    expect(capacitorConfig).toContain('appId: "com.summonworld.app"');
    expect(capacitorConfig).toContain('appName: "Summon World"');
    expect(capacitorConfig).toContain('url: "https://summoner.world"');
    expect(capacitorConfig).toContain('iosScheme: "summonworld"');

    const generatedCapacitorConfig = await readText("ios/App/App/capacitor.config.json");
    expect(generatedCapacitorConfig).toContain('"url": "https://summoner.world"');

    const exportOptions = await readText("ios/App/ExportOptions.plist");
    expect(exportOptions).toContain("<key>method</key>");
    expect(exportOptions).toContain("<string>app-store-connect</string>");
    expect(exportOptions).toContain("<key>signingStyle</key>");
    expect(exportOptions).toContain("<string>automatic</string>");

    const infoPlist = await readText("ios/App/App/Info.plist");
    expect(infoPlist).toContain("<key>CFBundleDisplayName</key>");
    expect(infoPlist).toContain("Summon World");
    expect(infoPlist).toContain("<key>NSCameraUsageDescription</key>");
    expect(infoPlist).toContain("<key>NSMicrophoneUsageDescription</key>");
    expect(infoPlist).toContain("<key>NSPhotoLibraryUsageDescription</key>");
    expect(infoPlist).toContain("<key>NSAllowsArbitraryLoads</key>");
    expect(infoPlist).toContain("<false/>");
    expect(infoPlist).toContain("<key>WKAppBoundDomains</key>");
    expect(infoPlist).toContain("summoner.world");

    const privacyManifest = await readText("ios/App/App/PrivacyInfo.xcprivacy");
    expect(privacyManifest).toContain("<key>NSPrivacyTracking</key>");
    expect(privacyManifest).toContain("<false/>");
    expect(privacyManifest).toContain("<key>NSPrivacyAccessedAPITypes</key>");
    expect(privacyManifest).toContain("NSPrivacyAccessedAPICategoryUserDefaults");
    expect(privacyManifest).toContain("CA92.1");
  });
});
