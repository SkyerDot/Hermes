import { test, expect } from "@playwright/test";
import { gotoDashboardRoute } from "./helpers/dashboardAuth";

test.describe("Endpoint tab visibility", () => {
  test("shows the retained endpoint tabs inside the endpoint page", async ({ page }) => {
    await gotoDashboardRoute(page, "/dashboard/endpoint");
    await page.waitForLoadState("networkidle");

    const apisTab = page.getByRole("tab", { name: "APIs" });
    const contextSourcesTab = page.getByRole("tab", { name: "Context Sources" });

    await expect(apisTab).toBeVisible();
    await expect(contextSourcesTab).toBeVisible();

    await contextSourcesTab.click();
    await expect(page.locator("body")).not.toContainText(/application error|500/i);
  });
});
