import { expect, test } from "@playwright/test";

test("creates a task and completes the approval-gated demo flow", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await page.getByPlaceholder("New task").fill("Draft a launch checklist");
  await page.getByPlaceholder("Notes").first().fill("Keep it short and concrete.");
  await page.getByRole("button", { name: "Add task" }).click();

  await expect(page.getByRole("button", { name: /Draft a launch checklist/ })).toBeVisible();

  await page.getByRole("button", { name: "Start agent" }).click();
  await expect(page.getByText("Context").last()).toBeVisible();
  await expect(page.getByText("Context requested: Answer the questions to continue.")).toBeVisible();

  await page
    .getByLabel("What outcome would make this task feel done?")
    .fill("A compact checklist I can use today.");
  await page
    .getByLabel("Any constraints, preferences, or things to avoid?")
    .fill("No long explanations.");
  await page.getByRole("button", { name: "Submit context" }).click();

  await expect(page.getByText("Approval").last()).toBeVisible();
  await expect(page.getByText("Approval needed: Review the plan.")).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();

  await expect(page.getByText("Task completed: Result is ready.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Result" })).toBeVisible();
  await expect(
    page.getByText('Defined the target outcome for "Draft a launch checklist".'),
  ).toBeVisible();
});

test("surfaces next steps when execution needs user action", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await page.getByRole("button", { name: /Renew my passport/ }).click();
  await page.getByRole("button", { name: "Start agent" }).click();
  await page
    .getByLabel("What outcome would make this task feel done?")
    .fill("Know the official next step.");
  await page.getByRole("button", { name: "Submit context" }).click();
  await expect(page.getByText("Approval needed: Review the plan.")).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();

  await expect(page.getByText("User action needed: Next steps are ready.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Action needed" })).toBeVisible();
  await expect(page.getByText("Open the official service page")).toBeVisible();
  await expect(page.getByRole("link", { name: "USA.gov official services directory" })).toBeVisible();
});
