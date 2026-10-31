import { createApp } from 'vue';
import App from '@web/App.vue';
import { router } from '@web/router';
import { initTelegram } from '@web/telegram';
import '@web/styles/tokens.css';
import '@web/styles/tokens.fixes.css';

initTelegram();
createApp(App).use(router).mount('#app');
