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

    const BRAND_TITLE = 'ygelon Harness';
    const TITLE_SEPARATOR = ' — ';

    // 浏览器标题和 favicon 只能运行时改；窗口标题栏、Dock 图标在 .app 里，改不了。
    const FAVICON = 'data:image/svg+xml,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">`
      + `<path d="${ICON_PATH}" stroke="#4176E6" stroke-width="4" stroke-linecap="square" stroke-linejoin="miter"/>`
      + `</svg>`,
    );

    const Mark = React.forwardRef(function Mark({ size = 24 }, ref) {
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
          d: ICON_PATH,
          stroke: 'currentColor',
          strokeWidth: 4,
          strokeLinecap: 'square',
          strokeLinejoin: 'miter',
        }),
      );
    });

    function Name() {
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
          },
        }, 'ygelon'),
        // Harness 和 ygelon 同一套字号/字距，字重更细，颜色是次要色。
        h('span', {
          style: {
            ...FONT,
            fontSize: '20px',
            fontWeight: 400,
            lineHeight: '24px',
            letterSpacing: '0.01em',
            color: 'var(--dsw-alias-label-secondary)',
          },
        }, 'Harness'),
      );
    }

    // 空会话标语是 conversation 包的语言字典；同一 namespace 不能再注册，
    // 所以只能在 DOM 里接管。主路径是结构锚定（见 HeroMark），
    // 这里保留一份按已知文案替换的兜底。
    const SLOGANS = ['探索未至之境', 'Into the Unknown'];
    const SLOGAN = 'All For Humans';

    function rewriteSlogan(root) {
      if (root === null || root === undefined) return;
      if (root.nodeType === 3) {
        const text = root.data;
        if (!SLOGANS.some((s) => text.includes(s))) return;
        let next = text;
        for (const s of SLOGANS) next = next.split(s).join(SLOGAN);
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
      const current = document.title;
      const at = current.lastIndexOf(TITLE_SEPARATOR);
      const next = at === -1
        ? BRAND_TITLE
        : `${current.slice(0, at + TITLE_SEPARATOR.length)}${BRAND_TITLE}`;
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
        for (const link of links) link.setAttribute('href', FAVICON);
        return () => {
          links.forEach((link, i) => {
            if (previous[i] === null) link.removeAttribute('href');
            else link.setAttribute('href', previous[i]);
          });
        };
      });
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
            if (node.data !== SLOGAN) node.data = SLOGAN;
            return;
          }
          if (target.textContent !== SLOGAN) target.textContent = SLOGAN;
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

    return {
      inject: ['slots'],
      apply(ctx) {
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
      },
    };
  },
});
