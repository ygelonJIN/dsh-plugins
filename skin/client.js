window.__ModuleLoader__.load({
  id: '@local/skin',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // 整个名称都是我们自己的：不再复用、裁剪官方字标。
    // 字体用 DSH 自带的品牌字体 Montserrat（--dsw-font-family-brand）。
    const FONT = { fontFamily: 'var(--dsw-font-family-brand)' };

    // 图标由田字格线段拼成；同一条链上的转角用 miter 连成直角，
    // 端点用 square 方形帽，和转角一样向外扩半个线宽，所以没有圆角、两端对齐。
    // 点：3/12/21 三档；对应线段 H00 H01 H10 H11 H20 V01 V10 V11。
    const ICON_PATH = 'M3 3H21M12 3V12M12 12H21M12 12V21H3V12Z';

    // 品牌位是 single 槽位：priority 比官方注册（0）低，渲染的就是我们。
    // 官方换槽位名或改成更低的 priority 时，这里会失效，禁用插件即回退。
    const PRIORITY = -1;

    const STYLE_ID = '@local/skin/styles';

    // 设置页文案：skin 的 locale 字典（NS 在下面配色段定义）。
    const DICTS = {
      en: {
        'look.tab': 'Appearance',
        'look.title': 'Appearance',
        'look.desc': 'Pick a target above — the accent or one background surface — then drag on the colour field. '
          + 'Every hue runs left to right, brightness top to bottom, so red, orange, green, blue and purple are all in '
          + 'the same picture; the strip below sets how saturated. Brand name, slogan and icon are further down.',
        'look.target.seed': 'Accent',
        'look.target.sidebar': 'Sidebar / files',
        'look.target.base': 'Conversation',
        'look.target.card': 'Card',
        'look.target.nested': 'Nested card',
        'look.target.dialog': 'Composer',
        'look.target.bubble': 'Bubble',
        'look.target.group': 'Workspace stripe',
        'look.target.seat': 'Composer fade',
        'look.seatHint': 'The fade above the composer only takes an opacity — it never gets a colour.',
        'look.target.icon': 'Icon',
        'look.target.brandLead': 'Name, first',
        'look.target.brandTail': 'Name, second',
        'look.alpha': 'Opacity',
        'look.value': 'Colour value',
        'look.valueHint': '#rrggbb or oklch(L C H), e.g. #d9661a',
        'look.inherit': 'follows default',
        'look.clear': 'Reset this',
        'look.resetSeed': 'Reset to blue',
        'look.surfaceHint': 'Drag to override',
        'look.scale': 'Derived scale',
        'look.brand': 'Brand',
        'look.name': 'Name',
        'look.slogan': 'Slogan',
        'look.icon': 'Icon',
        'look.resetAll': 'Reset everything',
        'look.hint': 'Client-only, stored in this browser.',
      },
      zh: {
        'look.tab': '外观',
        'look.title': '外观',
        'look.desc': '先在上面选一项——主色或某个背景面——再在下面那张色域图上按住拖动就能改它。'
          + '横向是全部色相、纵向是明暗，红橙黄绿蓝紫都在同一张图里；下面那条带子决定选多浓。'
          + '品牌名称、标语和图标在本页最下方。',
        'look.target.seed': '主色',
        'look.target.sidebar': '侧栏 / 文件区',
        'look.target.base': '对话区',
        'look.target.card': '卡片',
        'look.target.nested': '嵌套卡片',
        'look.target.dialog': '输入框',
        'look.target.bubble': '气泡',
        'look.target.group': '工作区色带',
        'look.target.seat': '输入框上渐隐',
        'look.seatHint': '输入框上方那条渐隐只调透明度，不参与配色。',
        'look.target.icon': '图标',
        'look.target.brandLead': '名称·前段',
        'look.target.brandTail': '名称·后段',
        'look.alpha': '透明度',
        'look.value': '颜色值',
        'look.valueHint': '#rrggbb 或 oklch(0.64 0.16 48)，例如 #d9661a',
        'look.inherit': '跟随默认',
        'look.clear': '恢复这一项',
        'look.resetSeed': '恢复官方蓝',
        'look.surfaceHint': '拖动即覆盖',
        'look.scale': '派生色阶',
        'look.brand': '品牌',
        'look.name': '名称',
        'look.slogan': '标语',
        'look.icon': '图标',
        'look.resetAll': '全部恢复默认',
        'look.hint': '只改客户端，存在本机浏览器。',
      },
    };

    function pickT(t) {
      return typeof t === 'function' ? t : (key) => key;
    }

    /** 官方品牌蓝，也是「恢复默认」的落点；favicon 和外观页共用。 */
    const DEFAULT_SEED = '#4176e6';
    const LOOK_KEY = 'dsh.skin.look';
    const TITLE_SEPARATOR = ' — ';

    // 品牌默认值：名称两段、标语、图标路径、主色。
    const LOOK_DEFAULT = {
      lead: 'ygelon',
      tail: 'Harness',
      slogan: 'All For Humans',
      icon: ICON_PATH,
      seed: DEFAULT_SEED,
      surfaces: {},
      alphas: {},
      paint: {},
      groups: {},
    };

    // 直接着色的目标：不走 token，直接写进组件的颜色。
    const PAINT_TARGETS = [
      { id: 'icon', storeKey: 'iconColor', fallback: 'currentColor' },
      { id: 'brandLead', storeKey: 'leadColor', fallback: 'var(--dsw-alias-label-primary)' },
      { id: 'brandTail', storeKey: 'tailColor', fallback: 'var(--dsw-alias-label-secondary)' },
    ];

    // 可改背景的表面：加一个新区域 = 往这张表加一行，外观页自动多一个目标。
    // pane: 官方把透明度硬编码在 hash 类名规则里，只能整条重写（见 PANE_RULES）；
    // fallback: 官方浅/深两色，用户只调透明度不选色时当底色。
    const SURFACES = [
      { id: 'sidebar', tokens: ['--dsw-specific-sidebar-fill'], pane: true, fallback: { light: '#f9fafb', dark: '#1b1b1c' } },
      { id: 'base', tokens: ['--dsw-alias-bg-base'], pane: true, fallback: { light: '#ffffff', dark: '#151517' } },
      { id: 'card', tokens: ['--dsw-alias-bg-layer-1'], fallback: { light: '#ffffff', dark: '#232324' } },
      { id: 'nested', tokens: ['--dsw-alias-bg-layer-2'], fallback: { light: '#ffffff', dark: '#2c2c2e' } },
      { id: 'dialog', tokens: ['--dsw-specific-input-major'], fallback: { light: '#ffffff', dark: '#2c2c2e' } },
      { id: 'bubble', tokens: ['--dsw-specific-bubble'], fallback: { light: '#edf3fe', dark: '#2c2c2e' } },
      // 输入框上方的渐隐遮罩（composerSeat）：不是 token 面，只给一条透明度滑条。
      { id: 'seat', tokens: [], alphaOnly: true, fallback: { light: '#ffffff', dark: '#151517' } },
    ];

    function sanitizeText(value, fallback) {
      const text = typeof value === 'string' ? value.trim() : '';
      return text === '' ? fallback : text.slice(0, 48);
    }

    function sanitizePath(value) {
      const text = typeof value === 'string' ? value.trim() : '';
      // 只收路径命令和数字，逗号空格连字符点都留着；挡掉标签和括号。
      return /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\-\s]+$/.test(text) && text.length <= 2000
        ? text
        : LOOK_DEFAULT.icon;
    }

    function readLook() {
      try {
        const raw = localStorage.getItem(LOOK_KEY);
        const stored = raw === null ? {} : JSON.parse(raw);
        const surfaces = stored !== null && typeof stored.surfaces === 'object' && stored.surfaces !== null
          ? stored.surfaces
          : {};
        const seed = typeof stored?.seed === 'string' && parseColor(stored.seed) !== null
          ? stored.seed
          : LOOK_DEFAULT.seed;
        const alphas = {};
        if (stored !== null && typeof stored.alphas === 'object' && stored.alphas !== null) {
          for (const [key, value] of Object.entries(stored.alphas)) {
            if (typeof value === 'number' && value >= 0 && value <= 100) alphas[key] = Math.round(value);
          }
        }
        const paint = {};
        if (stored !== null && typeof stored.paint === 'object' && stored.paint !== null) {
          for (const [key, value] of Object.entries(stored.paint)) {
            if (typeof value === 'string' && parseColor(value) !== null) paint[key] = value;
          }
        }
        const groups = {};
        if (stored !== null && typeof stored.groups === 'object' && stored.groups !== null) {
          for (const [key, value] of Object.entries(stored.groups)) {
            if (typeof value === 'string' && parseColor(value) !== null && key.length <= 200) groups[key] = value;
          }
        }
        // 统一色带：旧版本按工作区分别存（groups[workspaceId]），现在只认 groups.all。
        // 迁移取第一个有效值，升级后观感不变。
        if (groups.all === undefined) {
          const first = Object.values(groups).find((value) => typeof value === 'string');
          if (typeof first === 'string') groups.all = first;
        }
        for (const key of Object.keys(groups)) if (key !== 'all') delete groups[key];
        return {
          lead: sanitizeText(stored?.lead, LOOK_DEFAULT.lead),
          tail: sanitizeText(stored?.tail, LOOK_DEFAULT.tail),
          slogan: sanitizeText(stored?.slogan, LOOK_DEFAULT.slogan),
          icon: sanitizePath(stored?.icon),
          seed,
          surfaces,
          alphas,
          paint,
          groups,
        };
      } catch {
        return { ...LOOK_DEFAULT };
      }
    }

    // 一个极简 store：品牌位（React 组件）和外观页共读同一份状态。
    let look = readLook();
    const lookListeners = new Set();

    function writeLook(next) {
      try {
        localStorage.setItem(LOOK_KEY, JSON.stringify(next));
      } catch {
        // Storage unavailable: the change still applies for this page.
      }
    }

    function setLook(patch) {
      look = { ...look, ...patch };
      writeLook(look);
      for (const listener of [...lookListeners]) listener();
    }

    function useLook() {
      const [, bump] = React.useReducer((n) => n + 1, 0);
      React.useEffect(() => {
        lookListeners.add(bump);
        return () => lookListeners.delete(bump);
      }, []);
      return look;
    }

    /** 主色，或某个表面的覆盖色；没覆盖时返回 null。 */
    function surfaceColor(id) {
      if (id === 'seed') return look.seed;
      const def = targetById(id);
      if (def.kind === 'groupAll') {
        const value = look.groups.all;
        return typeof value === 'string' && parseColor(value) !== null ? value : null;
      }
      const value = look.surfaces[id];
      return typeof value === 'string' && parseColor(value) !== null ? value : null;
    }

    function setSurfaceColor(id, value) {
      if (id === 'seed') return setLook({ seed: value });
      const surfaces = { ...look.surfaces };
      if (value === null) delete surfaces[id];
      else surfaces[id] = value;
      setLook({ surfaces });
    }

    // 三类目标合成一张表：加新东西 = 加一行，外观页的胶囊、取色、恢复全部跟着有。
    const TARGETS = [{ id: 'seed', kind: 'seed', labelKey: 'look.target.seed' }]
      .concat(SURFACES.map((surface) => ({
        id: surface.id,
        kind: 'token',
        labelKey: 'look.target.' + surface.id,
        alphaOnly: surface.alphaOnly === true,
      })))
      .concat(PAINT_TARGETS.map((paint) => ({
        id: paint.id,
        kind: 'paint',
        labelKey: 'look.target.' + paint.id,
        storeKey: paint.storeKey,
        fallback: paint.fallback,
      })))
      // 工作区色带是“所有工作区一起配”，不再是每个工作区一个目标。
      .concat([{ id: 'group', kind: 'groupAll', labelKey: 'look.target.group' }]);

    function targetById(id) {
      return TARGETS.find((item) => item.id === id) ?? TARGETS[0];
    }

    /** 三类目标各自的取色 / 写色 / 判定是否已覆盖。 */
    function readTargetColor(id) {
      const def = targetById(id);
      if (def.kind === 'seed') return look.seed;
      if (def.kind === 'paint') return look.paint[def.storeKey];
      if (def.kind === 'groupAll') return look.groups.all;
      const value = look.surfaces[id];
      return typeof value === 'string' && parseColor(value) !== null ? value : null;
    }

    function writeTargetColor(id, value) {
      const def = targetById(id);
      if (def.kind === 'seed') return setLook({ seed: value });
      if (def.kind === 'paint') {
        const paint = { ...look.paint };
        if (value === null) delete paint[def.storeKey];
        else paint[def.storeKey] = value;
        return setLook({ paint });
      }
      if (def.kind === 'groupAll') {
        const groups = { ...look.groups };
        if (value === null) delete groups.all;
        else groups.all = value;
        return setLook({ groups });
      }
      return setSurfaceColor(id, value);
    }

    /** 所有工作区共用一条色带；没设色就把它清掉。 */
    function applyGroups() {
      if (typeof document === 'undefined') return;
      const color = look.groups.all;
      for (const row of document.querySelectorAll('[data-row-key^="workspace:"]')) {
        if (typeof color === 'string') {
          row.setAttribute('data-ys-group', '');
          row.style.setProperty('box-shadow', `inset 3px 0 0 ${color}`);
        } else {
          row.removeAttribute('data-ys-group');
          row.style.removeProperty('box-shadow');
        }
      }
    }

    /** 图上起点：没设过色的，一律拿主色当参照。 */
    function targetEditingColor(id) {
      const value = readTargetColor(id);
      return typeof value === 'string' && parseColor(value) !== null ? value : look.seed;
    }

    // 浏览器标题和 favicon 只能运行时改；窗口标题栏、Dock 图标在 .app 里，改不了。
    // favicon 跟着主色走，换橙之后页签图标不再是蓝的。
    function faviconFor() {
      const chosen = look.paint?.iconColor ?? look.seed;
      const color = parseColor(chosen);
      const hex = color === null ? DEFAULT_SEED : oklchToHex(color.L, color.C, color.H);
      return 'data:image/svg+xml,' + encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">`
        + `<path d="${look.icon}" stroke="${hex}" stroke-width="4" stroke-linecap="square" stroke-linejoin="miter"/>`
        + `</svg>`,
      );
    }

    const Mark = React.forwardRef(function Mark({ size = 24 }, ref) {
      const { icon, paint } = useLook();
      return h('svg', {
        ref,
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        focusable: 'false',
        'aria-hidden': 'true',
        style: { display: 'block' },
      },
        h('path', {
          d: icon,
          stroke: paint.iconColor ?? 'currentColor',
          strokeWidth: 4,
          strokeLinecap: 'square',
          strokeLinejoin: 'miter',
        }),
      );
    });

    function Name() {
      const { lead, tail, paint } = useLook();
      return h('span', {
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          whiteSpace: 'nowrap',
        },
      },
        h('span', {
          style: {
            ...FONT,
            fontSize: '20px',
            fontWeight: 600,
            lineHeight: '24px',
            letterSpacing: '0.01em',
            color: paint.leadColor,
          },
        }, lead),
        // Harness 和 ygelon 同一套字号/字距，字重更细，颜色是次要色。
        h('span', {
          style: {
            ...FONT,
            fontSize: '20px',
            fontWeight: 400,
            lineHeight: '24px',
            letterSpacing: '0.01em',
            color: paint.tailColor ?? 'var(--dsw-alias-label-secondary)',
          },
        }, tail),
      );
    }

    // 空会话标语是 conversation 包的语言字典；同一 namespace 不能再注册，
    // 所以只能在 DOM 里接管。主路径是结构锚定（见 HeroMark），
    // 这里保留一份按已知文案替换的兜底。
    const SLOGANS = ['探索未至之境', 'Into the Unknown'];

    function rewriteSlogan(root) {
      if (root === null || root === undefined) return;
      if (root.nodeType === 3) {
        const text = root.data;
        if (!SLOGANS.some((s) => text.includes(s))) return;
        let next = text;
        for (const s of SLOGANS) next = next.split(s).join(look.slogan);
        if (next !== text) root.data = next;
        return;
      }
      if (root.nodeType !== 1) return;
      const all = root.textContent;
      if (all === null || !SLOGANS.some((s) => all.includes(s))) return;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes = [];
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) nodes.push(node);
      for (const node of nodes) rewriteSlogan(node);
    }

    function installSloganFallback(ctx) {
      ctx.effect(() => {
        const observer = new MutationObserver((records) => {
          for (const record of records) {
            if (record.type === 'characterData') {
              rewriteSlogan(record.target);
            } else {
              for (const node of record.addedNodes) rewriteSlogan(node);
            }
          }
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        rewriteSlogan(document.body);
        return () => observer.disconnect();
      });
    }

    // 标题不再匹配产品名：保留 “ — ” 前面的会话标题，后面一段永远换成我们的。
    // 官方改名、改文案都不会让这里失效；只有分隔符变了才会退化成整段替换。
    function syncTitle() {
      if (typeof document === 'undefined' || typeof document.title !== 'string') return;
      const current = document.title;
      const at = current.lastIndexOf(TITLE_SEPARATOR);
      const brand = `${look.lead} ${look.tail}`;
      const next = at === -1
        ? brand
        : `${current.slice(0, at + TITLE_SEPARATOR.length)}${brand}`;
      if (next !== current) document.title = next;
    }

    function installBrowserBrand(ctx) {
      ctx.effect(() => {
        const title = document.querySelector('head > title');
        if (title === null) return;
        const observer = new MutationObserver(syncTitle);
        observer.observe(title, { childList: true, characterData: true, subtree: true });
        syncTitle();
        return () => observer.disconnect();
      });

      ctx.effect(() => {
        const links = [...document.querySelectorAll('link[rel="icon"]')];
        const previous = links.map((link) => link.getAttribute('href'));
        const href = faviconFor();
        for (const link of links) link.setAttribute('href', href);
        return () => {
          links.forEach((link, i) => {
            if (previous[i] === null) link.removeAttribute('href');
            else link.setAttribute('href', previous[i]);
          });
        };
      });
    }

    /** 外观变了就换页签图标；link 由 installBrowserBrand 的 effect 负责还原。 */
    function syncFavicon() {
      if (typeof document === 'undefined') return;
      const href = faviconFor();
      for (const link of document.querySelectorAll('link[rel="icon"]')) link.setAttribute('href', href);
    }

    // 空会话标语已经被替换成我们自己的文案，改标语时要把旧的那句换掉。
    let lastSlogan = look.slogan;

    function syncSloganText() {
      if (lastSlogan === look.slogan) return;
      const previous = lastSlogan;
      lastSlogan = look.slogan;
      if (typeof document === 'undefined' || !document.body) return;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const nodes = [];
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) nodes.push(node);
      for (const node of nodes) {
        if (node.data !== null && node.data.includes(previous)) {
          node.data = node.data.split(previous).join(look.slogan);
        }
      }
    }

    // 从 hero 标志往上找同级的标题节点，直接接管文本：
    // 不看官方写的是什么，改文案也不会失效；官方重排 hero 结构时才退到上面的文案兜底。
    function useHeroSlogan(ref) {
      React.useEffect(() => {
        const svg = ref.current;
        if (svg === null) return undefined;
        const hitbox = svg.parentElement;
        const headline = hitbox === null ? null : hitbox.parentElement;
        const group = headline === null ? null : headline.lastElementChild;
        const target = group === null ? null : group.firstElementChild;
        if (target === null) {
          console.warn('[ygelon] hero headline not found; relying on slogan text fallback');
          return undefined;
        }
        const sync = () => {
          const node = target.firstChild;
          if (node !== null && node.nodeType === 3) {
            if (node.data !== look.slogan) node.data = look.slogan;
            return;
          }
          if (target.textContent !== look.slogan) target.textContent = look.slogan;
        };
        const observer = new MutationObserver(sync);
        observer.observe(target, { childList: true, characterData: true, subtree: true });
        sync();
        return () => observer.disconnect();
      }, [ref]);
    }

    function HeroMark({ size = 24 }) {
      const ref = React.useRef(null);
      useHeroSlogan(ref);
      return h(Mark, { size, ref });
    }

    function registerSlot(ctx, name, component) {
      ctx.effect(() => ctx.slots.inject(name, () => {
        try {
          return ctx.slots.register({ name, priority: PRIORITY }, component);
        } catch (error) {
          console.warn(`[ygelon] slot "${name}" registration failed`, error);
          return () => {};
        }
      }));
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

    // ── 配色：只换品牌色阶，其余九档按官方明暗关系派生 ───────────────────
    //
    // 官方把整套蓝锚在 --dsw-static-deepseek-*：焦点环、链接、选中态、
    // info 按钮都是 var() 转发，所以改写这 10 个变量就够了。
    // 派生保持两件事：①各档 OKLCH 亮度阶梯 ②各档相对 500 的饱和度比例，
    // 只有色相和整体浓淡换成选中的主色 —— 选一个橙，九个浅橙深橙自动出来。
    const NS = 'skin';
    const PALETTE_SOURCE = '@local/skin/palette';

    // 官方色阶实测值：[档位, OKLCH 亮度, 相对 500 的饱和度比, 亮度跟随权重]。
    // 权重在两端衰减，避免把浅底冲到纯白、把深底压成黑。
    const BASE_L = 0.5896;
    const BRAND_STEPS = [
      [50, 0.9628, 0.090, 0.10],
      [100, 0.9441, 0.132, 0.14],
      [200, 0.9106, 0.239, 0.22],
      [300, 0.8386, 0.436, 0.42],
      [400, 0.7396, 0.748, 0.72],
      [450, 0.6473, 1.036, 0.90],
      [500, 0.5896, 1.000, 1.00],
      [600, 0.5291, 0.683, 0.90],
      [800, 0.3755, 0.268, 0.62],
      [900, 0.3125, 0.185, 0.45],
    ];

    function srgbToLinear(value) {
      const c = value / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }

    function cbrt(x) {
      return x < 0 ? -((-x) ** (1 / 3)) : x ** (1 / 3);
    }

    function clamp(value, low, high) {
      return Math.min(high, Math.max(low, value));
    }

    function round(value, digits) {
      return Number(value.toFixed(digits));
    }

    function parseHex(hex) {
      const match = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
      if (match === null) return null;
      const n = parseInt(match[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    /** sRGB hex → OKLCH（亮度 L、彩度 C、色相 H），够用于色阶派生。 */
    function hexToOklch(hex) {
      const rgb = parseHex(hex);
      if (rgb === null) return null;
      const [r, g, b] = rgb.map(srgbToLinear);
      const l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
      const m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
      const s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
      const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
      const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
      const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
      let H = (Math.atan2(B, A) * 180) / Math.PI;
      if (H < 0) H += 360;
      return { L, C: Math.hypot(A, B), H };
    }

    /** OKLCH → 线性 sRGB 通道，不夹取；色域判断和 hex 都从这里走。 */
    function oklchChannels(L, C, H) {
      const rad = (H * Math.PI) / 180;
      const a = C * Math.cos(rad);
      const b = C * Math.sin(rad);
      const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
      const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
      const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
      return [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
      ];
    }

    /** 线性通道 → 0–255 字节，越界夹住。 */
    function channelByte(value) {
      const c = clamp(value, 0, 1);
      const encoded = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
      return Math.round(clamp(encoded, 0, 1) * 255);
    }

    function oklchRgb(L, C, H) {
      return oklchChannels(L, C, H).map(channelByte);
    }

    /** OKLCH → sRGB hex；越界通道夹住，够显示和 favicon 用。 */
    function oklchToHex(L, C, H) {
      return '#' + oklchRgb(L, C, H).map((v) => v.toString(16).padStart(2, '0')).join('');
    }

    /** 这个 (L, H) 在 sRGB 里能到多浓；色域图的右边界靠它算，图才不会被压平。 */
    function maxChroma(L, H) {
      let low = 0;
      let high = 0.42;
      for (let i = 0; i < 14; i += 1) {
        const mid = (low + high) / 2;
        const channels = oklchChannels(L, mid, H);
        const inside = channels.every((v) => v >= -0.0005 && v <= 1.0005);
        if (inside) low = mid;
        else high = mid;
      }
      return low;
    }

    /** 主色统一解析成 OKLCH：既收 '#rrggbb'，也收派生出来的 'oklch(…)'。 */
    function parseColor(value) {
      const text = String(value).trim();
      const match = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/i.exec(text);
      if (match !== null) {
        return { L: Number(match[1]), C: Number(match[2]), H: Number(match[3]) };
      }
      return hexToOklch(text);
    }

    function oklchStr(L, C, H) {
      return 'oklch(' + round(L, 4) + ' ' + round(C, 4) + ' ' + round(H, 2) + ')';
    }

    /** 主色 → 10 个 --dsw-static-deepseek-* 值（CSS 颜色字符串）。 */
    function deriveScale(seedColor) {
      const seed = parseColor(seedColor);
      if (seed === null) return null;
      const delta = seed.L - BASE_L;
      const scale = {};
      for (const [step, L, chromaRatio, weight] of BRAND_STEPS) {
        const lightness = clamp(L + delta * weight, 0.02, 0.995);
        const chroma = clamp(chromaRatio * seed.C, 0, 0.37);
        scale['--dsw-static-deepseek-' + step] = oklchStr(lightness, chroma, seed.H);
      }
      return scale;
    }

    /** overrideTokens 要求每个 token 带 light/dark 两值；色阶本身不分主题。 */
    function toOverrides(scale) {
      const overrides = {};
      for (const [name, value] of Object.entries(scale)) {
        overrides[name] = { light: value, dark: value };
      }
      return overrides;
    }

    // 侧栏和对话区在 macOS 上是半透明压在原生 vibrancy 上的（frame 本身透明）。
    // 透明度用 CSS 变量收口：不设置时分别等于官方的 40% / 50% / 100%，视觉零变化；
    // 选择器重复三次是为了压过官方 [data-platform=darwin] .xxx 的 specificity。
    // 规则只在用户真的调过透明度时才生效（靠 html 上的 data-ys-* 开关），
    // 否则系统「降低透明度」的官方降级不该被我们顶掉。
    const PANE_RULES = `
html[data-ys-sidebar][data-platform=darwin] [class*="sidebarCol"][class*="sidebarCol"][class*="sidebarCol"]{background:linear-gradient(to bottom,#7a9bf01a,#7a9bf000 35%,#8f89b800 68%,#8f89b817),color-mix(in srgb,color-mix(in srgb,var(--dsw-specific-sidebar-fill) 97%,#7a9bf0) var(--ys-sidebar-alpha,40%),transparent)}
html[data-ys-sidebar][data-platform=darwin] body[data-ds-dark-theme] [class*="sidebarCol"][class*="sidebarCol"][class*="sidebarCol"]{background:linear-gradient(to bottom,#7a9bf014,#7a9bf000 35%,#8f89b800 68%,#8f89b812),color-mix(in srgb,var(--dsw-specific-sidebar-fill) var(--ys-sidebar-alpha,50%),transparent)}
html[data-ys-chat][data-platform=darwin] [class*="centerCol"][class*="centerCol"][class*="centerCol"]{background:linear-gradient(to bottom,#7a9bf01a,#7a9bf000 35%,#8f89b800 68%,#8f89b817),color-mix(in srgb,color-mix(in srgb,var(--dsw-alias-bg-base) 97%,#7a9bf0) var(--ys-chat-alpha,100%),transparent)}
html[data-ys-chat][data-platform=darwin] [data-ys-chat-main][data-ys-chat-main][data-ys-chat-main]{background:linear-gradient(to bottom,#7a9bf01a,#7a9bf000 35%,#8f89b800 68%,#8f89b817),color-mix(in srgb,color-mix(in srgb,var(--dsw-alias-bg-base) 97%,#7a9bf0) var(--ys-chat-alpha,100%),transparent)}
/* 输入框上方那块“渐隐”是 composerSeat 自带的 36px 渐变（透明 → 不透明 bg-base），
   它不是纯色背景层，所以对话区的透明度规则管不到它，要单写一条；它有自己的
   透明度变量 --ys-seat-alpha（外观页「输入框上渐隐」那一项）。只有
   [data-phase=active] 的会话页才有这层，空会话时官方本来就没有背景，别硬加。 */
html[data-ys-seat][data-platform=darwin] [data-phase=active] [class*="composerSeat"],
html[data-ys-seat][data-platform=darwin] [data-content-phase=active] [class*="composerSeat"]{background:linear-gradient(180deg,color-mix(in srgb,color-mix(in srgb,var(--dsw-alias-bg-base) 97%,#7a9bf0) 0%,transparent) 0px,color-mix(in srgb,color-mix(in srgb,var(--dsw-alias-bg-base) 97%,#7a9bf0) var(--ys-seat-alpha,100%),transparent) 36px)}
`;

    // 输入框那排信息（插件 pill、上下文条）原来是散着的，整体包成一张卡片，
    // 现在靠 InputBar 是 column flex 这一点，用 order:-1 把它挪到输入卡片**上方**（不动 DOM，
    // 官方结构一变就自然回落）。形状像“从输入框里长出来”的翻转版：宽度自适应内容、
    // 底边贴着输入卡片、只留上方两个圆角，底部两角用 radial-gradient 伪元素画成反向圆弧。
    // 颜色和透明度直接吃 --dsw-specific-input-major，也就是外观页「输入框」那一项
    // （ui-layout 会把覆盖写成 body 内联变量），所以调输入框就一起变，不需要另开一项。
    const DOCK_RULES = `
[data-composer-dock]:not(:empty){
  --ys-dock-fill:var(--dsw-specific-input-major);
  --ys-dock-radius:10px;
  position:relative;box-sizing:border-box;width:fit-content;max-width:var(--dsh-composer-card-max-width);
  order:-1;margin:0 auto;padding:5px 12px;
  border-radius:var(--ys-dock-radius) var(--ys-dock-radius) 0 0;
  background:var(--ys-dock-fill)
}
[data-composer-dock]:not(:empty):before,
[data-composer-dock]:not(:empty):after{
  content:'';position:absolute;bottom:0;width:var(--ys-dock-radius);height:var(--ys-dock-radius)
}
[data-composer-dock]:not(:empty):before{left:calc(-1 * var(--ys-dock-radius));background:radial-gradient(circle at 0% 0%,transparent var(--ys-dock-radius),var(--ys-dock-fill) var(--ys-dock-radius))}
[data-composer-dock]:not(:empty):after{right:calc(-1 * var(--ys-dock-radius));background:radial-gradient(circle at 100% 0%,transparent var(--ys-dock-radius),var(--ys-dock-fill) var(--ys-dock-radius))}
`;



    const ALPHA_RULES = [
      { key: 'sidebar', flag: 'data-ys-sidebar', variable: '--ys-sidebar-alpha', targetId: 'sidebar' },
      { key: 'base', flag: 'data-ys-chat', variable: '--ys-chat-alpha', targetId: 'base' },
      { key: 'seat', flag: 'data-ys-seat', variable: '--ys-seat-alpha', targetId: 'seat' },
    ];

    /** 目标 id → 透明度变量名（非 pane 表面的透明度折在 token 值里，没有变量）。 */
    function alphaRuleFor(targetId) {
      return ALPHA_RULES.find((rule) => rule.targetId === targetId) ?? null;
    }

    // 对话区不止一层：centerCol、ConversationRoot，还可能有中间容器，每一层都吃同一个
    // bg-base 且不透明。只调最外层会被里面挡回去，所以从会话内容往上走，把整条
    // "背景就是 bg-base" 的链路都找出来一起调。结果缓存起来，拖动滑条时不再遍历 DOM。
    const CHAT_BG = 'linear-gradient(to bottom,#7a9bf01a,#7a9bf000 35%,#8f89b800 68%,#8f89b817),'
      + 'color-mix(in srgb,color-mix(in srgb,var(--dsw-alias-bg-base) 97%,#7a9bf0) VAR%,transparent)';

    let chatNodesCache = [];

    /** bg-base 的实际颜色值，用来判断某个元素是不是背景层。 */
    function computedBaseColor() {
      const probe = document.createElement('span');
      probe.style.color = 'var(--dsw-alias-bg-base)';
      document.body.appendChild(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    }

    function markChatMain() {
      chatNodesCache = [];
      if (typeof document === 'undefined' || !document.body) return;
      const center = document.querySelector('[class*="centerCol"]');
      if (center === null) return;
      const base = computedBaseColor();
      const found = [];

      // 从会话内容往上，收下每一层背景恰好是 bg-base 的容器。
      const anchor = document.querySelector('[data-chat-turn], [contenteditable="true"]');
      if (anchor !== null) {
        let node = anchor.parentElement;
        while (node !== null && node !== center.parentElement) {
          if (getComputedStyle(node).backgroundColor === base && found.indexOf(node) === -1) found.push(node);
          if (node === center) break;
          node = node.parentElement;
        }
      }
      // 兜底：没走通就退回到"最高那个直接子"。
      if (found.length === 0) {
        let tallest = null;
        let height = 0;
        for (const child of center.children) {
          const box = child.getBoundingClientRect().height;
          if (box > height) { height = box; tallest = child; }
        }
        if (tallest !== null) found.push(tallest);
      }
      for (const child of center.children) {
        if (found.indexOf(child) === -1) child.removeAttribute('data-ys-chat-main');
      }
      for (const node of found) node.setAttribute('data-ys-chat-main', '');
      chatNodesCache = found;
    }

    /** 透明度写进根元素的 CSS 变量和开关属性；没设置就移除，回到官方值。 */
    function applyAlphas() {
      const root = typeof document === 'undefined' ? null : document.documentElement;
      if (root === null || root === undefined || root.style === undefined) return;
      for (const rule of ALPHA_RULES) {
        const value = look.alphas[rule.key];
        if (typeof value === 'number') {
          root.setAttribute(rule.flag, '');
          root.style.setProperty(rule.variable, value + '%');
        } else {
          root.removeAttribute(rule.flag);
          root.style.removeProperty(rule.variable);
        }
        // 对话区里那几层背景层：CSS 规则会被更深的官方规则盖住，
        // 改成直接写内联（优先级最高），颜色里用 var() 所以浅深切换照样跟。
        if (rule.key === 'base') {
          for (const node of document.querySelectorAll('[data-ys-chat-main]')) {
            if (chatNodesCache.indexOf(node) === -1 || typeof value !== 'number') node.style.removeProperty('background');
          }
          if (typeof value === 'number') {
            const bg = CHAT_BG.replace('VAR', String(value));
            for (const node of chatNodesCache) node.style.setProperty('background', bg);
          }
        }
      }
    }

    /** 把不透明度折进一个颜色值；alpha 为 null 时原样返回。 */
    function withAlpha(value, alpha) {
      if (alpha === null || alpha === undefined) return value;
      return `color-mix(in srgb, ${value} ${alpha}%, transparent)`;
    }

    /**
     * 把当前外观写进主题快照：品牌色阶 + 各个表面的覆盖色。
     * 什么都没改时不留覆盖层，默认态和官方像素级一致。
     */
    function applyLook(theme) {
      if (theme === null || theme === undefined) return null;
      const overrides = {};
      const scale = deriveScale(look.seed);
      if (String(look.seed).toLowerCase() !== DEFAULT_SEED && scale !== null) {
        Object.assign(overrides, toOverrides(scale));
      }
      for (const surface of SURFACES) {
        const user = readTargetColor(surface.id);
        // pane 类的透明度由 PANE_RULES 负责（官方那条 40% 写死在规则里），
        // 其余的把透明度直接折进 token 值，官方每个地方读到的都是半透明色。
        const alpha = surface.pane === true ? null : (look.alphas[surface.id] ?? null);
        if (user === null && alpha === null) continue;
        for (const token of surface.tokens) {
          overrides[token] = {
            light: withAlpha(user ?? surface.fallback.light, alpha),
            dark: withAlpha(user ?? surface.fallback.dark, alpha),
          };
        }
      }
      if (Object.keys(overrides).length === 0) return null;
      try {
        return theme.overrideTokens(PALETTE_SOURCE, overrides);
      } catch (error) {
        console.warn('[ygelon] appearance override failed', error);
        return null;
      }
    }

    const PALETTE_CSS = `
.ys-pal{font-size:13px;line-height:20px;padding:4px 0}
.ys-pal h3{margin:0 0 4px;font-size:15px;font-weight:600}
.ys-pal h4{margin:18px 0 8px;font-size:13px;font-weight:600}
.ys-pal-desc{margin:0 0 12px;color:var(--dsw-alias-label-secondary)}
.ys-pal-section{margin:0 0 6px;color:var(--dsw-alias-label-tertiary);font-size:11px}
.ys-pal-targets{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
.ys-pal-target{padding:0 9px;height:26px;border-radius:999px;border:1px solid var(--dsw-alias-border-l4);background:0 0;color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.ys-pal-target[data-active=true]{border-color:var(--dsw-alias-label-primary);color:var(--dsw-alias-label-primary)}
.ys-pal-target i{display:block;width:11px;height:11px;border-radius:3px;border:1px solid var(--dsw-alias-border-l3)}
.ys-pal-current{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.ys-pal-dot{width:24px;height:24px;border-radius:8px;border:1px solid var(--dsw-alias-border-l3)}
.ys-pal-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.ys-pal-value{width:150px;box-sizing:border-box;padding:4px 8px;border:1px solid var(--dsw-alias-border-l4);border-radius:7px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;outline:none}
.ys-pal-value:focus{border-color:var(--dsw-alias-state-business-primary)}
.ys-pal-value::placeholder{color:var(--dsw-alias-label-tertiary)}
.ys-pal-plane{position:relative;border-radius:10px;overflow:hidden;border:1px solid var(--dsw-alias-border-l3);cursor:crosshair;touch-action:none;margin-bottom:9px}
.ys-pal-canvas{display:block;width:100%;aspect-ratio:16/10;height:auto}
.ys-pal-mark{position:absolute;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px rgb(0 0 0 / 40%);pointer-events:none}
.ys-pal-sat{position:relative;height:14px;border-radius:8px;cursor:crosshair;touch-action:none;border:1px solid var(--dsw-alias-border-l3);margin-bottom:14px}
.ys-pal-sat-mark{position:absolute;top:-3px;width:5px;height:18px;margin-left:-2.5px;border-radius:3px;background:#fff;box-shadow:0 0 0 1px rgb(0 0 0 / 45%);pointer-events:none}
.ys-pal-alpha{display:grid;grid-template-columns:56px 1fr 40px;align-items:center;gap:8px;margin-bottom:12px;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.ys-pal-alpha input{width:100%;margin:0;accent-color:var(--dsw-alias-state-business-primary)}
.ys-pal-alpha b{font-weight:400;text-align:right;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.ys-pal-strip{display:flex;border-radius:8px;overflow:hidden;margin-bottom:6px}
.ys-pal-chip{flex:1 1 0;height:32px}
.ys-pal-steps{display:flex;color:var(--dsw-alias-label-tertiary);font-size:10px;margin-bottom:12px}
.ys-pal-steps span{flex:1 1 0;text-align:center}
.ys-pal-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ys-pal-btn{border:1px solid var(--dsw-alias-border-l4);border-radius:8px;background:0 0;color:var(--dsw-alias-label-primary);padding:2px 10px;line-height:22px;cursor:pointer;font-size:12px}
.ys-pal-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.ys-pal-hint{margin-left:auto;color:var(--dsw-alias-label-tertiary);font-size:11px}
.ys-pal-field{display:grid;grid-template-columns:56px 1fr 26px;align-items:center;gap:8px;margin-bottom:8px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.ys-pal-field>span{white-space:nowrap}
.ys-pal-field input{width:100%;box-sizing:border-box;padding:4px 8px;border:1px solid var(--dsw-alias-border-l4);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:12px;outline:none}
.ys-pal-field input:focus{border-color:var(--dsw-alias-state-business-primary)}
.ys-pal-pair{display:flex;gap:6px;grid-column:2 / 4}
.ys-pal-pair input{flex:1 1 0;min-width:0}
.ys-pal-wide{grid-column:2 / 4}
.ys-pal-field textarea{width:100%;box-sizing:border-box;padding:5px 8px;border:1px solid var(--dsw-alias-border-l4);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:16px;min-height:56px;resize:vertical;outline:none}
.ys-pal-field textarea:focus{border-color:var(--dsw-alias-state-business-primary)}
.ys-pal-preview{width:26px;height:26px;display:grid;place-items:center;color:var(--dsw-alias-label-primary)}
`;

    // 色域图：横向是色相（一整条彩虹），纵向是亮度，彩度取该点能到的最浓值
    // 再乘浓度带上选的比例 —— 所以一张图里同时有红橙黄绿蓝紫和深浅。
    const PLANE_L_TOP = 0.99;
    const PLANE_L_BOTTOM = 0.12;

    /** 某个颜色的 hex，用于回显和 favicon。 */
    function colorHex(value) {
      const color = parseColor(value);
      return color === null ? DEFAULT_SEED : oklchToHex(color.L, color.C, color.H);
    }

    /**
     * 设置 → 插件 → 外观：上面选目标（主色或某个背景面），下面一张图拖着调；
     * 再往下是品牌名称、标语和图标路径。
     */
    function AppearanceTab(props) {
      const t = pickT(props.t);
      const state = useLook();
      const [target, setTarget] = React.useState('seed');

      const planeRef = React.useRef(null);
      const canvasRef = React.useRef(null);
      const dragRef = React.useRef(false);
      const [width, setWidth] = React.useState(320);

      const raw = readTargetColor(target);
      const editing = targetEditingColor(target);
      const current = React.useMemo(() => parseColor(editing) ?? parseColor(DEFAULT_SEED), [editing]);
      const isSurface = targetById(target).kind === 'token';
      const hasOverride = typeof raw === 'string' && parseColor(raw) !== null;

      // 颜色值输入：拖图会改它，敲进去的值也会反过来改颜色。
      const [text, setText] = React.useState(() => colorHex(editing));
      React.useEffect(() => { setText(colorHex(editing)); }, [editing]);

      const pick = (value) => {
        if (parseColor(value) === null) return;
        writeTargetColor(target, value);
      };

      const edge = maxChroma(current.L, current.H);
      const satRatio = edge === 0 ? 0 : clamp(current.C / edge, 0, 1);

      const pickAt = (event) => {
        const plane = planeRef.current;
        if (plane === null) return;
        const rect = plane.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
        const H = x * 359.9;
        const L = PLANE_L_TOP + (PLANE_L_BOTTOM - PLANE_L_TOP) * y;
        pick(oklchStr(L, maxChroma(L, H) * satRatio, H));
      };

      const pickSat = (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (rect.width === 0) return;
        const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        pick(oklchStr(current.L, edge * x, current.H));
      };

      const drag = (handler) => ({
        onPointerDown: (event) => {
          dragRef.current = true;
          try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* older engines */ }
          handler(event);
        },
        onPointerMove: (event) => {
          if (dragRef.current) handler(event);
        },
        onPointerUp: () => { dragRef.current = false; },
        onPointerCancel: () => { dragRef.current = false; },
      });

      // 打开设置时先定位对话区的背景层、给已设色的工作区染色，然后才应用透明度。
      // 只在挂载时做一次：拖滑条时用缓存，不必每帧遍历 DOM。
      React.useEffect(() => {
        applyGroups();
        markChatMain();
        applyAlphas();
        return undefined;
      }, []);

      React.useEffect(() => {
        const plane = planeRef.current;
        if (plane === null) return undefined;
        const measure = () => {
          const next = plane.clientWidth;
          if (next > 0) setWidth((prev) => (Math.abs(prev - next) < 1 ? prev : next));
        };
        measure();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(measure);
        observer.observe(plane);
        return () => observer.disconnect();
      }, []);

      // 逐像素画：按 2×2 块取一次色域边界，够快也够平滑。
      React.useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas === null || typeof canvas.getContext !== 'function') return;
        const wide = Math.max(160, Math.round(width));
        const tall = Math.max(100, Math.round((wide * 10) / 16));
        canvas.width = wide;
        canvas.height = tall;
        const context = canvas.getContext('2d');
        if (context === null) return;
        const image = context.createImageData(wide, tall);
        const data = image.data;
        const block = 2;
        for (let row = 0; row < tall; row += block) {
          const L = PLANE_L_TOP + (PLANE_L_BOTTOM - PLANE_L_TOP) * (row / (tall - 1 || 1));
          for (let col = 0; col < wide; col += block) {
            const H = (col / (wide - 1 || 1)) * 359.9;
            const rgb = oklchRgb(L, maxChroma(L, H) * satRatio, H);
            for (let dy = 0; dy < block && row + dy < tall; dy += 1) {
              for (let dx = 0; dx < block && col + dx < wide; dx += 1) {
                const at = ((row + dy) * wide + (col + dx)) * 4;
                data[at] = rgb[0];
                data[at + 1] = rgb[1];
                data[at + 2] = rgb[2];
                data[at + 3] = 255;
              }
            }
          }
        }
        context.putImageData(image, 0, 0);
      }, [satRatio, width]);

      const hex = colorHex(editing);
      const markX = clamp(current.H / 360, 0, 1);
      const markY = clamp((current.L - PLANE_L_TOP) / (PLANE_L_BOTTOM - PLANE_L_TOP), 0, 1);
      const satBar = 'linear-gradient(to right,'
        + oklchStr(current.L, 0, current.H) + ','
        + oklchStr(current.L, edge, current.H) + ')';
      const scale = deriveScale(state.seed) ?? {};

      // 只有侧栏和对话区有透明度可调；默认值就是官方那两个数。
      const targetDef = targetById(target);
      // 每个背景面都有透明度；品牌位和工作区组没有。
      const alphaKey = targetDef.kind === 'token' ? target : null;
      const alphaOnly = targetDef.alphaOnly === true;
      const alphaDefault = alphaKey === 'sidebar' ? 40 : 100;
      const alphaValue = alphaKey === null
        ? 100
        : (typeof state.alphas[alphaKey] === 'number' ? state.alphas[alphaKey] : alphaDefault);

      // 只调透明度的目标（输入框上渐隐）不用色域图，换成一行说明。
      const colorBlocks = h(React.Fragment, null,
        h('div', { className: 'ys-pal-current' },
          h('span', { className: 'ys-pal-dot', style: { background: hex } }),
          h('input', {
            className: 'ys-pal-value',
            type: 'text',
            value: text,
            spellCheck: false,
            placeholder: '#4176e6',
            title: t('look.valueHint'),
            'aria-label': t('look.value'),
            onChange: (event) => {
              const value = event.target.value;
              setText(value);
              if (parseColor(value) !== null) pick(value);
            },
            onBlur: () => setText(colorHex(editing)),
          }),
          isSurface && !hasOverride
            ? h('span', { className: 'ys-pal-code' }, '· ' + t('look.inherit'))
            : null,
        ),
        h('div', { className: 'ys-pal-plane', ref: planeRef, ...drag(pickAt) },
          h('canvas', { className: 'ys-pal-canvas', ref: canvasRef }),
          h('span', {
            className: 'ys-pal-mark',
            style: { left: markX * 100 + '%', top: markY * 100 + '%', background: hex },
          }),
        ),
        h('div', { className: 'ys-pal-sat', style: { backgroundImage: satBar }, ...drag(pickSat) },
          h('span', { className: 'ys-pal-sat-mark', style: { left: satRatio * 100 + '%' } }),
        ),
      );

      const targets = TARGETS.map((item) => ({
        id: item.id,
        label: t(item.labelKey),
        color: targetEditingColor(item.id),
      }));

      return h('div', { className: 'ys-pal' },
        h('h3', null, t('look.title')),
        h('p', { className: 'ys-pal-desc' }, t('look.desc')),

        h('div', { className: 'ys-pal-targets' }, targets.map((item) => h('button', {
          key: item.id,
          type: 'button',
          className: 'ys-pal-target',
          'data-active': item.id === target ? 'true' : 'false',
          onClick: () => setTarget(item.id),
        },
          h('i', { style: { background: colorHex(item.color) } }),
          item.label,
        ))),

        alphaOnly ? h('p', { className: 'ys-pal-code' }, t('look.seatHint')) : colorBlocks,
        alphaKey === null ? null : h('label', { className: 'ys-pal-alpha' },
          h('span', null, t('look.alpha')),
          h('input', {
            type: 'range',
            min: 0,
            max: 100,
            step: 1,
            value: alphaValue,
            'aria-label': t('look.alpha'),
            onChange: (event) => setLook({
              alphas: { ...state.alphas, [alphaKey]: Number(event.target.value) },
            }),
          }),
          h('b', null, alphaValue + '%'),
        ),
        h('div', { className: 'ys-pal-bar' },
          h('button', {
            type: 'button',
            className: 'ys-pal-btn',
            onClick: () => {
              if (target === 'seed') {
                setLook({ seed: DEFAULT_SEED });
                return;
              }
              const surfaces = { ...look.surfaces };
              const alphas = { ...look.alphas };
              const paint = { ...look.paint };
              const groups = { ...look.groups };
              const def = targetById(target);
              if (def.kind === 'paint') delete paint[def.storeKey];
              if (def.kind === 'groupAll') delete groups.all;
              delete surfaces[target];
              delete alphas[target];
              setLook({ surfaces, alphas, paint, groups });
            },
          }, target === 'seed' ? t('look.resetSeed') : t('look.clear')),
          isSurface && !alphaOnly
            ? h('span', { className: 'ys-pal-hint' }, t('look.surfaceHint'))
            : null,
        ),

        target === 'seed' ? h(React.Fragment, null,
          h('p', { className: 'ys-pal-section', style: { marginTop: '14px' } }, t('look.scale')),
          h('div', { className: 'ys-pal-strip' }, BRAND_STEPS.map(([step]) => h('div', {
            key: step,
            className: 'ys-pal-chip',
            style: { background: scale['--dsw-static-deepseek-' + step] ?? 'transparent' },
            title: String(step),
          }))),
          h('div', { className: 'ys-pal-steps' }, BRAND_STEPS.map(([step]) => h('span', { key: step }, String(step)))),
        ) : null,

        h('h4', null, t('look.brand')),
        h('label', { className: 'ys-pal-field' },
          h('span', null, t('look.name')),
          h('div', { className: 'ys-pal-pair' },
            h('input', {
              type: 'text',
              value: state.lead,
              spellCheck: false,
              onChange: (event) => setLook({ lead: sanitizeText(event.target.value, LOOK_DEFAULT.lead) }),
            }),
            h('input', {
              type: 'text',
              value: state.tail,
              spellCheck: false,
              onChange: (event) => setLook({ tail: sanitizeText(event.target.value, LOOK_DEFAULT.tail) }),
            }),
          ),
        ),
        h('label', { className: 'ys-pal-field' },
          h('span', null, t('look.slogan')),
          h('input', {
            className: 'ys-pal-wide',
            type: 'text',
            value: state.slogan,
            spellCheck: false,
            onChange: (event) => setLook({ slogan: sanitizeText(event.target.value, LOOK_DEFAULT.slogan) }),
          }),
        ),
        h('label', { className: 'ys-pal-field' },
          h('span', null, t('look.icon')),
          h('textarea', {
            value: state.icon,
            spellCheck: false,
            onChange: (event) => setLook({ icon: sanitizePath(event.target.value) }),
          }),
          h('span', { className: 'ys-pal-preview' },
            h('svg', {
              width: 22,
              height: 22,
              viewBox: '0 0 24 24',
              fill: 'none',
              'aria-hidden': 'true',
            }, h('path', {
              d: state.icon,
              stroke: state.paint.iconColor ?? 'currentColor',
              strokeWidth: 4,
              strokeLinecap: 'square',
              strokeLinejoin: 'miter',
            })),
          ),
        ),
        h('div', { className: 'ys-pal-bar', style: { marginTop: '10px' } },
          h('button', {
            type: 'button',
            className: 'ys-pal-btn',
            onClick: () => setLook({ ...LOOK_DEFAULT, surfaces: {} }),
          }, t('look.resetAll')),
          h('span', { className: 'ys-pal-hint' }, t('look.hint')),
        ),
      );
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const translate = ctx.locale.bind(NS);
        let themeRef = null;
        let disposeLook = null;

        // 外观一变：重写 token 覆盖层、换 favicon、刷标题和标语。
        const applyNow = () => {
          if (disposeLook !== null) {
            try { disposeLook(); } catch { /* layer already replaced */ }
            disposeLook = null;
          }
          disposeLook = applyLook(themeRef);
          applyAlphas();
          applyGroups();
          syncFavicon();
          syncSloganText();
          syncTitle();
        };

        ctx.effect(() => ctx.locale.register(NS, DICTS));

        ctx.effect(() => {
          if (typeof document === 'undefined') return undefined;
          // 热更新后旧标签会一直活着，先清再挂。
          for (const stale of document.querySelectorAll('style[data-plugin-css="' + STYLE_ID + '"]')) stale.remove();
          const tag = document.createElement('style');
          tag.setAttribute('data-plugin-css', STYLE_ID);
          tag.textContent = PALETTE_CSS + PANE_RULES + DOCK_RULES;
          document.head.appendChild(tag);
          return () => tag.remove();
        });

        // theme 由 ui-theme 提供：色阶覆盖走官方快照，ui-layout 会把它
        // 写成 body 的内联变量，优先级压过内置样式表。
        ctx.inject(['theme'], (themeCtx) => {
          themeRef = themeCtx.get('theme') ?? null;
          lookListeners.add(applyNow);
          ctx.effect(() => () => {
            lookListeners.delete(applyNow);
            if (disposeLook !== null) {
              try { disposeLook(); } catch { /* already gone */ }
              disposeLook = null;
            }
          });
          applyNow();
        });

        ctx.effect(() => ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
          name: 'settings.plugins.tab',
          id: 'skin-appearance',
          order: 30,
          label: () => translate('look.tab'),
          locale: NS,
        }, AppearanceTab)));

        registerSlot(ctx, 'sidebar.brand.mark', Mark);
        registerSlot(ctx, 'sidebar.brand.name', Name);
        registerSlot(ctx, 'conversation.hero.brand.mark', HeroMark);

        try {
          installBrowserBrand(ctx);
        } catch (error) {
          console.warn('[ygelon] browser brand install failed', error);
        }
        try {
          installSloganFallback(ctx);
        } catch (error) {
          console.warn('[ygelon] slogan fallback install failed', error);
        }

        selfCheck('ygelon', [
          {
            anchor: '页面标题 head > title',
            impact: '浏览器标题不显示品牌名',
            probe: () => document.querySelector('head > title') !== null,
          },
          {
            anchor: 'favicon link[rel=icon]',
            impact: 'favicon 不替换',
            probe: () => document.querySelector('link[rel="icon"]') !== null,
          },
          {
            anchor: 'body 上的 --dsw-alias-bg-base',
            impact: '外观页改了颜色也不会生效（token 名变了）',
            probe: () => getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base').trim() !== '',
          },
        ]);
      },
    };
  },
});
