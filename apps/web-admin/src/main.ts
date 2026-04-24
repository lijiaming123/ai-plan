import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import '@ai-plan/ui-theme/theme.css';
import '@ai-plan/ui-theme/atoms.css';
import './styles/ui.css';
import './styles/auth-branded.css';

createApp(App).use(router).mount('#app');
