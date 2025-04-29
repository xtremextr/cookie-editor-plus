/**
 * Modern UI effects for Cookie-Editor Options
 * Adds ripple effects, animations, and other interactive elements
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize ripple effects
  initRippleEffect();
  
  // Update sidebar version
  updateSidebarVersion();
  
  // Initialize smooth scroll for sidebar navigation
  initSmoothScroll();
  
  // Initialize fancy switch animations
  initFancySwitches();
});

/**
 * Initialize ripple effect for buttons and clickable elements
 */
function initRippleEffect() {
  const rippleElements = document.querySelectorAll('.btn, .theme-toggle button, .nav-link');
  
  rippleElements.forEach(element => {
    element.addEventListener('click', function(e) {
      const rect = element.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2;
      
      // Create ripple element
      const ripple = document.createElement('span');
      ripple.classList.add('ripple');
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${e.clientX - rect.left - (size / 2)}px`;
      ripple.style.top = `${e.clientY - rect.top - (size / 2)}px`;
      
      // Add ripple to element
      element.appendChild(ripple);
      
      // Remove ripple after animation
      setTimeout(() => {
        ripple.remove();
      }, 600);
    });
  });
}

/**
 * Initialize smooth scroll for sidebar navigation
 */
function initSmoothScroll() {
  const navLinks = document.querySelectorAll('.sidebar nav a');
  
  navLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      // The main navigation functionality is handled in options-v2.js
      // This just adds a smooth scroll animation
      
      const targetId = this.getAttribute('href').substring(1);
      const targetSection = document.getElementById(targetId);
      
      if (targetSection) {
        // If we're on mobile, scroll to the section
        if (window.innerWidth <= 768) {
          e.preventDefault();
          window.scrollTo({
            top: targetSection.offsetTop - 100, // Adjust for header
            behavior: 'smooth'
          });
          
          // Update active class manually
          navLinks.forEach(navLink => navLink.classList.remove('active'));
          this.classList.add('active');
          
          // Show target section
          document.querySelectorAll('.section').forEach(section => {
            section.classList.remove('active');
          });
          targetSection.classList.add('active');
        }
      }
    });
  });
}

/**
 * Initialize fancy switch animations
 */
function initFancySwitches() {
  const switches = document.querySelectorAll('.fancy-switch input');
  
  switches.forEach(switchInput => {
    switchInput.addEventListener('change', function() {
      const switchElement = this.parentElement;
      
      // Add pulse animation when toggled
      if (this.checked) {
        // Create and append a temporary element for the pulse animation
        const pulse = document.createElement('span');
        pulse.style.position = 'absolute';
        pulse.style.top = '0';
        pulse.style.left = '0';
        pulse.style.right = '0';
        pulse.style.bottom = '0';
        pulse.style.borderRadius = '8px';
        pulse.style.animation = 'notificationPulse 0.6s ease-out';
        pulse.style.zIndex = '0';
        pulse.style.pointerEvents = 'none';
        
        switchElement.appendChild(pulse);
        
        // Remove the pulse element after animation completes
        setTimeout(() => {
          pulse.remove();
        }, 600);
      }
    });
  });
}

/**
 * Update the sidebar version display
 */
function updateSidebarVersion() {
  const sidebarVersionElement = document.getElementById('sidebar-version-display');
  const versionElement = document.getElementById('version-display');
  
  if (sidebarVersionElement && versionElement) {
    // Use a MutationObserver to watch for changes to the version display
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' || mutation.type === 'characterData') {
          sidebarVersionElement.textContent = versionElement.textContent;
        }
      });
    });
    
    observer.observe(versionElement, { 
      childList: true,
      characterData: true,
      subtree: true
    });
    
    // Initial set if already loaded
    if (versionElement.textContent && versionElement.textContent !== 'Loading version...') {
      sidebarVersionElement.textContent = versionElement.textContent;
    }
  }
}

/**
 * Initialize header scroll effect
 * Makes the header more compact on scroll
 */
window.addEventListener('scroll', function() {
  const header = document.querySelector('.app-header');
  
  if (window.scrollY > 50) {
    header.classList.add('compact');
  } else {
    header.classList.remove('compact');
  }
});

/**
 * Handle keyboard navigation accessibility
 */
function initAccessibility() {
  // Add focus indicators for keyboard navigation
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Tab') {
      document.body.classList.add('keyboard-navigation');
    }
  });
  
  document.addEventListener('mousedown', function() {
    document.body.classList.remove('keyboard-navigation');
  });
}

// Initialize accessibility features
initAccessibility(); 