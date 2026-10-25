import { z } from 'zod';

/**
 * Host half: a session projection that buckets provider-reported token usage
 * per model route and per billing period (peak / off-peak) at each message's
 * actual timestamp, so the Client can price the session exactly.
 *
 * Billing period rule (Asia/Shanghai, no DST):
 *   - Monday-Friday (excluding the holiday list): 09:00-12:00 and 14:00-18:00
 *     are peak; everything else is off-peak.
 *   - Weekends and listed holidays are off-peak all day.
 */

const SHANGHAI_OFFSET_MS = 8 * 3600 * 1000; // 北京时间固定 UTC+8

// 内置中国法定节假日(按国务院办公厅通知整理;请核对,
// 可通过插件的 config.holidayDates 覆盖或补充).
const DEFAULT_HOLIDAYS = [
  '2026-01-01',
  '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
  '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
  '2026-04-04', '2026-04-05', '2026-04-06',
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  '2026-06-19', '2026-06-20', '2026-06-21',
  '2026-09-25', '2026-09-26', '2026-09-27',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',
  '2026-10-06', '2026-10-07',
  '2027-01-01', '2027-01-02', '2027-01-03',
];

const DEFAULT_PEAK_WINDOWS = [['09:00', '12:00'], ['14:00', '18:00']];

const bucketsSchema = z.object({
  uncachedInputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
}).strict();

const periodBucketsSchema = z.object({
  offpeak: bucketsSchema,
  peak: bucketsSchema,
}).strict();

const usageByRouteStateSchema = z.object({
  routes: z.record(z.string(), periodBucketsSchema),
  slot: z.object({
    turn: z.number().int().nonnegative(),
    step: z.number().int().nonnegative(),
    route: z.string().nullable(),
    period: z.enum(['offpeak', 'peak']),
    buckets: bucketsSchema,
  }).nullable(),
}).strict();

const usageByRouteViewSchema = z.object({
  routes: z.record(z.string(), periodBucketsSchema),
}).strict();

function pad2(value) {
  return String(value).padStart(2, '0');
}

function shanghaiDateKey(epochMs) {
  const local = new Date(epochMs + SHANGHAI_OFFSET_MS);
  return local.getUTCFullYear() + '-' + pad2(local.getUTCMonth() + 1) + '-' + pad2(local.getUTCDate());
}

function minutesOfClock(clock) {
  const [hours, minutes] = clock.split(':').map(Number);
  return hours * 60 + minutes;
}

function periodOf(epochMs, holidays, peakWindows) {
  const local = new Date(epochMs + SHANGHAI_OFFSET_MS);
  const weekday = local.getUTCDay(); // 0=Sun ... 6=Sat
  if (weekday === 0 || weekday === 6 || holidays.has(shanghaiDateKey(epochMs))) return 'offpeak';
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  for (const [start, end] of peakWindows) {
    if (minutes >= minutesOfClock(start) && minutes < minutesOfClock(end)) return 'peak';
  }
  return 'offpeak';
}

const zeroBuckets = () => ({
  uncachedInputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
});

const bucketsFrom = (usage) => ({
  uncachedInputTokens: usage.inputTokens,
  outputTokens: usage.outputTokens,
  cacheReadTokens: usage.cacheReadTokens ?? 0,
  cacheWriteTokens: usage.cacheWriteTokens ?? 0,
});

const bucketsEqual = (left, right) =>
  left.uncachedInputTokens === right.uncachedInputTokens &&
  left.outputTokens === right.outputTokens &&
  left.cacheReadTokens === right.cacheReadTokens &&
  left.cacheWriteTokens === right.cacheWriteTokens;

const addBuckets = (left, right) => ({
  uncachedInputTokens: left.uncachedInputTokens + right.uncachedInputTokens,
  outputTokens: left.outputTokens + right.outputTokens,
  cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
  cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
});

const subtractBuckets = (left, right) => ({
  uncachedInputTokens: left.uncachedInputTokens - right.uncachedInputTokens,
  outputTokens: left.outputTokens - right.outputTokens,
  cacheReadTokens: left.cacheReadTokens - right.cacheReadTokens,
  cacheWriteTokens: left.cacheWriteTokens - right.cacheWriteTokens,
});

function usageOf(event) {
  if (event.type === 'assistant/message' && event.data.usage !== undefined) return event.data.usage;
  if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return undefined;
  return lastUsageChunk(event.data.stream);
}

function lastUsageChunk(stream) {
  for (let index = stream.length - 1; index >= 0; index -= 1) {
    const record = stream[index];
    if (record.type === 'chunk' && record.chunk.type === 'usage') return record.chunk.usage;
  }
  return undefined;
}

function routeKeyOf(message) {
  const source = message.source;
  if (source === undefined || source.kind !== 'model') return null;
  return source.provider + '::' + source.model;
}

function withRoute(routes, route, period, buckets, delta) {
  const current = routes[route] ?? { offpeak: zeroBuckets(), peak: zeroBuckets() };
  const nextPeriod = delta === 1
    ? addBuckets(current[period], buckets)
    : subtractBuckets(current[period], buckets);
  return { ...routes, [route]: { ...current, [period]: nextPeriod } };
}

export function apply(ctx, config = {}) {
  const holidays = new Set(config.holidayDates ?? DEFAULT_HOLIDAYS);
  const peakWindows = config.peakWindows ?? DEFAULT_PEAK_WINDOWS;

  ctx.inject(['sessionProjections'], (scope) => {
    const projections = scope.sessionProjections;
    if (projections === undefined) return;

    projections.register({
      key: 'usageByRoute',
      stateVersion: 1,
      stateSchema: usageByRouteStateSchema,
      init: () => ({ routes: {}, slot: null }),
      apply: (state, event) => {
        if (event.type === 'llm/retry-started') {
          return state.slot !== null && state.slot.turn === event.data.turn && state.slot.step === event.data.step
            ? { ...state, slot: null }
            : state;
        }
        if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return state;
        const slot = state.slot;
        const { turn, step } = event.data;
        const sameAttempt = slot !== null && slot.turn === turn && slot.step === step;

        // A final message without its own usage attributes the attempt's
        // pending (unrouted) sample to the message's route instead of dropping it.
        if (event.type === 'assistant/message' && sameAttempt && slot.route === null && usageOf(event) === undefined) {
          const route = routeKeyOf(event.data.message);
          if (route === null) return state;
          const period = slot.period;
          return {
            routes: withRoute(state.routes, route, period, slot.buckets, 1),
            slot: { turn, step, route, period, buckets: slot.buckets },
          };
        }

        const sample = usageOf(event);
        if (sample === undefined) return state;
        const buckets = bucketsFrom(sample);

        if (sameAttempt) {
          if (bucketsEqual(slot.buckets, buckets)) return state;
          let routes = state.routes;
          if (slot.route !== null) routes = withRoute(routes, slot.route, slot.period, slot.buckets, -1);
          const route = event.type === 'assistant/message' ? routeKeyOf(event.data.message) : slot.route;
          if (route !== null) routes = withRoute(routes, route, slot.period, buckets, 1);
          return {
            routes,
            slot: { turn, step, route, period: slot.period, buckets },
          };
        }

        const route = event.type === 'assistant/message' ? routeKeyOf(event.data.message) : null;
        const period = periodOf(event.time, holidays, peakWindows);
        const routes = route === null ? state.routes : withRoute(state.routes, route, period, buckets, 1);
        return { routes, slot: { turn, step, route, period, buckets } };
      },
      wire: {
        viewSchema: usageByRouteViewSchema,
        view: (state) => ({ routes: state.routes }),
      },
    });
  });
}
