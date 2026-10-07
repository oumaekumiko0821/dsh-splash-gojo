/**
 * dsh-boot-splash — the host half, and the whole plugin.
 *
 * A boot animation has to be on screen from the first painted frame, before
 * any plugin bundle has loaded and before the application mounts. The only
 * supported place for that is the boot HTML itself, so this plugin
 * contributes rows to `webserver/index-inject` and nothing else:
 *
 *   - a head `style` row carrying the whole sequence, plus a CSS failsafe,
 *   - a body `html` row carrying the overlay and the inlined artwork,
 *   - a body `script` row carrying the handover: the animation leaves as soon
 *     as the frontend's own boot card is gone (the moment the application
 *     mounts), on a hard cap, or when the user skips it.
 *
 * The overlay sits immediately after `<body>`, outside `#root`, so the
 * renderer's hydration never sees it and it never fights the app for a node.
 * When JavaScript is dead the body rows never run the handover and the CSS
 * failsafe uncovers the viewport on its own.
 *
 * No imports, no services, no client bundle: if this module loads at all,
 * boot is unaffected.
 */

/** Opening artwork. Replaced with a data URI by scripts/build.mjs. */
const BOOT_IMAGE = '__BOOT_IMAGE__';

/** Layer identity shared by the markup, the stylesheet, and the handover script. */
const ROOT_ATTR = 'data-dsh-boot-splash';
const EXIT_ATTR = 'data-dsh-splash-exiting';
const LANG_ATTR = 'data-dsh-splash-lang';

/** The frontend's own loading card: its removal means "the application mounted". */
const BOOT_CARD = '[data-dsh-boot]';

/** Tunables, overridable per surface through the profile patch's `config` block. */
const DEFAULTS = {
	enabled: true,
	/** One full pass of the opening motion. */
	minShowMs: 2600,
	/** Hard cap: past this the layer leaves on its own, ready or not. */
	maxShowMs: 9000,
	wordmark: 'DEEPSEEK HARNESS',
	allowSkip: true
};

/** The CSS failsafe outlives the script's cap so the script normally wins the race. */
const FAILSAFE_MARGIN_MS = 1500;
/** Exit fade, mirrored by the `transition` in the stylesheet. */
const EXIT_MS = 620;

const Z_INDEX = 100000;

/** Read one config field, tolerating a plain object, a live config wrapper, or absence. */
function readField(source, key) {
	if (source === null || typeof source !== 'object') return undefined;
	const field = source[key];
	if (field === null || field === undefined) return undefined;
	return typeof field.get === 'function' ? field.get() : field;
}

/** A whole number within bounds, or the default. */
function readNumber(source, key, fallback, min, max) {
	const value = Number(readField(source, key));
	if (!Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(min, Math.round(value)));
}

/** A non-empty string, or the default. */
function readText(source, key, fallback) {
	const value = readField(source, key);
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

/** A boolean, or the default. */
function readFlag(source, key, fallback) {
	const value = readField(source, key);
	return typeof value === 'boolean' ? value : fallback;
}

/** Resolve the injected rows' behavior from the surface's config. */
function readOptions(config) {
	return {
		minShowMs: readNumber(config, 'minShowMs', DEFAULTS.minShowMs, 200, 30000),
		maxShowMs: readNumber(config, 'maxShowMs', DEFAULTS.maxShowMs, 500, 120000),
		wordmark: readText(config, 'wordmark', DEFAULTS.wordmark),
		allowSkip: readFlag(config, 'allowSkip', DEFAULTS.allowSkip)
	};
}

/** Escape a configured string for the injected markup. */
function escapeHtml(value) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** The whole opening sequence as one stylesheet. */
function stylesheet(options) {
	return `
[${ROOT_ATTR}] {
	position: fixed;
	inset: 0;
	z-index: ${Z_INDEX};
	overflow: hidden;
	background: #05030c;
	isolation: isolate;
	cursor: default;
	user-select: none;
	-webkit-user-select: none;
	transition: opacity ${EXIT_MS}ms cubic-bezier(0.33, 0, 0.2, 1);
	animation: dshs-failsafe ${options.maxShowMs + FAILSAFE_MARGIN_MS}ms linear forwards;
}
[${ROOT_ATTR}],
[${ROOT_ATTR}] *,
[${ROOT_ATTR}] *::before,
[${ROOT_ATTR}] *::after { box-sizing: border-box; }
[${ROOT_ATTR}][${EXIT_ATTR}] {
	opacity: 0;
	pointer-events: none;
	transition: opacity ${EXIT_MS}ms cubic-bezier(0.33, 0, 0.2, 1);
}

/* The failsafe: if the handover script never runs, the layer still uncovers the
   application. Visibility interpolation keeps it visible until the very end. */
@keyframes dshs-failsafe {
	0% { visibility: visible; }
	100% { visibility: hidden; pointer-events: none; }
}

[${ROOT_ATTR}] .dshs-art {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
	object-fit: cover;
	object-position: center 44%;
	transform: scale(1.14);
	animation: dshs-settle 3400ms cubic-bezier(0.16, 0.84, 0.24, 1) forwards;
	will-change: transform;
}
@keyframes dshs-settle {
	from { transform: scale(1.14); }
	to { transform: scale(1.005); }
}

[${ROOT_ATTR}] .dshs-scrim {
	position: absolute;
	inset: 0;
	background:
		radial-gradient(118% 78% at 50% 44%, rgba(0, 0, 0, 0) 36%, rgba(4, 2, 12, 0.74) 100%),
		linear-gradient(to top, rgba(4, 2, 12, 0.94) 0%, rgba(4, 2, 12, 0.42) 24%, rgba(4, 2, 12, 0) 54%),
		linear-gradient(to bottom, rgba(4, 2, 12, 0.6) 0%, rgba(4, 2, 12, 0) 22%);
}

[${ROOT_ATTR}] .dshs-bloom {
	position: absolute;
	left: 50%;
	top: 46%;
	width: 66vmax;
	height: 66vmax;
	margin: -33vmax 0 0 -33vmax;
	background: radial-gradient(circle, rgba(206, 170, 255, 0.4) 0%, rgba(152, 112, 255, 0.17) 32%, rgba(90, 60, 190, 0) 62%);
	mix-blend-mode: screen;
	opacity: 0;
	animation: dshs-bloom 2600ms ease-in-out 180ms forwards;
}
@keyframes dshs-bloom {
	0% { opacity: 0; transform: scale(0.86); }
	38% { opacity: 0.95; transform: scale(1); }
	100% { opacity: 0.5; transform: scale(1.06); }
}

[${ROOT_ATTR}] .dshs-beam {
	position: absolute;
	left: 0;
	right: 0;
	top: 52.5%;
	height: 2px;
	background: linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(206, 226, 255, 0.9) 45%, #ffffff 50%, rgba(216, 190, 255, 0.9) 55%, rgba(255, 255, 255, 0) 100%);
	box-shadow: 0 0 18px 4px rgba(180, 170, 255, 0.5), 0 0 64px 16px rgba(140, 110, 255, 0.32);
	mix-blend-mode: screen;
	opacity: 0;
	animation: dshs-beam 2300ms cubic-bezier(0.3, 0.7, 0.2, 1) 300ms forwards;
	will-change: transform, opacity;
}
@keyframes dshs-beam {
	0% { opacity: 0; transform: translate3d(-120%, 0, 0); }
	10% { opacity: 0.95; }
	72% { opacity: 0.7; }
	100% { opacity: 0; transform: translate3d(120%, 0, 0); }
}

[${ROOT_ATTR}] .dshs-hud {
	position: absolute;
	left: clamp(28px, 5.2vw, 78px);
	bottom: clamp(26px, 5vh, 66px);
	display: flex;
	flex-direction: column;
	gap: 11px;
	max-width: min(560px, 74vw);
	font-family: ui-sans-serif, system-ui, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;
	color: #eef0ff;
	text-shadow: 0 1px 14px rgba(0, 0, 0, 0.66);
}
[${ROOT_ATTR}] .dshs-mark {
	font-size: clamp(18px, 1.5vw, 25px);
	font-weight: 600;
	text-transform: uppercase;
	letter-spacing: 0.17em;
	opacity: 0;
	animation: dshs-mark 1100ms cubic-bezier(0.2, 0.8, 0.2, 1) 320ms forwards;
}
@keyframes dshs-mark {
	from { opacity: 0; letter-spacing: 0.44em; transform: translateY(14px); filter: blur(7px); }
	to { opacity: 1; letter-spacing: 0.17em; transform: translateY(0); filter: blur(0); }
}
[${ROOT_ATTR}] .dshs-sub {
	font-size: 11.5px;
	letter-spacing: 0.28em;
	text-transform: uppercase;
	color: rgba(214, 206, 255, 0.6);
	opacity: 0;
	animation: dshs-fade-in 900ms ease-out 880ms forwards;
}
@keyframes dshs-fade-in {
	from { opacity: 0; }
	to { opacity: 1; }
}
[${ROOT_ATTR}] .dshs-track {
	position: relative;
	width: min(360px, 46vw);
	height: 3px;
	border-radius: 2px;
	background: rgba(255, 255, 255, 0.16);
	box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06) inset;
	overflow: hidden;
}
[${ROOT_ATTR}] .dshs-fill {
	position: absolute;
	top: 0;
	bottom: 0;
	left: 0;
	width: 0;
	border-radius: 2px;
	background: linear-gradient(90deg, #7f6bff 0%, #c9b6ff 58%, #ffffff 100%);
	box-shadow: 0 0 16px 1px rgba(178, 148, 255, 0.95);
	transition: width 280ms cubic-bezier(0.22, 0.9, 0.24, 1);
	animation: dshs-fill-idle ${options.minShowMs}ms cubic-bezier(0.16, 0.84, 0.24, 1) forwards;
}
@keyframes dshs-fill-idle {
	from { width: 0%; }
	to { width: 88%; }
}
[${ROOT_ATTR}] .dshs-fill::after {
	content: "";
	position: absolute;
	inset: 0;
	background: linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0));
	animation: dshs-shimmer 1500ms linear infinite;
}
@keyframes dshs-shimmer {
	from { transform: translate3d(-100%, 0, 0); }
	to { transform: translate3d(100%, 0, 0); }
}
[${ROOT_ATTR}] .dshs-status {
	display: flex;
	align-items: baseline;
	gap: 12px;
	font-size: 11px;
	letter-spacing: 0.18em;
	color: rgba(232, 226, 255, 0.8);
	font-variant-numeric: tabular-nums;
}
[${ROOT_ATTR}] .dshs-phase {
	position: relative;
	display: inline-block;
	min-width: 13.5em;
	height: 1.35em;
	white-space: nowrap;
}
[${ROOT_ATTR}] .dshs-phase > span {
	position: absolute;
	left: 0;
	top: 0;
	opacity: 0;
	animation-duration: 1200ms;
	animation-timing-function: cubic-bezier(0.2, 0.8, 0.2, 1);
	animation-fill-mode: forwards;
}
[${ROOT_ATTR}] .dshs-phase > span:nth-child(1) { animation-name: dshs-phase-pass; }
[${ROOT_ATTR}] .dshs-phase > span:nth-child(2) { animation-name: dshs-phase-pass; animation-delay: 1200ms; }
[${ROOT_ATTR}] .dshs-phase > span:nth-child(3) { animation-name: dshs-phase-hold; animation-delay: 2400ms; }
@keyframes dshs-phase-pass {
	0% { opacity: 0; transform: translateY(5px); }
	12% { opacity: 1; transform: translateY(0); }
	84% { opacity: 1; transform: translateY(0); }
	100% { opacity: 0; transform: translateY(-3px); }
}
@keyframes dshs-phase-hold {
	0% { opacity: 0; transform: translateY(5px); }
	20% { opacity: 1; transform: translateY(0); }
	100% { opacity: 1; transform: translateY(0); }
}
[${ROOT_ATTR}] .dshs-pct { color: rgba(255, 255, 255, 0.46); }
[${ROOT_ATTR}] .dshs-pct:empty { display: none; }

[${ROOT_ATTR}] .dshs-lang-en { display: none; }
[${LANG_ATTR}="en"] .dshs-lang-zh { display: none; }
[${LANG_ATTR}="en"] .dshs-lang-en { display: inline; }

[${ROOT_ATTR}] .dshs-skip {
	position: absolute;
	right: clamp(24px, 4vw, 62px);
	bottom: clamp(26px, 5vh, 66px);
	font-family: ui-sans-serif, system-ui, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;
	font-size: 10.5px;
	letter-spacing: 0.22em;
	text-transform: uppercase;
	color: rgba(236, 230, 255, 0.55);
	opacity: 0;
	animation: dshs-fade-in 520ms ease-out 1500ms forwards;
}

[${ROOT_ATTR}] .dshs-flash {
	position: absolute;
	inset: 0;
	background: radial-gradient(circle at 50% 48%, rgba(255, 255, 255, 0.92) 0%, rgba(196, 166, 255, 0.34) 30%, rgba(0, 0, 0, 0) 68%);
	mix-blend-mode: screen;
	opacity: 0;
}
[${ROOT_ATTR}][${EXIT_ATTR}] .dshs-flash { animation: dshs-flash ${EXIT_MS}ms ease-out forwards; }
@keyframes dshs-flash {
	0% { opacity: 0; }
	16% { opacity: 0.86; }
	100% { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
	[${ROOT_ATTR}] .dshs-art { transform: scale(1.02); animation: none; }
	[${ROOT_ATTR}] .dshs-bloom { opacity: 0.45; transform: none; animation: none; }
	[${ROOT_ATTR}] .dshs-beam { display: none; }
	[${ROOT_ATTR}] .dshs-mark { opacity: 1; letter-spacing: 0.17em; transform: none; filter: none; animation: none; }
	[${ROOT_ATTR}] .dshs-sub,
	[${ROOT_ATTR}] .dshs-skip { opacity: 1; animation: none; }
	[${ROOT_ATTR}] .dshs-phase > span { animation: none; }
	[${ROOT_ATTR}] .dshs-phase > span:nth-child(3) { opacity: 1; }
	[${ROOT_ATTR}] .dshs-fill { animation: none; width: 100%; }
	[${ROOT_ATTR}] .dshs-fill::after { animation: none; }
}
`;
}

/** The overlay markup, artwork included: painted on the first frame, script or not. */
function markup(options) {
	return `<div ${ROOT_ATTR} data-dsh-splash-owner="dsh-boot-splash">
<img class="dshs-art" src="${BOOT_IMAGE}" alt="" draggable="false" decoding="async">
<div class="dshs-scrim"></div>
<div class="dshs-bloom"></div>
<div class="dshs-beam"></div>
<div class="dshs-hud">
<div class="dshs-mark">${escapeHtml(options.wordmark)}</div>
<div class="dshs-sub"><span class="dshs-lang-zh">启动序列 · BOOT SEQUENCE</span><span class="dshs-lang-en">BOOT SEQUENCE</span></div>
<div class="dshs-track"><div class="dshs-fill"></div></div>
<div class="dshs-status"><span class="dshs-phase"><span><span class="dshs-lang-zh">初始化内核</span><span class="dshs-lang-en">initializing core</span></span><span><span class="dshs-lang-zh">装载插件</span><span class="dshs-lang-en">loading plugins</span></span><span><span class="dshs-lang-zh">恢复会话</span><span class="dshs-lang-en">restoring session</span></span></span><span class="dshs-pct"></span></div>
</div>
<div class="dshs-skip"><span class="dshs-lang-zh">点击跳过</span><span class="dshs-lang-en">click to skip</span></div>
<div class="dshs-flash"></div>
</div>`;
}

/** The handover: leave on the mount signal, on the cap, or on a deliberate input. */
function handover(options) {
	return `(() => {
var root = document.querySelector('[${ROOT_ATTR}]')
if (root === null) return
var MIN = ${options.minShowMs}
var CAP = ${options.maxShowMs}
var ALLOW_SKIP = ${options.allowSkip ? 'true' : 'false'}
var started = Date.now()
var released = false
var sawBoot = document.querySelector('${BOOT_CARD}') !== null
var fill = root.querySelector('.dshs-fill')
var pct = root.querySelector('.dshs-pct')
var last = root.querySelector('.dshs-phase > span:last-child')
if ((document.documentElement.getAttribute('lang') || navigator.language || 'en').toLowerCase().indexOf('zh') !== 0) document.documentElement.setAttribute('${LANG_ATTR}', 'en')

function release() {
	if (released) return
	released = true
	clearInterval(poll)
	cancelAnimationFrame(frame)
	if (fill !== null) { fill.style.animation = 'none'; fill.style.width = '100%' }
	if (pct !== null) pct.textContent = '100%'
	if (last !== null) {
		var zh = last.querySelector('.dshs-lang-zh')
		var en = last.querySelector('.dshs-lang-en')
		if (zh !== null) zh.textContent = '就绪'
		if (en !== null) en.textContent = 'ready'
		last.style.animation = 'none'
		last.style.opacity = '1'
	}
	root.style.animation = 'none'
	root.setAttribute('${EXIT_ATTR}', '')
	setTimeout(function () { if (root.parentNode !== null) root.parentNode.removeChild(root) }, ${EXIT_MS + 80})
}

function arm() {
	var wait = MIN - (Date.now() - started)
	if (wait <= 0) release()
	else setTimeout(release, wait)
}

function check() {
	if (released) return
	if (document.querySelector('${BOOT_CARD}') !== null) { sawBoot = true; return }
	var app = document.getElementById('root')
	if (sawBoot || (app !== null && app.querySelector(':scope > *:not([data-dsh-boot])') !== null)) arm()
}

function tick() {
	if (released) return
	var ratio = Math.min(1, (Date.now() - started) / MIN)
	if (pct !== null) pct.textContent = Math.round((1 - Math.pow(1 - ratio, 3)) * 88) + '%'
	frame = requestAnimationFrame(tick)
}

var poll = setInterval(check, 140)
var frame = requestAnimationFrame(tick)
check()
setTimeout(release, CAP)

if (ALLOW_SKIP) {
	root.addEventListener('pointerdown', release)
	window.addEventListener('keydown', function (event) {
		if (event.key === 'Escape' || event.key === ' ' || event.key === 'Enter') release()
	}, true)
}
})()`;
}

/** Every row this plugin contributes to one boot HTML render. */
function buildRows(options) {
	return [
		{ kind: 'style', text: stylesheet(options) },
		{ kind: 'html', placement: 'body', html: markup(options) },
		{ kind: 'script', placement: 'body', text: handover(options) }
	];
}

/**
 * Contribute the opening sequence to every boot HTML the host serves.
 * @param ctx - Host plugin context.
 * @param config - Optional per-surface overrides from the profile patch.
 */
export function apply(ctx, config) {
	const enabled = readFlag(config, 'enabled', DEFAULTS.enabled);
	if (!enabled) return;
	ctx.on('webserver/index-inject', (table) => {
		table.push(...buildRows(readOptions(config)));
	});
}
