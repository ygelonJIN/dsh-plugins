window.__ModuleLoader__.load({
  id: '@local/harness-period',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'harness-period';
    const STYLE_ID = '@local/harness-period/styles';
    const CHECK_MS = 15000;
    const CONFIG_POLL_MS = 15000;

    const DICTS = {
      en: {
        'period.low': 'Low',
        'period.high': 'High',
        'period.separator': ': ',
        'period.weekend': 'weekend',
        'period.holiday': 'holiday',
        'holiday.missing': 'holidays not configured',
        'holiday.missingDetail': 'holidays not configured ({years})',
        'list.separator': ', ',
      },
      zh: {
        'period.low': '低价',
        'period.high': '高价',
        'period.separator': '：',
        'period.weekend': '周末',
        'period.holiday': '节假日',
        'holiday.missing': '节假日未配置',
        'holiday.missingDetail': '节假日未配置（{years}）',
        'list.separator': '、',
      },
    };

    // 只用主题 token，不加背景、边框或图标。
    // 低价用 1017 标签的蓝（Tag tone="info"），高价用红色（Tag tone="danger"）。
    const CSS = `
.hp-tag{display:inline-flex;align-items:center;border-radius:999px;corner-shape:round;padding:1px 8px;font-size:11px;line-height:17px;font-weight:500;white-space:nowrap}
.hp-tag-low{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent);color:var(--dsw-alias-state-business-primary)}
.hp-tag-high{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent);color:var(--dsw-alias-state-error-primary)}
.hp-period-control{display:inline-flex;align-items:center;min-width:0;margin-left:auto;padding:0 2px}
`;

    // prices.json 的 off_peak 缺字段时的兜底，和 tokenlens 保持一致。
    const DEFAULT_WINDOWS = [['09:00', '12:00'], ['14:00', '18:00']];
    const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5];

    const WEEKDAY_BY_NAME = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
    const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
    const CLOCK = /^(\d{1,2}):(\d{2})$/;

    function validDateKey(value) {
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

    function clockMinutes(value) {
      const match = CLOCK.exec(String(value));
      if (match === null) return null;
      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      if (hours > 23 || minutes > 59) return null;
      return hours * 60 + minutes;
    }

    function validWindow(value) {
      return Array.isArray(value) && value.length === 2
        && clockMinutes(value[0]) !== null && clockMinutes(value[1]) !== null;
    }

    function normalizeConfig(raw) {
      const source = raw !== null && typeof raw === 'object' ? raw : {};
      const off = source.off_peak !== null && typeof source.off_peak === 'object'
        ? source.off_peak
        : source;
      let timezone = typeof off.timezone === 'string' && off.timezone.trim() !== ''
        ? off.timezone.trim()
        : 'Asia/Shanghai';
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone });
      } catch {
        timezone = 'Asia/Shanghai';
      }
      const rawWindows = Array.isArray(off.peakWindows)
        ? off.peakWindows
        : (Array.isArray(off.peak_windows) ? off.peak_windows : []);
      const windows = rawWindows.filter(validWindow);
      const weekdays = Array.isArray(off.weekdays)
        ? off.weekdays.filter((value) => Number.isInteger(value) && value >= 1 && value <= 7)
        : [];
      const holidays = Array.isArray(off.holidays) ? off.holidays.filter(validDateKey) : [];
      return {
        timezone,
        peakWindows: windows.length > 0 ? windows : DEFAULT_WINDOWS,
        weekdays: weekdays.length > 0 ? weekdays : DEFAULT_WEEKDAYS,
        holidays,
      };
    }

    const formatters = new Map();

    function formatterFor(timezone) {
      const cached = formatters.get(timezone);
      if (cached !== undefined) return cached;
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });
      formatters.set(timezone, formatter);
      return formatter;
    }

    function zonedParts(date, timezone) {
      const parts = {};
      for (const part of formatterFor(timezone).formatToParts(date)) parts[part.type] = part.value;
      return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        weekday: WEEKDAY_BY_NAME[parts.weekday] || 0,
        hour: Number(parts.hour),
        minute: Number(parts.minute),
        dateKey: parts.year + '-' + parts.month + '-' + parts.day,
        clock: parts.hour + ':' + parts.minute,
      };
    }

    function classify(zoned, config) {
      if (!config.weekdays.includes(zoned.weekday)) return 'offpeak';
      if (config.holidays.includes(zoned.dateKey)) return 'offpeak';
      const minutes = zoned.hour * 60 + zoned.minute;
      for (const window of config.peakWindows) {
        const start = clockMinutes(window[0]);
        const end = clockMinutes(window[1]);
        if (start === null || end === null) continue;
        if (start <= end && minutes >= start && minutes < end) return 'peak';
        if (start > end && (minutes >= start || minutes < end)) return 'peak';
      }
      return 'offpeak';
    }

    function snapshotAt(date, config) {
      const zoned = zonedParts(date, config.timezone);
      const coveredYears = new Set();
      for (const key of config.holidays) coveredYears.add(Number(key.slice(0, 4)));
      const requiredYears = [zoned.year];
      if (zoned.month >= 11) requiredYears.push(zoned.year + 1);
      const missingYears = requiredYears.filter((year) => !coveredYears.has(year));
      return {
        period: classify(zoned, config),
        clock: zoned.clock,
        year: zoned.year,
        weekday: zoned.weekday,
        isWeekend: zoned.weekday === 6 || zoned.weekday === 7,
        isHoliday: config.holidays.includes(zoned.dateKey),
        requiredYears,
        coveredYears: [...coveredYears].sort((left, right) => left - right),
        missingYears,
      };
    }

    function createClock(initialConfig) {
      let config = initialConfig;
      let state = snapshotAt(new Date(), config);
      const listeners = new Set();
      const get = () => state;
      const subscribe = (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      };
      const setConfig = (nextConfig) => {
        if (JSON.stringify(config) === JSON.stringify(nextConfig)) return;
        config = nextConfig;
        state = snapshotAt(new Date(), config);
        for (const listener of listeners) listener();
      };
      const tick = () => {
        const next = snapshotAt(new Date(), config);
        const sameYears = next.missingYears.length === state.missingYears.length
          && next.missingYears.every((year, index) => year === state.missingYears[index]);
        if (next.period === state.period && next.clock === state.clock
          && next.isWeekend === state.isWeekend && next.isHoliday === state.isHoliday
          && sameYears) return;
        state = next;
        for (const listener of listeners) listener();
      };
      return { get, subscribe, tick, setConfig };
    }

    function useClock(clock) {
      const [state, setState] = React.useState(clock.get());
      React.useEffect(() => {
        setState(clock.get());
        return clock.subscribe(() => setState(clock.get()));
      }, [clock]);
      return state;
    }

    // 输入框左侧控制区（模型选择器左边）的一颗标签：低价/高价 + 原因。
    // 节假日没配置时，原因位置直接显示「节假日未配置」，占满原因位。
    function PeriodView({ t, clock }) {
      const state = useClock(clock);
      const high = state.period === 'peak';
      const missing = state.missingYears.length > 0;
      const reason = missing
        ? t('holiday.missing')
        : (state.isHoliday ? t('period.holiday') : (state.isWeekend ? t('period.weekend') : ''));
      const label = high ? t('period.high') : t('period.low');
      const separator = t('period.separator') || '：';
      const detail = reason !== '' ? reason : state.clock;
      const periodText = label + separator + detail;
      const years = state.missingYears.join(t('list.separator') || '、');
      const titleText = missing
        ? label + separator + t('holiday.missingDetail', { years })
        : label + separator + (reason ? reason + ' ' : '') + state.clock;
      return h('span', { className: 'hp-period-control' },
        h('span', {
          className: 'hp-tag ' + (high ? 'hp-tag-high' : 'hp-tag-low'),
          title: titleText,
        }, periodText));
    }

    /**
     * One-shot self-check: probes the shipped anchors this plugin builds on so
     * a Harness upgrade reports what moved instead of failing silently. Runs
     * once after the first paint (one bounded retry while the shell mounts),
     * then never again — no timer, no observer, no recurring cost.
     */
    function selfCheck(label, checks) {
      let runs = 0;
      const run = () => {
        runs += 1;
        const misses = [];
        for (const check of checks) {
          let ok = false;
          try { ok = check.probe() === true; } catch { ok = false; }
          if (!ok) misses.push(check);
        }
        if (runs === 1 && misses.length === checks.length) {
          setTimeout(run, 1500); // shell not mounted yet is not a broken anchor
          return;
        }
        // Keep the last result where a human can read it without DevTools:
        // localStorage['dsh.self-check'] holds one entry per plugin.
        try {
          const key = 'dsh.self-check';
          const all = JSON.parse(localStorage.getItem(key) ?? '{}');
          all[label] = {
            ok: misses.length === 0,
            misses: misses.map((m) => ({ anchor: m.anchor, impact: m.impact })),
            at: Date.now(),
          };
          localStorage.setItem(key, JSON.stringify(all));
        } catch {
          // Storage unavailable: the console warning still carries the result.
        }
        if (misses.length === 0) return;
        console.warn('[' + label + '] 自检：' + misses.length + ' 处官方锚点变了，受影响的功能：');
        for (const miss of misses) console.warn('  · ' + miss.anchor + ' → ' + miss.impact);
        console.warn('[' + label + '] 修复参照 经验文档/插件开发.md「升级后失效排查」。');
      };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
      else setTimeout(run, 16);
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const config = normalizeConfig(window.__HARNESS_PERIOD__);
        const clock = createClock(config);
        const translate = ctx.locale.bind(NS);
        const pickT = (t) => (typeof t === 'function' ? t : translate);

        ctx.provide('harnessPeriod', {
          getSnapshot: clock.get,
          subscribe: clock.subscribe,
          refresh: clock.tick,
        });

        ctx.effect(() => ctx.locale.register(NS, DICTS));

        ctx.effect(() => {
          if (typeof document === 'undefined') return;
          if (document.querySelector('style[data-plugin-css="' + STYLE_ID + '"]') !== null) return;
          const tag = document.createElement('style');
          tag.setAttribute('data-plugin-css', STYLE_ID);
          tag.textContent = CSS;
          document.head.appendChild(tag);
          return () => tag.remove();
        });

        ctx.effect(() => {
          const timer = window.setInterval(() => clock.tick(), CHECK_MS);
          return () => window.clearInterval(timer);
        });

        // prices.json 改完后不用刷新页面：Host 每次请求都重读文件。
        // 自定义 scheme 下取不到路由时静默保留 index 注入的配置。
        ctx.effect(() => {
          let disposed = false;
          const pull = async () => {
            try {
              const response = await fetch('/harness-period/config.json', { cache: 'no-store' });
              if (!response.ok) return;
              const raw = await response.json();
              if (!disposed) clock.setConfig(normalizeConfig(raw));
            } catch {
              // Keep the boot config.
            }
          };
          const timer = window.setInterval(pull, CONFIG_POLL_MS);
          const initial = window.setTimeout(pull, 1000);
          return () => {
            disposed = true;
            window.clearInterval(timer);
            window.clearTimeout(initial);
          };
        });

        ctx.effect(() => ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
          name: 'conversation.input.left',
          id: 'harness-period-state',
          order: 0,
          locale: NS,
        }, (props) => h(PeriodView, {
          t: pickT(props.t),
          clock,
        }))));

        selfCheck(NS, [{
          anchor: '输入框 contenteditable',
          impact: '峰谷提示不显示',
          probe: () => document.querySelector('[contenteditable="true"]') !== null,
        }]);
      },
    };
  },
});
