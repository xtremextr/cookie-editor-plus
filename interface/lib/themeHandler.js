import { Themes } from './options/themes.js';

/**
 * ThemeHandler: Handles dynamic theme changes after initial page load.
 * Works with themeLoader.js which handles the immediate theme application.
 */
export class ThemeHandler {
  /**
   * Constructs a ThemeHandler instance for dynamic theme changes
   * @param {OptionsHandler} optionHandler - The options handler instance
   */
  constructor(optionHandler) {
    this.optionHandler = optionHandler;
    
    // Listen for options changes
    optionHandler.on('optionsChanged', this.onOptionsChanged);
    
    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => this.updateTheme());
    
    // Ensure theme is up-to-date
    this.updateTheme();
  }
  
  /**
   * Updates the theme based on current settings
   */
  updateTheme() {
    const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
    const selectedTheme = this.optionHandler.getTheme();
    let themeToApply;
    
    switch (selectedTheme) {
      case Themes.Light:
        themeToApply = 'light';
        break;
      case Themes.Dark:
        themeToApply = 'dark';
        break;
      default:
        // Auto theme
        themeToApply = prefersDarkScheme.matches ? 'dark' : 'light';
        break;
    }
    
    // First check if the theme has actually changed
    const currentTheme = document.documentElement.getAttribute('data-theme');
    if (currentTheme === themeToApply) {
      // No change, don't do anything
      return;
    }
    
    // First remove old theme attributes before adding new ones
    document.documentElement.removeAttribute('data-theme');
    document.body.removeAttribute('data-theme');
    
    // Apply theme to both document elements - using setAttribute to ensure clean application
    document.documentElement.setAttribute('data-theme', themeToApply);
    document.body.setAttribute('data-theme', themeToApply);
    
    // Clean up and update theme CSS and variables
    this._loadThemeStylesheets(themeToApply);
    this._updateCssVariables(themeToApply);
    
    // Force a repaint to ensure styles are applied
    document.body.offsetHeight;
  }
  
  /**
   * Loads theme-specific stylesheets
   * @param {string} theme - 'light' or 'dark'
   * @private
   */
  _loadThemeStylesheets(theme) {
    // First, clean up all existing theme stylesheets to avoid conflicts
    const stylesheets = document.querySelectorAll('link[id^="theme-"], style[id^="theme-"]');
    stylesheets.forEach(stylesheet => stylesheet.remove());
    
    // Create link elements for CSS instead of using @import
    const themeGlobalLink = document.createElement('link');
    themeGlobalLink.rel = 'stylesheet';
    themeGlobalLink.href = `../theme/${theme}.css`;
    themeGlobalLink.id = 'theme-global-stylesheet';
    
    const themeContextLink = document.createElement('link');
    themeContextLink.rel = 'stylesheet';
    themeContextLink.href = `${theme}.css`;
    themeContextLink.id = 'theme-context-stylesheet';
    
    // Create a cleanup style to remove any lingering theme-specific styles
    const cleanupStyle = document.createElement('style');
    cleanupStyle.id = 'theme-cleanup-style';
    cleanupStyle.textContent = `
      /* Force reset of any lingering theme styles */
      [data-theme="${theme === 'light' ? 'dark' : 'light'}"] {
        display: none !important;
      }
    `;
    
    // Disable transitions during theme change to prevent visual glitches
    const transitionStyle = document.createElement('style');
    transitionStyle.id = 'theme-transition-style';
    transitionStyle.textContent = '* { transition: none !important; }';
    
    // Append stylesheets in correct order
    document.head.appendChild(transitionStyle);
    document.head.appendChild(cleanupStyle);
    document.head.appendChild(themeGlobalLink);
    document.head.appendChild(themeContextLink);
    
    // Re-enable transitions and remove cleanup style after a brief delay
    setTimeout(() => {
      transitionStyle.remove();
      cleanupStyle.remove();
    }, 100);
    
    // Add load event listeners to ensure stylesheets are loaded correctly
    themeGlobalLink.addEventListener('load', () => {
      // Force a refresh once the stylesheet is loaded
      document.body.offsetHeight;
    });
    
    themeContextLink.addEventListener('load', () => {
      // Force a refresh once the stylesheet is loaded
      document.body.offsetHeight;
    });
  }
  
  /**
   * Updates CSS variables when theme changes
   * @param {string} theme - 'light' or 'dark'
   * @private
   */
  _updateCssVariables(theme) {
    const root = document.documentElement;
    
    // First clear any existing inline style properties to avoid conflicts
    const themeVars = [
      '--primary-surface-color',
      '--primary-border-color',
      '--primary-text-color',
      '--primary-accent-color',
      '--primary-accent-darker',
      '--secondary-surface-color',
      '--menu-surface-color',
      '--menu-surface-hover-color',
      '--dropdown-bg',
      '--primary-link-color',
      '--primary-link-hover-color',
      '--secondary-text-color',
      '--secondary-text-onsurface-color'
    ];
    
    themeVars.forEach(varName => root.style.removeProperty(varName));
    
    if (theme === 'light') {
      // Essential light theme variables
      root.style.setProperty('--primary-surface-color', '#ffffff');
      root.style.setProperty('--primary-border-color', '#c5c5c5');
      root.style.setProperty('--primary-text-color', '#000000');
      root.style.setProperty('--primary-accent-color', '#4285f4');
      root.style.setProperty('--primary-accent-darker', '#3367d6');
      root.style.setProperty('--secondary-surface-color', '#eaeaea');
      root.style.setProperty('--menu-surface-color', '#ffffff');
      root.style.setProperty('--menu-surface-hover-color', '#eaeaea');
      root.style.setProperty('--dropdown-bg', '#ffffff');
      root.style.setProperty('--primary-link-color', '#0d63d3');
      root.style.setProperty('--primary-link-hover-color', '#85b9fc');
      root.style.setProperty('--secondary-text-color', '#777777');
      root.style.setProperty('--secondary-text-onsurface-color', '#000000');
    } else {
      // Essential dark theme variables
      root.style.setProperty('--primary-surface-color', '#2c2e31');
      root.style.setProperty('--primary-border-color', '#696969');
      root.style.setProperty('--primary-text-color', '#fafafa');
      root.style.setProperty('--primary-accent-color', '#1b98f1');
      root.style.setProperty('--primary-accent-darker', '#1b7bca');
      root.style.setProperty('--secondary-surface-color', '#303134');
      root.style.setProperty('--menu-surface-color', '#45474d');
      root.style.setProperty('--menu-surface-hover-color', '#373b44');
      root.style.setProperty('--dropdown-bg', '#45474d');
      root.style.setProperty('--primary-link-color', '#8fc9eb');
      root.style.setProperty('--primary-link-hover-color', '#d5ecf8');
      root.style.setProperty('--secondary-text-color', '#aaaaaa');
      root.style.setProperty('--secondary-text-onsurface-color', '#eaeaea');
    }
  }
  
  /**
   * Handles options changes
   * @param {Object} oldOptions - The previous options
   */
  onOptionsChanged = (oldOptions) => {
    if (oldOptions.theme !== this.optionHandler.getTheme()) {
      this.updateTheme();
    }
  };
}
