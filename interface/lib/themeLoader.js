// CRITICAL: Apply theme IMMEDIATELY before anything else loads
(function() {
  // Theme constants to match the ThemeManager
  const THEMES = {
    Auto: 'auto',
    Light: 'light',
    Dark: 'dark'
  };
  
  // Immediately determine and apply theme to prevent flash
  const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
  
  let savedTheme;
  try {
    const options = JSON.parse(localStorage.getItem('all_options')) || {};
    savedTheme = options.theme || THEMES.Auto;
  } catch(e) {
    savedTheme = THEMES.Auto;
  }
  
  // Determine which theme to apply
  const isDark = savedTheme === THEMES.Dark || (savedTheme === THEMES.Auto && prefersDarkScheme.matches);
  const theme = isDark ? THEMES.Dark : THEMES.Light;
  
  // Save the initially loaded theme for later reference
  window.initialTheme = theme;
  
  // First clean any existing theme attributes to ensure we start fresh
  document.documentElement.removeAttribute('data-theme');
  
  // Apply to html element immediately
  document.documentElement.setAttribute('data-theme', theme);
  
  // Create and apply critical theme styling
  const style = document.createElement('style');
  style.id = 'theme-initial-style';
  
  // Set base variables that are common to both themes or have defaults
  style.textContent = `
    /* Base variables with defaults that will be overridden by theme-specific styles */
    :root {
      /* Default variables that will be overridden by theme-specific CSS */
      --primary-surface-color: ${theme === THEMES.Light ? '#ffffff' : '#2c2e31'} !important;
      --primary-border-color: ${theme === THEMES.Light ? '#c5c5c5' : '#696969'} !important;
      --primary-text-color: ${theme === THEMES.Light ? '#000000' : '#fafafa'} !important;
      --primary-accent-color: ${theme === THEMES.Light ? '#4285f4' : '#1b98f1'} !important;
      --primary-accent-darker: ${theme === THEMES.Light ? '#3367d6' : '#1b7bca'} !important;
      --secondary-surface-color: ${theme === THEMES.Light ? '#eaeaea' : '#303134'} !important;
      --menu-surface-color: ${theme === THEMES.Light ? '#ffffff' : '#45474d'} !important;
      --menu-surface-hover-color: ${theme === THEMES.Light ? '#eaeaea' : '#373b44'} !important;
      --dropdown-bg: ${theme === THEMES.Light ? '#ffffff' : '#45474d'} !important;
      
      /* Disable transitions initially */
      * { transition: none !important; }
    }
    
    /* Apply core styles to body */
    body {
      background-color: ${theme === THEMES.Light ? '#ffffff' : '#202124'} !important;
      color: ${theme === THEMES.Light ? '#222222' : '#fafafa'} !important;
    }
    
    /* Prevent FOUC by hiding content until styles are loaded */
    body {
      opacity: 0;
      transition: opacity 0.3s ease;
    }
    
    /* Set color scheme */
    :root {
      color-scheme: ${theme === THEMES.Light ? 'light' : 'dark'};
    }
    
    /* Force hide any other theme styles */
    [data-theme="${theme === THEMES.Light ? 'dark' : 'light'}"] {
      display: none !important;
    }
  `;
  
  // Remove any existing theme styles to start fresh
  const existingStyles = document.querySelectorAll('style[id^="theme-"], link[id^="theme-"]');
  existingStyles.forEach(el => el.remove());
  
  document.head.appendChild(style);
  
  // Load theme-specific stylesheets immediately when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    // Apply to body as well
    document.body.setAttribute('data-theme', theme);
    
    // Remove any existing theme style element to ensure clean state
    const existingStyles = document.querySelectorAll('style[id^="theme-"], link[id^="theme-"]');
    existingStyles.forEach(el => el.remove());
    
    // Create link elements for CSS instead of using @import for better performance and reliability
    const themeGlobalLink = document.createElement('link');
    themeGlobalLink.rel = 'stylesheet';
    themeGlobalLink.href = `../theme/${theme}.css`;
    themeGlobalLink.id = 'theme-global-stylesheet';
    
    const themeContextLink = document.createElement('link');
    themeContextLink.rel = 'stylesheet';
    themeContextLink.href = `${theme}.css`;
    themeContextLink.id = 'theme-context-stylesheet';
    
    // Append stylesheet links
    document.head.appendChild(themeGlobalLink);
    document.head.appendChild(themeContextLink);
    
    // Make body visible once styles are loaded
    document.body.style.opacity = '1';
    
    // Add event listeners to ensure stylesheets load properly
    const styleLoaded = () => {
      // Force a repaint to ensure styles are applied
      document.body.offsetHeight;
    };
    
    themeGlobalLink.addEventListener('load', styleLoaded);
    themeContextLink.addEventListener('load', styleLoaded);
    
    // Enable transitions after a delay
    setTimeout(() => {
      const styleTransitions = document.createElement('style');
      styleTransitions.id = 'theme-transitions-style';
      styleTransitions.textContent = '* { transition: all 0.3s ease; }';
      document.head.appendChild(styleTransitions);
    }, 300);
  });
})(); 