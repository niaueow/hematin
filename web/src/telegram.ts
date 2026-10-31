// The Telegram Mini App bridge (telegram-web-app.js, loaded in index.html). Outside Telegram it still loads,
// but initData is empty. initData is sent to the API as-is and verified there; initDataUnsafe is for display
// only and never trusted (SECURITY §3.1).

type WebApp = {
  initData: string;
  initDataUnsafe: { user?: { first_name?: string } };
  ready: () => void;
  expand: () => void;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: WebApp };
  }
}

const webApp = (): WebApp | undefined => window.Telegram?.WebApp;

/** The raw initData when running as a Mini App, else null (a normal browser). */
export function telegramInitData(): string | null {
  const data = webApp()?.initData;
  return data ? data : null;
}

export const isMiniApp = () => telegramInitData() !== null;

/** Tell Telegram the app is ready and use the full height. No-op in a normal browser. */
export function initTelegram() {
  const app = webApp();
  if (!app?.initData) return;
  app.ready();
  app.expand();
}
