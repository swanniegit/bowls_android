import { App } from '@capacitor/app';
import { router } from './router.js';
import './css/app.css';

// Capacitor 8 — handle Android back button via router
App.addListener('backButton', ({ canGoBack }) => {
  if (canGoBack) {
    router.back();
  } else {
    App.exitApp();
  }
});

// Boot the router
router.init();
