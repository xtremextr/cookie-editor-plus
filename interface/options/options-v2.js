import { BrowserDetector } from '../lib/browserDetector.js';
import { GenericStorageHandler } from '../lib/genericStorageHandler.js';
import { OptionsHandler } from '../lib/optionsHandler.js';
import { PermissionHandler } from '../lib/permissionHandler.js';
import { ThemeHandler } from '../lib/themeHandler.js';
import { CookieHandlerPopup } from '../popup/cookieHandlerPopup.js';
import { Options } from '../lib/options/options.js';

// Initialize critical objects immediately
const browserDetector = new BrowserDetector();
const storageHandler = new GenericStorageHandler(browserDetector);
const optionHandler = new OptionsHandler(browserDetector, storageHandler);
const themeHandler = new ThemeHandler(optionHandler);
// Create cookie handler for later use
const cookieHandler = new CookieHandlerPopup(browserDetector);

// Main initialization function
document.addEventListener('DOMContentLoaded', () => {
  // Remove no-js class from body immediately
  document.body.classList.remove('no-js');

  // --- Initial UI Setup (Runs Immediately) ---
  console.log('Performing immediate initial UI setup...');

  // Remove loading class once DOM is ready and initial setup is done
  document.body.classList.remove('loading');

  // Cache DOM elements early
  const elements = {
      advancedCookieInput: document.getElementById('advanced-cookie'),
      showDevtoolsInput: document.getElementById('devtool-show'),
      animationsEnabledInput: document.getElementById('animations-enabled'),
      exportFormatInput: document.getElementById('export-format'),
      themeInput: document.getElementById('theme'),
      buttonBarPositionInput: document.getElementById('button-bar-position'),
      adsEnabledInput: document.getElementById('ads-enabled'),
      actionButtonPositionInput: document.getElementById('action-button-position'),
      notificationElement: document.getElementById('notification'),
      versionDisplay: document.getElementById('version-display'),
  };

  // Initialize essential UI parts immediately
  // (These might use defaults initially, then get updated)
  try {
    // Initialize theme based on loader, then update later if needed
    themeHandler.updateTheme(); // Uses initial value set by themeLoader.js

    // Setup navigation and basic interactions immediately
    initNavigation(elements); // Setup sidebar navigation
    setupThemeToggle(elements); // Setup theme toggle button
    setupOptionsNavigation(); // Setup internal section navigation

    // Display version info immediately
    displayVersion(elements);

    // Set input events immediately
    // Deferring slightly might still be okay if complex
    setTimeout(() => setInputEvents(elements), 50);

    // Add tooltip position handler for better tooltip display
    setupTooltipPositioning();

  } catch (error) {
      console.error('Error during immediate initial setup:', error);
      showNotification('Error setting up initial UI: ' + error.message, true);
      // Ensure container is visible even on error
      const appContainer = document.querySelector('.app-container'); // Get explicitly here
      if (appContainer) {
        appContainer.style.opacity = '1';
      }
  }

  // --- Asynchronous Option Loading and UI Update ---

  const updateUIWithOptions = () => {
    console.log('Options loaded, updating UI...');
    // Remove this listener immediately to act like 'once'
    optionHandler.off('optionsLoaded', updateUIWithOptions); // Use a more general 'optionsLoaded' event if available

    try {
      // Update theme based on loaded options
      themeHandler.updateTheme(); // Re-apply based on loaded setting

      // Update form values with actual loaded options
      setEssentialFormValues(elements); // Set values critical for display first
      setRemainingFormValues(elements); // Set the rest of the values

      // Handle animations based on loaded setting
      handleAnimationsEnabled();

      // Any other UI updates dependent on loaded options
      // e.g., updatePermissionDisplay(elements);

    } catch (error) {
      console.error('Error updating UI with loaded options:', error);
      showNotification('Error applying loaded options: ' + error.message, true);
    }
  };

  // Listen for options being fully loaded
  // Using 'optionsLoaded' event, assuming OptionsHandler emits this when ready.
  // If only 'essentialOptionsLoaded' exists, we might need to adjust OptionsHandler
  // or use that event and assume 'isReady' flag is set by then.
  optionHandler.on('optionsLoaded', updateUIWithOptions);

  // Trigger the asynchronous loading process in OptionsHandler
  optionHandler.loadOptions().catch(error => {
      console.error("Critical error triggering option load:", error);
      showNotification('Failed to initiate option loading', true);
      // Ensure UI is visible even if loading fails critically
      const appContainer = document.querySelector('.app-container'); // Get explicitly here
      if (appContainer) {
        appContainer.style.opacity = '1';
      }
  });


  // --- Helper Functions ---
  // (Pass elements object to functions that need DOM refs)

  /**
   * Sets essential form values that impact the UI immediately *after* options are loaded
   * @param {object} elements DOM element references
   */
  function setEssentialFormValues(elements) {
    // Now assumes options are loaded via optionHandler
    if (elements.themeInput) elements.themeInput.value = optionHandler.getTheme();
    // Animations handled separately by handleAnimationsEnabled after load
  }

  /**
   * Sets the remaining form values *after* options are loaded.
   * @param {object} elements DOM element references
   */
  function setRemainingFormValues(elements) {
    // Assumes optionHandler.isReady is true or options are loaded
    if (!optionHandler.isReady) {
        console.warn("Attempting to set remaining form values before options fully loaded.");
        // Optionally, re-queue or wait, but the event listener pattern should prevent this
        return;
    }

    console.log('Setting remaining form values with loaded data...');
    if (elements.advancedCookieInput) elements.advancedCookieInput.checked = optionHandler.getCookieAdvanced();
    if (elements.showDevtoolsInput) elements.showDevtoolsInput.checked = optionHandler.getDevtoolsEnabled();
    if (elements.animationsEnabledInput) elements.animationsEnabledInput.checked = optionHandler.getAnimationsEnabled();
    if (elements.exportFormatInput) elements.exportFormatInput.value = optionHandler.getExportFormat();
    if (elements.buttonBarPositionInput) elements.buttonBarPositionInput.value = optionHandler.getButtonBarTop() ? 'top' : 'bottom';
    if (elements.adsEnabledInput) elements.adsEnabledInput.checked = optionHandler.getAdsEnabled();
    if (elements.actionButtonPositionInput) elements.actionButtonPositionInput.value = optionHandler.getActionButtonPosition();

    // Check if we can access github sponsor
    if (window.location.protocol !== 'moz-extension:') {
      const sponsorLinks = document.querySelectorAll('.github-sponsor');
      sponsorLinks.forEach(link => link.classList.remove('hidden'));
    }
  }

  const permissionHandler = new PermissionHandler(browserDetector);

  /**
   * Initialize tab navigation
   */
  function initNavigation(elements) {
    const navLinks = document.querySelectorAll('.sidebar nav a');
    const sections = document.querySelectorAll('.section');

    navLinks.forEach(link => {
      link.addEventListener('click', async (e) => {
        e.preventDefault();
        const targetId = link.getAttribute('href').substring(1);
        
        // Update active link
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        
        // Show target section
        sections.forEach(section => {
          if (section.id === targetId) {
            section.classList.add('active');
          } else {
            section.classList.remove('active');
          }
        });

        // Initialize or re-initialize All Cookies section when clicked
        if (targetId === 'all-cookies') {
          initAllCookiesSection(); // Call the initialization function
        }
      });
    });
  }
  
  /**
   * Setup theme toggle button
   */
  function setupThemeToggle(elements) {
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    
    if (!themeToggleBtn) return;
    
    themeToggleBtn.addEventListener('click', () => {
      const currentTheme = optionHandler.getTheme();
      let newTheme;
      
      if (currentTheme === 'dark') {
        newTheme = 'light';
      } else if (currentTheme === 'light') {
        newTheme = 'dark';
      } else {
        // If auto, check the current applied theme and toggle it
        const currentAppliedTheme = document.documentElement.getAttribute('data-theme');
        newTheme = currentAppliedTheme === 'dark' ? 'light' : 'dark';
      }
      
      optionHandler.setTheme(newTheme);
      themeHandler.updateTheme();
      if (elements.themeInput) elements.themeInput.value = newTheme;
    });
  }

  /**
   * Displays the current extension version from manifest.json
   */
  function displayVersion(elements) {
    const manifest = browserDetector.getApi().runtime.getManifest();
    const version = manifest.version;
    if (elements.versionDisplay) {
        elements.versionDisplay.textContent = `v${version}`;
    }
    // Assuming footerVersionElement is defined elsewhere or not needed
    // if (elements.footerVersionElement) {
    //   elements.footerVersionElement.textContent = `Version ${version}`;
    // }
  }

  /**
   * Sets the different input listeners to save the form changes.
   */
  function setInputEvents(elements) {
    elements.advancedCookieInput.addEventListener('change', (event) => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setCookieAdvanced(elements.advancedCookieInput.checked);
      showNotification('Advanced cookie options updated', false);
    });
    
    elements.showDevtoolsInput.addEventListener('change', (event) => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setDevtoolsEnabled(elements.showDevtoolsInput.checked);
      showNotification('Devtools panel setting updated', false);
    });
    
    elements.animationsEnabledInput.addEventListener('change', (event) => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setAnimationsEnabled(elements.animationsEnabledInput.checked);
      handleAnimationsEnabled();
      showNotification('Animation setting updated', false);
    });
    
    elements.exportFormatInput.addEventListener('change', (event) => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setExportFormat(elements.exportFormatInput.value);
      showNotification('Export format preference saved', false);
    });
    
    elements.themeInput.addEventListener('change', (event) => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setTheme(elements.themeInput.value);
      themeHandler.updateTheme();
      showNotification('Theme updated', false);
    });
    
    elements.buttonBarPositionInput.addEventListener('change', (event) => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setButtonBarTop(elements.buttonBarPositionInput.value === 'top');
      showNotification('Button bar position updated', false);
    });
    
    elements.adsEnabledInput.addEventListener('change', (event) => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setAdsEnabled(elements.adsEnabledInput.checked);
      const message = elements.adsEnabledInput.checked ? 
        'Thank you for supporting Cookie-Editor!' : 
        'Ads disabled';
      showNotification(message, false);
    });
    
    // Listen for change in action button position
    const actionPositionInput = document.getElementById('action-button-position');
    if (actionPositionInput) {
      actionPositionInput.addEventListener('change', (event) => {
        if (!event.isTrusted) return;
        optionHandler.setActionButtonPosition(event.target.value);
        showNotification('Cookie action button position updated', false);
      });
    }

    document
      .getElementById('delete-all')
      .addEventListener('click', async (event) => {
        await deleteAllCookies();
      });

    document
      .getElementById('export-all-json')
      .addEventListener('click', async (event) => {
        await exportCookiesAsJson();
      });

    document
      .getElementById('export-all-netscape')
      .addEventListener('click', async (event) => {
        await exportCookiesAsNetscape();
      });
      
    // Import cookies: trigger file input click
    document.getElementById('import-cookies').addEventListener('click', () => {
      document.getElementById('cookie-file-input').click();
    });

    // Handle file input change for import
    document.getElementById('cookie-file-input').addEventListener('change', async (event) => {
      await importCookiesFromJson(event);
    });

    document
      .getElementById('reset-confirmations')
      .addEventListener('click', async (event) => {
        await resetConfirmationDialogs();
      });

    // Add event listeners for new permission management buttons
    document.getElementById('allow-all-permissions').addEventListener('click', async () => {
      try {
        const granted = await permissionHandler.requestPermission('<all_urls>');
        showNotification(granted ? 'All site permissions granted.' : 'Failed to grant all site permissions.', !granted);
      } catch (e) {
        showNotification('Error requesting all site permissions.', true);
      }
    });

    document.getElementById('revoke-all-permissions').addEventListener('click', async () => {
      try {
        // Add confirmation dialog
        const confirmed = confirm('Are you sure you want to revoke permissions for all sites? This will restrict Cookie-Editor\'s ability to manage cookies across websites.');
        
        // Only proceed if user confirms
        if (!confirmed) {
          return;
        }
        
        // Use the browser API directly for more reliability
        const browser = browserDetector.getApi();
        browser.permissions.remove({ origins: ['<all_urls>'] }, (removed) => {
          if (browser.runtime.lastError) {
            console.error('Error revoking permissions:', browser.runtime.lastError);
            showNotification('Failed to revoke all site permissions: ' + browser.runtime.lastError.message, true);
            return;
          }
          
          showNotification(removed ? 'All site permissions revoked.' : 'Failed to revoke all site permissions.', !removed);
        });
      } catch (e) {
        console.error('Error in revoke permissions:', e);
        showNotification('Error revoking all site permissions: ' + e.message, true);
      }
    });

    document.getElementById('allow-domain-btn').addEventListener('click', async () => {
      const input = document.getElementById('allow-domain-input');
      let domain = input.value.trim();
      if (!domain) {
        showNotification('Please enter a domain.', true);
        return;
      }
      // Remove protocol if user entered it
      domain = domain.replace(/^https?:\/\//, '');
      // Remove trailing slash if present
      domain = domain.replace(/\/$/, '');
      try {
        const granted = await permissionHandler.requestPermission(`https://${domain}`);
        showNotification(granted ? `Permissions granted for ${domain}` : `Failed to grant permissions for ${domain}`, !granted);
        if (granted) {
          input.value = '';
        }
      } catch (e) {
        showNotification('Error requesting domain permission.', true);
      }
    });

    // Listen for custom events from dialog-handlers.js
    document.addEventListener('delete-all-cookies-confirmed', deleteAllCookies);
    document.addEventListener('export-all-json', exportCookiesAsJson);
    document.addEventListener('export-all-netscape', exportCookiesAsNetscape);
    document.addEventListener('reset-confirmations', resetConfirmationDialogs);
    
    // Import file handling
    document.addEventListener('import-file-selected', (e) => {
      importCookiesFromJson(e.detail.event);
    });
    
    // Import strategy selection
    document.addEventListener('import-strategy-selected', (e) => {
      const strategy = e.detail.strategy;
      const event = window.importFileEvent;
      
      if (event && event.target.files.length > 0) {
        const file = event.target.files[0];
        const reader = new FileReader();
        
        reader.onload = async (e) => {
          try {
            const cookieData = JSON.parse(e.target.result);
            await importCookiesWithStrategy(cookieData, strategy);
          } catch (error) {
            console.error('Failed to parse import file:', error);
            showNotification('Failed to parse import file: ' + error.message, true);
          }
        };
        
        reader.readAsText(file);
      }
    });
  }

  /**
   * Delete all cookies.
   */
  async function deleteAllCookies() {
    // Get references to the dialog elements
    const dialog1 = document.getElementById('delete-all-confirm-dialog-1');
    const dialog2 = document.getElementById('delete-all-confirm-dialog-2');
    const confirmBtn1 = document.getElementById('confirm-delete');
    const cancelBtn1 = document.getElementById('cancel-delete');
    const confirmInput = document.getElementById('confirm-text-input');
    const proceedBtn2 = document.getElementById('proceed-delete');
    const cancelBtn2 = document.getElementById('cancel-delete-2');
    const errorMsg2 = document.getElementById('delete-confirm-error');

    // Show the first confirmation dialog
    dialog1.style.display = 'flex';

    // --- Dialog 1 Logic ---
    const confirmPromise1 = new Promise((resolve, reject) => {
      document.getElementById('confirm-delete').onclick = () => resolve();
      document.getElementById('cancel-delete').onclick = () => reject(new Error('User cancelled'));
    });

    try {
      await confirmPromise1;
      // User confirmed first dialog, hide it and show second
      dialog1.style.display = 'none';
      
      dialog2.style.display = 'flex';
      confirmInput.focus(); // Focus the input field
    } catch (err) {
      // User cancelled first dialog
      return;
    }
          
    // --- Dialog 2 Logic ---
    const confirmPromise2 = new Promise((resolve, reject) => {
      document.getElementById('proceed-delete').onclick = () => {
        if (confirmInput.value === 'CONFIRM') {
          resolve();
        } else {
          errorMsg2.textContent = 'You must type CONFIRM exactly.';
          errorMsg2.style.display = 'block';
        }
      };
      document.getElementById('cancel-delete-2').onclick = () => reject(new Error('User cancelled'));
    });

    try {
      await confirmPromise2;
      // User typed CONFIRM and proceeded
      
      // --- Perform the deletion ---
      showNotification('Deleting all cookies...', false, 0); 
          const cookies = await getAllCookies();
          let count = 0;
          
      // Process cookies in batches to avoid overwhelming the browser
      const batchSize = 20;
      const cookieIds = Object.keys(cookies);
      const totalCookies = cookieIds.length;
      
      for (let i = 0; i < cookieIds.length; i += batchSize) {
        const batch = cookieIds.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (cookieId) => {
            if (!Object.prototype.hasOwnProperty.call(cookies, cookieId)) {
              return;
            }
            
            const cookie = cookies[cookieId];
            try {
              if (cookie && cookie.cookie) {
                // Get the domain and path from the cookie object
                const domain = cookie.cookie.domain || '';
                const path = cookie.cookie.path || '/';
                const name = cookie.cookie.name;
                const storeId = cookie.cookie.storeId;
                
                // Construct URL for removal
                let url;
                if (domain.startsWith('.')) {
                  url = `https://${domain.substring(1)}${path}`;
                } else {
                  url = `https://${domain}${path}`;
                }
                
                // Delete the cookie
                await new Promise((resolve) => {
                  cookieHandler.removeCookie(name, url, storeId, resolve);
                });
                
                count++;
              }
            } catch (err) {
              // Log the error but continue with other cookies
              const cookieName = cookie && cookie.cookie ? cookie.cookie.name : 'unknown';
              const cookieDomain = cookie && cookie.cookie ? cookie.cookie.domain : 'unknown';
              console.error(`Error deleting cookie ${cookieName} for ${cookieDomain}:`, err);
            }
          })
        );
        
        // Update the notification with progress every few batches
        if (i % (batchSize * 5) === 0 || i + batchSize >= totalCookies) {
          showNotification(`Deleting cookies... (${count}/${totalCookies})`, false, 0, true);
        }
      }
      
      showNotification(`Deleted ${count} cookies.`, false);
    } catch (err) {
      if (err.message !== 'User cancelled') {
          console.error("Error during delete all process:", err);
          showNotification('An error occurred during deletion.', true);
      }
    }
  }

  /**
   * Export all cookies as Json.
   */
  async function exportCookiesAsJson() {
    try {
      // Get all cookies mapping and format as JSON
      const cookies = await getAllCookies();
      const count = Object.keys(cookies).length;
      const jsonData = JsonFormat.format(cookies);
      
      // Copy to clipboard
      copyText(jsonData);
      // Trigger download of JSON file
      const blobJson = new Blob([jsonData], { type: 'application/json' });
      const urlJson = URL.createObjectURL(blobJson);
      const linkJson = document.createElement('a');
      linkJson.href = urlJson;
      linkJson.download = 'cookies-export.json';
      linkJson.style.display = 'none';
      document.body.appendChild(linkJson);
      linkJson.click();
      setTimeout(() => {
        document.body.removeChild(linkJson);
        URL.revokeObjectURL(urlJson);
      }, 100);
      
      showNotification(`${count} cookies exported and copied to clipboard!`, false);
    } catch (error) {
      console.error('Error exporting cookies as JSON:', error);
      showNotification('Error exporting cookies. Please try again.', true);
    }
  }

  /**
   * Export all cookies as netscape format.
   */
  async function exportCookiesAsNetscape() {
    try {
      // Get all cookies mapping and format as Netscape
      const cookies = await getAllCookies();
      const count = Object.keys(cookies).length;
      const netscapeData = NetscapeFormat.format(cookies);
      
      // Copy to clipboard
      copyText(netscapeData);
      // Trigger download of Netscape file
      const blobN = new Blob([netscapeData], { type: 'text/plain' });
      const urlN = URL.createObjectURL(blobN);
      const linkN = document.createElement('a');
      linkN.href = urlN;
      linkN.download = 'cookies-export.txt';
      linkN.style.display = 'none';
      document.body.appendChild(linkN);
      linkN.click();
      setTimeout(() => {
        document.body.removeChild(linkN);
        URL.revokeObjectURL(urlN);
      }, 100);
      
      showNotification(`${count} cookies exported and copied to clipboard!`, false);
    } catch (error) {
      console.error('Error exporting cookies as Netscape format:', error);
      showNotification('Error exporting cookies. Please try again.', true);
    }
  }

  /**
   * Handle animations based on user preferences
   */
  function handleAnimationsEnabled() {
    const animationsEnabled = optionHandler.getAnimationsEnabled();
    document.documentElement.classList.toggle('no-animations', !animationsEnabled);
  }

  /**
   * Show a notification to the user
   * @param {string} message - The message to display
   * @param {boolean} isError - Whether this is an error notification
   * @param {number} duration - How long to show the notification in ms
   * @param {boolean} isUpdate - Whether this is just updating an existing notification
   */
  function showNotification(message, isError = false, duration = 3000, isUpdate = false) {
    if (!elements.notificationElement) return;
    
    // Clear any existing timeout
    if (elements.notificationElement.timeoutId) {
      clearTimeout(elements.notificationElement.timeoutId);
    }
    
    if (!isUpdate) {
      // Reset classes
      elements.notificationElement.classList.remove('hidden', 'success', 'error');
      
      // Set the right class
      if (isError) {
        elements.notificationElement.classList.add('error');
      } else {
        elements.notificationElement.classList.add('success');
      }
      
      // Show notification
      elements.notificationElement.classList.remove('hidden');
      
      // Add animation effect
      elements.notificationElement.style.animation = 'none';
      setTimeout(() => {
        elements.notificationElement.style.animation = '';
      }, 10);
    }
    
    // Set message in the content div
    const contentEl = elements.notificationElement.querySelector('.notification-content');
    if (contentEl) {
      contentEl.textContent = message;
    }
    
    // Make sure close button has event listener
    const closeBtn = elements.notificationElement.querySelector('.notification-close');
    if (closeBtn && !closeBtn._hasEventListener) {
      closeBtn.addEventListener('click', hideNotification);
      closeBtn._hasEventListener = true;
    }
    
    // Set timeout to hide
    if (duration > 0) {
      elements.notificationElement.timeoutId = setTimeout(hideNotification, duration);
    }
    
    // Add pulse animation for updates
    if (isUpdate) {
      elements.notificationElement.classList.add('pulsing');
      setTimeout(() => {
        elements.notificationElement.classList.remove('pulsing');
      }, 600);
    }
  }

  /**
   * Hide the notification
   */
  function hideNotification() {
    if (elements.notificationElement) {
      elements.notificationElement.classList.add('hidden');
      // Clear any existing timeout
      if (elements.notificationElement.timeoutId) {
        clearTimeout(elements.notificationElement.timeoutId);
        elements.notificationElement.timeoutId = null;
      }
    }
  }

  /**
   * Reset all confirmation dialogs
   */
  async function resetConfirmationDialogs() {
    try {
      // Reset all confirmation dialogs using setLocal
      await storageHandler.setLocal('showDeleteConfirmation', true);
      await storageHandler.setLocal('showDeleteAllConfirmation', true);
      await storageHandler.setLocal('showOptionsDeleteAllConfirmation', true);
      await storageHandler.setLocal('showProfileLoadConfirmation', true);
      await storageHandler.setLocal('showBatchDeleteConfirmation', true);
      await storageHandler.setLocal('showDeleteProfileConfirmation', true);
      
      // Also reset with the "neverShow" format for backward compatibility
      await storageHandler.set('neverShowDeleteConfirmation', false);
      await storageHandler.set('neverShowDeleteAllConfirmation', false);
      await storageHandler.set('neverShowOptionsDeleteAllConfirmation', false);
      await storageHandler.set('neverShowBatchDeleteConfirmation', false);
      await storageHandler.set('neverShowProfileLoadConfirmation', false);
      
      // Show success notification
      showNotification('All confirmation dialogs have been reset', false);
    } catch (err) {
      console.error('Error resetting confirmation dialogs:', err);
      showNotification('Error resetting confirmation dialogs', true);
    }
  }

  /**
   * Setup options page navigation preference
   */
  function setupOptionsNavigation() {
    // Set current preference to v2 (new options)
    optionHandler.setPreferredOptionsPage('v2');
    
    // Add event listener to the "Original Options" button
    const originalOptionsBtn = document.querySelector('.header-actions a[href="options.html"]');
    if (originalOptionsBtn) {
      originalOptionsBtn.addEventListener('click', (event) => {
        // Save preference to v1 before navigating
        optionHandler.setPreferredOptionsPage('v1');
      });
    }
  }

  /**
   * Import cookies from a JSON file.
   */
  async function importCookiesFromJson(event) {
    // Save the event for later use when strategy is selected
    window.importFileEvent = event;
    
    const file = event.target.files[0];
    
    try {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const cookieData = JSON.parse(e.target.result);
          
          // Display the import dialog with cookie count
          const cookieCount = Array.isArray(cookieData) ? cookieData.length : 
                              (cookieData.cookies ? cookieData.cookies.length : 0);
                              
          // Trigger custom event to show the dialog
          document.dispatchEvent(new CustomEvent('show-import-dialog', { 
            detail: { cookieCount } 
          }));
        } catch (error) {
          console.error('Failed to parse import file:', error);
          showNotification('Failed to parse import file: ' + error.message, true);
        }
      };
      
      reader.readAsText(file);
    } catch (error) {
      console.error('Failed to read import file:', error);
      showNotification('Failed to read import file: ' + error.message, true);
    }
  }
  
  /**
   * Imports cookies from the provided cookie data based on the selected strategy.
   * @param {Object|Array} cookieData - The cookie data to import, can be an array or an object.
   * @param {string} strategy - The strategy to use for importing cookies ('merge' or 'replace').
   * @returns {Promise<void>}
   */
  async function importCookiesWithStrategy(cookieData, strategy) {
    const startTime = new Date().getTime();
    const importedCount = { value: 0 };
    const skippedCount = { value: 0 };
    
    showNotification('Processing cookies...', false, 0);
    
    try {
      // Convert the data into a standardized format - array of cookie objects
      const cookiesArray = normalizeCookieData(cookieData);
      const totalCookies = cookiesArray.length;
      
      // Get existing cookies if using merge strategy
      let existingCookies = {};
      if (strategy === 'merge') {
        existingCookies = await getAllCookies();
      }
      
      // Process each cookie in the normalized array
      for (let i = 0; i < cookiesArray.length; i++) {
        const cookieInfo = cookiesArray[i];
        try {
          // Skip if missing required properties
          if (!cookieInfo.domain || !cookieInfo.name) {
            skippedCount.value++;
            continue;
          }
          
          // Update progress every 20 cookies
          if (i > 0 && i % 20 === 0 || i === totalCookies - 1) {
            showNotification(`Processing cookies... (${i+1}/${totalCookies})`, false, 0, true);
          }
          
          // Create the URL from domain and path
          const path = cookieInfo.path || '/';
          const domain = cookieInfo.domain.startsWith('.') ? cookieInfo.domain.substr(1) : cookieInfo.domain;
          const url = (cookieInfo.secure ? 'https://' : 'http://') + domain + path;
          
          // For merge strategy, check if we should skip this cookie
          if (strategy === 'merge') {
            const cookieKey = getCookieKey(cookieInfo);
            if (existingCookies[cookieKey]) {
              skippedCount.value++;
              continue;
            }
          }
          
          // Create cookie object for the browser API
          const newCookie = {
            url: url,
            name: cookieInfo.name,
            value: cookieInfo.value || '',
            domain: cookieInfo.domain,
            path: path,
            secure: !!cookieInfo.secure,
            httpOnly: !!cookieInfo.httpOnly,
            sameSite: cookieInfo.sameSite || 'unspecified',
            expirationDate: cookieInfo.expirationDate,
            storeId: cookieInfo.storeId
          };
          
          // Handle special cases
          
          // For session cookies, don't include expirationDate
          if (!cookieInfo.expirationDate) {
            delete newCookie.expirationDate;
          }
          
          // For host-only cookies, don't include domain
          if (cookieInfo.hostOnly) {
            delete newCookie.domain;
          }
          
          // Remove any undefined values
          Object.keys(newCookie).forEach(key => {
            if (newCookie[key] === undefined) {
              delete newCookie[key];
            }
          });
          
          // Set the cookie using the browser's API
          await setCookieAsync(newCookie, url);
          importedCount.value++;
        } catch (cookieError) {
          console.error('Error importing cookie:', cookieError, cookieInfo);
          skippedCount.value++;
        }
      }
      
      const endTime = new Date().getTime();
      const timeElapsed = (endTime - startTime) / 1000;
      
      if (importedCount.value > 0) {
        showNotification(`${importedCount.value} cookies imported in ${timeElapsed.toFixed(2)}s. ${skippedCount.value} cookies skipped.`, false);
        // No need to refresh list in options page
      } else {
        showNotification(`No cookies imported. ${skippedCount.value} cookies skipped.`, true);
      }
    } catch (error) {
      console.error('Error importing cookies:', error);
      showNotification('Error importing cookies: ' + error.message, true);
    }
  }
  
  /**
   * Creates a unique key for a cookie based on its domain, path, and name.
   * @param {Object} cookie - The cookie object.
   * @returns {string} - A unique identifier for the cookie.
   */
  function getCookieKey(cookie) {
    const path = cookie.path || '/';
    return `${cookie.domain}|${path}|${cookie.name}`;
  }

  /**
   * Initialize the all-cookies section
   */
  async function initAllCookiesSection() {
    console.log('[AllCookies] Initializing section...');
    // Use existing cookieHandler to avoid creating duplicate cookie manager instances
    const container = document.getElementById('all-cookies-list-container');
    const tableBody = document.getElementById('all-cookies-table-body');
    const searchInput = document.getElementById('all-cookies-search');
    const selectAllCheckbox = document.getElementById('select-all-cookies');
    const loaderElement = document.getElementById('all-cookies-loader');
    const emptyMessageElement = document.getElementById('all-cookies-empty-message');
    const totalCountElement = document.getElementById('all-cookies-total');
    const showingElement = document.getElementById('all-cookies-showing');
    
    // Pagination elements
    const firstPageBtn = document.getElementById('all-cookies-first-page');
    const prevPageBtn = document.getElementById('all-cookies-prev-page');
    const nextPageBtn = document.getElementById('all-cookies-next-page');
    const lastPageBtn = document.getElementById('all-cookies-last-page');
    const pageNumbersContainer = document.getElementById('all-cookies-page-numbers');
    
    // Action button references
    const deleteAllButton = document.getElementById('delete-all');
    const exportJsonButton = document.getElementById('export-all-json');
    const exportNetscapeButton = document.getElementById('export-all-netscape');
    const importCookiesButton = document.getElementById('import-cookies');
    const cookieFileInput = document.getElementById('cookie-file-input');
    
    if (!container || !tableBody) {
      console.error('All cookies container or table body not found');
      return;
    }
    
    // Show loader
    if (loaderElement) loaderElement.classList.remove('hidden');
    if (emptyMessageElement) emptyMessageElement.classList.add('hidden');
    
    // Pagination state
    const state = {
      allCookies: [], // All available cookies
      filteredCookies: [], // Filtered cookies based on search
      currentPage: 1,
      itemsPerPage: 20,
      totalPages: 1
    };
    
    try {
      console.log('[AllCookies] Fetching all cookies...');
      // Fetch all cookies
      const allCookies = await new Promise((resolve) => {
        cookieHandler.getAllBrowserCookies(resolve);
      });

      console.log('[AllCookies] Fetched cookies:', allCookies ? allCookies.length : 'null/undefined');
      
      // Update UI with cookies
      if (allCookies && allCookies.length > 0) {
        // Store cookies in state
        state.allCookies = allCookies;
        state.filteredCookies = allCookies;
        state.totalPages = Math.ceil(allCookies.length / state.itemsPerPage);
        
        // Update count
        if (totalCountElement) totalCountElement.textContent = allCookies.length;
        
        // Render cookies with pagination
        renderCookieTable();
        updatePagination();
        
        // Hide loader and show table
        if (loaderElement) loaderElement.classList.add('hidden');
        
        // Remove the generic .cookie-table class to prevent style conflicts
        const tableElement = document.getElementById('all-cookies-table');
        if (tableElement) {
          tableElement.classList.remove('cookie-table');
          console.log('[AllCookies] Removed .cookie-table class to isolate styles.');
        }
        
      } else {
        console.log('[AllCookies] No cookies found or array is empty.');
        // Show empty message
        if (emptyMessageElement) {
          emptyMessageElement.classList.remove('hidden');
        }
        if (loaderElement) {
          loaderElement.classList.add('hidden');
        }
        if (totalCountElement) totalCountElement.textContent = '0';
        if (showingElement) showingElement.textContent = '0-0';
      }
      
    } catch (error) {
      console.error('[AllCookies] Error loading all cookies:', error);
      if (loaderElement) loaderElement.classList.add('hidden');
      if (emptyMessageElement) {
        emptyMessageElement.querySelector('p').textContent = 'Error loading cookies: ' + error.message;
        emptyMessageElement.classList.remove('hidden');
      }
    }
    
    /**
     * Renders the cookie table based on current pagination state
     */
    function renderCookieTable() {
      // Clear existing table rows
      if (tableBody) tableBody.innerHTML = '';
      
      if (state.filteredCookies.length === 0) {
        if (loaderElement) loaderElement.classList.add('hidden');
        if (emptyMessageElement) emptyMessageElement.classList.remove('hidden');
        return;
      }

      // Calculate visible cookies for pagination
      const start = (state.currentPage - 1) * state.itemsPerPage;
      const end = Math.min(start + state.itemsPerPage, state.filteredCookies.length);
      const visibleCookies = state.filteredCookies.slice(start, end);
      
      // Update the "showing X-Y of Z" text if exists
      if (showingElement) showingElement.textContent = `${start + 1}-${end}`;
      if (totalCountElement) totalCountElement.textContent = state.filteredCookies.length;
      
      // Function to escape HTML and format tooltip content
      function escapeAndFormatTooltip(content) {
        if (!content) return '';
        
        // First escape HTML
        const escaped = content.toString()
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
        
        return escaped;
      }
      
      // Render table rows
      visibleCookies.forEach(cookie => {
        const cookieKey = getCookieKey(cookie);
        
        const row = document.createElement('tr');
        row.setAttribute('data-cookie-id', cookieKey);
        
        const expiryDisplay = cookie.expirationDate ? 
          new Date(cookie.expirationDate * 1000).toLocaleString() : 
          'Session';
        
        // Format and escape tooltip values
        const escapedName = escapeAndFormatTooltip(cookie.name);
        const escapedDomain = escapeAndFormatTooltip(cookie.domain);
        const escapedValue = escapeAndFormatTooltip(cookie.value);
        const escapedExpiry = escapeAndFormatTooltip(expiryDisplay);
        
        // Truncate display values for the table
        const displayName = cookie.name.length > 20 ? cookie.name.substring(0, 20) + '...' : cookie.name;
        const displayDomain = cookie.domain.length > 20 ? cookie.domain.substring(0, 20) + '...' : cookie.domain;
        const displayValue = cookie.value.length > 40 ? cookie.value.substring(0, 40) + '...' : cookie.value;
        
        row.innerHTML = `
          <td>
            <label class="custom-checkbox">
              <input type="checkbox" data-cookie-id="${cookieKey}" />
              <span class="checkbox-checkmark"></span>
            </label>
          </td>
          <td class="tooltip-cell" data-tooltip="${escapedName}">${displayName}</td>
          <td class="tooltip-cell" data-tooltip="${escapedDomain}">${displayDomain}</td>
          <td class="tooltip-cell" data-tooltip="${escapedValue}">${displayValue}</td>
          <td class="tooltip-cell" data-tooltip="${escapedExpiry}">${expiryDisplay}</td>
          <td>
            <div class="cookie-actions">
              <button class="btn-action edit" title="Edit cookie" data-cookie-id="${cookieKey}">
                <svg class="icon"><use href="../sprites/solid.svg#edit"></use></svg>
              </button>
              <button class="btn-action copy" title="Copy cookie" data-cookie-id="${cookieKey}">
                <svg class="icon"><use href="../sprites/solid.svg#copy"></use></svg>
              </button>
              <button class="btn-action delete" title="Delete cookie" data-cookie-id="${cookieKey}">
                <svg class="icon"><use href="../sprites/solid.svg#trash-alt"></use></svg>
              </button>
            </div>
          </td>
        `;
        
        tableBody.appendChild(row);
      });
      
      // Update select-all checkbox state after rendering rows
      updateSelectAllCheckboxState();
    }
    
    /**
     * Updates pagination UI based on current state
     */
    function updatePagination() {
      // Enable/disable navigation buttons
      if (firstPageBtn) firstPageBtn.disabled = state.currentPage <= 1;
      if (prevPageBtn) prevPageBtn.disabled = state.currentPage <= 1;
      if (nextPageBtn) nextPageBtn.disabled = state.currentPage >= state.totalPages;
      if (lastPageBtn) lastPageBtn.disabled = state.currentPage >= state.totalPages;
      
      // Update page numbers
      if (pageNumbersContainer) {
        pageNumbersContainer.innerHTML = '';
        
        // Calculate range of pages to show
        let startPage = Math.max(1, state.currentPage - 2);
        let endPage = Math.min(state.totalPages, startPage + 4);
        
        // Adjust if we're near the end
        if (endPage - startPage < 4 && startPage > 1) {
          startPage = Math.max(1, endPage - 4);
        }
        
        // Add page numbers
        for (let i = startPage; i <= endPage; i++) {
          const pageButton = document.createElement('button');
          pageButton.className = `page-number${i === state.currentPage ? ' active' : ''}`;
          pageButton.textContent = i;
          pageButton.addEventListener('click', () => {
            state.currentPage = i;
            renderCookieTable();
            updatePagination();
          });
          pageNumbersContainer.appendChild(pageButton);
        }
      }
    }
    
    // --- Add Listeners for Main Pagination Buttons ---
    if (firstPageBtn) {
      firstPageBtn.addEventListener('click', () => {
        if (state.currentPage > 1) {
          state.currentPage = 1;
          renderCookieTable();
          updatePagination();
        }
      });
    }
    if (prevPageBtn) {
      prevPageBtn.addEventListener('click', () => {
        if (state.currentPage > 1) {
          state.currentPage--;
          renderCookieTable();
          updatePagination();
        }
      });
    }
    if (nextPageBtn) {
      nextPageBtn.addEventListener('click', () => {
        if (state.currentPage < state.totalPages) {
          state.currentPage++;
          renderCookieTable();
          updatePagination();
        }
      });
    }
    if (lastPageBtn) {
      lastPageBtn.addEventListener('click', () => {
        if (state.currentPage < state.totalPages) {
          state.currentPage = state.totalPages;
          renderCookieTable();
          updatePagination();
        }
      });
    }
    // --- End Main Pagination Button Listeners ---

    // Add event listener for search input
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.trim().toLowerCase();
        
        if (searchTerm === '') {
          // Reset to original list
          state.filteredCookies = state.allCookies;
        } else {
          // Filter cookies based on search term
          state.filteredCookies = state.allCookies.filter(cookie => {
            const name = cookie.name.toLowerCase();
            const domain = cookie.domain.toLowerCase();
            const value = cookie.value.toLowerCase();
            
            return name.includes(searchTerm) || domain.includes(searchTerm) || value.includes(searchTerm);
          });
        }
        
        // Update pagination state
        state.currentPage = 1;
        state.totalPages = Math.ceil(state.filteredCookies.length / state.itemsPerPage);
        
        // Update UI
        renderCookieTable();
        updatePagination();
        
        // Show/hide empty message
        if (emptyMessageElement) {
          if (state.filteredCookies.length === 0) {
            emptyMessageElement.querySelector('p').textContent = 'No cookies found matching your search';
            emptyMessageElement.classList.remove('hidden');
    } else {
            emptyMessageElement.classList.add('hidden');
          }
        }
      });
    }
    
    // --- EVENT DELEGATION for Table Body ---
    if (tableBody) {
      // Remove previous listener if re-initializing to prevent duplicates
      // Note: This requires storing the listener function reference if initAllCookiesSection can be called multiple times.
      // For simplicity now, we assume it's called once or the duplication is handled elsewhere/acceptable.

      tableBody.addEventListener('click', (event) => {
        const target = event.target;
        const button = target.closest('.btn-action');
        const checkbox = target.closest('input[type="checkbox"][data-cookie-id]');

        // Handle action button clicks
        if (button && button.closest('#all-cookies-table-body')) {
          event.stopPropagation(); // Prevent triggering other listeners if necessary
          const cookieKey = button.getAttribute('data-cookie-id');
          const cookie = state.allCookies.find(c => getCookieKey(c) === cookieKey);
        
        if (cookie) {
            if (button.classList.contains('edit')) {
              console.log('Attempting to edit cookie:', cookie);
              // TODO: Implement actual edit functionality
              showNotification(`Edit: ${cookie.name}@${cookie.domain}`, false); 
            } else if (button.classList.contains('copy')) {
          navigator.clipboard.writeText(JSON.stringify(cookie, null, 2))
                .then(() => showNotification('Cookie copied', false))
                .catch(err => {
                  console.error('Clipboard copy failed:', err);
                  showNotification('Failed to copy', true);
                });
            } else if (button.classList.contains('delete')) {
          showDeleteConfirmation(() => {
            cookieHandler.removeCookie(cookie, () => {
              const row = button.closest('tr');
              if (row) {
                    // --- Update state and UI counts before removing row visually ---
                    const indexAll = state.allCookies.findIndex(c => getCookieKey(c) === cookieKey);
                    const indexFiltered = state.filteredCookies.findIndex(c => getCookieKey(c) === cookieKey);
                    if (indexAll > -1) state.allCookies.splice(indexAll, 1);
                    if (indexFiltered > -1) state.filteredCookies.splice(indexFiltered, 1);

                    if (totalCountElement) totalCountElement.textContent = state.allCookies.length;
                    state.totalPages = Math.ceil(state.filteredCookies.length / state.itemsPerPage);
                    if (state.currentPage > state.totalPages && state.totalPages > 0) state.currentPage = state.totalPages;
                    else if (state.filteredCookies.length === 0) { state.currentPage = 1; state.totalPages = 1; }

                    // Re-render the table content for the current page
                    renderCookieTable(); 
                    updatePagination();
                    updateSelectAllCheckboxState(); // Update header checkbox

                    showNotification('Cookie deleted', false);

                    // Check if the now potentially empty page needs the empty message
                    if (emptyMessageElement && state.filteredCookies.length === 0) {
                        emptyMessageElement.querySelector('p').textContent = searchInput.value.trim() ? 'No cookies matching search' : 'No cookies found';
                        emptyMessageElement.classList.remove('hidden');
                }
              }
            });
          });
            }
          } else {
            console.warn('Could not find cookie for key:', cookieKey, 'in state.allCookies');
          }
          return; // Stop processing if we handled a button click
        }

        // Handle row checkbox clicks
        if (checkbox && checkbox.closest('#all-cookies-table-body')) {
             // Checkbox click automatically changes its state
             // We just need to update the header checkbox state
             updateSelectAllCheckboxState();
        }
      });
    }
    // --- END EVENT DELEGATION ---

    // Add event listener for select all checkbox
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', () => {
        const checked = selectAllCheckbox.checked;
        const checkboxes = tableBody.querySelectorAll('input[type="checkbox"][data-cookie-id]');
        checkboxes.forEach(cb => cb.checked = checked);
      });
    }
  }
  
  /**
   * Shows a confirmation dialog for delete operations
   */
  function showDeleteConfirmation(onConfirm) {
    const confirmationDialog = document.getElementById('generic-confirm-dialog');
    
    if (!confirmationDialog) {
      console.error('Confirmation dialog not found');
      return;
    }
    
    const confirmBtn = confirmationDialog.querySelector('.confirm-btn');
    const cancelBtn = confirmationDialog.querySelector('.cancel-btn');
    const message = confirmationDialog.querySelector('.confirmation-message p');
    
    // Update message
    if (message) {
      message.textContent = 'Are you sure you want to delete? This action cannot be undone.';
    }
    
    // Show dialog
    confirmationDialog.style.display = 'flex';
    
    // Set up event listeners
    const confirmHandler = () => {
      confirmationDialog.style.display = 'none';
      onConfirm();
      cleanup();
    };
    
    const cancelHandler = () => {
      confirmationDialog.style.display = 'none';
      cleanup();
    };
    
    // Cleanup function to remove event listeners
    const cleanup = () => {
      confirmBtn.removeEventListener('click', confirmHandler);
      cancelBtn.removeEventListener('click', cancelHandler);
    };
    
    // Add event listeners
    confirmBtn.addEventListener('click', confirmHandler);
    cancelBtn.addEventListener('click', cancelHandler);
  }

  /**
   * Updates the state (checked, indeterminate) of the main select-all checkbox
   * based on the currently visible row checkboxes.
   */
  function updateSelectAllCheckboxState() {
    const allCookiesSection = document.getElementById('all-cookies');
    const selectAllCheckbox = allCookiesSection?.querySelector('#select-all-cookies');
    const tableBody = allCookiesSection?.querySelector('#all-cookies-table-body');

    if (!tableBody || !selectAllCheckbox) {
      console.warn("[updateSelectAllCheckboxState] Could not find required elements.");
      return; // Ensure elements exist
    }

    const checkboxes = tableBody.querySelectorAll('input[type="checkbox"][data-cookie-id]');
    const visibleCheckboxes = Array.from(checkboxes);

    if (visibleCheckboxes.length === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
        return;
    }

    const checkedCount = visibleCheckboxes.filter(checkbox => checkbox.checked).length;

    if (checkedCount === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    } else if (checkedCount === visibleCheckboxes.length) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
    }
  }

  /**
   * Sets up event delegation for tooltip positioning
   * This ensures tooltips are always visible and properly positioned
   */
  function setupTooltipPositioning() {
    // Check for truncated content after table renders
    function detectTruncatedContent() {
      document.querySelectorAll('.tooltip-cell').forEach(cell => {
        // Check if content is truncated (scrollWidth > clientWidth)
        if (cell.scrollWidth > cell.clientWidth) {
          cell.classList.add('is-truncated');
        } else {
          cell.classList.remove('is-truncated');
        }
        
        // Check if tooltip content is very long to apply special styling
        const tooltipText = cell.getAttribute('data-tooltip');
        if (tooltipText && tooltipText.length > 200) {
          cell.classList.add('is-very-long');
          // For very long content, always show tooltip regardless of truncation
          cell.classList.add('tooltip-cell--force-tooltip');
        } else {
          cell.classList.remove('is-very-long');
          cell.classList.remove('tooltip-cell--force-tooltip');
        }
      });
    }
    
    // Detect truncated content on initial load and on window resize
    window.addEventListener('resize', detectTruncatedContent);
    
    // Call it after a short delay to ensure the table is fully rendered
    setTimeout(detectTruncatedContent, 300);
    
    // Set up mutation observer to detect when table content changes
    const tableObserver = new MutationObserver((mutations) => {
      // Check if any mutation involved table changes
      const shouldCheckTruncation = mutations.some(mutation => {
        return mutation.target.closest('.table-scroll-container') || 
               mutation.target.classList.contains('table-scroll-container');
      });
      
      if (shouldCheckTruncation) {
        detectTruncatedContent();
      }
    });
    
    // Observe the table container for changes
    const tableContainer = document.querySelector('.table-scroll-container');
    if (tableContainer) {
      tableObserver.observe(tableContainer, {
        childList: true,
        subtree: true
      });
    }
    
    // Handle tooltip positioning on hover
    document.addEventListener('mouseover', function(e) {
      // Check if it's a tooltip cell
      if (e.target.classList.contains('tooltip-cell') || e.target.closest('.tooltip-cell')) {
        const cell = e.target.classList.contains('tooltip-cell') ? e.target : e.target.closest('.tooltip-cell');
        
        // Get tooltip text
        const tooltipText = cell.getAttribute('data-tooltip');
        if (!tooltipText) return;
        
        // Check if content is truncated (scrollWidth > clientWidth)
        if (cell.scrollWidth > cell.clientWidth) {
          cell.classList.add('is-truncated');
        } else {
          cell.classList.remove('is-truncated');
        }
        
        // Check if tooltip content is very long
        if (tooltipText.length > 200) {
          cell.classList.add('is-very-long');
          cell.classList.add('tooltip-cell--force-tooltip');
        }
        
        // Position calculation timeout to ensure CSS hover effects are applied first
        setTimeout(() => {
          // For this approach we'll use custom positioning
          const rect = cell.getBoundingClientRect();
          
          // Use mouse position for more accurate tooltip placement
          // This makes the tooltip follow the cursor more naturally
          const mouseX = e.clientX;
          const mouseY = e.clientY;
          
          // Calculate optimal position for tooltip - use mouse X position 
          const viewportWidth = window.innerWidth;
          const tooltipMaxWidth = 400; // Match the CSS max-width value
          
          // Calculate optimal left position based on mouse cursor
          let leftPos = mouseX;
          
          // Keep tooltip within viewport horizontally with some padding
          const padding = 20;
          leftPos = Math.max(tooltipMaxWidth/2 + padding, Math.min(leftPos, viewportWidth - (tooltipMaxWidth/2 + padding)));
          
          // Apply positioning directly to the cell which will affect its pseudo-elements
          cell.style.setProperty('--tooltip-left', `${leftPos}px`);
          
          // Calculate vertical position - place tooltip above the cursor
          const tooltipHeight = cell.classList.contains('is-very-long') ? 300 : 100; // Estimated tooltip height
          const topPos = mouseY - tooltipHeight - 15; // Position above cursor with small gap
          cell.style.setProperty('--tooltip-top', `${topPos}px`);
          
          // Set arrow position right below the tooltip
          const arrowTop = topPos + tooltipHeight;
          cell.style.setProperty('--arrow-top', `${arrowTop}px`);
          cell.style.setProperty('--arrow-left', `${leftPos}px`);
        }, 10);
      }
    });
  }
}); 