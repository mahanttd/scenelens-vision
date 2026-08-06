import { expect, test } from "@playwright/test";

test("opens SceneLens and analyzes an uploaded image without a camera", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Security viewport" })).toBeVisible();
  await expect(page.getByText("Security model ready", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("scene-description")).toContainText(
    "Start a camera or upload an image",
  );

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
  await expect(page.getByAltText("Uploaded frame for security review")).toBeVisible();
  await page.getByRole("button", { name: "Security summary" }).click();
  await expect(page.getByTestId("analysis-result")).toContainText("ON-DEVICE ANALYSIS");
  await expect(page.getByTestId("analysis-result")).toContainText("No people or potentially harmful objects");
});
