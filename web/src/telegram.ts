// The Telegram Mini App bridge (telegram-web-app.js, loaded in index.html). Outside Telegram it still loads,
// but initData is empty and everything here is a no-op. Checked against the Telegram Mini Apps docs (2026-10-31):
// BackButton is Bot API 6.1+; safe areas (--tg-safe-area-inset-*, --tg-content-safe-area-inset-*) are 8.0+ and
// set as CSS variables by the script itself. initData is sent to the API as-is and verified there;
// initDataUnsafe is for display only (the photo, SECURITY §3.1).

type BackButton = {
  show: () => void;
  hide: () => void;
  onClick: (callback: () => void) => void;
  offClick: (callback: () => void) => void;
};

type WebApp = {
  initData: string;
  initDataUnsafe: { user?: { first_name?: string; username?: string; photo_url?: string } };
  ready: () => void;
  expand: () => void;
  isVersionAtLeast?: (version: string) => boolean;
  BackButton?: BackButton;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: WebApp };
  }
}

/** The WebApp object, only when actually running inside Telegram. */
const miniApp = (): WebApp | undefined => {
  const app = window.Telegram?.WebApp;
  return app?.initData ? app : undefined;
};

/** The raw initData when running as a Mini App, else null (a normal browser). */
export function telegramInitData(): string | null {
  return miniApp()?.initData ?? null;
}

export const isMiniApp = () => miniApp() !== undefined;

/** Tell Telegram the app is ready and use the full height. No-op in a normal browser. */
export function initTelegram() {
  const app = miniApp();
  if (!app) return;
  app.ready();
  app.expand();
}

/** The user's Telegram photo (display only), if Telegram shares it. https only. */
export function telegramPhotoUrl(): string | null {
  const url = miniApp()?.initDataUnsafe.user?.photo_url;
  return url?.startsWith('https://') ? url : null;
}

// --- BackButton -------------------------------------------------------------------------------------------
// One handler stack for the whole app: the newest registration (e.g. an open dialog) gets the press; the
// button is visible while anything is registered.

const backHandlers: (() => void)[] = [];
const onBackPressed = () => backHandlers.at(-1)?.();

function backButton(): BackButton | undefined {
  const app = miniApp();
  if (!app?.BackButton || !(app.isVersionAtLeast?.('6.1') ?? false)) return undefined;
  return app.BackButton;
}

/** While registered, Telegram's back button calls `handler`. Returns the unregister function. */
export function pushTelegramBack(handler: () => void): () => void {
  const button = backButton();
  if (!button) return () => undefined;
  backHandlers.push(handler);
  if (backHandlers.length === 1) {
    button.onClick(onBackPressed);
    button.show();
  }
  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;
    backHandlers.splice(backHandlers.lastIndexOf(handler), 1);
    if (backHandlers.length === 0) {
      button.offClick(onBackPressed);
      button.hide();
    }
  };
}
