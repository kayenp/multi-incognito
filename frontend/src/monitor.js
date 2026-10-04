// Run monitor: an instance × step matrix fed by the backend's SSE stream.
import { $, escapeHtml, api, openModal, modalOpen } from "./ui.js";

const STALL_MS = 60_000;
const TERMINAL = new Set(["done", "failed", "stopped"]);

let run = null; // { id, state, steps, createdAt, endedAt, config, instances: Map }
let serverOffset = 0; // server clock − browser clock
let source = null;
let feed = "idle"; // idle | live | reconnecting | lost
let lastEventAt = 0;
let selectedId = null;
let drawerOpen = false;
const stalledIds = new Set();
const rowEls = new Map();

const now = () => Date.now() + serverOffset;
const isTerminal = (i) => TERMINAL.has(i.state);
const currentStep = (i) => i.steps.findLast((s) => s.state === "running") ?? null;
const isStalled = (i) => i.state === "running" && currentStep(i) && now() - currentStep(i).startedAt > STALL_MS;
const label = (i) => `#${String(i.label).padStart(2, "0")}`;
const initialTitle = document.title;

// ---------- Formatting ----------

export function fmtClock(ms) {
	const s = Math.max(0, Math.floor(ms / 1000));
	const h = Math.floor(s / 3600);
	const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, "0");
	const ss = String(s % 60).padStart(2, "0");
	return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function fmtDur(ms) {
	if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
	if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
	if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
	return `${Math.floor(ms / 60_000)}m${String(Math.round((ms % 60_000) / 1000)).padStart(2, "0")}s`;
}

const icon = (name, cls = "") => `<span class="icon text-[13px] ${cls}" aria-hidden="true">${name}</span>`;

// ---------- State intake ----------

function ingestRun(r, serverNow) {
	if (serverNow) serverOffset = serverNow - Date.now();
	const instances = run?.id === r.id ? run.instances : new Map();
	if (run?.id !== r.id) {
		rowEls.clear();
		stalledIds.clear();
		selectedId = null;
		closeDrawer();
	}
	run = { ...r, instances };
	for (const inst of r.instances ?? []) instances.set(inst.id, inst);
}

export function setRun(r, serverNow) {
	ingestRun(r, serverNow);
	connect();
	renderAll();
}

export async function loadCurrentRun() {
	try {
		const { status, data } = await api("/runs/current");
		if (status === 200) setRun(data.run, data.now);
	} catch {
		/* backend offline — the status pill already says so */
	}
}

export const hasActiveRun = () => run && run.state !== "finished";

function connect() {
	source?.close();
	feed = "reconnecting";
	source = new EventSource(`/api/runs/${run.id}/events`);
	const runId = run.id;

	source.addEventListener("snapshot", (e) => {
		const msg = JSON.parse(e.data);
		if (runId !== run?.id) return;
		ingestRun(msg.run, msg.now);
		feed = "live";
		lastEventAt = Date.now();
		renderAll();
	});
	source.addEventListener("run", (e) => {
		const msg = JSON.parse(e.data);
		serverOffset = msg.now - Date.now();
		lastEventAt = Date.now();
		Object.assign(run, { ...msg.run, instances: run.instances });
		renderHeader();
		renderNavBadge();
		if (drawerOpen) renderDrawer();
	});
	source.addEventListener("instance", (e) => {
		const msg = JSON.parse(e.data);
		serverOffset = msg.now - Date.now();
		lastEventAt = Date.now();
		const inst = msg.instance;
		const isNew = !run.instances.has(inst.id);
		run.instances.set(inst.id, inst);
		const unknownStep = inst.steps.some((s) => !run.steps.includes(s.name));
		if (isNew || unknownStep) {
			for (const s of inst.steps) if (!run.steps.includes(s.name)) run.steps.push(s.name);
			renderAll();
		} else {
			renderRow(inst);
			renderHeader();
			renderNavBadge();
			if (drawerOpen && selectedId === inst.id) renderDrawer();
		}
	});
	// Another tab (or this one) dismissed the run.
	source.addEventListener("dismissed", () => runId === run?.id && clearRun());
	source.addEventListener("error", () => {
		// EventSource retries on its own; CLOSED means the backend refused (e.g. restarted and forgot the run).
		feed = source.readyState === EventSource.CLOSED ? "lost" : "reconnecting";
		renderFeedBanner();
	});
}

// ---------- Rendering ----------

function columns() {
	return run.steps;
}

function counts() {
	const c = { queued: 0, launching: 0, running: 0, stalled: 0, failed: 0, stopped: 0, done: 0 };
	for (const i of run.instances.values()) {
		c[i.state]++;
		if (isStalled(i)) c.stalled++;
	}
	return c;
}

// Tape/count order follows the run's arc: settled first, then live, then waiting.
const COUNT_STYLES = [
	// Done is deliberately quiet so failures out-rank finished work.
	["done", "Done", "color-mix(in srgb, var(--color-tertiary) 36%, var(--color-surface-container-highest))"],
	["running", "Running", "var(--color-primary-container)"],
	["stalled", "Stalled", "var(--color-warning)"],
	["failed", "Failed", "var(--color-danger)"],
	["stopped", "Stopped", "var(--color-outline)"],
	["launching", "Launching", "var(--color-secondary)"],
	["queued", "Queued", "var(--color-surface-container-highest)"],
];
const SEG_COLOR = Object.fromEntries(COUNT_STYLES.map(([k, , color]) => [k, color]));

const RUN_STATE = {
	running: ["Running", "text-primary"],
	stopping: ["Stopping", "text-warning"],
	finished: ["Finished", "text-tertiary"],
};

const tapeState = (i) => (isStalled(i) ? "stalled" : i.state);

// How far up its segment an instance has climbed: completed steps, plus half a step while one is in flight.
function tapeFill(i) {
	// Settled-badly instances take the full segment: a failure must read louder than progress.
	if (["done", "failed"].includes(i.state)) return 100;
	if (i.state === "queued") return 0;
	if (i.state === "launching") return 6;
	const total = Math.max(1, run.steps.length);
	const done = i.steps.filter((s) => s.state === "done").length;
	const partial = i.steps.some((s) => s.state !== "done") ? 0.5 : 0;
	return Math.max(6, Math.round(((done + partial) / total) * 100));
}

function renderTape(sorted) {
	const tape = $("run-tape");
	tape.style.setProperty("--n", sorted.length);
	tape.innerHTML = sorted
		.map((i) => {
			const st = tapeState(i);
			const where = currentStep(i)?.name ?? i.steps.at(-1)?.name;
			return `<div class="tape-seg" data-id="${i.id}" data-state="${st}" aria-current="${i.id === selectedId}" title="${label(i)} · ${st}${where ? ` · ${escapeHtml(where)}` : ""}"><i style="--fill:${tapeFill(i)}%;--seg:${SEG_COLOR[st]}"></i></div>`;
		})
		.join("");
}

function renderHeader() {
	// Stalled instances are shown on their own, so Running here excludes them.
	const c = { ...counts() };
	c.running -= c.stalled;
	const sorted = [...run.instances.values()].sort((a, b) => a.label - b.label);
	const total = run.instances.size;
	const [stateLabel, stateColor] = RUN_STATE[run.state] ?? [run.state, "text-on-surface"];
	const settled = c.done + c.failed + c.stopped;

	$("run-id").textContent = run.id;
	$("run-state").textContent = stateLabel;
	$("run-state").className = `text-headline-lg ${stateColor}`;
	$("run-total").textContent = `${settled}/${total} settled · ${run.steps.length} steps`;

	// Every slot is always present so the header never reflows; empty ones just dim.
	$("run-counts").innerHTML = COUNT_STYLES.map(
		([k, name, color]) =>
			`<span class="flex items-center gap-1.5 ${c[k] ? "text-on-surface" : "text-outline"}"><span class="w-2.5 h-2.5 rounded-sm" style="background:${color}"></span><span class="text-ui">${name}</span><span class="font-mono text-headline-sm font-semibold tabular-nums ${c[k] ? "" : "opacity-50"}">${c[k]}</span></span>`,
	).join("");

	renderTape(sorted);
	$("run-tape").setAttribute("aria-label", `Batch progress: ${COUNT_STYLES.filter(([k]) => c[k]).map(([k, name]) => `${c[k]} ${name.toLowerCase()}`).join(", ")}`);

	$("run-elapsed").dataset.since = run.createdAt;
	$("run-elapsed").dataset.until = run.endedAt ?? "";
	tickText($("run-elapsed"));

	// Phase line: only facts the run already knows (the last launch slot is scheduled up front).
	const lastSlot = Math.max(0, ...sorted.filter((i) => i.state === "queued").map((i) => i.scheduledAt));
	const phase = $("run-phase");
	if (run.state === "finished") phase.textContent = `ended ${new Date((run.endedAt ?? Date.now()) - serverOffset).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
	else if (run.state === "stopping") phase.textContent = "closing windows…";
	else if (lastSlot) phase.innerHTML = `last launch in <span class="font-mono text-code-md text-on-surface tabular-nums" data-until="${lastSlot}"></span>`;
	else phase.textContent = "all instances launched";
	for (const el of phase.querySelectorAll("[data-until]")) tickText(el);

	$("btn-stop-run").hidden = run.state === "finished";
	$("btn-dismiss-run").hidden = run.state !== "finished";
	$("btn-stop-run").disabled = run.state !== "running";
	$("btn-stop-run").querySelector("[data-label]").textContent = run.state === "stopping" ? "Stopping…" : "Stop Run";

	const problems = [c.failed && `${c.failed} failed`, c.stalled && `${c.stalled} stalled`].filter(Boolean).join(" · ");
	document.title = `${stateLabel} ${c.done}/${total}${problems ? ` · ${problems}` : ""} · RUN ${run.id}`;
	renderFeedBanner();
}

function renderFeedBanner() {
	const banner = $("feed-banner");
	if (!run || feed === "live" || feed === "idle") {
		banner.hidden = true;
		return;
	}
	banner.hidden = false;
	const age = lastEventAt ? `Last update ${fmtDur(Date.now() - lastEventAt)} ago.` : "";
	$("feed-banner-text").textContent =
		feed === "lost"
			? `The backend no longer knows this run (it was probably restarted). Showing the last known state. ${age}`
			: `Live feed lost — reconnecting. Showing the last known state. ${age}`;
	banner.className = `flex items-center gap-space-sm px-space-md py-space-sm rounded text-body-md border ${
		feed === "lost" ? "border-danger/30 bg-danger/[0.06] text-danger" : "border-warning/30 bg-warning/[0.06] text-warning"
	}`;
}

function renderAll() {
	const empty = !run;
	$("monitor-empty").hidden = !empty;
	$("monitor-body").hidden = empty;
	renderNavBadge();
	if (empty) return;

	const cols = columns();
	$("matrix").style.setProperty("--steps", cols.length);
	$("matrix-head").innerHTML =
		`<div role="columnheader">#</div><div role="columnheader">Config</div>` +
		cols.map((name, n) => `<div role="columnheader" class="truncate" title="${escapeHtml(name)}"><span class="font-mono text-primary">${n + 1}</span> ${escapeHtml(name)}</div>`).join("") +
		`<div role="columnheader" class="text-right">Elapsed</div><div role="columnheader">Result</div>`;

	const body = $("matrix-body");
	body.innerHTML = "";
	rowEls.clear();
	const sorted = [...run.instances.values()].sort((a, b) => a.label - b.label);
	for (const inst of sorted) {
		const row = document.createElement("div");
		row.setAttribute("role", "row");
		row.dataset.id = inst.id;
		rowEls.set(inst.id, row);
		body.append(row);
		renderRow(inst, false);
	}
	if (!selectedId || !run.instances.has(selectedId)) selectedId = sorted[0]?.id ?? null;
	applySelection();
	renderHeader();
	if (drawerOpen) renderDrawer();
}

// Median duration of completed cells per step, so shading flags outliers rather than ranking every cell.
function stepMedians() {
	const byStep = new Map();
	for (const inst of run.instances.values()) {
		for (const s of inst.steps) {
			if (s.state !== "done") continue;
			if (!byStep.has(s.name)) byStep.set(s.name, []);
			byStep.get(s.name).push(s.endedAt - s.startedAt);
		}
	}
	const medians = new Map();
	for (const [name, ds] of byStep) {
		ds.sort((a, b) => a - b);
		medians.set(name, ds[Math.floor(ds.length / 2)]);
	}
	return medians;
}

let medianCache = null;
function medians() {
	return (medianCache ??= stepMedians());
}

function cell(inst, name) {
	const s = inst.steps.findLast((x) => x.name === name);
	const base = "h-6 rounded-sm flex items-center gap-1 px-1.5 font-mono text-code-sm tabular-nums overflow-hidden whitespace-nowrap";
	if (!s) return `<div role="cell" class="flex items-center"><span class="${base} w-full bg-surface-container/70"></span></div>`;

	if (s.state === "done") {
		const d = s.endedAt - s.startedAt;
		const m = medians().get(name) || d;
		const tier = d > m * 2 ? "bg-primary text-white font-semibold" : d > m * 1.25 ? "bg-primary-container/40 text-on-primary-fixed" : "bg-primary-container/15 text-on-surface";
		return `<div role="cell" title="${escapeHtml(name)}: ${fmtDur(d)}"><span class="${base} ${tier}">${fmtDur(d)}</span></div>`;
	}
	if (s.state === "running") {
		const stalled = isStalled(inst);
		const tone = stalled ? "border-warning text-warning bg-warning/10" : "border-primary-container text-primary bg-primary-container/10 cell-live";
		return `<div role="cell" title="${escapeHtml(name)}: in progress${stalled ? " (stalled)" : ""}"><span class="${base} border ${tone}">${icon(stalled ? "hourglass_bottom" : "play_arrow")}<span data-since="${s.startedAt}"></span></span></div>`;
	}
	if (s.state === "failed") {
		return `<div role="cell" title="${escapeHtml(name)} failed after ${fmtDur(s.endedAt - s.startedAt)}: ${escapeHtml(s.error?.message ?? "")}"><span class="${base} border border-danger bg-danger/10 text-danger">${icon("close")}<span class="truncate">${escapeHtml((s.error?.name ?? "Error").replace(/(.)Error$/, "$1"))}</span></span></div>`;
	}
	return `<div role="cell" title="${escapeHtml(name)}: stopped after ${fmtDur(s.endedAt - s.startedAt)}"><span class="${base} border border-dashed border-outline-variant text-outline">${icon("stop")}stopped</span></div>`;
}

const PLATFORM_SHORT = { windows: "win", macos: "mac", linux: "linux" };

function result(inst) {
	switch (inst.state) {
		case "done":
			return `<span class="flex items-center gap-1 text-tertiary">${icon("check_circle")}Done</span>`;
		case "failed":
			return `<span class="flex items-center gap-1 text-danger">${icon("error")}Failed</span>`;
		case "stopped":
			return `<span class="flex items-center gap-1 text-outline">${icon("stop_circle")}Stopped</span>`;
		case "running":
			return isStalled(inst)
				? `<span class="flex items-center gap-1 text-warning">${icon("hourglass_bottom")}Stalled</span>`
				: `<span class="flex items-center gap-1 text-primary">${icon("play_circle")}Running</span>`;
		default:
			return "";
	}
}

function renderRow(inst, refreshMedians = true) {
	const row = rowEls.get(inst.id);
	if (!row) return;
	if (refreshMedians) medianCache = null;
	if (isStalled(inst)) stalledIds.add(inst.id);
	else stalledIds.delete(inst.id);

	const tz = inst.config.timezone.split("/").pop().replaceAll("_", " ");
	const head =
		`<div role="cell" class="font-mono text-code-md font-semibold text-primary flex items-center gap-1">${label(inst)}${
			inst.retryOf ? `<span class="text-outline flex items-center" title="Retry of ${label(run.instances.get(inst.retryOf) ?? { label: "?" })}">${icon("replay", "text-[11px]")}</span>` : ""
		}</div>` +
		`<div role="cell" class="font-mono text-code-sm text-on-surface-variant truncate" title="seed ${inst.config.seed} · ${inst.config.os} · ${inst.config.timezone} · ${inst.config.lang}"><span class="text-on-surface">${inst.config.seed}</span> <span class="text-outline">${PLATFORM_SHORT[inst.config.os]} · ${escapeHtml(tz)} · ${inst.config.lang}</span></div>`;

	let middle;
	if (inst.state === "queued") {
		middle = `<div role="cell" class="col-span-(--steps) flex items-center gap-1.5 text-ui !font-normal text-outline">${icon("schedule")}Queued · launches in <span class="font-mono text-code-md text-on-surface-variant tabular-nums" data-until="${inst.scheduledAt}"></span></div>`;
	} else if (inst.state === "launching") {
		middle = `<div role="cell" class="col-span-(--steps) flex items-center gap-1.5 text-ui !font-normal text-secondary">${icon("progress_activity", "animate-spin")}Launching Chromium…</div>`;
	} else if (inst.steps.length === 0 && inst.state !== "running") {
		middle = `<div role="cell" class="col-span-(--steps) flex items-center gap-1.5 text-ui !font-normal ${inst.state === "failed" ? "text-danger" : "text-outline"} truncate">${
			inst.state === "failed" ? `${icon("error")}Failed before the first step: ${escapeHtml(inst.error?.message ?? "")}` : `${icon("stop")}Stopped before the first step`
		}</div>`;
	} else {
		middle = columns().map((name) => cell(inst, name)).join("");
	}

	const elapsed = inst.startedAt
		? `<div role="cell" class="font-mono text-code-md text-on-surface-variant text-right tabular-nums" data-since="${inst.startedAt}" data-until="${inst.endedAt ?? ""}"></div>`
		: `<div role="cell" class="font-mono text-code-md text-outline-variant text-right">–</div>`;

	row.className = "matrix-row";
	row.innerHTML = head + middle + elapsed + `<div role="cell" class="text-ui">${result(inst)}</div>`;
	row.setAttribute("aria-selected", String(inst.id === selectedId));
	for (const el of row.querySelectorAll("[data-since], [data-until]")) tickText(el);
}

function renderNavBadge() {
	const badge = $("nav-run-badge");
	if (!run) return (badge.hidden = true);
	const c = counts();
	const active = c.queued + c.launching + c.running;
	badge.hidden = false;
	badge.textContent = run.state === "finished" ? (c.failed ? `${c.failed} failed` : "done") : `${active} live`;
	badge.className = `ml-auto font-mono text-code-xs px-1.5 py-px rounded-full ${
		run.state === "finished" ? (c.failed ? "bg-danger/10 text-danger" : "bg-tertiary/10 text-tertiary") : "bg-primary-fixed text-on-primary-fixed"
	}`;
}

// ---------- Ticking ----------

function tickText(el) {
	const since = Number(el.dataset.since);
	const until = Number(el.dataset.until);
	if (el.dataset.since !== undefined) {
		el.textContent = fmtClock((until || now()) - since);
	} else if (until) {
		el.textContent = fmtClock(until - now());
	}
}

function tick() {
	if (!run || $("monitor-body").hidden) return;
	for (const el of document.querySelectorAll("#monitor-body [data-since], #monitor-body [data-until]")) tickText(el);
	// Re-render rows whose stall status flipped since the last render.
	for (const inst of run.instances.values()) {
		if (isStalled(inst) !== stalledIds.has(inst.id)) {
			renderRow(inst);
			renderHeader();
			if (drawerOpen && selectedId === inst.id) renderDrawer();
		}
	}
	if (feed !== "live") renderFeedBanner();
}

// ---------- Selection & drawer ----------

function sortedIds() {
	return [...run.instances.values()].sort((a, b) => a.label - b.label).map((i) => i.id);
}

function applySelection() {
	for (const [id, row] of rowEls) row.setAttribute("aria-selected", String(id === selectedId));
	for (const seg of $("run-tape").children) seg.setAttribute("aria-current", String(seg.dataset.id === selectedId));
	rowEls.get(selectedId)?.scrollIntoView({ block: "nearest" });
}

function select(id, { open = false } = {}) {
	selectedId = id;
	applySelection();
	if (open) openDrawer();
	else if (drawerOpen) renderDrawer();
}

function openDrawer() {
	if (!selectedId) return;
	drawerOpen = true;
	renderDrawer();
	$("drawer").classList.remove("translate-x-full");
	$("drawer").inert = false;
}

function closeDrawer() {
	drawerOpen = false;
	$("drawer").classList.add("translate-x-full");
	$("drawer").inert = true;
}

function renderDrawer() {
	const inst = run?.instances.get(selectedId);
	if (!inst) return closeDrawer();

	$("drawer-title").textContent = `Instance ${label(inst)}`;
	$("drawer-state").innerHTML = inst.state === "queued" ? `<span class="text-outline">Queued</span>` : inst.state === "launching" ? `<span class="text-secondary">Launching</span>` : result(inst);

	const original = inst.retryOf && run.instances.get(inst.retryOf);
	const retries = [...run.instances.values()].filter((i) => i.retryOf === inst.id);
	$("drawer-config").innerHTML = [
		["Seed", inst.config.seed],
		["Platform", inst.config.os],
		["Time zone", inst.config.timezone],
		["Language", inst.config.lang],
		["Started", inst.startedAt ? new Date(inst.startedAt - serverOffset).toLocaleTimeString() : "not yet"],
		["Window", inst.windowOpen ? "open" : "closed"],
		...(original ? [["Retry of", label(original)]] : []),
		...(retries.length ? [["Retried as", retries.map(label).join(", ")]] : []),
	]
		.map(([k, v]) => `<dt class="font-sans text-ui !font-normal text-outline">${k}</dt><dd class="text-on-surface truncate">${escapeHtml(v)}</dd>`)
		.join("");

	const canStop = !isTerminal(inst);
	const canClose = isTerminal(inst) && inst.windowOpen;
	const canRetry = ["failed", "stopped"].includes(inst.state) && run.state !== "stopping";
	$("btn-inst-stop").hidden = !(canStop || canClose);
	$("btn-inst-stop").querySelector("[data-label]").textContent = canStop ? "Stop instance" : "Close window";
	$("btn-inst-retry").hidden = !canRetry;
	$("drawer-actions").hidden = !(canStop || canClose || canRetry);

	const t0 = inst.startedAt;
	$("drawer-steps").innerHTML = inst.steps.length
		? inst.steps
				.map((s) => {
					const [ic, color] = { done: ["check_circle", "text-tertiary"], running: ["play_circle", "text-primary"], failed: ["error", "text-danger"], stopped: ["stop_circle", "text-outline"] }[s.state];
					const dur = s.endedAt ? fmtDur(s.endedAt - s.startedAt) : `<span data-since="${s.startedAt}"></span>`;
					return `<li class="grid grid-cols-[16px_1fr_auto_auto] items-center gap-space-sm py-1.5 border-b border-line last:border-0">
						${icon(ic, `${color} text-[14px]`)}
						<span class="text-body-sm text-on-surface truncate">${escapeHtml(s.name)}</span>
						<span class="font-mono text-code-sm text-outline tabular-nums">+${fmtClock(s.startedAt - t0)}</span>
						<span class="font-mono text-code-sm ${color} tabular-nums w-14 text-right">${dur}</span>
					</li>`;
				})
				.join("")
		: `<li class="py-1 text-body-sm text-outline">${inst.state === "queued" ? "Waiting for its launch slot." : inst.state === "launching" ? "Starting the browser." : "No steps ran."}</li>`;

	renderDiagnostics(inst);

	// A stopped instance has no error of its own, but its interrupted step keeps Playwright's call log.
	const stepErr = inst.steps.findLast((s) => s.error);
	const err = inst.error ?? stepErr?.error;
	const interrupted = !inst.error && stepErr?.state === "stopped";
	$("drawer-error").hidden = !err;
	if (err) {
		$("drawer-error-heading").textContent = interrupted ? `Interrupted in “${stepErr.name}”` : "Error";
		$("drawer-error-heading").className = `section-label ${interrupted ? "text-on-surface-variant" : "text-danger"}`;
		$("drawer-error-title").textContent = `${err.name}: ${err.message.split("\n")[0]}`;
		$("drawer-error-title").className = `text-body-sm mb-space-xs break-words ${interrupted ? "text-on-surface-variant" : "text-danger"}`;
		$("drawer-error-stack").textContent = err.stack ?? err.message;
	}
	for (const el of $("drawer").querySelectorAll("[data-since]")) tickText(el);
}

function renderDiagnostics(inst) {
	const d = inst.diagnostics;
	$("drawer-diagnostics").hidden = !d;
	if (!d) return;
	$("drawer-diag-when").textContent = d.step ? `“${d.step}”` : "failure";
	$("drawer-diag-meta").innerHTML = [
		["URL", d.url],
		["Title", d.title ?? "(no answer)"],
		["Captured", new Date(d.capturedAt - serverOffset).toLocaleTimeString()],
	]
		.map(([k, v]) => `<dt class="font-sans text-ui !font-normal text-outline">${k}</dt><dd class="text-on-surface break-all" title="${escapeHtml(v)}">${escapeHtml(v)}</dd>`)
		.join("");
	const src = `/api/instances/${inst.id}/screenshot?at=${d.capturedAt}`;
	$("drawer-diag-shot-link").hidden = !d.screenshot;
	$("drawer-diag-noshot").hidden = d.screenshot;
	if (d.screenshot && $("drawer-diag-shot-link").getAttribute("href") !== src) {
		$("drawer-diag-shot-link").href = src;
		$("drawer-diag-shot").src = src;
	}
}

// ---------- Actions ----------

async function act(fn, failTitle) {
	try {
		await fn();
	} catch (err) {
		openModal({ icon: "error", tone: "danger", title: failTitle, subtitle: "The backend rejected the request", lines: [["text-danger", err.message]] });
	}
}

function stopSelected() {
	const inst = run?.instances.get(selectedId);
	if (!inst || (isTerminal(inst) && !inst.windowOpen)) return;
	act(() => api(`/instances/${inst.id}/stop`, { method: "POST" }), `Couldn't stop ${label(inst)}`);
}

function retrySelected() {
	const inst = run?.instances.get(selectedId);
	if (!inst || !["failed", "stopped"].includes(inst.state)) return;
	act(async () => {
		const { data } = await api(`/instances/${inst.id}/retry`, { method: "POST" });
		run.instances.set(data.instance.id, data.instance);
		renderAll();
		select(data.instance.id, { open: drawerOpen });
	}, `Couldn't retry ${label(inst)}`);
}

function confirmStopRun() {
	if (!run || run.state !== "running") return;
	const c = counts();
	const open = [...run.instances.values()].filter((i) => i.windowOpen).length;
	openModal({
		icon: "dangerous",
		tone: "danger",
		title: "Stop the whole run?",
		subtitle: `Cancels ${c.queued} queued instance${c.queued === 1 ? "" : "s"} and closes ${open} open browser window${open === 1 ? "" : "s"}.`,
		confirm: { label: "Stop Run", onConfirm: () => act(() => api(`/runs/${run.id}/stop`, { method: "POST" }), "Couldn't stop the run") },
	});
}

function clearRun() {
	source?.close();
	source = null;
	run = null;
	feed = "idle";
	selectedId = null;
	stalledIds.clear();
	rowEls.clear();
	$("matrix-body").innerHTML = "";
	closeDrawer();
	document.title = initialTitle;
	renderAll();
}

function confirmDismissRun() {
	if (!run || run.state !== "finished") return;
	const id = run.id;
	const dismiss = () => act(async () => {
		await api(`/runs/${id}/dismiss`, { method: "POST" });
		if (run?.id === id) clearRun();
	}, "Couldn't dismiss the run");
	const open = [...run.instances.values()].filter((i) => i.windowOpen).length;
	if (!open) return dismiss();
	openModal({
		icon: "close",
		tone: "warn",
		title: "Dismiss this run?",
		subtitle: `Also closes ${open} browser window${open === 1 ? "" : "s"} it left open.`,
		confirm: { label: "Dismiss Run", onConfirm: dismiss },
	});
}

// ---------- Init ----------

export const monitorVisible = () => !document.querySelector('[data-view-panel="run-monitor"]').hidden;

export function initMonitor() {
	$("drawer").inert = true;
	$("matrix-body").addEventListener("click", (e) => {
		const row = e.target.closest("[data-id]");
		if (row) select(row.dataset.id, { open: true });
	});
	$("run-tape").addEventListener("click", (e) => {
		const seg = e.target.closest("[data-id]");
		if (seg) select(seg.dataset.id);
	});
	$("btn-drawer-close").addEventListener("click", closeDrawer);
	$("btn-inst-stop").addEventListener("click", stopSelected);
	$("btn-inst-retry").addEventListener("click", retrySelected);
	$("btn-stop-run").addEventListener("click", confirmStopRun);
	$("btn-dismiss-run").addEventListener("click", confirmDismissRun);
	$("btn-copy-error").addEventListener("click", async () => {
		await navigator.clipboard?.writeText($("drawer-error-stack").textContent);
		$("btn-copy-error").querySelector("[data-label]").textContent = "Copied";
		setTimeout(() => ($("btn-copy-error").querySelector("[data-label]").textContent = "Copy"), 1500);
	});

	window.addEventListener("keydown", (e) => {
		if (!run || !monitorVisible() || modalOpen()) return;
		if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
		const ids = sortedIds();
		const idx = ids.indexOf(selectedId);
		switch (e.key) {
			case "ArrowDown":
			case "ArrowUp":
				e.preventDefault();
				select(ids[Math.min(ids.length - 1, Math.max(0, idx + (e.key === "ArrowDown" ? 1 : -1)))]);
				break;
			case "Enter":
				if (e.target.tagName === "BUTTON") return;
				e.preventDefault();
				openDrawer();
				break;
			case "Escape":
				if (drawerOpen) closeDrawer();
				break;
			case "s":
			case "S":
				stopSelected();
				break;
			case "r":
			case "R":
				retrySelected();
				break;
		}
	});

	renderAll();
	setInterval(tick, 1000);
}
