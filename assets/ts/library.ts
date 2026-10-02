const root = document.documentElement;
const themeButton = document.querySelector<HTMLButtonElement>('.theme-toggle');
const systemScheme = window.matchMedia('(prefers-color-scheme: dark)');
const key = 'StackColorScheme';
let preference = 'light';
try { preference = localStorage.getItem(key) || 'light'; } catch (_) {}

function updateThemeButton() {
    const dark = root.dataset.scheme === 'dark';
    const label = dark ? '切换到浅色模式' : '切换到暗色模式';
    themeButton?.setAttribute('aria-label', label);
    themeButton?.setAttribute('title', label);
    themeButton?.setAttribute('aria-pressed', String(dark));
}

themeButton?.addEventListener('click', () => {
    preference = root.dataset.scheme === 'dark' ? 'light' : 'dark';
    root.dataset.scheme = preference;
    try { localStorage.setItem(key, preference); } catch (_) {}
    updateThemeButton();
});
systemScheme.addEventListener('change', (event) => {
    if (preference === 'auto') {
        root.dataset.scheme = event.matches ? 'dark' : 'light';
        updateThemeButton();
    }
});
updateThemeButton();

const navButton = document.querySelector<HTMLButtonElement>('.nav-toggle');
const nav = document.querySelector<HTMLElement>('.library-nav');
const mobileQuery = window.matchMedia('(max-width: 700px)');

function setNavigation(open: boolean) {
    navButton?.setAttribute('aria-expanded', String(open));
    navButton?.setAttribute('aria-label', open ? '收起导航' : '展开导航');
    nav?.classList.toggle('is-open', open);
}

navButton?.addEventListener('click', () => {
    setNavigation(navButton.getAttribute('aria-expanded') !== 'true');
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && navButton?.getAttribute('aria-expanded') === 'true') {
        setNavigation(false);
        navButton.focus();
    }
});
mobileQuery.addEventListener('change', () => setNavigation(false));
// 导航在脚本加载后才折叠，无 JavaScript 时仍可直接访问全部栏目。
root.classList.add('has-library-js');
