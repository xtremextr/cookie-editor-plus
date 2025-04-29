/**
 * Cookie Manager Initialization
 * This script initializes the Cookie Manager UI when the page loads.
 */
import { CookieManagerUI } from './cookieManagerUI.js';

// Check for browser support for necessary features
const supportsSmoothScroll = 'scrollBehavior' in document.documentElement.style;
const supportsBackdropFilter = CSS.supports('backdrop-filter', 'blur(10px)') || 
                               CSS.supports('-webkit-backdrop-filter', 'blur(10px)');

// Initialize Cookie Manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Wait a short time to ensure the main options UI is loaded first
  setTimeout(() => {
    initCookieManager();
  }, 100);
});

/**
 * Initialize the Cookie Manager UI
 */
function initCookieManager() {
  const container = document.getElementById('cookie-manager-container');
  
  if (!container) {
    console.error('Cookie manager container not found');
    return;
  }
  
  // Apply feature detection classes to the body for progressive enhancement
  if (supportsSmoothScroll) {
    document.body.classList.add('supports-smooth-scroll');
  }
  
  if (supportsBackdropFilter) {
    document.body.classList.add('supports-backdrop-filter');
  } else {
    // Add fallback class when backdrop-filter is not supported
    document.body.classList.add('no-backdrop-filter');
  }
  
  // Enhance the page's transition when switching to the manager tab
  const managerTab = document.querySelector('.sidebar nav a[href="#manager"]');
  const managerSection = document.getElementById('manager');
  
  if (managerTab && managerSection) {
    managerTab.addEventListener('click', () => {
      // Add transition class for a smoother experience
      managerSection.classList.add('section-transition');
      setTimeout(() => {
        managerSection.classList.remove('section-transition');
      }, 500);
    });
  }
  
  // Create the Cookie Manager UI
  const cookieManagerUI = new CookieManagerUI(container);
  
  // Listen for notifications from the CookieManagerUI
  document.addEventListener('show-notification', (event) => {
    const notificationElement = document.getElementById('notification');
    if (!notificationElement) return;
    
    const { message, isError = false, duration = 3000 } = event.detail;
    
    // Clear any existing timeout
    if (notificationElement.timeoutId) {
      clearTimeout(notificationElement.timeoutId);
    }
    
    // Reset classes
    notificationElement.classList.remove('hidden', 'success', 'error');
    
    // Set the right class
    if (isError) {
      notificationElement.classList.add('error');
    } else {
      notificationElement.classList.add('success');
    }
    
    // Show notification with enhanced animation
    notificationElement.classList.remove('hidden');
    
    // Add animation effect
    notificationElement.style.animation = 'none';
    setTimeout(() => {
      notificationElement.style.animation = '';
    }, 10);
    
    // Set message
    notificationElement.innerHTML = `
      <div class="notification-content">
        <svg class="icon notification-icon">
          <use href="../sprites/solid.svg#${isError ? 'exclamation-circle' : 'check-circle'}"></use>
        </svg>
        <span>${message}</span>
      </div>
      <button class="notification-close">
        <svg class="icon">
          <use href="../sprites/solid.svg#times"></use>
        </svg>
      </button>
    `;
    
    // Add close button functionality
    const closeButton = notificationElement.querySelector('.notification-close');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        notificationElement.classList.add('hidden');
      });
    }
    
    // Set timeout to hide if duration is greater than 0
    if (duration > 0) {
      notificationElement.timeoutId = setTimeout(() => {
        notificationElement.classList.add('hidden');
      }, duration);
    }
  });
  
  // Set up lazy loading behavior when switching to the manager tab
  if (managerTab) {
    let isFirstLoad = true;
    managerTab.addEventListener('click', () => {
      // Only refresh if it's not the very first time the tab is activated
      if (!isFirstLoad) {
        // This will ensure cookies are refreshed when switching to the tab subsequently
        if (cookieManagerUI && typeof cookieManagerUI.refreshCookies === 'function') {
          // Show notification on subsequent refreshes
          cookieManagerUI.refreshCookies(true);
        }
      } else {
        // It's the first load, mark it as done
        isFirstLoad = false;
      }
    });
  }
  
  // Enhance accessibility
  container.setAttribute('role', 'region');
  container.setAttribute('aria-label', 'Cookie Manager');
} 