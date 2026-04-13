import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import './styles/tailwind.css';
import './styles/ui-sunrise-select.css';
import './styles/ui-scrollbar.css';
import './styles/user-menu-dropdown.css';

createApp(App).use(router).mount('#app');
