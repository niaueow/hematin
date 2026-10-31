// Light/dark (DESIGN.md §1): <html data-semantic-mode="light|dark">.
// The Figma export has light-mode semantics only (DESIGN §1 "As built"). Switching to dark without dark tokens
// gave a mixed page: native controls (the date picker) and the danger hover went dark while the page stayed
// light. So until a dark export is generated, the app stays light. Set DARK_MODE_READY to true when the
// [data-semantic-mode='dark'] token block exists, and it follows the device setting again.

export const DARK_MODE_READY = false;

export function initTheme(root: HTMLElement = document.documentElement, darkReady: boolean = DARK_MODE_READY) {
  if (!darkReady) {
    root.dataset.semanticMode = 'light';
    return;
  }
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    root.dataset.semanticMode = query.matches ? 'dark' : 'light';
  };
  apply();
  query.addEventListener('change', apply);
}
