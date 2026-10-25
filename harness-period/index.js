import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Host half of @local/harness-period.
 *
 * Reads the same prices.json tokenlensbar uses and exposes a small, read-only
 * clock config. The index gets it injected for the first paint, and the Client
 * can re-read it from the local route without a page reload when prices.json
 * changes.
 *
 * tokenlensbar stores its files under ~/.tokenlensbar; older tokenlens installs
 * used ~/.tokenlens. Both are checked on every request, and the
 * TOKENLENSBAR_PRICES / TOKENLENS_PRICES environment variables still win.
 *
 * The file is re-read on every request, so editing prices.json propagates to
 * the open page within one poll interval.
 */

const DEFAULT_PRICES_PATHS = [
  path.join(os.homedir(), '.tokenlensbar', 'prices.json'),
  path.join(os.homedir(), '.tokenlens', 'prices.json'),
];
const DEFAULT_WINDOWS = [['09:00', '12:00'], ['14:00', '18:00']];
const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5];
const CONFIG_ROUTE = '/harness-period/config.json';
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK = /^(\d{1,2}):(\d{2})$/;

function isDateKey(value) {
  if (typeof value !== 'string') return false;
  const match = DATE_KEY.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function isClock(value) {
  if (typeof value !== 'string') return false;
  const match = CLOCK.exec(value);
  if (match === null) return false;
  return Number(match[1]) <= 23 && Number(match[2]) <= 59;
}

function isWindow(value) {
  return Array.isArray(value) && value.length === 2
    && isClock(value[0]) && isClock(value[1]);
}

function emptyClockConfig(file) {
  return {
    timezone: 'Asia/Shanghai',
    peakWindows: DEFAULT_WINDOWS,
    weekdays: DEFAULT_WEEKDAYS,
    holidays: [],
    source: file,
  };
}

function buildClockConfig(file, raw) {
  const source = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const off = source.off_peak !== null && typeof source.off_peak === 'object'
    ? source.off_peak
    : source;
  const rawWindows = Array.isArray(off.peak_windows)
    ? off.peak_windows
    : (Array.isArray(off.peakWindows) ? off.peakWindows : []);
  const windows = rawWindows.filter(isWindow);
  const weekdays = Array.isArray(off.weekdays)
    ? off.weekdays.filter((value) => Number.isInteger(value) && value >= 1 && value <= 7)
    : [];
  const holidays = Array.isArray(off.holidays) ? off.holidays.filter(isDateKey) : [];
  return {
    timezone: typeof off.timezone === 'string' && off.timezone.trim() !== ''
      ? off.timezone.trim()
      : 'Asia/Shanghai',
    peakWindows: windows.length > 0 ? windows : DEFAULT_WINDOWS,
    weekdays: weekdays.length > 0 ? weekdays : DEFAULT_WEEKDAYS,
    holidays,
    source: file,
  };
}

function resolvePricesPath() {
  const override = process.env.TOKENLENSBAR_PRICES || process.env.TOKENLENS_PRICES;
  if (typeof override === 'string' && override.trim() !== '') return override;
  for (const candidate of DEFAULT_PRICES_PATHS) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // Try the next known location.
    }
  }
  return DEFAULT_PRICES_PATHS[0];
}

// A malformed read is usually a half-written file; keep the previous good
// config instead of flashing "holidays not configured" for one poll interval.
let lastGood = null;

function readClockConfig(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return emptyClockConfig(file);
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return lastGood !== null && lastGood.path === file
      ? lastGood.config
      : emptyClockConfig(file);
  }
  const config = buildClockConfig(file, raw);
  lastGood = { path: file, config };
  return config;
}

function encode(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function injectConfig(html, config) {
  const tag = `<script>window.__HARNESS_PERIOD__=${encode(config)};</script>`;
  const head = html.indexOf('</head>');
  if (head < 0) return tag + html;
  return html.slice(0, head) + tag + html.slice(head);
}

function sendConfig(res, config) {
  const body = JSON.stringify(config);
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

export function apply(ctx) {
  ctx.inject(['webServer'], (scope) => {
    scope.effect(() => scope.webServer.tapIndex((html) => injectConfig(
      html,
      readClockConfig(resolvePricesPath()),
    )));
    scope.effect(() => scope.webServer.register({
      kind: 'exact',
      path: CONFIG_ROUTE,
      handler: (_request, response) => sendConfig(
        response,
        readClockConfig(resolvePricesPath()),
      ),
    }));
  });
}
