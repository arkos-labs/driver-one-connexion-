import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerPushNotifications } from './lib/pushNotifications'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Prevent horizontal swipe gestures for navigation (back/forward)
const preventSwipeBack = () => {
  let startX = 0;
  let startY = 0;

  document.addEventListener('touchstart', (e) => {
    startX = e.touches[0].pageX;
    startY = e.touches[0].pageY;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    const deltaX = touch.pageX - startX;
    const deltaY = touch.pageY - startY;

    // If movement is starting near the edges (50px) and is primarily horizontal
    // we block the event to prevent the browser from interpreting it as a back/forward gesture.
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if (startX < 50 || startX > window.innerWidth - 50) {
        if (e.cancelable) e.preventDefault();
      }
    }
  }, { passive: false });

  // Safety: Lock history to prevent back button/gesture from working easily
  window.history.pushState(null, null, window.location.href);
  window.addEventListener('popstate', () => {
    window.history.pushState(null, null, window.location.href);
  });
};

preventSwipeBack();

// Register Push Notifications & Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      // Use the sw.js from dist if it exists, otherwise use the source one (Vite PWA handles this)
      const swUrl = import.meta.env.PROD ? '/sw.js' : '/dev-sw.js?dev-sw';
      // Actually, with Vite PWA in 'injectManifest' mode, we might need a different approach.
      // But for now, let's just trigger our custom registration.
      await registerPushNotifications();
    } catch (err) {
      console.error('SW registration failed:', err);
    }
  });
}
