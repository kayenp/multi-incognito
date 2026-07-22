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
	} catch (err) {
		if (err instanceof Error) {
			console.error(err);
		} else {
			console.error(Error(err));
		};
	};
};

// for (let i = 0; i < 20; i++) {
// 	startBrowser();
// }