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
    // Read ONLY the dedicated theme key from localStorage (synchronous but fast for small string)
    savedTheme = localStorage.getItem('selectedTheme') || THEMES.Auto;
  } catch(e) {
    // Fallback if localStorage read fails for any reason
    console.error('Failed to read theme from localStorage:', e);
    savedTheme = THEMES.Auto;
  }
  
  // Validate the retrieved theme value
  if (!Object.values(THEMES).includes(savedTheme)) {
    savedTheme = THEMES.Auto;
  }
  
  // Determine which theme to apply
  const isDark = savedTheme === THEMES.Dark || (savedTheme === THEMES.Auto && prefersDarkScheme.matches);
  const theme = isDark ? THEMES.Dark : THEMES.Light;
  
  // First clean any existing theme attributes to ensure we start fresh
  document.documentElement.removeAttribute('data-theme');
  
  // Apply to html element immediately
  document.documentElement.setAttribute('data-theme', theme);
  
  // Create and apply critical theme styling
  const style = document.createElement('style');
  style.id = 'theme-initial-style';
  
  // Set base variables that are common to both themes or have defaults - simplified for faster parsing
  style.textContent = `
    :root {
      --primary-surface-color: ${theme === THEMES.Light ? '#ffffff' : '#2c2e31'};
      --primary-border-color: ${theme === THEMES.Light ? '#c5c5c5' : '#696969'};
      --primary-text-color: ${theme === THEMES.Light ? '#000000' : '#fafafa'};
      --primary-accent-color: ${theme === THEMES.Light ? '#4285f4' : '#1b98f1'};
      --primary-accent-color-rgb: ${theme === THEMES.Light ? '66, 133, 244' : '27, 152, 241'};
      --primary-accent-darker: ${theme === THEMES.Light ? '#3367d6' : '#1b7bca'};
      --secondary-surface-color: ${theme === THEMES.Light ? '#eaeaea' : '#303134'};
      --menu-surface-color: ${theme === THEMES.Light ? '#ffffff' : '#45474d'};
      --menu-surface-hover-color: ${theme === THEMES.Light ? '#eaeaea' : '#373b44'};
      --dropdown-bg: ${theme === THEMES.Light ? '#ffffff' : '#45474d'};
      --input-background-color: ${theme === THEMES.Light ? '#ffffff' : '#3c3f41'};
      --border-color: ${theme === THEMES.Light ? '#c5c5c5' : '#696969'};
      color-scheme: ${theme === THEMES.Light ? 'light' : 'dark'};
    }
    
    body {
      background-color: ${theme === THEMES.Light ? '#ffffff' : '#202124'};
      color: ${theme === THEMES.Light ? '#222222' : '#fafafa'};
    }
  `;
  
  // Remove any existing theme styles to start fresh
  const existingStyles = document.querySelectorAll('style[id^="theme-"], link[id^="theme-"]');
  existingStyles.forEach(el => el.remove());
  
  document.head.appendChild(style);
  
  // Load theme-specific stylesheets with higher priority
  const loadStylesheet = (href, id) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.id = id;
    
    // Use proper event listener instead of inline attribute
    link.addEventListener('load', function() {
      this.rel = 'stylesheet';
    });
    
    document.head.appendChild(link);
    return link;
  };
  
  // Add listener to make body visible as soon as DOM is ready
  window.addEventListener('DOMContentLoaded', () => {
    // Apply to body element
    document.body.setAttribute('data-theme', theme);
    
    // Preload theme stylesheets
    const themeGlobalLink = loadStylesheet(`../theme/${theme}.css`, 'theme-global-stylesheet');
    
    // Enable transitions after a delay
    setTimeout(() => {
      const styleTransitions = document.createElement('style');
      styleTransitions.id = 'theme-transitions-style';
      styleTransitions.textContent = '* { transition: all 0.3s ease; }';
      document.head.appendChild(styleTransitions);
    }, 300);
  });
})(); 

