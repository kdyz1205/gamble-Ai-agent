import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

async function readText(relativePath: string) {
  return readFile(path.join(root, relativePath), "utf8");
}

test.describe("iOS App Store compliance artifacts", () => {
  test("exposes in-app privacy, terms, and support surfaces for App Review", async () => {
    const [rootLayout, legalPage, entryPolicyLinks, privacyPage, termsPage, supportPage, supportForm, supportRoute] = await Promise.all([
      readText("src/app/layout.tsx"),
      readText("src/components/legal/LegalPage.tsx"),
      readText("src/components/legal/EntryPolicyLinks.tsx"),
      readText("src/app/privacy/page.tsx"),
      readText("src/app/terms/page.tsx"),
      readText("src/app/support/page.tsx"),
      readText("src/components/support/SupportReportForm.tsx"),
      readText("src/app/api/support/report/route.ts"),
    ]);

    expect(rootLayout).toContain("<EntryPolicyLinks />");
    expect(legalPage).toContain('href="/privacy"');
    expect(legalPage).toContain('href="/terms"');
    expect(legalPage).toContain('href="/support"');
    expect(entryPolicyLinks).toContain('href="/privacy"');
    expect(entryPolicyLinks).toContain('href="/terms"');
    expect(entryPolicyLinks).toContain('href="/support"');

    expect(privacyPage).toContain("support@summoner.world");
    expect(privacyPage).toContain("submitted proof");
    expect(privacyPage).toContain("AI-refereed results");

    expect(termsPage).toContain("No real-money gambling");
    expect(termsPage).toContain("Credits are in-app points");
    expect(termsPage).toContain("dangerous challenges");

    expect(supportPage).toContain("Report content");
    expect(supportPage).toContain("Block a user");
    expect(supportPage).toContain("SupportReportForm");
    expect(supportPage).toContain("support@summoner.world");
    expect(supportForm).toContain('fetch("/api/support/report"');
    expect(supportRoute).toContain("prisma.auditLog.create");
    expect(supportRoute).toContain("support.report_content");
    expect(supportRoute).toContain("support.block_user");
  });

  test("keeps App Store Connect metadata aligned with the native shell", async () => {
    const metadata = JSON.parse(await readText("app-store/app-store-connect.json")) as {
      appName?: string;
      bundleId?: string;
      privacyPolicyUrl?: string;
      supportUrl?: string;
      reviewNotes?: string;
      moderation?: Record<string, unknown>;
    };

    expect(metadata.appName).toBe("Summon World");
    expect(metadata.bundleId).toBe("com.summonworld.app");
    expect(metadata.privacyPolicyUrl).toBe("https://summoner.world/privacy");
    expect(metadata.supportUrl).toBe("https://summoner.world/support");
    expect(metadata.reviewNotes).toContain("demo account");
    expect(metadata.reviewNotes).toContain("No real-money gambling");
    expect(metadata.reviewNotes).toContain("creating Quests with friends");
    expect(metadata.reviewNotes).toContain("AI-assisted result");
    expect(metadata.moderation).toMatchObject({
      reportContent: true,
      blockUser: true,
      supportContact: "support@summoner.world",
    });
  });

  test("defines a macOS iOS release workflow for archive verification", async () => {
    const packageJson = JSON.parse(await readText("package.json")) as {
      scripts?: Record<string, string>;
    };
    const workflow = await readText(".github/workflows/ios-release.yml");

    expect(packageJson.scripts?.["ios:archive:unsigned"]).toContain("CODE_SIGNING_ALLOWED=NO");
    expect(packageJson.scripts?.["ios:export"]).toContain("-exportArchive");

    expect(workflow).toContain("runs-on: macos-15");
    expect(workflow).toContain("npm run ios:sync");
    expect(workflow).toContain("npm run ios:archive:unsigned");
    expect(workflow).toContain("npm run ios:archive");
    expect(workflow).toContain("npm run ios:export");
    expect(workflow).toContain("actions/upload-artifact");
    expect(workflow).toContain("app-store-connect");
  });
});
