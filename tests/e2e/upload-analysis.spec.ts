import { expect, test } from "@playwright/test";

test("opens SceneLens and analyzes an uploaded image without a camera", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Scene viewport" })).toBeVisible();
  await expect(page.getByText("YOLO ready", { exact: true })).toBeVisible({ timeout: 30_000 });

  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const chooserPromise = page.waitForEvent("filechooser");
  await page.locator('label[for="scene-upload"]').click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "test-scene.png",
    mimeType: "image/png",
    buffer: tinyPng,
  });
  await expect(page.getByAltText("Uploaded scene for analysis")).toBeVisible();
  await page.getByRole("button", { name: "Describe the scene" }).click();
  await expect(page.getByTestId("analysis-result")).toContainText("ON-DEVICE ANALYSIS");
  await expect(page.getByTestId("analysis-result")).toContainText("confidence");
});
