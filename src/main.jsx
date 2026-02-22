import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Prevent horizontal swipe gestures for navigation (back/forward)
const preventSwipeBack = () => {
  let startX = 0;

  document.addEventListener('touchstart', (e) => {
    startX = e.touches[0].pageX;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    const changeX = touch.pageX - startX;

    // If starting near the edge (20px) and swiping horizontally
    if ((startX < 20 && changeX > 0) || (startX > window.innerWidth - 20 && changeX < 0)) {
      if (e.cancelable) {
        e.preventDefault();
      }
    }
  }, { passive: false });
};

preventSwipeBack();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
  })
}
