/**
 * @local/for-free — 客户端半（一页）
 *
 * 设置 → 插件 →「For Free」：模型清单、两条车道的状态、刷新、开关。
 * 不往界面加悬浮按钮、不加胶囊、不弹公告。
 *
 * 数据全部来自宿主路由 `/api/for-free/*`；宿主不响应时（精简版没挂上 webServer）
 * 这里只显示一条读取失败，不做任何猜测。
 */
window.__ModuleLoader__.load({
  id: '@local/for-free',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useCallback } = React;

    const NS = 'settings.for-free';
    const API = '/api/for-free';

    const DICTS = {
      zh: {
        'tab.label': 'For Free',
        title: '免 Key 免费模型',
        lead: '两条免费车道：opencode 免费车道与 Kilo 免费池。不用登录、不用填 Key。可用性由出口实测得出，被上游拒绝的模型不会进入选择器。',
        'state.on': '已开启',
        'state.off': '已暂停',
        'state.unknown': '读取中…',
        'btn.refresh': '刷新清单',
        'btn.probe': '检测可用性',
        'btn.reload': '重新读取',
        'btn.toggleOn': '开启',
        'btn.toggleOff': '暂停',
        'meta.models': '{n} 个模型',
        'meta.picker': '选择器里 {n} 个',
        'meta.egress': '出口 {ip}',
        'meta.egress.country': '出口 {ip}（{c}）',
        'meta.egress.none': '出口未探测',
        'meta.synced': '清单同步于 {t}',
        'meta.synced.never': '还没有成功同步过清单',
        'meta.version': 'v{v}',
        'settings.title': '设置',
        'setting.enabled': '启用插件',
        'setting.region': '单独显示地区受限模型',
        'setting.interval': '后台刷新间隔（分钟）',
        'setting.maxTokens': '默认输出上限',
        'setting.baseTitle': '反代（留空 = 直连官方）',
        'setting.baseOpen': 'opencode 反代地址',
        'setting.baseKilo': 'Kilo 反代地址',
        'setting.baseHint': '直连被限流（429）或地区拦住（403）时，填自己的转发域名。转发端必须原样带上请求头（UA 与 x-opencode-*），否则 opencode 指纹门一样过不去。',
        'setting.save': '保存设置',
        'setting.saved': '设置已保存',
        'col.model': '模型',
        'col.channel': '车道',
        'col.context': '上下文',
        'col.state': '状态',
        'col.latency': '首字 / 延迟',
        'channel.free': '免费车道',
        'channel.kilo': 'Kilo',
        'state.available': '可用',
        'state.region-blocked': '地区受限',
        'state.throttled': '额度受限',
        'state.unavailable': '不可用',
        'state.unknown': '未检测',
        'empty.title': '清单是空的',
        'empty.hint': '点「刷新清单」从上游重新拉一次。两条车道都拿不到时，通常是本机网络出口被上游限流。',
        'note.channel': 'Kilo 免费池的模型卡声明 prompt 可能被上游记录用于改进服务，别往里发敏感内容。',
        'note.dir': '数据目录：{p}',
        'quota.blocked': '免费车道额度受限：{n} 个模型，最早约 {t} 恢复（{m} 分钟后）。',
        'quota.hint': 'opencode 车道按出口计算配额，一个模型受限整条车道一起受限；Kilo 免费池没有配额概念（cost 0），只有速率限制。上游不给“剩余百分比”，这里只能是实测出来的恢复时间。',
        'quota.reset': '约 {t} 恢复',
        'usage.title': '本地用量（这台机器累计）',
        'usage.line': '请求 {r} · 失败 {f} · 输入 {i} / 输出 {o} / 思考 {x} tokens',
        'usage.models': '按模型',
        'usage.empty': '还没有请求记录。发一轮对话后再看这里。',
        'usage.col.calls': '调用',
        'usage.col.failed': '失败',
        'usage.col.tokens': '输出 tokens',
        'usage.col.speed': '生成速度',
        'setting.autoChain': '额度用完自动换模型',
        'autoChain.title': '自动链（选择器里的「自动」）',
        'autoChain.current': '当前顺序：{n} 个候选',
        'autoChain.empty': '链还没建好，点「刷新清单」会按当前可用性重排',
        'autoChain.hint': '按「可用 > 未检测 > 地区受限 > 额度受限 > 不可用」排序，每条车道各取前 6 个。正文出来之前失败会整体丢弃并换下一个，你看不到中间过程；正文出来之后失败才算这一轮失败。',
        'err.load': '读取失败：{e}',
        'err.refresh': '刷新失败：{e}',
        'err.save': '保存失败：{e}',
        'ok.refresh': '已刷新：{n} 个模型，用时 {ms} ms',
        'ok.probe': '检测完成：{n} 个可用',
        'busy.refreshing': '刷新中…',
        'busy.probing': '检测中（每个模型发一次真实请求）…',
        'busy.saving': '保存中…',
      },
      en: {
        'tab.label': 'For Free',
        title: 'Key-free free models',
        lead: 'Two free lanes: the opencode free lane and the Kilo free pool. No login, no API key. Availability comes from real requests on this egress; refused models never reach the picker.',
        'state.on': 'On',
        'state.off': 'Paused',
        'state.unknown': 'Loading…',
        'btn.refresh': 'Refresh roster',
        'btn.probe': 'Probe availability',
        'btn.reload': 'Reload',
        'btn.toggleOn': 'Turn on',
        'btn.toggleOff': 'Pause',
        'meta.models': '{n} models',
        'meta.picker': '{n} in picker',
        'meta.egress': 'egress {ip}',
        'meta.egress.country': 'egress {ip} ({c})',
        'meta.egress.none': 'egress not probed',
        'meta.synced': 'roster synced {t}',
        'meta.synced.never': 'no successful sync yet',
        'meta.version': 'v{v}',
        'settings.title': 'Settings',
        'setting.enabled': 'Plugin enabled',
        'setting.region': 'Show region-limited models separately',
        'setting.interval': 'Background refresh (minutes)',
        'setting.maxTokens': 'Default output ceiling',
        'setting.baseTitle': 'Reverse proxy (empty = direct)',
        'setting.baseOpen': 'opencode base URL',
        'setting.baseKilo': 'Kilo base URL',
        'setting.baseHint': 'Use your own forwarder when this egress is throttled (429) or region-blocked (403). The forwarder must pass headers through unchanged (UA and x-opencode-*), or the opencode fingerprint gate still refuses.',
        'setting.save': 'Save settings',
        'setting.saved': 'Settings saved',
        'col.model': 'Model',
        'col.channel': 'Lane',
        'col.context': 'Context',
        'col.state': 'State',
        'col.latency': 'TTFT / latency',
        'channel.free': 'Free lane',
        'channel.kilo': 'Kilo',
        'state.available': 'available',
        'state.region-blocked': 'region-limited',
        'state.throttled': 'throttled',
        'state.unavailable': 'unavailable',
        'state.unknown': 'unprobed',
        'empty.title': 'The roster is empty',
        'empty.hint': 'Hit “Refresh roster” to pull it again. Both lanes empty usually means this egress is throttled upstream.',
        'note.channel': 'Kilo free-pool model cards state prompts may be retained upstream. Do not send secrets there.',
        'note.dir': 'Data directory: {p}',
        'quota.blocked': 'Free lane quota reached: {n} models, earliest reset ~{t} ({m} min away).',
        'quota.hint': 'The opencode lane meters quota per egress, so one throttled model means the whole lane is; the Kilo pool has no quota concept (cost 0), only rate limits. Upstream never reports a remaining percentage — this is the measured reset time.',
        'quota.reset': 'reset ~{t}',
        'usage.title': 'Local usage (this machine, lifetime)',
        'usage.line': '{r} requests · {f} failed · {i} / {o} / {x} tokens in / out / reasoning',
        'usage.models': 'By model',
        'usage.empty': 'No requests recorded yet — send a turn and come back.',
        'usage.col.calls': 'calls',
        'usage.col.failed': 'failed',
        'usage.col.tokens': 'output tokens',
        'usage.col.speed': 'speed',
        'setting.autoChain': 'Fail over when a model runs out',
        'autoChain.title': 'Auto chain (appears as “自动” in the picker)',
        'autoChain.current': '{n} candidates, in order',
        'autoChain.empty': 'Not built yet — hit “Refresh roster” to order it by availability',
        'autoChain.hint': 'Ordered available > unprobed > region-limited > throttled > unavailable, six per lane. A failure before any answer text is discarded whole and the next candidate answers; a failure after the text starts is a real turn failure.',
        'err.load': 'Load failed: {e}',
        'err.refresh': 'Refresh failed: {e}',
        'err.save': 'Save failed: {e}',
        'ok.refresh': 'Refreshed: {n} models in {ms} ms',
        'ok.probe': 'Probe done: {n} available',
        'busy.refreshing': 'Refreshing…',
        'busy.probing': 'Probing (one real request per model)…',
        'busy.saving': 'Saving…',
      },
    };

    async function api(path, init) {
      const res = await fetch(API + path, init);
      const raw = await res.text();
      if (!raw) throw new Error(`空响应（HTTP ${res.status}）`);
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(`返回的不是 JSON（HTTP ${res.status}）`);
      }
      if (data && data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    }

    function formatTime(ms) {
      if (!ms) return '—';
      try {
        const d = new Date(ms);
        return d.toLocaleString('zh-CN', { hour12: false });
      } catch {
        return String(ms);
      }
    }

    function formatClock(ms) {
      try {
        return new Date(ms).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
      } catch {
        return '—';
      }
    }

    function formatTokens(value) {
      if (!Number.isFinite(value)) return '—';
      if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} M`;
      if (value >= 1024) return `${Math.round(value / 1024)} K`;
      return String(value);
    }

    const STATE_TONE = {
      available: 'var(--dsw-alias-brand-primary)',
      'region-blocked': '#c98a1a',
      throttled: '#c98a1a',
      unavailable: 'var(--dsw-alias-state-error)',
      unknown: 'var(--dsw-alias-label-tertiary)',
    };

    const S = {
      root: { display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 2px 24px' },
      head: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
      title: { fontSize: 15, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
      pill: (on) => ({
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '2px 9px', borderRadius: 999, fontSize: 12, fontWeight: 600,
        color: on ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-secondary)',
        border: '1px solid color-mix(in srgb, currentColor 35%, transparent)',
        background: on ? 'color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent)' : 'transparent',
      }),
      dot: (on) => ({
        width: 6, height: 6, borderRadius: 999,
        background: on ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-tertiary)',
      }),
      lead: { fontSize: 12.5, lineHeight: 1.7, color: 'var(--dsw-alias-label-secondary)', maxWidth: 760 },
      row: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
      btn: (primary) => ({
        appearance: 'none', cursor: 'pointer', height: 30, padding: '0 14px',
        borderRadius: 8, fontSize: 12.5, fontWeight: primary ? 600 : 500,
        border: primary
          ? '1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 70%, transparent)'
          : '1px solid var(--dsw-alias-border-l1)',
        background: primary
          ? 'color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent)'
          : 'var(--dsw-alias-bg-layer-2)',
        color: primary ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-label-primary)',
      }),
      meta: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', fontFamily: 'var(--dsw-font-family-mono, monospace)' },
      mono: { fontSize: 11.5, color: 'var(--dsw-alias-label-tertiary)', fontFamily: 'var(--dsw-font-family-mono, monospace)', wordBreak: 'break-all' },
      notice: (kind) => ({
        fontSize: 12.5, lineHeight: 1.6, padding: '7px 10px', borderRadius: 8,
        color: kind === 'error' ? 'var(--dsw-alias-state-error)' : 'var(--dsw-alias-label-secondary)',
        background: kind === 'error'
          ? 'color-mix(in srgb, var(--dsw-alias-state-error) 10%, transparent)'
          : 'color-mix(in srgb, var(--dsw-alias-label-secondary) 8%, transparent)',
      }),
      card: {
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        borderRadius: 10, padding: '10px 12px',
        display: 'flex', flexDirection: 'column', gap: 10,
      },
      table: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 },
      th: {
        textAlign: 'left', padding: '6px 8px', fontWeight: 600, fontSize: 11.5,
        color: 'var(--dsw-alias-label-tertiary)', borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      td: {
        padding: '7px 8px', borderBottom: '1px solid color-mix(in srgb, var(--dsw-alias-border-l1) 60%, transparent)',
        color: 'var(--dsw-alias-label-primary)', verticalAlign: 'top',
      },
      stateChip: (state) => ({
        display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600,
        color: STATE_TONE[state] || 'var(--dsw-alias-label-tertiary)',
      }),
      swatch: (state) => ({
        width: 6, height: 6, borderRadius: 999,
        background: STATE_TONE[state] || 'var(--dsw-alias-label-tertiary)',
      }),
      field: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--dsw-alias-label-secondary)' },
      input: {
        width: 92, height: 28, padding: '0 8px', borderRadius: 8, fontSize: 12.5,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-layer-2))',
        color: 'var(--dsw-alias-label-primary)', outline: 'none',
      },
    };

    function ForFreeTab() {
      const t = useT();
      const [data, setData] = useState(null);
      const [busy, setBusy] = useState(null);
      const [notice, setNotice] = useState(null);
      const [draft, setDraft] = useState(null);

      const load = useCallback(async () => {
        try {
          const next = await api('/summary');
          setData(next);
          setDraft({
            enabled: next.settings.enabled !== false,
            exposeRegionModels: next.settings.exposeRegionModels !== false,
            probeIntervalMinutes: next.settings.probeIntervalMinutes ?? 15,
            opencodeBase: next.settings.opencodeBase ?? '',
            kiloBase: next.settings.kiloBase ?? '',
            autoChain: next.settings.autoChain !== false,
            defaultMaxTokens: next.settings.defaultMaxTokens ?? 32768,
          });
          setNotice(null);
        } catch (error) {
          setNotice({ kind: 'error', text: t('err.load', { e: String(error.message || error) }) });
        }
      }, [t]);

      useEffect(() => { load(); }, [load]);

      const runRefresh = useCallback(async (probe) => {
        if (busy) return;
        setBusy(probe ? 'probe' : 'refresh');
        try {
          const result = await api('/refresh', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ probe }),
          });
          if (result.summary) setData(result.summary);
          const n = probe
            ? (result.summary ? result.summary.counts.available : 0)
            : (result.models ?? 0);
          setNotice({
            kind: 'ok',
            text: probe ? t('ok.probe', { n }) : t('ok.refresh', { n, ms: result.ms ?? 0 }),
          });
        } catch (error) {
          setNotice({ kind: 'error', text: t('err.refresh', { e: String(error.message || error) }) });
        } finally {
          setBusy(null);
        }
      }, [busy, t]);

      const saveSettings = useCallback(async (patch) => {
        if (busy) return;
        setBusy('save');
        try {
          const result = await api('/settings', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(patch),
          });
          if (result.summary) setData(result.summary);
          setNotice({ kind: 'ok', text: t('setting.saved') });
        } catch (error) {
          setNotice({ kind: 'error', text: t('err.save', { e: String(error.message || error) }) });
        } finally {
          setBusy(null);
        }
      }, [busy, t]);

      const enabled = data ? data.enabled !== false : false;
      const models = data ? data.models : [];
      const counts = data && data.counts ? data.counts : null;
      const egress = data ? data.egress : null;

      return h('div', { style: S.root },
        h('div', { style: S.head },
          h('span', { style: S.title }, t('title')),
          h('span', { style: S.pill(enabled) },
            h('span', { style: S.dot(enabled) }),
            data ? (enabled ? t('state.on') : t('state.off')) : t('state.unknown'),
          ),
          counts ? h('span', { style: S.meta }, t('meta.models', { n: counts.total })) : null,
          counts ? h('span', { style: S.meta }, '· ' + t('meta.picker', { n: counts.inPicker })) : null,
          h('span', { style: S.meta }, '· ' + t('meta.version', { v: data ? data.version : '—' })),
        ),

        h('div', { style: S.lead }, t('lead')),

        h('div', { style: S.row },
          h('button', {
            type: 'button', style: S.btn(true), disabled: Boolean(busy), onClick: () => runRefresh(false),
          }, busy === 'refresh' ? t('busy.refreshing') : t('btn.refresh')),
          h('button', {
            type: 'button', style: S.btn(false), disabled: Boolean(busy), onClick: () => runRefresh(true),
          }, busy === 'probe' ? t('busy.probing') : t('btn.probe')),
          h('button', {
            type: 'button', style: S.btn(false), disabled: Boolean(busy), onClick: load,
          }, t('btn.reload')),
          h('button', {
            type: 'button', style: S.btn(false), disabled: Boolean(busy),
            onClick: () => saveSettings({ enabled: !enabled }),
          }, enabled ? t('btn.toggleOff') : t('btn.toggleOn')),
        ),

        h('div', { style: S.meta },
          egress && egress.ip
            ? (egress.country ? t('meta.egress.country', { ip: egress.ip, c: egress.country }) : t('meta.egress', { ip: egress.ip }))
            : t('meta.egress.none'),
          ' · ',
          data && data.syncedAt ? t('meta.synced', { t: formatTime(data.syncedAt) }) : t('meta.synced.never'),
        ),

        notice ? h('div', { style: S.notice(notice.kind) }, notice.text) : null,
        data && data.quota && data.quota.blockedUntil > 0
          ? h('div', { style: S.notice('warn') },
            h('div', null, t('quota.blocked', {
              n: data.quota.throttledModels,
              t: formatClock(data.quota.blockedUntil),
              m: data.quota.blockedMinutes,
            })),
            h('div', { style: { ...S.meta, marginTop: 4 } }, t('quota.hint')),
          )
          : null,

        models.length === 0
          ? h('div', { style: S.card },
            h('div', { style: { fontSize: 13, fontWeight: 600 } }, t('empty.title')),
            h('div', { style: S.lead }, t('empty.hint')),
          )
          : h('div', { style: S.card },
            h('table', { style: S.table },
              h('thead', null,
                h('tr', null,
                  h('th', { style: S.th }, t('col.model')),
                  h('th', { style: S.th }, t('col.channel')),
                  h('th', { style: S.th }, t('col.context')),
                  h('th', { style: S.th }, t('col.state')),
                  h('th', { style: S.th }, t('col.latency')),
                ),
              ),
              h('tbody', null,
                models.map(row => h('tr', { key: row.id },
                  h('td', { style: S.td },
                    h('div', { style: { fontWeight: 500 } }, row.name || row.id),
                    h('div', { style: S.mono }, row.id),
                  ),
                  h('td', { style: S.td }, row.channel === 'kilo' ? t('channel.kilo') : t('channel.free')),
                  h('td', { style: { ...S.td, whiteSpace: 'nowrap' } }, formatTokens(row.contextWindow)),
                  h('td', { style: S.td },
                    h('span', { style: S.stateChip(row.state) },
                      h('span', { style: S.swatch(row.state) }),
                      t('state.' + row.state),
                    ),
                    row.detail ? h('div', { style: S.mono, title: row.detail }, String(row.detail).slice(0, 60)) : null,
                    row.resetAt && row.resetAt > Date.now()
                      ? h('div', { style: { ...S.mono, color: STATE_TONE.throttled } }, t('quota.reset', { t: formatClock(row.resetAt) }))
                      : null,
                  ),
                  h('td', { style: { ...S.td, whiteSpace: 'nowrap' } },
                    row.ttftMs === null ? '—' : `${row.ttftMs} / ${row.latencyMs ?? '—'} ms`,
                  ),
                )),
              ),
            ),
            h('div', { style: S.meta }, t('note.channel')),
          ),

        h('div', { style: S.card },
          h('div', { style: { fontSize: 13, fontWeight: 600 } }, t('autoChain.title')),
          data && data.autoChain
            ? (data.autoChain.models.length > 0
              ? h('div', { style: S.mono },
                t('autoChain.current', { n: data.autoChain.models.length }) + '：'
                + data.autoChain.models.slice(0, 6).join(' → ')
                + (data.autoChain.models.length > 6 ? ' → …' : ''))
              : h('div', { style: S.meta }, t('autoChain.empty')))
            : null,
          h('div', { style: S.meta }, t('autoChain.hint')),
        ),

        h('div', { style: S.card },
          h('div', { style: { fontSize: 13, fontWeight: 600 } }, t('usage.title')),
          data && data.usage
            ? h('div', { style: S.meta },
              t('usage.line', {
                r: data.usage.requests,
                f: data.usage.refused,
                i: formatTokens(data.usage.tokens.input),
                o: formatTokens(data.usage.tokens.output),
                x: formatTokens(data.usage.tokens.reasoning),
              }))
            : null,
          data && data.usage && data.usage.models.length > 0
            ? h('table', { style: S.table },
              h('thead', null,
                h('tr', null,
                  h('th', { style: S.th }, t('usage.models')),
                  h('th', { style: S.th }, t('usage.col.calls')),
                  h('th', { style: S.th }, t('usage.col.failed')),
                  h('th', { style: S.th }, t('usage.col.tokens')),
                  h('th', { style: S.th }, t('usage.col.speed')),
                ),
              ),
              h('tbody', null,
                data.usage.models.map(row => h('tr', { key: row.id },
                  h('td', { style: S.td }, row.name || row.id),
                  h('td', { style: S.td }, String(row.calls)),
                  h('td', { style: S.td }, String(row.failed)),
                  h('td', { style: S.td }, formatTokens(row.output)),
                  h('td', { style: S.td }, row.tps ? `${row.tps} tok/s` : '—'),
                )),
              ),
            )
            : h('div', { style: S.meta }, t('usage.empty')),
        ),

        h('div', { style: S.card },
          h('div', { style: { fontSize: 13, fontWeight: 600 } }, t('settings.title')),
          h('div', { style: S.row },
            h('label', { style: S.field },
              h('input', {
                type: 'checkbox', checked: draft ? draft.enabled : false,
                onChange: event => setDraft({ ...draft, enabled: event.target.checked }),
              }),
              t('setting.enabled'),
            ),
            h('label', { style: S.field },
              h('input', {
                type: 'checkbox', checked: draft ? draft.exposeRegionModels : false,
                onChange: event => setDraft({ ...draft, exposeRegionModels: event.target.checked }),
              }),
              t('setting.region'),
            ),
            h('label', { style: S.field },
              h('input', {
                type: 'checkbox', checked: draft ? draft.autoChain : true,
                onChange: event => setDraft({ ...draft, autoChain: event.target.checked }),
              }),
              t('setting.autoChain'),
            ),
            h('label', { style: S.field },
              t('setting.interval'),
              h('input', {
                type: 'number', min: 1, max: 1440, style: S.input, value: draft ? draft.probeIntervalMinutes : 15,
                onChange: event => setDraft({ ...draft, probeIntervalMinutes: Number(event.target.value) }),
              }),
            ),
            h('label', { style: S.field },
              t('setting.maxTokens'),
              h('input', {
                type: 'number', min: 1024, max: 1048576, step: 1024, style: S.input,
                value: draft ? draft.defaultMaxTokens : 32768,
                onChange: event => setDraft({ ...draft, defaultMaxTokens: Number(event.target.value) }),
              }),
            ),
            h('button', {
              type: 'button', style: S.btn(false), disabled: Boolean(busy) || draft === null,
              onClick: () => saveSettings(draft ?? {}),
            }, busy === 'save' ? t('busy.saving') : t('setting.save')),
          ),
          h('div', { style: { fontSize: 12.5, fontWeight: 600, marginTop: 2 } }, t('setting.baseTitle')),
          h('div', { style: S.row },
            h('label', { style: S.field },
              t('setting.baseOpen'),
              h('input', {
                type: 'url', placeholder: data ? data.bases.opencodeDefault : 'https://opencode.ai',
                style: { ...S.input, width: 260 },
                value: draft ? draft.opencodeBase : '',
                onChange: event => setDraft({ ...draft, opencodeBase: event.target.value }),
              }),
            ),
            h('label', { style: S.field },
              t('setting.baseKilo'),
              h('input', {
                type: 'url', placeholder: data ? data.bases.kiloDefault : 'https://api.kilo.ai/api/gateway',
                style: { ...S.input, width: 260 },
                value: draft ? draft.kiloBase : '',
                onChange: event => setDraft({ ...draft, kiloBase: event.target.value }),
              }),
            ),
          ),
          h('div', { style: S.meta }, t('setting.baseHint')),
          data && data.bases ? h('div', { style: S.mono },
            '生效：' + data.bases.opencode + ' · ' + data.bases.kilo) : null,
        ),

        data ? h('div', { style: S.mono }, t('note.dir', { p: data.dataDir })) : null,
      );
    }

    let translate = (key) => key;
    function useT() { return translate; }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const bound = ctx.locale.bind(NS);
        translate = bound;

        ctx.effect(() => ctx.locale.register(NS, DICTS));

        ctx.effect(() => ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
          name: 'settings.plugins.tab',
          id: 'for-free',
          order: 34,
          label: () => bound('tab.label'),
          locale: NS,
        }, ForFreeTab)));
      },
    };
  },
});
