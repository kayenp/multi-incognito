import "./style.css";
import { $, escapeHtml, api, openModal, updateModal, closeModal, modalOpen, initModal } from "./ui.js";
import { setRun, loadCurrentRun, initMonitor } from "./monitor.js";

// Option sets mirror backend/utils/fingerprint.js so the UI only offers values the backend generates.
const TIMEZONES = [
	["America/New_York", "Eastern Time", "UTC-05:00"],
	["America/Detroit", "Eastern Time (Michigan)", "UTC-05:00"],
	["America/Chicago", "Central Time", "UTC-06:00"],
	["America/Indiana/Knox", "Central Time (Indiana)", "UTC-06:00"],
	["America/Menominee", "Central Time (Michigan)", "UTC-06:00"],
	["America/Denver", "Mountain Time", "UTC-07:00"],
	["America/Phoenix", "Mountain Time (no DST)", "UTC-07:00"],
	["America/Los_Angeles", "Pacific Time", "UTC-08:00"],
	["America/Anchorage", "Alaska Time", "UTC-09:00"],
	["Pacific/Honolulu", "Hawaii Time", "UTC-10:00"],
];

const LANGS = [
	["en", "English", "en;q=0.9"],
	["en-GB", "English (United Kingdom)", "en-GB,en;q=0.9"],
];

const PLATFORMS = [
	["windows", "Windows x64", "Win32"],
	["macos", "macOS", "MacIntel"],
	["linux", "Linux x86_64", "Linux x86_64"],
];

const SEED_MAX = 2147483647;
const MB_PER_INSTANCE = 380;
const DELAY_PRESETS = [0, 1000, 5000, 10000];
const PRESETS_KEY = "multi-incognito:presets";

const DEFAULTS = {
	timezone: "America/New_York",
	lang: "en",
	os: "windows",
	seed: 1234567890,
	autoSeed: true,
	autoProfile: false,
	instances: 1,
	staggerMs: 10000,
};

let state = { ...DEFAULTS };
let launches = 0;
let backendOnline = false;

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[randInt(0, arr.length - 1)];
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function randomSeed() {
	const buf = new Uint32Array(1);
	crypto.getRandomValues(buf);
	return buf[0] % (SEED_MAX + 1);
}

function fillSelect(select, rows, label) {
	select.innerHTML = rows.map(([value, ...rest]) => `<option value="${value}">${label(value, ...rest)}</option>`).join("");
}

// ---------- Rendering ----------

function cliFlags() {
	return [
		["text-outline", "--no-first-run"],
		["text-primary", `--fingerprint=${state.seed}`],
		["text-on-primary-fixed bg-primary-fixed px-1 rounded-sm", `--fingerprint-platform=${state.autoProfile ? "<random>" : state.os}`],
		["text-tertiary", `--timezone=${state.autoProfile ? "<random>" : state.timezone}`],
		["text-secondary", `--lang=${state.autoProfile ? "<random>" : state.lang}`],
	];
}

function cliText() {
	return ["chromium", ...cliFlags().map(([, f]) => f)].join(" ");
}

function render() {
	$("tz-select").value = state.timezone;
	$("lang-select").value = state.lang;
	$("os-select").value = state.os;
	if (document.activeElement !== $("seed-input")) $("seed-input").value = state.seed;
	$("auto-seed-toggle").checked = state.autoSeed;
	$("auto-profile-toggle").checked = state.autoProfile;
	// With a per-instance profile the backend picks these, so the fixed choices don't apply.
	for (const id of ["tz-select", "lang-select", "os-select", "btn-rand-tz", "btn-rand-lang", "btn-rand-os"]) $(id).disabled = state.autoProfile;
	for (const id of ["tz-select", "lang-select", "os-select"]) $(id).closest(".panel").classList.toggle("opacity-50", state.autoProfile);
	if (document.activeElement !== $("instance-count-input")) $("instance-count-input").value = state.instances;
	if (document.activeElement !== $("launch-delay-input")) $("launch-delay-input").value = state.staggerMs;

	const tz = TIMEZONES.find(([v]) => v === state.timezone);
	$("tz-badge").innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse"></span>${tz[2]} • ${tz[0]}`;
	$("lang-chip").textContent = LANGS.find(([v]) => v === state.lang)[2];
	const platform = PLATFORMS.find(([v]) => v === state.os);
	$("os-preview").textContent = `"${platform[2]}"`;

	$("policy-label").textContent = state.autoProfile
		? state.autoSeed ? "Per-instance Random (full profile)" : "Per-instance Random Profile · Fixed Seed"
		: state.autoSeed ? "Per-instance Random Seed" : "Fixed Seed";

	// Batch
	const totalMb = state.instances * MB_PER_INSTANCE;
	$("inst-badge").textContent = `${state.instances}x spawn (~${formatMem(totalMb)})`;
	$("exec-mode-badge").textContent = state.instances === 1 ? "Single Launch" : state.staggerMs === 0 ? "Parallel Burst" : "Sequential Stagger";
	$("launch-label").textContent = state.instances === 1 ? "Launch Chromium Instance" : `Launch ${state.instances} Chromium Instances`;
	for (const btn of $("delay-presets").children) {
		const active = Number(btn.dataset.delay) === state.staggerMs;
		btn.className = `h-7 px-space-sm rounded-sm border font-mono text-code-sm transition-colors active:translate-y-px cursor-pointer ${
			active ? "bg-ink border-ink text-white" : "bg-surface-container-lowest border-line-strong hover:bg-surface-container text-on-surface-variant hover:text-on-surface"
		}`;
	}

	// Memory estimate
	const budgetGb = navigator.deviceMemory ?? 16;
	const pct = (totalMb / 1024 / budgetGb) * 100;
	const level = pct < 60 ? ["NOMINAL", "text-tertiary", "bg-primary-container"] : pct < 90 ? ["ELEVATED", "text-warning", "bg-warning"] : ["OVER BUDGET", "text-danger", "bg-danger"];
	$("mem-state").textContent = level[0];
	$("mem-state").className = `section-label px-1 py-0.5 rounded-sm bg-surface-container ${level[1]}`;
	$("mem-usage-text").innerHTML = `${formatMem(totalMb)} / ${budgetGb.toFixed(1)} GB <span class="${level[1]} text-code-xs font-normal">(${pct.toFixed(1)}%)</span>`;
	for (const id of ["mem-gauge-bar", "sidebar-ram-bar"]) {
		$(id).style.width = `${Math.min(pct, 100)}%`;
		$(id).className = `h-full transition-all duration-300 ${level[2]}`;
	}
	$("sidebar-ram-text").textContent = formatMem(totalMb);
	$("mem-instances").textContent = state.instances;
	$("mem-ramp").textContent = formatDuration((state.instances - 1) * state.staggerMs);
	$("mem-budget").textContent = `${budgetGb} GB`;

	// CLI
	$("cli").innerHTML =
		`<span class="text-primary font-semibold">chromium</span>` +
		cliFlags()
			.map(([cls, f]) => `<span class="${cls}">${escapeHtml(f)}</span>`)
			.join("") +
		`<span class="text-outline-variant pl-2"># ×${state.instances}${state.instances > 1 ? ` @ ${state.staggerMs}ms stagger` : ""}${[state.autoSeed && "seed", state.autoProfile && "os/timezone/lang"].filter(Boolean).map((s) => `, ${s} randomized per instance`).join("")}</span>`;

	$("footer-launches").textContent = launches;
}

function formatMem(mb) {
	return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

function formatDuration(ms) {
	if (ms < 1000) return `${ms} ms`;
	const s = ms / 1000;
	return s < 60 ? `${s.toFixed(s % 1 ? 1 : 0)} s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

function setState(patch) {
	state = { ...state, ...patch };
	render();
}

// ---------- Backend ----------

function setBackendStatus(online) {
	backendOnline = online;
	const [dot, text, color] = online ? ["bg-tertiary animate-pulse", "Ready to Launch", "text-tertiary"] : ["bg-danger", "Backend Offline", "text-danger"];
	$("status-dot").className = `w-2 h-2 rounded-full ${dot}`;
	$("status-text").textContent = text;
	$("status-pill").className = `flex items-center gap-space-xs h-7 px-space-sm rounded-full bg-surface-container border border-line font-mono text-code-sm font-semibold ${color}`;
	$("sidebar-dot").className = `w-2 h-2 rounded-full ${online ? "bg-tertiary animate-pulse" : "bg-danger"}`;
	$("sidebar-backend").textContent = online ? ":3000 online" : "offline";
	$("sidebar-backend").className = `font-mono text-code-sm ${online ? "text-tertiary" : "text-danger"}`;
	$("footer-dot").className = `w-2 h-2 rounded-full ${online ? "bg-tertiary" : "bg-danger"}`;
}

async function pingBackend() {
	try {
		// Any non-5xx response (including 404) means Express answered; the Vite proxy returns 5xx when it's down.
		const res = await fetch("/api/health", { cache: "no-store" });
		setBackendStatus(res.status < 500);
	} catch {
		setBackendStatus(false);
	}
}

function launchPayload() {
	return {
		timezone: state.timezone,
		lang: state.lang,
		os: state.os,
		seed: state.autoSeed ? null : state.seed,
		autoSeed: state.autoSeed,
		autoProfile: state.autoProfile,
		instances: state.instances,
		staggerMs: state.staggerMs,
	};
}

function validate() {
	const errors = [];
	if (!TIMEZONES.some(([v]) => v === state.timezone)) errors.push(`Unknown timezone "${state.timezone}"`);
	if (!LANGS.some(([v]) => v === state.lang)) errors.push(`Unknown lang "${state.lang}"`);
	if (!PLATFORMS.some(([v]) => v === state.os)) errors.push(`Unknown platform "${state.os}"`);
	if (!Number.isInteger(state.seed) || state.seed < 0 || state.seed > SEED_MAX) errors.push(`Seed must be an integer in [0, ${SEED_MAX}]`);
	if (state.instances < 1 || state.instances > 50) errors.push("Instances must be between 1 and 50");
	if (state.staggerMs < 0) errors.push("Stagger must be ≥ 0 ms");
	return errors;
}

async function launch() {
	if (modalOpen()) return;
	const errors = validate();
	if (errors.length) {
		openModal({ icon: "error", tone: "danger", title: "Invalid Configuration", subtitle: "Fix the following before launching", lines: errors.map((e) => ["text-danger", `[ERR] ${e}`]) });
		return;
	}

	const payload = launchPayload();
	$("btn-launch").disabled = true;
	openModal({
		icon: "progress_activity",
		spin: true,
		title: "Starting Run",
		subtitle: `POST /api/launch · ${payload.instances} instance${payload.instances > 1 ? "s" : ""}`,
		lines: [["text-outline", `> ${JSON.stringify(payload)}`]],
	});

	try {
		const { data } = await api("/launch", { method: "POST", body: payload });
		launches += payload.instances;
		closeModal();
		setRun(data.run, data.now);
		location.hash = "run-monitor";
		if (state.autoSeed) setState({ seed: randomSeed() });
	} catch (err) {
		updateModal({ icon: "error", tone: "danger", title: "Launch Failed", subtitle: "The backend rejected or did not answer the request", line: ["text-danger", `[ERR] ${err.message}`] });
	} finally {
		$("btn-launch").disabled = false;
		render();
	}
}

// ---------- Presets ----------

function loadPresets() {
	try {
		return JSON.parse(localStorage.getItem(PRESETS_KEY)) ?? {};
	} catch {
		return {};
	}
}

function savePresets(presets) {
	try {
		localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
	} catch {
		/* storage unavailable — presets just won't persist */
	}
}

function renderPresets() {
	const presets = loadPresets();
	const names = Object.keys(presets);
	$("preset-list").innerHTML = names.length
		? names
				.map(
					(n) => `<li class="flex items-center group">
						<button type="button" data-load="${escapeHtml(n)}" class="flex-1 text-left truncate px-space-sm py-1.5 rounded text-body-md text-on-surface-variant hover:bg-surface-container hover:text-on-surface cursor-pointer">${escapeHtml(n)}</button>
						<button type="button" data-delete="${escapeHtml(n)}" aria-label="Delete preset ${escapeHtml(n)}" class="opacity-0 group-hover:opacity-100 focus:opacity-100 w-6 h-6 rounded-sm flex items-center justify-center text-outline hover:text-danger hover:bg-danger/10 cursor-pointer"><span class="icon text-[14px]">close</span></button>
					</li>`,
				)
				.join("")
		: `<li class="px-space-sm py-1.5 text-body-md text-outline">None saved</li>`;
}

// ---------- Navigation ----------

const NAV_ACTIVE = "flex items-center gap-space-sm px-space-md py-space-sm rounded bg-ink text-white text-label-lg shadow-sm [&>.icon]:text-primary-bright";
const NAV_IDLE = "flex items-center gap-space-sm px-space-md py-space-sm rounded text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors text-label-lg !font-medium";

const PANELS = ["launcher-profiles", "run-monitor"];

function route() {
	const view = location.hash.slice(1) || "launcher-profiles";
	const link = document.querySelector(`#nav a[data-view="${view}"]`) ?? document.querySelector("#nav a");
	for (const a of document.querySelectorAll("#nav a")) {
		const active = a === link;
		a.className = active ? NAV_ACTIVE : NAV_IDLE;
		if (active) a.setAttribute("aria-current", "page");
		else a.removeAttribute("aria-current");
	}
	const panel = PANELS.includes(link.dataset.view) ? link.dataset.view : "placeholder";
	for (const el of document.querySelectorAll("[data-view-panel]")) el.hidden = el.dataset.viewPanel !== panel;
	if (panel === "placeholder") {
		const [icon, label] = link.querySelectorAll("span");
		$("placeholder-icon").textContent = icon.textContent;
		$("placeholder-title").textContent = label.textContent;
	}
}

// ---------- Wiring ----------

function init() {
	fillSelect($("tz-select"), TIMEZONES, (v, name, offset) => `${v} (${name}, ${offset})`);
	fillSelect($("lang-select"), LANGS, (v, name) => `${v} — ${name}`);
	fillSelect($("os-select"), PLATFORMS, (v, name) => `${name} (${v})`);
	$("delay-presets").innerHTML = DELAY_PRESETS.map((d) => `<button type="button" data-delay="${d}">${d >= 1000 ? `${d / 1000}s` : `${d}ms`}</button>`).join("");

	$("tz-select").addEventListener("change", (e) => setState({ timezone: e.target.value }));
	$("lang-select").addEventListener("change", (e) => setState({ lang: e.target.value }));
	$("os-select").addEventListener("change", (e) => setState({ os: e.target.value }));
	$("seed-input").addEventListener("input", (e) => {
		const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
		const seed = clamp(Number(digits || 0), 0, SEED_MAX);
		e.target.value = digits === "" ? "" : seed;
		setState({ seed });
	});
	$("seed-input").addEventListener("blur", render);
	$("auto-seed-toggle").addEventListener("change", (e) => setState({ autoSeed: e.target.checked }));
	$("auto-profile-toggle").addEventListener("change", (e) => setState({ autoProfile: e.target.checked }));

	$("btn-rand-tz").addEventListener("click", () => setState({ timezone: pick(TIMEZONES)[0] }));
	$("btn-rand-lang").addEventListener("click", () => setState({ lang: pick(LANGS)[0] }));
	$("btn-rand-os").addEventListener("click", () => setState({ os: pick(PLATFORMS)[0] }));
	$("btn-rand-seed").addEventListener("click", () => setState({ seed: randomSeed() }));
	$("btn-randomize-all").addEventListener("click", () =>
		setState({ timezone: pick(TIMEZONES)[0], lang: pick(LANGS)[0], os: pick(PLATFORMS)[0], seed: randomSeed() }),
	);
	$("btn-reset").addEventListener("click", () => {
		$("crumb-preset").textContent = "default";
		setState({ ...DEFAULTS });
	});

	$("btn-copy-seed").addEventListener("click", async () => {
		await navigator.clipboard?.writeText(String(state.seed));
		$("btn-copy-seed").classList.add("!text-primary");
		setTimeout(() => $("btn-copy-seed").classList.remove("!text-primary"), 800);
	});
	$("btn-copy-cli").addEventListener("click", async () => {
		await navigator.clipboard?.writeText(cliText());
		$("copy-notif").style.opacity = "1";
		setTimeout(() => ($("copy-notif").style.opacity = "0"), 1800);
	});

	const setInstances = (n) => setState({ instances: clamp(Number.isFinite(n) ? Math.round(n) : 1, 1, 50) });
	$("btn-inst-dec").addEventListener("click", () => setInstances(state.instances - 1));
	$("btn-inst-inc").addEventListener("click", () => setInstances(state.instances + 1));
	$("instance-count-input").addEventListener("change", (e) => setInstances(Number(e.target.value)));
	$("launch-delay-input").addEventListener("change", (e) => setState({ staggerMs: clamp(Math.round(Number(e.target.value) || 0), 0, 60000) }));
	$("delay-presets").addEventListener("click", (e) => {
		const btn = e.target.closest("[data-delay]");
		if (btn) setState({ staggerMs: Number(btn.dataset.delay) });
	});

	$("btn-launch").addEventListener("click", launch);
	$("btn-validate").addEventListener("click", () => {
		const errors = validate();
		openModal(
			errors.length
				? { icon: "error", tone: "danger", title: "Dry Run: Failed", subtitle: `${errors.length} problem(s) found`, lines: errors.map((e) => ["text-danger", `[ERR] ${e}`]) }
				: {
						icon: "fact_check",
						tone: "ok",
						title: "Dry Run: Passed",
						subtitle: `Backend ${backendOnline ? "reachable" : "unreachable"} · nothing was launched`,
						lines: [
							["text-tertiary", "[OK] Config is valid"],
							[backendOnline ? "text-tertiary" : "text-warning", `[${backendOnline ? "OK" : "WARN"}] Backend ${backendOnline ? "online" : "offline"}`],
							["text-outline", `[CMD] ${cliText()}`],
						],
					},
		);
	});
	$("btn-save-preset").addEventListener("click", () => {
		const name = prompt("Preset name:", $("crumb-preset").textContent)?.trim();
		if (!name) return;
		const presets = loadPresets();
		presets[name] = { ...state };
		savePresets(presets);
		$("crumb-preset").textContent = name;
		renderPresets();
	});
	$("btn-inspect").addEventListener("click", () =>
		openModal({ icon: "data_object", title: "Launch Payload", subtitle: "Body sent to POST /api/launch", lines: [["text-primary", JSON.stringify(launchPayload(), null, 2)]] }),
	);

	$("preset-list").addEventListener("click", (e) => {
		const load = e.target.closest("[data-load]")?.dataset.load;
		const del = e.target.closest("[data-delete]")?.dataset.delete;
		const presets = loadPresets();
		if (load && presets[load]) {
			$("crumb-preset").textContent = load;
			setState({ ...DEFAULTS, ...presets[load] });
			location.hash = "launcher-profiles";
		} else if (del) {
			delete presets[del];
			savePresets(presets);
			renderPresets();
		}
	});

	initModal();
	initMonitor();
	window.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && modalOpen()) return closeModal();
		const onLauncher = !document.querySelector('[data-view-panel="launcher-profiles"]').hidden;
		const tag = e.target.tagName;
		if (e.key === "Enter" && onLauncher && !modalOpen() && tag !== "BUTTON" && tag !== "SELECT" && tag !== "A") {
			e.preventDefault();
			e.target.blur?.();
			launch();
		}
	});

	window.addEventListener("hashchange", route);

	route();
	renderPresets();
	render();
	pingBackend();
	setInterval(pingBackend, 5000);
	loadCurrentRun();
}

init();
