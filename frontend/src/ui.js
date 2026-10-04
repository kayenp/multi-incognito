// Shared DOM helpers and the modal used by both the launcher and the run monitor.

export const $ = (id) => document.getElementById(id);

export const escapeHtml = (s) =>
	String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function api(path, { method = "GET", body } = {}) {
	const res = await fetch(`/api${path}`, {
		method,
		cache: "no-store",
		headers: body ? { "Content-Type": "application/json" } : undefined,
		body: body ? JSON.stringify(body) : undefined,
	});
	const text = await res.text();
	let data = null;
	try {
		data = text ? JSON.parse(text) : null;
	} catch {
		/* non-JSON (e.g. proxy error page) */
	}
	if (!res.ok) {
		const reason = data?.error ?? (res.status >= 500 ? "Backend unreachable — is `npm run dev` running in backend/?" : text.slice(0, 300));
		throw new Error(`HTTP ${res.status}: ${reason}`);
	}
	return { status: res.status, data };
}

// ---------- Modal ----------

const TONES = { info: "text-primary", ok: "text-tertiary", danger: "text-danger", warn: "text-warning" };
let onConfirm = null;
let returnFocus = null;

export const modalOpen = () => !$("modal").classList.contains("pointer-events-none");

export function openModal({ icon, spin = false, tone = "info", title, subtitle, lines = [], confirm = null }) {
	returnFocus = document.activeElement;
	$("modal-log").innerHTML = "";
	updateModal({ icon, spin, tone, title, subtitle });
	lines.forEach(appendLog);
	$("modal-log").hidden = lines.length === 0;

	onConfirm = confirm?.onConfirm ?? null;
	$("btn-modal-confirm").hidden = !confirm;
	if (confirm) $("btn-modal-confirm").textContent = confirm.label;
	$("btn-close-modal").textContent = confirm ? "Cancel" : "Dismiss";
	$("btn-close-modal").className = confirm ? BTN_SECONDARY : BTN_PRIMARY;

	$("modal").classList.remove("opacity-0", "pointer-events-none");
	$("modal").inert = false;
	// For confirmations, focus lands on Cancel so a stray Enter never confirms a destructive action.
	$("btn-close-modal").focus();
}

export function updateModal({ icon, spin = false, tone = "info", title, subtitle, line }) {
	$("modal-icon").textContent = icon;
	$("modal-icon").className = `icon text-[28px] ${TONES[tone]} ${spin ? "animate-spin" : ""}`;
	$("modal-title").textContent = title;
	$("modal-subtitle").textContent = subtitle;
	if (line) {
		$("modal-log").hidden = false;
		appendLog(line);
	}
}

function appendLog([cls, text]) {
	const div = document.createElement("div");
	div.className = cls;
	div.textContent = text;
	$("modal-log").append(div);
}

export function closeModal() {
	$("modal").classList.add("opacity-0", "pointer-events-none");
	$("modal").inert = true;
	onConfirm = null;
	returnFocus?.focus?.();
}

const BTN_PRIMARY = "h-10 px-space-md rounded bg-primary hover:bg-primary-hover text-white text-label-lg shadow-sm transition-colors active:translate-y-px cursor-pointer";
const BTN_SECONDARY = "h-10 px-space-md rounded bg-surface-container-lowest border border-line-strong hover:bg-surface-container hover:border-on-surface text-on-surface text-ui transition-colors cursor-pointer";

export function initModal() {
	$("modal").inert = true;
	$("btn-close-modal").addEventListener("click", closeModal);
	$("btn-modal-confirm").addEventListener("click", () => {
		const fn = onConfirm;
		closeModal();
		fn?.();
	});
	$("modal").addEventListener("click", (e) => e.target === $("modal") && closeModal());
}
