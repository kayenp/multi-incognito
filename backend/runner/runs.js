// Run manager: schedules a staggered batch of Chromium instances, drives each through a flow,
// and emits every state change so the API can stream it to the dashboard.
import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { chromium } from "@playwright/test";
import { genFingerprints } from "../utils/fingerprint.js";

const SEED_MAX = 2147483647;
const EXECUTABLE_PATH = process.env.CHROMIUM_PATH || "/home/ken/applications/ungoogled-chromium-148.0.7778.215-1-x86_64.AppImage";
const TERMINAL = new Set(["done", "failed", "stopped"]);
// Playwright waits this long for an element before failing the step with its call log (default would be 30s).
const STEP_TIMEOUT_MS = Number(process.env.STEP_TIMEOUT_MS) || 15_000;
const NAV_TIMEOUT_MS = Number(process.env.NAV_TIMEOUT_MS) || 30_000;
const DIAGNOSTIC_TIMEOUT_MS = 5_000;

// Memory savers (headed mode is required, so these are the main levers). Each can be turned off from .env:
//   BLOCK_RESOURCES        – comma-separated Playwright resource types to abort ("" blocks nothing)
//   DISABLE_SITE_ISOLATION – "0" keeps Chromium's one-renderer-per-site iframe isolation
//   VIEWPORT               – "<w>x<h>" page size ("" keeps Playwright's 1280x720 default)
const BLOCK_RESOURCES = new Set((process.env.BLOCK_RESOURCES ?? "image,media,font").split(",").map((s) => s.trim()).filter(Boolean));
const DISABLE_SITE_ISOLATION = process.env.DISABLE_SITE_ISOLATION !== "0";
const VIEWPORT = (() => {
	const [width, height] = (process.env.VIEWPORT ?? "1024x700").split("x").map(Number);
	return width > 0 && height > 0 ? { width, height } : null;
})();
// Room for the tab strip and toolbar above the viewport.
const WINDOW_CHROME_HEIGHT = 90;

function launchArgs({ seed, os, timezone, lang }) {
	const args = [`--fingerprint=${seed}`, `--fingerprint-platform=${os}`, `--timezone=${timezone}`, `--lang=${lang}`];
	// Cross-site iframes (cookie banner, payment, analytics) otherwise each get their own renderer process.
	if (DISABLE_SITE_ISOLATION) args.push("--disable-site-isolation-trials", "--disable-features=IsolateOrigins,site-per-process");
	if (VIEWPORT) args.push(`--window-size=${VIEWPORT.width},${VIEWPORT.height + WINDOW_CHROME_HEIGHT}`);
	return args;
}

export const isTerminal = (instance) => TERMINAL.has(instance.state);

const randomSeed = () => Math.floor(Math.random() * (SEED_MAX + 1));

// OS, time zone and language for one instance: freshly randomized with autoProfile, otherwise the run's fixed choice.
function instanceProfile({ autoProfile, os, timezone, lang }) {
	if (!autoProfile) return { os, timezone, lang };
	const fp = genFingerprints();
	return { os: fp.os, timezone: fp.timezone, lang: fp.lang };
}

// Playwright colours its call logs for terminals; the dashboard wants plain text.
const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, "");

function serializeError(err) {
	const e = err instanceof Error ? err : new Error(String(err));
	return { name: e.name, message: stripAnsi(e.message).slice(0, 4000), stack: e.stack ? stripAnsi(e.stack).slice(0, 8000) : null };
}

// Resolves to `fallback` instead of hanging when a page is too busy to answer.
const withTimeout = (promise, ms, fallback = null) =>
	Promise.race([promise.catch(() => fallback), new Promise((resolve) => setTimeout(resolve, ms, fallback))]);

class StoppedError extends Error {
	name = "StoppedError";
}

export class RunManager extends EventEmitter {
	runs = new Map();
	instances = new Map();
	// Live handles (browser, timers) kept off the serialized instance objects.
	handles = new Map();
	currentRunId = null;
	// Latest failure screenshot per instance, served by GET /instances/:id/screenshot (kept off the streamed JSON).
	screenshots = new Map();

	constructor(flow) {
		super();
		this.flow = flow;
	}

	get currentRun() {
		return this.currentRunId ? this.runs.get(this.currentRunId) : null;
	}

	snapshot(runId) {
		const run = this.runs.get(runId);
		if (!run) return null;
		return { ...run, instances: run.instanceIds.map((id) => this.instances.get(id)) };
	}

	createRun(config) {
		if (this.currentRun && this.currentRun.state !== "finished") {
			throw Object.assign(new Error("A run is already in progress. Stop it before launching another."), { status: 409 });
		}

		const run = {
			id: randomUUID().slice(0, 8),
			createdAt: Date.now(),
			endedAt: null,
			state: "running",
			config,
			steps: [...(this.flow.steps ?? [])],
			instanceIds: [],
		};
		this.runs.set(run.id, run);
		this.currentRunId = run.id;

		for (let i = 0; i < config.instances; i++) {
			this.addInstance(run, {
				label: i + 1,
				delayMs: i * config.staggerMs,
				seed: config.autoSeed ? randomSeed() : config.seed,
				profile: instanceProfile(config),
			});
		}
		this.emit("run", run);
		return this.snapshot(run.id);
	}

	addInstance(run, { label, delayMs, seed, profile, retryOf = null }) {
		const instance = {
			id: randomUUID().slice(0, 8),
			runId: run.id,
			label,
			retryOf,
			config: { seed, ...profile },
			state: "queued",
			scheduledAt: Date.now() + delayMs,
			startedAt: null,
			endedAt: null,
			windowOpen: false,
			steps: [],
			error: null,
			diagnostics: null,
		};
		this.instances.set(instance.id, instance);
		run.instanceIds.push(instance.id);
		this.handles.set(instance.id, { timer: setTimeout(() => this.start(instance), delayMs), browser: null, page: null, stopping: false });
		this.emit("instance", instance);
		return instance;
	}

	update(instance, patch) {
		Object.assign(instance, patch);
		this.emit("instance", instance);
		this.settleRun(this.runs.get(instance.runId));
	}

	settleRun(run) {
		const done = run.instanceIds.every((id) => isTerminal(this.instances.get(id)));
		if (done && run.state !== "finished") {
			run.state = "finished";
			run.endedAt = Date.now();
			this.emit("run", run);
		} else if (!done && run.state === "finished") {
			run.state = "running";
			run.endedAt = null;
			this.emit("run", run);
		}
	}

	async start(instance) {
		const handle = this.handles.get(instance.id);
		handle.timer = null;
		if (handle.stopping) return;

		this.update(instance, { state: "launching", startedAt: Date.now() });
		const { seed, os, timezone, lang } = instance.config;

		try {
			handle.browser = await chromium.launch({
				headless: false,
				executablePath: EXECUTABLE_PATH,
				args: launchArgs({ seed, os, timezone, lang }),
			});
			if (handle.stopping) throw new StoppedError();

			this.update(instance, { state: "running", windowOpen: true });
			handle.browser.on("disconnected", () => {
				handle.browser = null;
				if (instance.windowOpen) this.update(instance, { windowOpen: false });
				if (!isTerminal(instance) && !handle.stopping) {
					handle.stopping = true;
					this.finish(instance, "stopped", { name: "WindowClosed", message: "The browser window was closed.", stack: null });
				}
			});

			const page = await handle.browser.newPage(VIEWPORT ? { viewport: VIEWPORT } : {});
			if (BLOCK_RESOURCES.size) {
				await page.route("**/*", (route) => (BLOCK_RESOURCES.has(route.request().resourceType()) ? route.abort() : route.continue()));
			}
			page.setDefaultTimeout(STEP_TIMEOUT_MS);
			page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
			handle.page = page;
			await this.flow.run({ page, step: (name, fn) => this.step(instance, name, fn), config: instance.config });
			this.finish(instance, "done");
		} catch (err) {
			if (handle.stopping) await handle.browser?.close().catch(() => {});
			if (isTerminal(instance)) return;
			if (handle.stopping || err instanceof StoppedError) return this.finish(instance, "stopped");
			// A throw outside any step (steps capture their own) still leaves evidence.
			if (!instance.diagnostics) await this.captureDiagnostics(instance, null);
			this.finish(instance, "failed", serializeError(err));
		}
	}

	async step(instance, name, fn) {
		if (this.handles.get(instance.id).stopping) throw new StoppedError();
		const step = { name, state: "running", startedAt: Date.now(), endedAt: null, error: null };
		this.update(instance, { steps: [...instance.steps, step] });
		try {
			const result = await fn();
			Object.assign(step, { state: "done", endedAt: Date.now() });
			this.update(instance, {});
			return result;
		} catch (err) {
			const stopped = this.handles.get(instance.id).stopping;
			if (!stopped) await this.captureDiagnostics(instance, name);
			// Keep the error even when stopped: Playwright's call log says what the step was still waiting for.
			Object.assign(step, { state: stopped ? "stopped" : "failed", endedAt: step.endedAt ?? Date.now(), error: serializeError(err) });
			this.update(instance, {});
			throw err;
		}
	}

	finish(instance, state, error = null) {
		for (const step of instance.steps) {
			if (step.state === "running") Object.assign(step, { state: "stopped", endedAt: Date.now() });
		}
		this.update(instance, { state, error, endedAt: Date.now() });
	}

	// Records where the page was and what it showed when a step went wrong. Best-effort: never throws.
	async captureDiagnostics(instance, stepName) {
		const page = this.handles.get(instance.id)?.page;
		if (!page || page.isClosed()) return;
		const [title, shot] = await Promise.all([
			withTimeout(page.title(), DIAGNOSTIC_TIMEOUT_MS),
			withTimeout(page.screenshot({ type: "jpeg", quality: 70, timeout: DIAGNOSTIC_TIMEOUT_MS }), DIAGNOSTIC_TIMEOUT_MS + 500),
		]);
		if (shot) this.screenshots.set(instance.id, shot);
		this.update(instance, { diagnostics: { step: stepName, capturedAt: Date.now(), url: page.url(), title, screenshot: Boolean(shot) } });
	}

	// Stops a queued/running instance, or closes the window a finished instance left open.
	async stopInstance(id) {
		const instance = this.instances.get(id);
		if (!instance) throw Object.assign(new Error(`No instance ${id}`), { status: 404 });
		const handle = this.handles.get(id);
		handle.stopping = true;

		if (handle.timer) {
			clearTimeout(handle.timer);
			handle.timer = null;
			this.finish(instance, "stopped");
		} else if (!isTerminal(instance) && !handle.browser) {
			// Still inside chromium.launch(); start() sees `stopping` once it resolves.
		} else if (!isTerminal(instance)) {
			// Capture before closing the window so a hung step still leaves a screenshot.
			await this.captureDiagnostics(instance, instance.steps.findLast((s) => s.state === "running")?.name ?? null);
			if (!isTerminal(instance)) this.finish(instance, "stopped");
		}

		await handle.browser?.close().catch(() => {});
		return instance;
	}

	async stopRun(id) {
		const run = this.runs.get(id);
		if (!run) throw Object.assign(new Error(`No run ${id}`), { status: 404 });
		if (run.state !== "finished") {
			run.state = "stopping";
			this.emit("run", run);
		}
		await Promise.all(run.instanceIds.map((iid) => this.stopInstance(iid)));
		this.settleRun(run);
		return this.snapshot(id);
	}

	// Lets the UI forget a finished run: closes any windows it left open and clears it as the current run.
	async dismissRun(id) {
		const run = this.runs.get(id);
		if (!run) throw Object.assign(new Error(`No run ${id}`), { status: 404 });
		if (run.state !== "finished") throw Object.assign(new Error("Only a finished run can be dismissed."), { status: 409 });
		await Promise.all(run.instanceIds.filter((iid) => this.instances.get(iid).windowOpen).map((iid) => this.stopInstance(iid)));
		for (const iid of run.instanceIds) this.screenshots.delete(iid);
		if (this.currentRunId === id) this.currentRunId = null;
		this.emit("dismissed", id);
	}

	retryInstance(id) {
		const original = this.instances.get(id);
		if (!original) throw Object.assign(new Error(`No instance ${id}`), { status: 404 });
		if (!["failed", "stopped"].includes(original.state)) {
			throw Object.assign(new Error("Only failed or stopped instances can be retried."), { status: 409 });
		}
		const run = this.runs.get(original.runId);
		if (run.state === "stopping") throw Object.assign(new Error("The run is stopping."), { status: 409 });

		const { seed: _, ...originalProfile } = original.config;
		const label = Math.max(...run.instanceIds.map((iid) => this.instances.get(iid).label)) + 1;
		const instance = this.addInstance(run, {
			label,
			delayMs: 0,
			seed: run.config.autoSeed ? randomSeed() : original.config.seed,
			profile: run.config.autoProfile ? instanceProfile(run.config) : originalProfile,
			retryOf: original.id,
		});
		this.settleRun(run);
		return instance;
	}
}
