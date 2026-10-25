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
        'period.peak': 'Peak',
        'period.offpeak': 'Off-peak',
        'period.separator': ': ',
        'period.weekend': 'weekend',
        'period.holiday': 'holiday',
        'holiday.missing': 'Holidays not configured: {years}',
        'list.separator': ', ',
      },
      zh: {
        'period.peak': '高峰时段',
        'period.offpeak': '空闲时段',
        'period.separator': '：',
        'period.weekend': '周末',
        'period.holiday': '节假日',
        'holiday.missing': '节假日未配置：{years}',
        'list.separator': '、',
      },
    };

    // 只用主题 token，不加背景、边框或图标。
    const CSS = `
.hp-coverage{order:-1;flex:1;min-width:0;padding:0 4px 6px;display:flex;align-items:center}
.hp-tag{display:inline-flex;align-items:center;border-radius:999px;corner-shape:round;padding:1px 8px;font-size:11px;line-height:17px;font-weight:500;white-space:nowrap}
.hp-tag-peak{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 12%,transparent);color:var(--dsw-alias-state-warn-primary)}
.hp-tag-offpeak{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 10%,transparent);color:var(--dsw-alias-state-success-primary)}
.hp-tag-warn{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 12%,transparent);color:var(--dsw-alias-state-warn-primary)}
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

    // 侧边栏左下角账户上方的一行：只在节假日尚未配置时提示；已配置就整行不显示。
    function CoverageView({ wide, t, clock }) {
      const state = useClock(clock);
      if (wide === false) return null;
      if (state.missingYears.length === 0) return null;
      const years = state.missingYears.join(t('list.separator') || '、');
      const text = t('holiday.missing', { years });
      return h('div', { className: 'hp-coverage', title: text },
        h('span', { className: 'hp-tag hp-tag-warn' }, text));
    }

    // 输入框左侧控制区的峰谷标签；不占用右侧模型名称的宽度。
    function PeriodView({ t, clock }) {
      const state = useClock(clock);
      const peak = state.period === 'peak';
      const reason = state.isHoliday
        ? t('period.holiday')
        : (state.isWeekend ? t('period.weekend') : '');
      const label = peak ? t('period.peak') : t('period.offpeak');
      const separator = t('period.separator') || '：';
      const detail = reason !== '' ? reason : state.clock;
      const periodText = label + separator + detail;
      const titleText = label + separator + (reason ? reason + ' ' : '') + state.clock;
      return h('span', { className: 'hp-period-control' },
        h('span', {
          className: 'hp-tag ' + (peak ? 'hp-tag-peak' : 'hp-tag-offpeak'),
          title: titleText,
        }, periodText));
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

        ctx.effect(() => ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'harness-period-holidays',
          order: 0,
          locale: NS,
        }, (props) => h(CoverageView, {
          wide: props.wide,
          t: pickT(props.t),
          clock,
        }))));

        ctx.effect(() => ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
          name: 'conversation.input.left',
          id: 'harness-period-state',
          order: 0,
          locale: NS,
        }, (props) => h(PeriodView, {
          t: pickT(props.t),
          clock,
        }))));
      },
    };
  },
});
