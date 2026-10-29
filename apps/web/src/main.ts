import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './assets/styles/index.scss';

createApp(App).use(createPinia()).mount('#app');
