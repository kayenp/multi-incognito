// nodejs imports
import https from 'https';
import fs from 'fs/promises';
import path from 'path';
import url from 'url';

// express imports
import express from 'express';
import cors from 'cors';

// playwright imports
import { chromium } from "@playwright/test";

// fingerprint imports
import { genFingerprints } from "./utils/fingerprint.js";

// constants
const PORT = process.env.PORT || 5000;
const __dirname = import.meta.dirname;
const __prevDir = path.join(__dirname, "..");
const __publicDir = path.join(__prevDir, "/", "public");
const app = express();
const server = https.createServer();

// servers
app.listen(3000, (err => {
	if (err) {
		console.error(err);
	} else {
		console.log("Express running on port 3000");
	};
}));

server.listen(PORT, () => console.log(`NodeJS running on port ${PORT}`));

// Playwright
async function startBrowser() {
	const { seed, os, timezone, lang } = genFingerprints();

	console.log(seed, os, timezone, lang);
	try {
		const browser = await chromium.launch({
			headless: false,
			executablePath: "C:/Users/Ken/AppData/Local/Chromium/Application/chrome.exe",
			args: [
				`--fingerprint=${seed}`, 
				`--fingerprint-platform=${os}`,
				`--timezone=${timezone}`,
				`--lang=${lang}`,
			],
		});

		const page = await browser.newPage();
		
		await page.goto("https://secretlair.wizards.com/us/shopall");
		await page.waitForLoadState("domcontentloaded");

		const addToCartBtn = page.locator("button[class*='buy-link']").filter({hasText: "Add to cart"}).first() //.highlight({style: "outline: 2px solid red"});
		
		await addToCartBtn.click();
		
		const miniCartBtn = page.locator("button[class*='minicart-button']");
		
		await miniCartBtn.click();
		
		const proceedCartBtn = page.locator("button[class*='btn-primary']").filter({hasText: "Proceed to Cart"});
		
		await proceedCartBtn.click();
		
		const guestCheckoutBtn = page.locator("button[class*='btn_reverse']").filter({hasText: "Continue as guest"});
		
		await guestCheckoutBtn.click();
		
	} catch (err) {
		if (err instanceof Error) {
			console.error(err);
		} else {
			console.error(Error(err));
		};
	};
};

function openBrowsers(instances) {
	for (let i = 0; i < instances; i++) {
		setTimeout(startBrowser, (i*10000));
	};
};

openBrowsers(3)

/*
Request URL
	https://assets.queue-it.net/static/QueueFront/css/sound/welcomeAudio_92a6592f5d4e6b14efdcc82656ba4273.mp3 
status code 
	206 Partial Content
content-type
	audio/mpeg
Request URL
	https://assets.queue-it.net/scalefast/userdata/assets/wizardsofthecoast-secret-lair/shared/img/favicon.ico
status code
	200
content-type 
	image/x-icon

Request URL
	https://cdn-prod.scalefast.com/public/assets/client/generic/angips/assets/images/payment-logos/visa.png
status code
	200
content-type
	image/png
...mastercard.png
...maestro.png
...amex.png
...discover.png
...paywithgoogle.png
...paypal.png
*/