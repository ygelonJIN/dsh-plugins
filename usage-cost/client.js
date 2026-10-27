window.__ModuleLoader__.load({
  id: '@local/usage-cost',
  factory(require) {
    const React = require('react');
    const reactDom = require('react-dom');
    const h = React.createElement;
    const Fragment = React.Fragment;

    const NS = 'usage-cost';
    const PANEL_GAP = 8;
    const PANEL_MARGIN = 12;
    const MEASURE_STYLE = { visibility: 'hidden', left: 0, top: 0 };

    const DICTS = {
      en: {
        'number.thousand': '{value}K',
        'number.million': '{value}M',
        'number.groupSeparator': ',',
        'pill.total': '{count} tokens',
        'pill.cacheHit': 'cache hit {percent}%',
        'pill.hit': 'hit {percent}%',
        'changes.pillAria': 'workspace changes: {added} added, {deleted} deleted',
        'changes.added': '+{count}',
        'changes.deleted': '-{count}',
        'changes.title': 'Workspace changes',
        'changes.workspace': 'Workspace (vs HEAD)',
        'changes.session': 'This session',
        'changes.files': '{count} files',
        'changes.untracked': '{count} new files',
        'changes.turn': 'Turn {turn}',
        'changes.empty': 'no changes recorded yet',
        'changes.unavailable': 'unavailable',
        'changes.noGit': 'not a git repository',
        'changes.note': 'Workspace numbers are uncommitted changes against HEAD; session numbers sum each turn and include repeated edits.',
        'changes.failed': 'changes unavailable',
        'changes.failedTitle': 'Local change stats unavailable',
        'changes.failedNote': 'The local ledger plugin (@local/workspace-ledger) returned no data: its route may have been renamed, the plugin may be inactive, or the Host refused the request. Other readings are unaffected.',
        'dialog.context': 'Context used',
        'dialog.contextWindow': 'Context window',
        'dialog.projected': 'Next request (est.)',
        'dialog.title': 'Token usage & cost',
        'dialog.cacheHit': 'Cache hit',
        'dialog.input': 'Input (uncached)',
        'dialog.cacheRead': 'Cache read',
        'dialog.cacheWrite': 'Cache write',
        'dialog.output': 'Output',
        'dialog.offpeak': 'Off-peak',
        'dialog.peak': 'Peak',
        'dialog.noPrice': 'no pricing',
        'dialog.totalCost': 'Estimated total',
        'dialog.note': 'Each message is priced at the period it was actually sent in (Beijing time: 09:00-12:00 and 14:00-18:00 are peak on working days; weekends and listed holidays are off-peak all day), using the official price table (CNY per 1M tokens).',
      },
      zh: {
        'number.thousand': '{value}K',
        'number.million': '{value}M',
        'number.groupSeparator': ',',
        'pill.total': '共 {count} tokens',
        'pill.cacheHit': '缓存命中 {percent}%',
        'pill.hit': '命中 {percent}%',
        'changes.pillAria': '工作区改动：新增 {added} 行，删除 {deleted} 行',
        'changes.added': '+{count}',
        'changes.deleted': '-{count}',
        'changes.title': '工作区改动',
        'changes.workspace': '工作区（相对 HEAD）',
        'changes.session': '本次会话',
        'changes.files': '{count} 个文件',
        'changes.untracked': '{count} 个新文件',
        'changes.turn': '第 {turn} 轮',
        'changes.empty': '还没有记录到改动',
        'changes.unavailable': '暂不可用',
        'changes.noGit': '不在 git 仓库中',
        'changes.note': '工作区数字是相对 HEAD 的未提交改动；会话数字按轮累加，含反复修改。',
        'changes.failed': '改动统计失效',
        'changes.failedTitle': '本地改动统计不可用',
        'changes.failedNote': '本地统计插件（@local/workspace-ledger）没有返回数据：可能接口改名、插件未激活，或 Host 拒绝了这个请求。其它统计不受影响。',
        'dialog.context': '上下文占用',
        'dialog.contextWindow': '上下文容量',
        'dialog.projected': '下一轮预计',
        'dialog.title': 'Token 消耗与费用',
        'dialog.cacheHit': '缓存命中',
        'dialog.input': '输入(未缓存)',
        'dialog.cacheRead': '缓存读',
        'dialog.cacheWrite': '缓存写',
        'dialog.output': '输出',
        'dialog.offpeak': '空闲',
        'dialog.peak': '高峰',
        'dialog.noPrice': '无定价',
        'dialog.totalCost': '估算金额',
        'dialog.note': '每条消息按实际发送时刻所在时段计价(北京时间:工作日 9:00-12:00、14:00-18:00 为高峰,周末与法定节假日全天为空闲),按官方定价表估算(人民币,每百万 tokens)。',
      },
    };

    const CSS = `
.uc-anchor{min-width:0;font-size:calc(var(--dsh-content-font-size-secondary,13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px));display:inline-flex}
.uc-pill{box-sizing:border-box;border-radius:var(--dsw-radius-sm);max-width:100%;color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;background:0 0;border:none;align-items:center;gap:6px;padding:1px 8px;display:inline-flex}
.uc-pill svg{flex:none;width:14px;height:14px}
button.uc-pill{cursor:pointer}
button.uc-pill:hover,button.uc-pill[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.uc-label{text-overflow:ellipsis;min-width:0;overflow:hidden}
.uc-sep{color:var(--dsw-alias-separator-primary);margin:0 6px}
.uc-panel{z-index:1100;box-sizing:border-box;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);width:max-content;min-width:min(300px,100vw - 24px);max-width:min(440px,100vw - 24px);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);cursor:default;border:0;padding:16px;font-size:12px;line-height:18px;position:fixed}
.uc-title{color:var(--dsw-alias-label-primary);justify-content:space-between;gap:16px;margin-bottom:8px;font-weight:500;display:flex}
.uc-titleRule{border-top:.5px solid var(--dsw-alias-border-l2);margin-bottom:10px}
.uc-titleValue{font-variant-numeric:tabular-nums}
.uc-titleLabel{align-items:center;gap:6px;min-width:0;display:inline-flex}
.uc-titleLabel svg{flex:none;width:14px;height:14px}
.uc-details{color:var(--dsw-alias-label-tertiary);grid-template-columns:minmax(76px,auto) minmax(0,1fr);gap:6px 16px;margin:0;display:grid}
.uc-details dt,.uc-details dd{min-width:0;margin:0}
.uc-details dd{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;text-align:right}
.uc-rule{border-top:.5px solid var(--dsw-alias-border-l2);margin:10px 0}
.uc-note{color:var(--dsw-alias-label-tertiary);margin-top:8px;font-size:11px;line-height:16px}
.uc-counts{font-variant-numeric:tabular-nums;gap:6px;display:inline-flex}
.uc-added{color:var(--dsw-alias-state-success-primary)}
.uc-deleted{color:var(--dsw-alias-state-error-primary)}
.uc-turnRow{justify-content:space-between;gap:16px;display:flex}
.uc-turnRow dt{color:var(--dsw-alias-label-tertiary)}
.uc-turnRow dd{color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;margin:0}
`;

    // ---- pricing table (CNY per 1M tokens) ----
    // 有峰谷的模型:off 为空闲价、peak 为高峰价;flat 模型(如 mimo)两价相同。
    const PRICING = [
      {
        match: (id) => id.includes('mimo'),
        label: 'mimo-v2.6-pro',
        off: { hit: 0.025, miss: 3.0, out: 6.0 },
        peak: { hit: 0.025, miss: 3.0, out: 6.0 },
      },
      {
        match: (id) => id.includes('flash'),
        label: 'DeepSeek-V4.1-Flash-1017',
        off: { hit: 0.02, miss: 1.0, out: 4.0 },
        peak: { hit: 0.04, miss: 2.0, out: 8.0 },
      },
      {
        match: (id) => id.includes('v4') && id.includes('pro'),
        label: 'DeepSeek-V4-Pro-0813',
        off: { hit: 0.15, miss: 4.5, out: 13.5 },
        peak: { hit: 0.3, miss: 9.0, out: 27.0 },
      },
    ];

    function pricingOf(modelId) {
      const entry = PRICING.find((candidate) => candidate.match(modelId));
      if (entry === undefined) return null;
      return { label: entry.label, off: entry.off, peak: entry.peak };
    }

    function costOf(usage, price) {
      const rate = 1e6;
      // 官方价格页只有「命中 / 未命中 / 输出」三列,没有缓存写入档。
      // DeepSeek 是自动缓存,写入不单独收费;真出现 cacheWriteTokens 时按
      // 命中价计,避免用未命中价对同一批 token 重复收费。
      const input =
        (usage.uncachedInputTokens * price.miss +
          usage.cacheReadTokens * price.hit +
          usage.cacheWriteTokens * price.hit) / rate;
      const output = usage.outputTokens * price.out / rate;
      return { input, output, total: input + output };
    }

    function formatMoney(value) {
      if (!Number.isFinite(value) || value <= 0) return '¥0';
      if (value < 0.0001) return '<¥0.0001';
      const places = value < 0.01 ? 4 : value < 1 ? 3 : 2;
      return '¥' + value.toFixed(places).replace(/0+$/, '').replace(/\.$/, '');
    }


    function formatExactTokens(value, t) {
      const digits = String(value);
      const groups = [];
      for (let end = digits.length; end > 0; end -= 3) groups.unshift(digits.slice(Math.max(0, end - 3), end));
      return groups.join(t('number.groupSeparator'));
    }

    const zeroBuckets = () => ({ uncachedInputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
    const addBuckets = (left, right) => ({
      uncachedInputTokens: left.uncachedInputTokens + right.uncachedInputTokens,
      outputTokens: left.outputTokens + right.outputTokens,
      cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
      cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
    });

    function billedInputTokens(usage) {
      return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
    }

    function roundedPercentUnits(cacheReadTokens, denominator, decimalPlaces) {
      const scale = (decimalPlaces === 0 ? 1 : 10) * 100;
      const doubledScale = scale * 2;
      const denominatorQuotient = Math.floor(denominator / doubledScale);
      const denominatorRemainder = denominator % doubledScale;
      let lower = 0;
      let upper = scale;
      while (lower < upper) {
        const candidate = Math.floor((lower + upper + 1) / 2);
        const factor = candidate * 2 - 1;
        if (cacheReadTokens >= factor * denominatorQuotient + Math.ceil(factor * denominatorRemainder / doubledScale)) lower = candidate;
        else upper = candidate - 1;
      }
      return lower;
    }

    function displayPercentUnits(units, decimalPlaces) {
      if (decimalPlaces === 0) return String(units);
      const whole = Math.floor(units / 10);
      const tenths = units % 10;
      return tenths === 0 ? String(whole) : whole + '.' + tenths;
    }

    function formatCacheHitPercent(cacheReadTokens, promptTokens, decimalPlaces = 0) {
      if (promptTokens === 0) return null;
      const missedInputTokens = promptTokens - cacheReadTokens;
      if (missedInputTokens === 0) return '100';
      const roundedUnits = roundedPercentUnits(cacheReadTokens, promptTokens, decimalPlaces);
      if (roundedUnits < (decimalPlaces === 0 ? 100 : 1e3)) return displayPercentUnits(roundedUnits, decimalPlaces);
      let distinguishingPlaces = 1;
      let scaledDoubleGap = missedInputTokens * 200;
      const denominatorTens = Math.floor(promptTokens / 10);
      while (scaledDoubleGap <= denominatorTens) {
        scaledDoubleGap *= 10;
        distinguishingPlaces += 1;
      }
      const denominatorOnes = promptTokens % 10;
      let roundedLoss = 5;
      for (let loss = 1; loss < 5; loss += 1) {
        const factor = loss * 2 + 1;
        const threshold = factor * denominatorTens + Math.floor(factor * denominatorOnes / 10);
        if (scaledDoubleGap <= threshold) {
          roundedLoss = loss;
          break;
        }
      }
      return '99.' + '9'.repeat(distinguishingPlaces - 1) + (10 - roundedLoss);
    }

    function cacheHitPercent(usage) {
      return formatCacheHitPercent(usage.cacheReadTokens, billedInputTokens(usage));
    }

    /** Share of the resolved context window the last request occupied, when both sides are known. */
    function contextPercent(pressure) {
      const used = pressure?.pressureTokens;
      const window = pressure?.contextWindow;
      if (typeof used !== 'number' || typeof window !== 'number' || window <= 0) return null;
      return Math.min(100, Math.round((used / window) * 100));
    }

    function overlayTopMargin(min) {
      const root = document.documentElement;
      const clearance = Number.parseFloat(getComputedStyle(root).getPropertyValue('--dsh-frame-top-clearance'));
      if (Number.isNaN(clearance)) return min;
      return Math.max(min, (root.hasAttribute('data-fullscreen') ? 0 : clearance) + 20);
    }

    function useAnchoredPosition({ open, anchorRef, panelRef, gap, margin }) {
      const [position, setPosition] = React.useState(null);
      React.useLayoutEffect(() => {
        if (!open) {
          setPosition(null);
          return;
        }
        const place = () => {
          const rect = anchorRef.current?.getBoundingClientRect();
          if (rect === undefined) return;
          const panel = panelRef.current;
          const width = panel?.offsetWidth ?? 0;
          const height = panel?.offsetHeight ?? 0;
          let left = rect.left;
          let top = rect.top - gap - height;
          if (width > 0) left = Math.min(Math.max(left, margin), window.innerWidth - width - margin);
          if (height > 0) top = Math.min(Math.max(top, overlayTopMargin(margin)), window.innerHeight - height - margin);
          setPosition({ left, top });
        };
        place();
        window.addEventListener('scroll', place, true);
        window.addEventListener('resize', place);
        const panel = panelRef.current;
        let observer = null;
        if (typeof ResizeObserver !== 'undefined' && panel !== null) {
          observer = new ResizeObserver(place);
          observer.observe(panel);
        }
        return () => {
          observer?.disconnect();
          window.removeEventListener('scroll', place, true);
          window.removeEventListener('resize', place);
        };
      }, [open, anchorRef, panelRef, gap, margin]);
      return position;
    }

    function useStatDialog() {
      const [open, setOpen] = React.useState(false);
      const rootRef = React.useRef(null);
      const panelRef = React.useRef(null);
      const pos = useAnchoredPosition({ open, anchorRef: rootRef, panelRef, gap: PANEL_GAP, margin: PANEL_MARGIN });
      React.useEffect(() => {
        if (!open) return;
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setOpen(false);
        };
        const closeOutside = (event) => {
          if (event.target instanceof Node && rootRef.current?.contains(event.target) !== true && panelRef.current?.contains(event.target) !== true) setOpen(false);
        };
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('pointerdown', closeOutside);
        return () => {
          document.removeEventListener('keydown', onKeyDown);
          document.removeEventListener('pointerdown', closeOutside);
        };
      }, [open]);
      return { open, setOpen, rootRef, panelRef, pos };
    }

    function DatabaseIcon() {
      return h('svg', { viewBox: '0 0 16 16', 'aria-hidden': true },
        h('g', { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' },
          h('path', { d: 'M2.8 3.9c0 1.2 2.3 2.1 5.2 2.1s5.2-.9 5.2-2.1S10.3 1.8 8 1.8 2.8 2.7 2.8 3.9Z' }),
          h('path', { d: 'M2.8 8c0 1.2 2.3 2.1 5.2 2.1s5.2-.9 5.2-2.1M2.8 12.1c0 1.2 2.3 2.1 5.2 2.1s5.2-.9 5.2-2.1' })));
    }

    function DialogPill({ stat, icon, label, ariaLabel, title, titleValue, children }) {
      const seat = useStatDialog();
      return h(Fragment, null,
        h('span', { ref: seat.rootRef, className: 'uc-anchor', 'data-composer-stat': stat },
          h('button', {
            type: 'button',
            className: 'uc-pill',
            'aria-haspopup': 'dialog',
            'aria-expanded': seat.open,
            'aria-label': ariaLabel,
            onClick: () => seat.setOpen(!seat.open),
          },
            icon,
            h('span', { className: 'uc-label' }, label))),
        seat.open && reactDom.createPortal(
          h('div', { ref: seat.panelRef, className: 'uc-panel', role: 'dialog', 'aria-label': title, style: seat.pos ?? MEASURE_STYLE },
            h('div', { className: 'uc-title' },
              h('span', { className: 'uc-titleLabel' }, icon, title),
              titleValue !== undefined && h('span', { className: 'uc-titleValue' }, titleValue)),
            h('div', { className: 'uc-titleRule', 'aria-hidden': true }),
            children),
          document.body));
    }

    const UsagePill = React.memo(function UsagePill({ useProjection, t }) {
      const byRoute = useProjection('usageByRoute');
      const legacyUsage = useProjection('tokenUsage');
      const pressure = useProjection('contextPressure');
      const selection = useProjection('modelSelection');

      let totals;
      let costRows = [];
      let totalCost = 0;
      let hasUnpriced = false;
      if (byRoute !== undefined && Object.keys(byRoute.routes ?? {}).length > 0) {
        totals = zeroBuckets();
        for (const routeKey of Object.keys(byRoute.routes)) {
          const periods = byRoute.routes[routeKey];
          totals = addBuckets(totals, addBuckets(periods.offpeak, periods.peak));
          const modelId = String(routeKey.split('::').pop() ?? routeKey).toLowerCase();
          const pricing = pricingOf(modelId);
          if (pricing === null) {
            hasUnpriced = true;
            continue;
          }
          const off = costOf(periods.offpeak, pricing.off);
          const peak = costOf(periods.peak, pricing.peak);
          totalCost += off.total + peak.total;
          costRows.push({ label: pricing.label, off, peak });
        }
      } else if (legacyUsage !== undefined) {
        totals = legacyUsage;
      } else {
        return null;
      }

      if (billedInputTokens(totals) === 0 && totals.outputTokens === 0) return null;

      const cacheHit = cacheHitPercent(totals);
      const total = billedInputTokens(totals) + totals.outputTokens;
      const costText = totalCost > 0 ? '≈' + formatMoney(totalCost) : null;
      const parts = [costText].filter((part) => part !== null);
      if (parts.length === 0) return null;
      const label = h(Fragment, null, parts.map((part, index) => index === 0 ? part : h(Fragment, { key: index },
        h('span', { className: 'uc-sep', 'aria-hidden': true }, '·'), part)));
      const icon = h(DatabaseIcon);

      const moneyRows = [];
      for (const row of costRows) {
        if (row.off.total > 0 && row.peak.total > 0) {
          moneyRows.push(
            h('dt', { key: row.label + ':off:dt' }, row.label + ' · ' + t('dialog.offpeak')), h('dd', { key: row.label + ':off:dd' }, formatMoney(row.off.total)),
            h('dt', { key: row.label + ':pk:dt' }, row.label + ' · ' + t('dialog.peak')), h('dd', { key: row.label + ':pk:dd' }, formatMoney(row.peak.total)));
        } else if (row.off.total > 0) {
          moneyRows.push(h('dt', { key: row.label + ':off:dt' }, row.label), h('dd', { key: row.label + ':off:dd' }, formatMoney(row.off.total)));
        } else if (row.peak.total > 0) {
          moneyRows.push(h('dt', { key: row.label + ':pk:dt' }, row.label), h('dd', { key: row.label + ':pk:dd' }, formatMoney(row.peak.total)));
        }
      }
      if (hasUnpriced) {
        moneyRows.push(h('dt', { key: 'unpriced' }, t('dialog.noPrice')), h('dd', { key: 'unpriced:dd' }, '—'));
      }

      const costBlock = costRows.length === 0 && !hasUnpriced ? null : h(Fragment, null,
        h('div', { className: 'uc-rule', 'aria-hidden': true }),
        h('dl', { className: 'uc-details' },
          moneyRows,
          totalCost > 0 && h(Fragment, null,
            h('dt', null, t('dialog.totalCost')), h('dd', null, formatMoney(totalCost)))),
        h('div', { className: 'uc-note' }, t('dialog.note')));

      return h(DialogPill, {
        stat: 'usage',
        icon,
        label,
        ariaLabel: parts.join(' · '),
        title: t('dialog.title'),
        titleValue: formatExactTokens(total, t),
        children: h(Fragment, null,
          h('dl', { className: 'uc-details', 'data-session-stats-usage': true },
            cacheHit !== null && h(Fragment, null,
              h('dt', null, t('dialog.cacheHit')), h('dd', null, cacheHit + '%')),
            typeof pressure?.pressureTokens === 'number' && h(Fragment, null,
              h('dt', null, t('dialog.context')),
              h('dd', null, contextPercent(pressure) === null
                ? formatExactTokens(pressure.pressureTokens, t)
                : formatExactTokens(pressure.pressureTokens, t) + ' · ' + contextPercent(pressure) + '%')),
            typeof pressure?.contextWindow === 'number' && h(Fragment, null,
              h('dt', null, t('dialog.contextWindow')), h('dd', null, formatExactTokens(pressure.contextWindow, t))),
            typeof pressure?.projectedTokens === 'number' && h(Fragment, null,
              h('dt', null, t('dialog.projected')), h('dd', null, formatExactTokens(pressure.projectedTokens, t))),
            h('dt', null, t('dialog.input')), h('dd', null, formatExactTokens(totals.uncachedInputTokens, t)),
            h('dt', null, t('dialog.cacheRead')), h('dd', null, formatExactTokens(totals.cacheReadTokens, t)),
            totals.cacheWriteTokens !== 0 && h(Fragment, null,
              h('dt', null, t('dialog.cacheWrite')), h('dd', null, formatExactTokens(totals.cacheWriteTokens, t))),
            h('dt', null, t('dialog.output')), h('dd', null, formatExactTokens(totals.outputTokens, t))),
          costBlock),
      });
    });

    /** Edited-file mark: a page whose lines were rewritten, not a plus/minus sign. */
    function DiffIcon() {
      return h('svg', { viewBox: '0 0 16 16', 'aria-hidden': true },
        h('g', { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' },
          h('path', { d: 'M3.5 2.2h5.1L12.5 6v7.8h-9z' }),
          h('path', { d: 'M8.6 2.4V6h3.7' }),
          h('path', { d: 'M6 9h4M6 11.2h2.6' })));
    }

    /** Added and deleted line counts in the card's colors. */
    function Counts({ added, deleted, t, className }) {
      const parts = [];
      if (added > 0 || deleted === 0) {
        parts.push(h('span', { key: 'added', className: 'uc-added' }, t('changes.added', { count: formatExactTokens(added, t) })));
      }
      if (deleted > 0) {
        parts.push(h('span', { key: 'deleted', className: 'uc-deleted' }, t('changes.deleted', { count: formatExactTokens(deleted, t) })));
      }
      return h('span', { className: className ?? 'uc-counts' }, parts);
    }

    /** Accept one ledger payload only when both halves keep the shape this pill renders. */
    function isLedger(value) {
      if (typeof value !== 'object' || value === null) return false;
      const workspace = value.workspace;
      const session = value.session;
      const workspaceOk = workspace === null
        || (typeof workspace === 'object'
          && typeof workspace.git === 'boolean'
          && Number.isFinite(workspace.added)
          && Number.isFinite(workspace.deleted)
          && Number.isFinite(workspace.files));
      const sessionOk = session === null
        || (typeof session === 'object'
          && Array.isArray(session.entries)
          && Number.isFinite(session.added)
          && Number.isFinite(session.deleted)
          && Number.isFinite(session.files));
      return workspaceOk && sessionOk;
    }

    /**
    * Workspace line delta. The pill prefers the workspace reading (git against
    * HEAD, stable across reloads) and falls back to the live Session's summed
    * turn summaries when no repository encloses the working directory.
    */
    const ChangesPill = React.memo(function ChangesPill({ sessionId, useProjection, t }) {
      const stats = useProjection('sessionStats');
      const turns = stats?.turns ?? 0;
      const [ledger, setLedger] = React.useState(null);
      const [failed, setFailed] = React.useState(false);

      React.useEffect(() => {
        if (typeof sessionId !== 'string' || sessionId.length === 0) return;
        let cancelled = false;
        const controller = new AbortController();
        const load = async () => {
          try {
            const query = new URLSearchParams({ sessionId });
            const response = await fetch('api/workspace-ledger.summary?' + query.toString(), { signal: controller.signal });
            if (!response.ok) throw new Error(String(response.status));
            const data = await response.json();
            if (cancelled) return;
            if (isLedger(data)) {
              setLedger(data);
              setFailed(false);
            } else {
              setFailed(true);
            }
          } catch (error) {
            if (cancelled || error?.name === 'AbortError') return;
            setFailed(true);
          }
        };
        load();
        const retry = setTimeout(load, 1200);
        return () => {
          cancelled = true;
          controller.abort();
          clearTimeout(retry);
        };
      }, [sessionId, turns]);

      const workspace = ledger?.workspace ?? null;
      const session = ledger?.session ?? null;
      const primary = workspace?.git === true ? workspace : session;

      // A broken local ledger must be visible: the footer keeps a muted cell that
      // names the failure instead of silently dropping the reading.
      if (primary === null) {
        if (!failed) return null;
        return h(DialogPill, {
          stat: 'changes',
          icon: h(DiffIcon),
          label: t('changes.failed'),
          ariaLabel: t('changes.failedTitle'),
          title: t('changes.failedTitle'),
          children: h(Fragment, null,
            h('div', { className: 'uc-note' }, t('changes.failedNote'))),
        });
      }

      const added = primary.added ?? 0;
      const deleted = primary.deleted ?? 0;
      if (added === 0 && deleted === 0) return null;

      const workspaceRow = workspace === null || workspace.git !== true
        ? h(Fragment, null,
          h('dt', null, t('changes.workspace')), h('dd', null, t('changes.noGit')))
        : h(Fragment, null,
          h('dt', null, t('changes.workspace')),
          h('dd', null, h(Counts, { added: workspace.added, deleted: workspace.deleted, t })),
          h('dt', null, t('changes.files', { count: workspace.files })),
          h('dd', null, workspace.untrackedFiles > 0
            ? t('changes.untracked', { count: workspace.untrackedFiles })
            : '—'));

      const sessionRow = session === null
        ? h(Fragment, null,
          h('dt', null, t('changes.session')), h('dd', null, t('changes.unavailable')))
        : h(Fragment, null,
          h('dt', null, t('changes.session')),
          h('dd', null, h(Counts, { added: session.added, deleted: session.deleted, t })),
          h('dt', null, t('changes.files', { count: session.files })),
          h('dd', null, session.missing > 0 ? t('changes.unavailable') : '—'));

      const turnsRows = session === null || session.entries.length === 0 ? null : h(Fragment, null,
        h('div', { className: 'uc-rule', 'aria-hidden': true }),
        h('dl', { className: 'uc-details' },
          session.entries.slice(-8).reverse().map((entry) => h(Fragment, { key: entry.seq },
            h('dt', null, t('changes.turn', { turn: entry.turn })),
            h('dd', null, h(Counts, { added: entry.added, deleted: entry.deleted, t }))))));

      return h(DialogPill, {
        stat: 'changes',
        icon: h(DiffIcon),
        label: h(Counts, { added, deleted, t }),
        ariaLabel: t('changes.pillAria', { added, deleted }),
        title: t('changes.title'),
        titleValue: t('changes.files', { count: workspace?.git === true ? workspace.files : session?.files ?? 0 }),
        children: h(Fragment, null,
          h('dl', { className: 'uc-details' }, workspaceRow, sessionRow),
          turnsRows,
          h('div', { className: 'uc-note' }, t('changes.note'))),
      });
    });

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
        ctx.effect(() => ctx.locale.register(NS, DICTS));
        ctx.effect(() => {
          if (typeof document === 'undefined') return;
          const tagId = '@local/usage-cost/styles';
          if (document.querySelector('style[data-plugin-css="' + tagId + '"]') !== null) return;
          const tag = document.createElement('style');
          tag.setAttribute('data-plugin-css', tagId);
          tag.textContent = CSS;
          document.head.appendChild(tag);
          return () => tag.remove();
        });
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'local-usage-cost',
          order: 2,
          locale: NS,
        }, UsagePill));
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'local-workspace-changes',
          order: 3,
          locale: NS,
        }, ChangesPill));
        selfCheck(NS, [{
          anchor: '输入框 contenteditable',
          impact: '输入框统计条不显示',
          probe: () => document.querySelector('[contenteditable="true"]') !== null,
        }]);
      },
    };
  },
});
