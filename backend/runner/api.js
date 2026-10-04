import express from "express";

// Must match the options the frontend offers and backend/utils/fingerprint.js generates.
const PLATFORMS = ["windows", "linux", "macos"];
const LANGS = ["en", "en-GB"];
const SEED_MAX = 2147483647;

function parseLaunch(body = {}) {
	const { timezone, lang, os, seed, autoSeed, autoProfile = false, instances, staggerMs } = body;
	const errors = [];
	if (typeof timezone !== "string" || !Intl.supportedValuesOf("timeZone").concat("UTC").includes(timezone)) errors.push("timezone must be an IANA zone");
	if (!LANGS.includes(lang)) errors.push(`lang must be one of ${LANGS.join(", ")}`);
	if (!PLATFORMS.includes(os)) errors.push(`os must be one of ${PLATFORMS.join(", ")}`);
	if (typeof autoSeed !== "boolean") errors.push("autoSeed must be a boolean");
	if (typeof autoProfile !== "boolean") errors.push("autoProfile must be a boolean");
	if (!autoSeed && !(Number.isInteger(seed) && seed >= 0 && seed <= SEED_MAX)) errors.push(`seed must be an integer in [0, ${SEED_MAX}]`);
	if (!(Number.isInteger(instances) && instances >= 1 && instances <= 50)) errors.push("instances must be an integer in [1, 50]");
	if (!(Number.isInteger(staggerMs) && staggerMs >= 0 && staggerMs <= 60000)) errors.push("staggerMs must be an integer in [0, 60000]");
	if (errors.length) throw Object.assign(new Error(errors.join("; ")), { status: 400 });
	return { timezone, lang, os, seed: autoSeed ? null : seed, autoSeed, autoProfile, instances, staggerMs };
}

export function createApi(manager) {
	const api = express.Router();
	api.use(express.json());

	api.get("/health", (req, res) => res.json({ ok: true, flow: manager.flow.name ?? null }));

	api.get("/runs/current", (req, res) => {
		const run = manager.currentRun;
		if (!run) return res.status(204).end();
		res.json({ now: Date.now(), run: manager.snapshot(run.id) });
	});

	api.post("/launch", (req, res) => {
		const run = manager.createRun(parseLaunch(req.body));
		res.status(201).json({ now: Date.now(), run });
	});

	api.post("/runs/:id/stop", async (req, res) => {
		res.json({ now: Date.now(), run: await manager.stopRun(req.params.id) });
	});

	api.post("/runs/:id/dismiss", async (req, res) => {
		await manager.dismissRun(req.params.id);
		res.status(204).end();
	});

	api.post("/instances/:id/stop", async (req, res) => {
		res.json({ now: Date.now(), instance: await manager.stopInstance(req.params.id) });
	});

	api.get("/instances/:id/screenshot", (req, res) => {
		const shot = manager.screenshots.get(req.params.id);
		if (!shot) return res.status(404).json({ error: "No screenshot for this instance." });
		res.set("Cache-Control", "no-store").type("jpeg").send(shot);
	});

	api.post("/instances/:id/retry", (req, res) => {
		res.status(201).json({ now: Date.now(), instance: manager.retryInstance(req.params.id) });
	});

	// Server-Sent Events: a full snapshot on connect (and on every reconnect), then one event per change.
	api.get("/runs/:id/events", (req, res) => {
		const { id } = req.params;
		const snapshot = manager.snapshot(id);
		if (!snapshot) return res.status(404).json({ error: `No run ${id}` });

		res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" });
		res.flushHeaders();
		const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify({ now: Date.now(), ...data })}\n\n`);

		send("snapshot", { run: snapshot });
		const onRun = (run) => run.id === id && send("run", { run: { ...run } });
		const onInstance = (instance) => instance.runId === id && send("instance", { instance });
		const onDismissed = (runId) => runId === id && send("dismissed", {});
		manager.on("run", onRun);
		manager.on("instance", onInstance);
		manager.on("dismissed", onDismissed);
		const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 15000);

		req.on("close", () => {
			clearInterval(heartbeat);
			manager.off("run", onRun);
			manager.off("instance", onInstance);
			manager.off("dismissed", onDismissed);
		});
	});

	api.use((err, req, res, next) => {
		const status = err.status ?? 500;
		if (status >= 500) console.error(err);
		res.status(status).json({ error: err.message });
	});

	return api;
}
