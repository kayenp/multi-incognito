// Example flow for the run manager. A flow exports:
//   name   – shown in the dashboard
//   steps  – the step names in order; they become the monitor's columns
//   run({ page, step, config }) – drives one instance. Wrap each stage in
//                                 `await step("<name>", async () => { ... })`
//                                 so the monitor can show where the instance is.
// A step that throws marks the instance failed at that step.
// Point FLOW in backend/.env at another module to swap flows.

export const name = "example";

export const steps = ["Open page", "Read heading", "Follow link", "Settle"];

export async function run({ page, step }) {
	await step("Open page", async () => {
		await page.goto("https://example.com/");
		await page.waitForLoadState("domcontentloaded");
	});

	await step("Read heading", async () => {
		await page.locator("h1").first().waitFor();
	});

	await step("Follow link", async () => {
		await page.locator("a").first().click();
		await page.waitForLoadState("domcontentloaded");
	});

	await step("Settle", async () => {
		await page.waitForTimeout(2000);
	});
}
