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
        'look.follow': 'Content surfaces follow the accent (bubble, code block, tool output, inline code)',
        'look.desc': 'Pick a target above — the accent or one background surface — then drag on the colour field. '
          + 'Every hue runs left to right, brightness top to bottom, so red, orange, green, blue and purple are all in '
          + 'the same picture; the strip below sets how saturated. Brand name, slogan and icon are further down.',
        'look.target.seed': 'Accent',
        'look.group.seed': 'Accent',
        'look.group.sidebar': 'Sidebar',
        'look.group.chat': 'Conversation',
        'look.group.input': 'Composer',
        'look.group.overlay': 'Menus & overlays',
        'look.group.brand': 'Brand',
        'look.target.sidebar': 'Sidebar / files',
        'look.target.base': 'Conversation',
        'look.target.card': 'Card',
        'look.target.nested': 'Nested card',
        'look.target.dialog': 'Composer',
        'look.target.bubble': 'Bubble',
        'look.target.code': 'Code block (body)',
        'look.target.think': 'Reasoning block',
        'look.target.toolOutput': 'Tool output block',
        'look.target.codeBanner': 'Code block (banner)',
        'look.target.inlineCode': 'Inline code',
        'look.target.menu': 'Menus & popovers',
        'look.target.seat': 'Composer fade',
        'look.target.groupCard': 'Workspace card',
        'look.target.groupEdge': 'Workspace card outline',
        'look.target.rowOpen': 'Open row',
        'look.target.rowRun': 'Running row',
        'look.hint.seed': "Accent colour — the whole derived scale: buttons, links, focus rings, selected states.",
        'look.hint.sidebar': "The left column (files) background; on macOS it also decides how much vibrancy shows through.",
        'look.hint.sidebarShadow': "Drop shadow for the whole left column.",
        'look.hint.rowOpen': "The sidebar row of the conversation you have open.",
        'look.hint.rowRun': "Sidebar rows that are running, or finished and not read yet.",
        'look.hint.groupCard': "The group box sidebar-marks draws around an expanded workspace.",
        'look.hint.groupEdge': "Hairline of that group box; the outline of the composer and message bubbles reuse it too.",
        'look.hint.rowIcon': "The ellipsis / pin / archive icons that appear when hovering a sidebar row.",
        'look.hint.base': "The main conversation column — the whole area the messages sit on.",
        'look.hint.card': "First-level card: changed-files card, tool output frame, hover previews, settings panels.",
        'look.hint.nested': "Second-level raised surface: code viewer, registry dialogs, switch panels in Settings.",
        'look.hint.bubble': "The bubble of the messages you send.",
        'look.hint.think': "The block that holds the reasoning text while the model thinks.",
        'look.hint.code': "Highlighted code blocks that have a language name (not the banner above them).",
        'look.hint.codeBanner': "The strip above a code block: language name (or “Code block”) and the copy button.",
        'look.hint.inlineCode': "The small pill for inline `code` inside running text.",
        'look.hint.toolOutput': "The output area of an expanded tool call; also drives turn triggers and the search panel.",
        'look.hint.deliverable': "The file card shown when I deliver a file to you.",
        'look.hint.changesHead': "The header row of the “edited files” card.",
        'look.hint.changesRow': "Each file row inside that card (no background by default).",
        'look.hint.dialog': "The composer card; the info card under it reuses the same colour.",
        'look.hint.seat': "The 36px fade right above the composer — opacity only, it never takes a colour.",
        'look.hint.menu': "Account menu and every popover: context, queue, stats panels.",
        'look.hint.icon': "The sidebar brand mark and the browser tab icon.",
        'look.hint.brandLead': "Colour of the first half of the brand name.",
        'look.hint.brandTail': "Colour of the second half of the brand name.",
        'look.target.icon': 'Icon',
        'look.target.rowIcon': 'Row action icons',
        'look.target.deliverable': 'Delivered file',
        'look.target.sidebarShadow': 'Sidebar shadow',
        'look.target.changesHead': 'Edited-files header',
        'look.target.changesRow': 'Edited-files row',
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
        'look.follow': '内容面跟随主色（气泡 / 代码块 / 工具输出 / 行内代码）',
        'look.desc': '先在上面选一项——主色或某个背景面——再在下面那张色域图上按住拖动就能改它。'
          + '横向是全部色相、纵向是明暗，红橙黄绿蓝紫都在同一张图里；下面那条带子决定选多浓。'
          + '品牌名称、标语和图标在本页最下方。',
        'look.target.seed': '主色',
        'look.group.seed': '主色',
        'look.group.sidebar': '侧栏',
        'look.group.chat': '对话区',
        'look.group.input': '输入区',
        'look.group.overlay': '弹层',
        'look.group.brand': '品牌',
        'look.target.sidebar': '侧栏 / 文件区',
        'look.target.base': '对话区',
        'look.target.card': '卡片',
        'look.target.nested': '嵌套卡片',
        'look.target.dialog': '输入框',
        'look.target.bubble': '气泡',
        'look.target.code': '代码块（主体）',
        'look.target.think': '思考过程',
        'look.target.toolOutput': '工具输出块',
        'look.target.codeBanner': '代码块（语言条）',
        'look.target.inlineCode': '行内代码',
        'look.target.menu': '菜单 / 弹层',
        'look.target.seat': '输入框上渐隐',
        'look.target.groupCard': '工作区卡片',
        'look.target.groupEdge': '工作区卡片描边',
        'look.target.rowOpen': '当前对话底色',
        'look.target.rowRun': '运行中 / 完成底色',
        'look.hint.seed': "主色——派生出整套色阶：按钮、链接、焦点环、选中态都跟着变。",
        'look.hint.sidebar': "左侧整列（文件区）的底色；macOS 下还决定毛玻璃透出多少。",
        'look.hint.sidebarShadow': "左侧整列的投影。",
        'look.hint.rowOpen': "侧栏里你当前打开的那一行。",
        'look.hint.rowRun': "侧栏里正在运行、以及跑完还没看的行。",
        'look.hint.groupCard': "sidebar-marks 给展开的工作区画的那张组框底色。",
        'look.hint.groupEdge': "那张组框的发丝描边；输入框和消息气泡的包边也复用它。",
        'look.hint.rowIcon': "侧栏行悬停时出现的省略号 / 置顶 / 归档图标。",
        'look.hint.base': "主对话区的底色——所有消息所在的那一整片。",
        'look.hint.card': "一级卡片：改动文件卡片、工具输出框、悬停预览、设置面板。",
        'look.hint.nested': "二级抬升面：代码查看器、注册表弹窗、设置里的开关面板。",
        'look.hint.bubble': "你自己发的消息气泡。",
        'look.hint.think': "模型思考时那段推理文字所在的块。",
        'look.hint.code': "写了语言名的高亮代码块主体（不含它上面的语言条）。",
        'look.hint.codeBanner': "代码块顶部那条：语言名（或“代码块”）加复制按钮。",
        'look.hint.inlineCode': "正文里反引号包起来的那个小胶囊（`npm test` 这种）。",
        'look.hint.toolOutput': "工具调用展开后的输出区；也会带动 turn trigger 和搜索面板。",
        'look.hint.deliverable': "我交付文件时给你看的那张文件卡片。",
        'look.hint.changesHead': "「已编辑文件」卡片的标题行。",
        'look.hint.changesRow': "那张卡片里逐个文件的行（官方原本没有底色）。",
        'look.hint.dialog': "输入卡片；输入框下方那排信息卡片也复用它。",
        'look.hint.seat': "输入框上方那条 36px 渐隐——只能调透明度，不参与配色。",
        'look.hint.menu': "账户菜单，以及上下文 / 队列 / 统计等所有浮层。",
        'look.hint.icon': "侧栏品牌标志和浏览器页签图标。",
        'look.hint.brandLead': "品牌名前半段的颜色。",
        'look.hint.brandTail': "品牌名后半段的颜色。",
        'look.target.icon': '图标',
        'look.target.rowIcon': '侧栏行图标',
        'look.target.deliverable': '交付文件卡片',
        'look.target.sidebarShadow': '侧栏阴影',
        'look.target.changesHead': '已编辑文件（头行）',
        'look.target.changesRow': '已编辑文件（文件行）',
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
    // 定稿主题：这些值原本只存在浏览器 localStorage['dsh.skin.look'] 里，
    // 现在写进代码，清缓存 / 换机器 / 重装都回到这一套。
    const LOOK_DEFAULT = {
      lead: 'ygelon',
      tail: 'Harness',
      slogan: 'All For Humans',
      icon: ICON_PATH,
      seed: 'oklch(0.99 0 0)',
      surfaces: { card: 'oklch(0.9931 0 0)' },
      alphas: { base: 0, seat: 0, sidebar: 0, groupCard: 0, dialog: 100, card: 6 },
      paint: {},
      follow: false,
    };

    // 直接着色的目标：不走 token，直接写进组件的颜色。
    const PAINT_TARGETS = [
      { id: 'icon', storeKey: 'iconColor', fallback: 'currentColor' },
      // 侧栏行悬停出来的动作图标（省略号 / 置顶 / 归档）：官方组件改不了属性，
      // 走 --ys-row-icon 变量 + CSS 规则染色。
      { id: 'rowIcon', storeKey: 'rowIconColor', fallback: 'var(--dsw-alias-label-tertiary)' },
      // 「已编辑文件」卡片：头那行和下面的文件行走组件内部变量（组件自己声明，
      // 祖先覆盖不到），只能落成 --ys-* 变量 + 带开关的 CSS 规则。
      // 代码块语言条实际是 banner 外层用 bg-base、内层 [data-code-block-banner] 自身没背景，
      // 覆盖 banner token 根本没被渲染路径读取，只能直接给那个元素上背景。
      // 对话里交付的文件卡片（[data-presented-file]）：底色来自组件在 .root 上声明的
      // --deliverable-fill，同样祖先覆盖不到，直接给元素上背景。
      { id: 'deliverable', storeKey: 'deliverableColor', fallback: 'var(--dsw-static-neutral-50)', alpha: true },
      // 包边与阴影：几何形状写死在规则里，这里只调颜色+浓度。
      { id: 'sidebarShadow', storeKey: 'sidebarShadowColor', fallback: 'rgba(0,0,0,.12)', alpha: true },
      { id: 'brandLead', storeKey: 'leadColor', fallback: 'var(--dsw-alias-label-primary)' },
      { id: 'brandTail', storeKey: 'tailColor', fallback: 'var(--dsw-alias-label-secondary)' },
    ];

    // 可改背景的表面：加一个新区域 = 往这张表加一行，外观页自动多一个目标。
    // pane: 官方把透明度硬编码在 hash 类名规则里，只能整条重写（见 PANE_RULES）；
    // fallback: 官方浅/深两色，用户只调透明度不选色时当底色。
    // fallback 一律写**纯色**，浓度交给透明度滑条：滑条 0–100 就是 0–100%，
    // 拖满是实色。这几项原来的“出厂浓度”放在 ALPHA_DEFAULT 里当滑条默认值。
    const ALPHA_DEFAULT = { sidebar: 40, groupCard: 5, groupEdge: 22 };
    const LABEL_PRIMARY = 'var(--dsw-alias-label-primary)';

    const SURFACES = [
      { id: 'sidebar', tokens: ['--dsw-specific-sidebar-fill'], pane: true, fallback: { light: '#f9fafb', dark: '#1b1b1c' } },
      { id: 'base', tokens: ['--dsw-alias-bg-base'], pane: true, fallback: { light: '#ffffff', dark: '#151517' } },
      { id: 'card', tokens: ['--dsw-alias-bg-layer-1'], fallback: { light: '#ffffff', dark: '#232324' } },
      { id: 'nested', tokens: ['--dsw-alias-bg-layer-2'], fallback: { light: '#ffffff', dark: '#2c2c2e' } },
      { id: 'dialog', tokens: ['--dsw-specific-input-major'], fallback: { light: '#ffffff', dark: '#2c2c2e' } },
      // 气泡默认就带透明度（alphaDefault），不是“用户拖过才生效”：官方给的是实色，
      // 这里按 60% 下发，玻璃感跟侧栏一致。
      // 对话区里的 Markdown 块：代码块（含顶部语言条，一起走才不割裂）和行内 code。
      // 它们跟「卡片」用的 bg-layer-1 是两套 token，所以之前调卡片对代码块无效。
      // 代码块主体：走 Shiki 自己的 --shiki-background（它默认指向 code-block），
      // 这样就不会顺带改到工具输出块——那个另开一项。
      {
        id: 'toolOutput',
        tokens: ['--dsw-alias-markdown-code-block'],
        follow: true,
        fallback: {
          light: 'var(--dsw-static-neutral-bluish-50)',
          dark: 'var(--dsw-static-neutral-bluish-900)',
        },
      },
      // 弹层底色有两层名字，必须一起写：
      //   --dsw-menu-surface-fill  → 公共菜单走 MenuSurface（账户菜单就是这个，官方 README 明确
      //                              要求平台代码保留这组 token 值）
      //   --dsw-specific-menu      → 它的别名，队列 / 上下文 / 统计等老面板在用
      // 只覆盖别名时账户菜单纹丝不动，这就是“调了没反应”的原因。
      {
        id: 'menu',
        tokens: ['--dsw-menu-surface-fill', '--dsw-specific-menu'],
        fallback: { light: '#f8f9fa94', dark: '#43454a73' },
      },
      // sidebar-marks 画的工作区组卡片：那两个变量由它在 body 上声明，
      // 这里用同一套机制覆盖（内联压过它的样式表规则），透明度照样折进值里。
      { id: 'groupCard', tokens: ['--sm-frame-fill'], fallback: { light: LABEL_PRIMARY, dark: LABEL_PRIMARY } },
      { id: 'groupEdge', tokens: ['--sm-frame'], fallback: { light: LABEL_PRIMARY, dark: LABEL_PRIMARY } },
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
        return {
          lead: sanitizeText(stored?.lead, LOOK_DEFAULT.lead),
          tail: sanitizeText(stored?.tail, LOOK_DEFAULT.tail),
          slogan: sanitizeText(stored?.slogan, LOOK_DEFAULT.slogan),
          icon: sanitizePath(stored?.icon),
          seed,
          surfaces,
          alphas,
          paint,
          follow: stored?.follow === true,
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
        alpha: paint.alpha === true,
      })));

    // 外观页的胶囊按界面分区排，顺序就是这里；加目标时在 GROUP_OF 里归一次类。
    const TARGET_GROUPS = [
      { id: 'seed', labelKey: 'look.group.seed' },
      { id: 'sidebar', labelKey: 'look.group.sidebar' },
      { id: 'chat', labelKey: 'look.group.chat' },
      { id: 'input', labelKey: 'look.group.input' },
      { id: 'overlay', labelKey: 'look.group.overlay' },
      { id: 'brand', labelKey: 'look.group.brand' },
    ];

    // 组内顺序：TARGETS 是按「token 面 + paint 面」拼的，跨类别时顺序会跳，
    // 这里显式排一遍，保证相邻的东西（比如代码块主体/语言条）挨在一起。
    const TARGET_ORDER = [
      'seed',
      'sidebar', 'sidebarShadow', 'groupCard', 'groupEdge', 'rowIcon',
      'base', 'card', 'nested', 'bubble', 'think',
      'toolOutput', 'deliverable',
      'dialog', 'seat',
      'menu',
      'icon', 'brandLead', 'brandTail',
    ];

    const GROUP_OF = {
      seed: 'seed',
      sidebar: 'sidebar', sidebarShadow: 'sidebar',
      groupCard: 'sidebar', groupEdge: 'sidebar', rowIcon: 'sidebar',
      base: 'chat', card: 'chat', nested: 'chat', bubble: 'chat',
      toolOutput: 'chat',
      deliverable: 'chat',
      dialog: 'input', seat: 'input',
      menu: 'overlay',
      icon: 'brand', brandLead: 'brand', brandTail: 'brand',
    };

    function targetById(id) {
      return TARGETS.find((item) => item.id === id) ?? TARGETS[0];
    }

    /** 三类目标各自的取色 / 写色 / 判定是否已覆盖。 */
    function readTargetColor(id) {
      const def = targetById(id);
      if (def.kind === 'seed') return look.seed;
      if (def.kind === 'paint') return look.paint[def.storeKey];
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
      return setSurfaceColor(id, value);
    }

    /** 工作区色带已下线：只清掉老版本自己打在行上的那层内联色带，
     * 按 data-ys-group 认领，绝不碰官方自己的 box-shadow。 */
    function clearGroupTints() {
      if (typeof document === 'undefined') return;
      for (const row of document.querySelectorAll('[data-row-key^="workspace:"][data-ys-group]')) {
        row.removeAttribute('data-ys-group');
        row.style.removeProperty('box-shadow');
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
      // 留 4% 余量：贴着色域边界时某个通道会被夹到 0/1，色相就会偏（黄变橙、橙变红）。
      return low * 0.96;
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
html[data-ys-sidebar][data-platform=darwin] [class*="sidebarCol"][class*="sidebarCol"][class*="sidebarCol"]{background:color-mix(in srgb,var(--dsw-specific-sidebar-fill) var(--ys-sidebar-alpha,40%),transparent)}
html[data-ys-sidebar][data-platform=darwin] body[data-ds-dark-theme] [class*="sidebarCol"][class*="sidebarCol"][class*="sidebarCol"]{background:color-mix(in srgb,var(--dsw-specific-sidebar-fill) var(--ys-sidebar-alpha,50%),transparent)}
html[data-ys-chat][data-platform=darwin] [class*="centerCol"][class*="centerCol"][class*="centerCol"]{background:color-mix(in srgb,var(--dsw-alias-bg-base) var(--ys-chat-alpha,100%),transparent)}
html[data-ys-chat][data-platform=darwin] [data-ys-chat-main][data-ys-chat-main][data-ys-chat-main]{background:color-mix(in srgb,var(--dsw-alias-bg-base) var(--ys-chat-alpha,100%),transparent)}
/* 输入框上方那块“渐隐”是 composerSeat 自带的 36px 渐变（透明 → 不透明 bg-base），
   它不是纯色背景层，所以对话区的透明度规则管不到它，要单写一条；它有自己的
   透明度变量 --ys-seat-alpha（外观页「输入框上渐隐」那一项）。只有
   [data-phase=active] 的会话页才有这层，空会话时官方本来就没有背景，别硬加。 */
html[data-ys-seat][data-platform=darwin] [data-phase=active] [class*="composerSeat"],
html[data-ys-seat][data-platform=darwin] [data-content-phase=active] [class*="composerSeat"]{background:linear-gradient(180deg,color-mix(in srgb,var(--dsw-alias-bg-base) 0%,transparent) 0px,color-mix(in srgb,var(--dsw-alias-bg-base) var(--ys-seat-alpha,100%),transparent) 36px)}
`;

    // 输入框那排信息（插件 pill、上下文条）不再做成独立小卡片，而是**并进输入框**：
    // 与输入卡片同宽、同底色、左右下三边同一条发丝描边、只留底部两个大圆角，
    // 并把输入卡片的下圆角收平 —— 两截拼起来就是“一个整的圆角框，下半部分装这排信息”。
    // 挪到上方只需改回 order:-1 并把圆角/描边翻面。
    // 颜色和透明度直接吃 --dsw-specific-input-major，也就是外观页「输入框」那一项
    // （ui-layout 会把覆盖写成 body 内联变量），所以调输入框就一起变，不需要另开一项。
    // 用户要的统一底色：20% 透明白（深色主题下是提亮，浅色主题下几乎透明）。
    const GLASS30 = 'color-mix(in srgb,#fff 30%,transparent)';

    const DOCK_RULES = `
/* 侧栏行悬停出来的动作图标（省略号 / 置顶 / 归档）与工作区行同款按钮。
   变量由 applyPaintVars 写到 html；没设时 var() 回退 currentColor，官方行为不变。 */
/* 「已编辑文件」卡片：头行读组件自己的 --changes-fill（在 .card 上声明，祖先覆盖不到），
   文件行本身没有底色。两个都靠开关属性 + --ys-* 变量，没设时规则完全不生效。 */
/* 卡片本体透明：不然 30% 白是叠在“卡片底色”（layer-1，浅色下就是纯白）上，
   看起来永远是纯白 —— 用户要的是能透出后面的东西。 */
[data-changed-files]{background-color:transparent!important}
[data-changed-files][data-changed-files][data-changed-files]{
  --changes-fill:${GLASS30};
  --changes-hover:${GLASS30}
}
[data-changed-files] [class*="_row"]{background:${GLASS30}}
/* 交付文件卡片：组件把 --deliverable-fill 声明在 .root 上，祖先改不动，直接给卡片上色；
   双属性是为了压过它自己的 :hover 规则。 */
html[data-ys-deliverable] [data-presented-file][data-presented-file]{background-color:var(--ys-deliverable)}
/* 包边与阴影：几何写死（inset 0 0 0 .5px 画发丝边、0 6px 18px 外阴影），
   颜色/浓度由 --ys-* 变量给；颜色缺省时那一层是 transparent，等于不画。 */
html[data-ys-sidebar-shadow] [class*="sidebarCol"]{box-shadow:var(--ys-sidebar-shadow)}
/* 输入框卡片与用户消息气泡的包边/阴影，直接跟「工作区卡片」那一套共用变量：
   0 0 14px 匀影 + inset 1px 发丝描边 + 顶部 1px 白高光。没装 sidebar-marks 时
   用等价 fallback，观感一致。html 前缀是为了压过官方同名类规则。 */
html [class*="_bubble"]{
  background-color:rgba(255,255,255,.65);
  box-shadow:
    var(--sm-frame-lift,inset 0 1px 0 rgba(255,255,255,.22)),
    var(--sm-frame-shadow,0 0 14px rgba(0,0,0,.10)),
    inset 0 0 0 1px var(--sm-frame,color-mix(in srgb,var(--dsw-alias-label-primary) 22%,transparent))
}
html [class*="composerSeat"] [class*="_card"]{
  box-shadow:
    var(--sm-frame-lift,inset 0 1px 0 rgba(255,255,255,.22)),
    var(--sm-frame-shadow,0 0 14px rgba(0,0,0,.10)),
    inset 0 0 0 1px var(--sm-frame,color-mix(in srgb,var(--dsw-alias-label-primary) 22%,transparent))
}
/* 发送按钮：官方是按钮填充色 + 固定白字，主色调白就是白底白字。这里把文字固定成黑色。 */
/* 输入区内部的品牌色改成主题文字色：模型名、时段标签这类原本是蓝色的东西，
   主色白时会一起变白。标签因此变成“很淡的文字色底 + 文字色文字”。 */
html [class*="composerSeat"]{--dsw-alias-state-business-primary:var(--dsw-alias-label-primary)}
/* 提示文字用次级文字色（官方的 caption 在 30% 白底上太淡，读不出来）。 */
html [class*="composerSeat"] [class*="placeholder"]{color:var(--dsw-alias-label-secondary)}
html [class*="composerSeat"] button[class*="_primary"]{
  background-color:#fff;color:#000;box-shadow:inset 0 0 0 1.5px #000
}
/* 行内代码小胶囊：默认也是 20% 白。 */
html [class*="_markdown"] :not(pre)>code{background-color:${GLASS30}}
/* 思考过程的内容块：官方只给了 padding，没有自己的底色。 */
[class*="thinkBody"]{background-color:transparent}
/* 思考块：用官方写在根上的 data-variant="think" 命中整体（折叠时也成立），
   头（DisclosureRow）和内容区共用这一层 30% 白 + 圆角。 */
[data-variant="think"]{background-color:${GLASS30};border-radius:12px;overflow:hidden}
/* 工具调用行（运行命令、读文件、搜索…）：官方把 data-tool + data-state 写在根上，
   和思考块同一套：整块 30% 白 + 圆角，内部输出区不再单独上色。 */
/* 工具行照抄「已编辑文件」那张卡片的层次：本体透明 + 发丝描边，
   头（DisclosureRow）和身（输出区）各自 30% 白，所以透出来的观感一致。 */
[data-tool][data-state]{
  background-color:transparent!important;
  border:.5px solid var(--dsw-alias-border-l2);
  border-radius:12px;overflow:hidden
}
/* 先把内部所有底色清掉，整行只剩文字 —— 用来验证锚点是否命中。 */
[data-tool][data-state] *{background-color:transparent!important}
/* Desktop 聊天里的“执行命令”是 web 前端自己的命令块（不是 ui-tool 的 data-tool），
   类名带构建期 hash：block/header/output = _xxx_8z71b_NN。整块 30% 白 + 圆角，
   内部行透明。hash 会随官方升级变，届时按新 hash 替换即可。 */
[class*="_block_8z71b"]{background-color:${GLASS30};border-radius:12px;overflow:hidden}
[class*="_header_8z71b"],
[class*="_output_8z71b"]{background-color:transparent!important}
/* 侧栏里的图标按钮（含工作区行右侧的“+ 新会话”、省略号）：30% 白底 + 圆角。 */
[class*="sidebarCol"] [class*="_iconButton"]{
  background-color:rgba(255,255,255,.3);border-radius:8px
}
/* 输入框光标：官方写的是 caret-color: var(--dsw-alias-state-business-primary)，
   主色一旦调成白色/极浅色，光标就跟背景同色、直接看不见。这里固定成文字色。 */
html [class*="composerSeat"] [contenteditable="true"]{caret-color:var(--dsw-alias-label-primary)}
/* 代码块主体：有语言名时是 Shiki 的内联 style（var(--shiki-background)）；
   没语言名时渲染的是 <pre class="..._plain">，没有任何背景，露出的是容器上的 bg-base ——
   所以调「代码块（主体）」对它无效。这里用 md-code-block 这个稳定类名兜住 pre 和容器本身，
   现在固定为 30% 白（不再读用户变量）。 */
[class*="md-code-block"],
[class*="md-code-block"] pre{background-color:${GLASS30}!important}
/* 代码块语言条：真实结构是 bannerWrap（background-color: var(--dsw-alias-bg-base)）> 内层
   [data-code-block-banner]（自己常常没有背景）。只给内层上色、外层强制透明：
   两层都涂成同一个半透明色会叠出更深的一层
   （1-(1-α)² 而不是 α），头行就会比内容区明显重。 */
:has(> [data-code-block-banner]){background-color:transparent}
[data-code-block-banner]{background-color:${GLASS30}}
[data-row-key] [class*="rowActions"] svg,
[data-row-key] [class*="iconButton"] svg{color:var(--ys-row-icon,currentColor)}
/* 贴合量放在容器上，输入卡片和 dock 都读得到；改这一个数即可。 */
html [class*="composerSeat"]{--ys-dock-lift:8px}
[data-composer-dock]:not(:empty){
  --ys-dock-fill:var(--dsw-specific-input-major);
  --ys-dock-radius:var(--dsw-radius-panel);
  --ys-dock-edge:var(--sm-frame,color-mix(in srgb,var(--dsw-alias-label-primary) 22%,transparent));
  --ys-dock-lift:8px;
  position:relative;box-sizing:border-box;width:100%;max-width:var(--dsh-composer-card-max-width);
  order:0;margin:calc(-1 * var(--ys-dock-lift)) auto 0;padding:0 12px 8px;
  border-radius:0 0 var(--ys-dock-radius) var(--ys-dock-radius);
  background-color:var(--ys-dock-fill);
  box-shadow:inset 1px 0 0 var(--ys-dock-edge),
    inset -1px 0 0 var(--ys-dock-edge),
    inset 0 -1px 0 var(--ys-dock-edge)
}
/* 有这排信息时，输入卡片底部两角收平，并且**去掉底边那条发丝线**：
   描边从“四边”改成“左/右/上三边”，两截才是浑然一块，中间没有横线。 */
html [class*="composerSeat"] :has(> [data-composer-dock]:not(:empty)) > [class*="_card"]{
  border-bottom-left-radius:0;border-bottom-right-radius:0;
  padding-bottom:var(--ys-dock-lift,8px);
  box-shadow:
    var(--sm-frame-lift,inset 0 1px 0 rgba(255,255,255,.22)),
    var(--sm-frame-shadow,0 0 14px rgba(0,0,0,.10)),
    inset 1px 0 0 var(--sm-frame,color-mix(in srgb,var(--dsw-alias-label-primary) 22%,transparent)),
    inset -1px 0 0 var(--sm-frame,color-mix(in srgb,var(--dsw-alias-label-primary) 22%,transparent)),
    inset 0 1px 0 var(--sm-frame,color-mix(in srgb,var(--dsw-alias-label-primary) 22%,transparent))
}
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
    const CHAT_BG = 'color-mix(in srgb,var(--dsw-alias-bg-base) VAR%,transparent)';

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
      // 先撤掉上一轮写的内联背景和标记：不撤的话，这些节点计算出来的背景是
      // 我们写的半透明渐变，不再等于 bg-base，会被自己的判断排除在外，
      // 于是来回切会话时透明度时有时无。
      for (const node of document.querySelectorAll('[data-ys-chat-main]')) {
        node.style.removeProperty('background');
        node.removeAttribute('data-ys-chat-main');
      }
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

    /**
     * 会话切换 / 冷启动都会重建主列内容，缓存的对话区背景层随之失效 —— 表现为
     * “切一次对话，透明度就掉回官方”。这里只盯两件事：主列子树有增删（rAF 合并），
     * 以及缓存节点已经脱离文档（isConnected === false）。流式输出只改文本、节点还在，
     * 所以不会触发重跑。
     */
    function watchChatLayers(onRebuild) {
      if (typeof MutationObserver !== 'function' || typeof document === 'undefined') return () => {};
      let handle = 0;
      const refresh = () => {
        const stale = chatNodesCache.length === 0 || chatNodesCache.some((node) => node.isConnected !== true);
        if (!stale) return;
        markChatMain();
        applyAlphas();
        // 切会话时官方会重写 body 上的 token 快照，我们的覆盖层随之失效（表现就是
        // “本来不透明的面突然透了，打开设置页又好了”）。这里顺手重下一遍。
        if (typeof onRebuild === 'function') onRebuild();
      };
      const schedule = () => {
        if (handle !== 0) return;
        handle = typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame(() => { handle = 0; refresh(); })
          : setTimeout(() => { handle = 0; refresh(); }, 120);
      };
      const observer = new MutationObserver((records) => {
        if (records.some((record) => record.type === 'childList')) schedule();
      });
      const center = document.querySelector('[class*="centerCol"]');
      observer.observe(center ?? document.body, { childList: true, subtree: true });
      // 冷启动时 shell 还没挂载，补一次延迟重试；之后全靠 observer，无轮询。
      const retry = typeof setTimeout === 'function' ? setTimeout(refresh, 1500) : 0;
      return () => {
        observer.disconnect();
        if (retry !== 0) clearTimeout(retry);
      };
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
    const TOKEN_STYLE_ID = STYLE_ID + '-tokens';

    /**
     * token 覆盖写进我们自己的一张样式表，并且带 `!important`。
     * 原因：官方每次切换会话都会重写 body 上的 token 快照（普通内联），而经 ui-theme 下发的覆盖层
     * 会被它顶掉——表现就是“本来不透明的面突然透了，打开设置页又好了”。
     * `!important` 的声明能压过普通内联，且深浅两套各一条规则，主题切换照样跟。
     */
    function applyTokenOverrides(overrides) {
      if (typeof document === 'undefined') return () => {};
      const existing = document.querySelector('style[data-plugin-css="' + TOKEN_STYLE_ID + '"]');
      if (Object.keys(overrides).length === 0) {
        if (existing !== null) existing.remove();
        return () => {};
      }
      const light = [];
      const dark = [];
      for (const [name, pair] of Object.entries(overrides)) {
        if (typeof pair?.light === 'string') light.push(name + ':' + pair.light + '!important');
        if (typeof pair?.dark === 'string') dark.push(name + ':' + pair.dark + '!important');
      }
      const css = (light.length === 0 ? '' : 'body{' + light.join(';') + '}\n')
        + (dark.length === 0 ? '' : 'body[data-ds-dark-theme]{' + dark.join(';') + '}');
      let tag = existing;
      if (tag === null) {
        tag = document.createElement('style');
        tag.setAttribute('data-plugin-css', TOKEN_STYLE_ID);
        document.head.appendChild(tag);
      }
      tag.textContent = css;
      return () => {
        if (tag !== null) tag.remove();
      };
    }

    /** 内容类面的默认值：follow 打开时混入 10% 品牌色，关着就是官方中性色。 */
    function fallbackFor(surface, scheme, follow) {
      const base = surface.fallback[scheme];
      if (follow !== true) return base;
      return 'color-mix(in srgb,var(--dsw-static-deepseek-400) 10%,' + base + ')';
    }

    // 与主色解耦的固定值：主色调成白色时，焦点环和链接会跟着变白、直接看不见。
    const FIXED_OVERRIDES = {
      '--dsw-focus-ring-color': { light: 'var(--dsw-alias-label-primary)', dark: 'var(--dsw-alias-label-primary)' },
      '--dsw-alias-link': { light: 'var(--dsw-alias-label-primary)', dark: 'var(--dsw-alias-label-primary)' },
    };

    function applyLook() {
      const overrides = { ...FIXED_OVERRIDES };
      const scale = deriveScale(look.seed);
      if (String(look.seed).toLowerCase() !== DEFAULT_SEED && scale !== null) {
        Object.assign(overrides, toOverrides(scale));
      }
      for (const surface of SURFACES) {
        const user = readTargetColor(surface.id);
        // pane 类的透明度由 PANE_RULES 负责（官方那条 40% 写死在规则里），
        // 其余的把透明度直接折进 token 值，官方每个地方读到的都是半透明色。
        const alpha = surface.pane === true ? null : (look.alphas[surface.id] ?? surface.alphaDefault ?? null);
        const follow = surface.follow === true && look.follow === true;
        if (user === null && alpha === null && !follow) continue;
        for (const token of surface.tokens) {
          overrides[token] = {
            light: withAlpha(user ?? fallbackFor(surface, 'light', follow), alpha),
            dark: withAlpha(user ?? fallbackFor(surface, 'dark', follow), alpha),
          };
        }
      }
      return applyTokenOverrides(overrides);
    }

    const PALETTE_CSS = `
.ys-pal{font-size:13px;line-height:20px;padding:4px 0}
.ys-pal h3{margin:0 0 4px;font-size:15px;font-weight:600}
.ys-pal-ver{margin-left:7px;color:var(--dsw-alias-label-tertiary);font-size:10px;font-weight:400;letter-spacing:.04em}
.ys-pal h4{margin:18px 0 8px;font-size:13px;font-weight:600}
.ys-pal-desc{margin:0 0 12px;color:var(--dsw-alias-label-secondary)}
.ys-pal-section{margin:0 0 6px;color:var(--dsw-alias-label-tertiary);font-size:11px}
.ys-pal-toggle{display:inline-flex;align-items:center;gap:7px;margin:0 0 12px;color:var(--dsw-alias-label-secondary);font-size:12px;cursor:pointer}
.ys-pal-toggle input{margin:0;accent-color:var(--dsw-alias-state-business-primary)}
.ys-pal-groups{display:flex;flex-direction:column;gap:10px;margin-bottom:12px}
.ys-pal-group .ys-pal-section{margin:0 0 6px}
.ys-pal-targets{display:flex;flex-direction:column;gap:1px;margin-bottom:12px}
.ys-pal-group .ys-pal-targets{margin-bottom:0}
.ys-pal-target{display:flex;align-items:baseline;gap:8px;width:100%;padding:5px 7px;border:0;border-radius:7px;background:0 0;color:var(--dsw-alias-label-secondary);font-size:12px;text-align:left;cursor:pointer}
.ys-pal-target:hover{background:var(--dsw-alias-interactive-bg-hover)}
.ys-pal-target[data-active=true]{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);color:var(--dsw-alias-label-primary)}
.ys-pal-target i{flex:none;align-self:center;display:block;width:11px;height:11px;border-radius:3px;border:1px solid var(--dsw-alias-border-l3)}
.ys-pal-targetName{flex:none;min-width:108px;white-space:nowrap}
.ys-pal-targetHint{flex:1;min-width:0;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.ys-pal-editor{margin:2px 0 8px;padding:8px 9px 10px;border-radius:9px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 4%,transparent)}
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
.ys-pal-gray{position:relative;height:14px;border-radius:8px;cursor:crosshair;touch-action:none;border:1px solid var(--dsw-alias-border-l3);margin-bottom:14px;background-image:linear-gradient(to right,#fff,#000)}
.ys-pal-gray-mark{position:absolute;top:-3px;width:11px;height:18px;margin-left:-5.5px;border-radius:4px;background:#fff;box-shadow:0 0 0 1px rgb(0 0 0 / 45%);pointer-events:none}
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
    // 下端给到 0.02：这样把浓度带拖到最左（彩度 0）时，纵轴底就是纯黑，能选出黑/灰/白的完整灰阶。
    const PLANE_L_BOTTOM = 0.02;

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

      // 灰阶条：横向就是 白 → 黑，点哪都是无彩色（C=0），不受色相影响。
      const pickGray = (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (rect.width === 0) return;
        const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        pick(oklchStr(1 - x, 0, current.H));
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
        clearGroupTints();
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
      }, [target]);

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
      }, [satRatio, width, target]);

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
      const alphaKey = targetDef.kind === 'token' || (targetDef.kind === 'paint' && targetDef.alpha === true)
        ? target
        : null;
      const alphaOnly = targetDef.alphaOnly === true;
      const alphaDefault = alphaKey === null ? 100 : (ALPHA_DEFAULT[alphaKey] ?? 100);
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
        h('div', { className: 'ys-pal-gray', ...drag(pickGray) },
          h('span', {
            className: 'ys-pal-gray-mark',
            style: { left: (1 - clamp(current.L, 0, 1)) * 100 + '%', background: hex },
          }),
        ),
      );

      // 每个目标自己的展开区：色域图 + 色值 + 浓度 + 透明度 + 恢复这一项（+ 主色的派生色阶）。
      const editor = h('div', { className: 'ys-pal-editor' },
        alphaOnly ? null : colorBlocks,
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
              const def = targetById(target);
              if (def.kind === 'paint') delete paint[def.storeKey];
              delete surfaces[target];
              delete alphas[target];
              setLook({ surfaces, alphas, paint });
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

      );

      const targets = TARGETS.map((item) => ({
        id: item.id,
        label: t(item.labelKey),
        color: targetEditingColor(item.id),
      }));

      return h('div', { className: 'ys-pal' },
        h('h3', null, t('look.title'), h('span', { className: 'ys-pal-ver' }, 'r4')),
        h('p', { className: 'ys-pal-desc' }, t('look.desc')),
        h('label', { className: 'ys-pal-toggle' },
          h('input', {
            type: 'checkbox',
            checked: state.follow === true,
            onChange: (event) => setLook({ follow: event.target.checked }),
          }),
          h('span', null, t('look.follow')),
        ),

        h('div', { className: 'ys-pal-groups' }, TARGET_GROUPS.map((group) => {
          const items = targets
            .filter((item) => (GROUP_OF[item.id] ?? 'chat') === group.id)
            .sort((a, b) => TARGET_ORDER.indexOf(a.id) - TARGET_ORDER.indexOf(b.id));
          if (items.length === 0) return null;
          return h('div', { key: group.id, className: 'ys-pal-group' },
            h('p', { className: 'ys-pal-section' }, t(group.labelKey)),
            h('div', { className: 'ys-pal-targets' }, items.map((item) => h(React.Fragment, { key: item.id },
              h('button', {
                type: 'button',
                className: 'ys-pal-target',
                'data-active': item.id === target ? 'true' : 'false',
                onClick: () => setTarget(item.id === target ? null : item.id),
              },
                h('i', { style: { background: colorHex(item.color) } }),
                h('span', { className: 'ys-pal-targetName' }, item.label),
                h('span', { className: 'ys-pal-targetHint' }, t('look.hint.' + item.id)),
              ),
              item.id === target ? editor : null,
            ))));
        })),

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
        /** paint 类里需要落到 DOM 上的那些（官方组件改不了属性）：目前只有侧栏行图标。 */
        const applyPaintVars = () => {
          if (typeof document === 'undefined' || !document.documentElement) return;
          const root = document.documentElement;
          const setVar = (name, flag, value) => {
            if (typeof value === 'string' && value !== '') {
              root.style.setProperty(name, value);
              root.setAttribute(flag, '');
            } else {
              root.style.removeProperty(name);
              root.removeAttribute(flag);
            }
          };
          /** paint 目标的颜色校验 + 把透明度折进值里（这两项在 UI 上带透明度滑条）。 */
          const tinted = (id, storeKey) => {
            const color = look.paint[storeKey];
            if (typeof color !== 'string' || parseColor(color) === null) return null;
            const alpha = look.alphas[id];
            return typeof alpha === 'number' && alpha < 100
              ? `color-mix(in srgb, ${color} ${alpha}%, transparent)`
              : color;
          };
          const plain = (storeKey) => {
            const color = look.paint[storeKey];
            return typeof color === 'string' && parseColor(color) !== null ? color : null;
          };
          setVar('--ys-row-icon', 'data-ys-row-icon', plain('rowIconColor'));
          setVar('--ys-deliverable', 'data-ys-deliverable', tinted('deliverable', 'deliverableColor'));
          /** 一组变量共用一个开关：任一有值才开。 */
          const setGroup = (flag, entries) => {
            let any = false;
            for (const entry of entries) {
              const value = tinted(entry[1], entry[2]);
              if (value !== null) {
                root.style.setProperty(entry[0], value);
                any = true;
              } else {
                root.style.removeProperty(entry[0]);
              }
            }
            if (any) root.setAttribute(flag, '');
            else root.removeAttribute(flag);
          };
          setGroup('data-ys-sidebar-shadow', [['--ys-sidebar-shadow', 'sidebarShadow', 'sidebarShadowColor']]);
        };

        /** 只对"需要按需接管"的面加开关属性，没设值时规则完全不生效。 */
        const applySurfaceFlags = () => {
          if (typeof document === 'undefined' || !document.documentElement) return;
          const root = document.documentElement;
          const toggle = (id, flag) => {
            const touched = typeof look.surfaces[id] === 'string' || typeof look.alphas[id] === 'number';
            if (touched) root.setAttribute(flag, '');
            else root.removeAttribute(flag);
          };
        };

        /** 只重建 token 覆盖 + 自有变量，不动标题/favicon/标语。 */
        const reapplyTheme = () => {
          if (disposeLook !== null) {
            try { disposeLook(); } catch { /* layer already replaced */ }
            disposeLook = null;
          }
          disposeLook = applyLook();
          applySurfaceFlags();
          applyPaintVars();
        };

        const applyNow = () => {
          if (disposeLook !== null) {
            try { disposeLook(); } catch { /* layer already replaced */ }
            disposeLook = null;
          }
          disposeLook = applyLook();
          applySurfaceFlags();
          applyPaintVars();
          applyAlphas();
          clearGroupTints();
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

        // 会话切换后重新定位对话区背景层，否则透明度只活到第一次切会话。
        ctx.effect(() => watchChatLayers(reapplyTheme));

        // theme 由 ui-theme 提供：色阶覆盖走官方快照，ui-layout 会把它
        // 写成 body 的内联变量，优先级压过内置样式表。
        // 覆盖层已经不走 ui-theme（自写带 !important 的样式表），所以这里不再等 theme 服务：
        // 注入回调没跑过就会“一切都没应用”，切会话也没人补。
        lookListeners.add(applyNow);
        ctx.effect(() => () => {
          lookListeners.delete(applyNow);
          if (disposeLook !== null) {
            try { disposeLook(); } catch { /* already gone */ }
            disposeLook = null;
          }
        });
        applyNow();

        // 外观调节页已下线：用户已经定稿成一套主题，不需要再在设置里调。
        // （AppearanceTab 组件保留在文件里，将来要恢复只需把这段注册加回来。）

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
