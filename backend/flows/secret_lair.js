export const name = "SLD";

export const steps = ["Open page", "Privacy", "Reject", "Add to cart", "Go to minicart", "Proceed to cart", "Guest checkout"];

export async function run({ page, step }) {
	await step("Open page", async () => {
		await page.goto("https://secretlair.wizards.com/us/en/", {waitUntil: "domcontentloaded"});
	});

	await step("Privacy", async () => {
		const cookieBtn = await page.locator("button[id='onetrust-pc-btn-handler']");
		await cookieBtn.click();
	});

	await step("Reject", async () => {
		const rejectBtn = await page.locator("button[class='ot-pc-refuse-all-handler']");
		await rejectBtn.click();
	})

	await step("Add to cart", async () => {
		// Slick carousel: off-screen slides are aria-hidden and can't be scrolled into view, so only target the shown ones.
		const addToCartBtn = await page.locator(".slick-slide:not([aria-hidden='true']) button[class*='buy-link']:visible").first(); //.filter({hasText: "Add to cart"})
		await addToCartBtn.click();
	});

	await step("Go to minicart", async () => {
		const miniCartBtn = await page.locator("button[class*='minicart-button']");
		await miniCartBtn.scrollIntoViewIfNeeded();
		await miniCartBtn.click();
	});

	await step("Proceed to cart", async () => {
		const proceedCartBtn = await page.locator("button[class*='btn-primary']").filter({hasText: "Proceed to Cart"});
		await proceedCartBtn.click();
	});

	await step("Guest checkout", async () => {
		const guestCheckoutBtn = await page.locator("button[class*='btn_reverse']").filter({hasText: "Continue as guest"});
		await guestCheckoutBtn.click();
	});
}

// async function startBrowser() {
// 	const { seed, os, timezone, lang } = genFingerprints();

// 	console.log(seed, os, timezone, lang);
// 	try {
// 		const browser = await chromium.launch({
// 			headless: false,
// 			executablePath: "~/applications/ungoogled-chromium-148.0.7778.215-1-x86_64.AppImage",
// 			// executablePath: "C:/Users/Ken/AppData/Local/Chromium/Application/chrome.exe",
// 			args: [
// 				`--fingerprint=${seed}`, 
// 				`--fingerprint-platform=${os}`,
// 				`--timezone=${timezone}`,
// 				`--lang=${lang}`,
// 			],
// 		});

// 		const page = await browser.newPage();
		
// 		await page.goto("https://secretlair.wizards.com/us/shopall");
// 		await page.waitForLoadState("domcontentloaded");

// 		const addToCartBtn = page.locator("button[class*='buy-link']").filter({hasText: "Add to cart"}).first() //.highlight({style: "outline: 2px solid red"});
		
// 		await addToCartBtn.click();
		
// 		const miniCartBtn = page.locator("button[class*='minicart-button']");
		
// 		await miniCartBtn.click();
		
// 		const proceedCartBtn = page.locator("button[class*='btn-primary']").filter({hasText: "Proceed to Cart"});
		
// 		await proceedCartBtn.click();
		
// 		const guestCheckoutBtn = page.locator("button[class*='btn_reverse']").filter({hasText: "Continue as guest"});
		
// 		await guestCheckoutBtn.click();
		
// 	} catch (err) {
// 		if (err instanceof Error) {
// 			console.error(err);
// 		} else {
// 			console.error(Error(err));
// 		};
// 	};
// };