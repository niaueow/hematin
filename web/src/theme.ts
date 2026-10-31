// Light/dark (DESIGN.md §1): <html data-semantic-mode="light|dark">. For now it follows the device setting
// (prefers-color-scheme) and updates live when that changes.

export function initTheme(root: HTMLElement = document.documentElement) {
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    root.dataset.semanticMode = query.matches ? 'dark' : 'light';
  };
  apply();
  query.addEventListener('change', apply);
}
