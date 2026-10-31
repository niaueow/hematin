import { createApp } from 'vue';
import App from '@web/App.vue';
import { router } from '@web/router';
import { initTelegram } from '@web/telegram';
import { initTheme } from '@web/theme';
import '@web/styles/tokens.css';
import '@web/styles/tokens.fixes.css';
import '@web/styles/typography.css';
import '@web/styles/base.css';

initTheme();
initTelegram();
createApp(App).use(router).mount('#app');
