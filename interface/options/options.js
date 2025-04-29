import { BrowserDetector } from '../lib/browserDetector.js';
import { Cookie } from '../lib/cookie.js';
import { GenericStorageHandler } from '../lib/genericStorageHandler.js';
import { JsonFormat } from '../lib/jsonFormat.js';
import { NetscapeFormat } from '../lib/netscapeFormat.js';
import { OptionsHandler } from '../lib/optionsHandler.js';
import { PermissionHandler } from '../lib/permissionHandler.js';
import { ThemeHandler } from '../lib/themeHandler.js';
import { CookieHandlerPopup } from '../popup/cookieHandlerPopup.js';

document.addEventListener('DOMContentLoaded', async (event) => {
  const browserDetector = new BrowserDetector();
  const storageHandler = new GenericStorageHandler(browserDetector);
  const optionHandler = new OptionsHandler(browserDetector, storageHandler);
  const themeHandler = new ThemeHandler(optionHandler);
  const cookieHandler = new CookieHandlerPopup(browserDetector);
  const permissionHandler = new PermissionHandler(browserDetector);
  const advancedCookieInput = document.getElementById('advanced-cookie');
  const showDevtoolsInput = document.getElementById('devtool-show');
  const animationsEnabledInput = document.getElementById('animations-enabled');
  const exportFormatInput = document.getElementById('export-format');
  const extraInfoInput = document.getElementById('extra-info');
  const themeInput = document.getElementById('theme');
  const buttonBarPositionInput = document.getElementById('button-bar-position');
  const adsEnabledInput = document.getElementById('ads-enabled');
  const notificationElement = document.getElementById('notification');

  await optionHandler.loadOptions();
  themeHandler.updateTheme();
  setFormValues();
  displayVersion();
  optionHandler.on('optionsChanged', setFormValues);
  setInputEvents();
  setupOptionsNavigation();

  /**
   * Setup options page navigation preference
   */
  function setupOptionsNavigation() {
    // Set current preference to v1 (original options)
    optionHandler.setPreferredOptionsPage('v1');
    
    // Add event listener to the "Try New Options V2" button
    const newOptionsBtn = document.querySelector('a.new-options-button');
    if (newOptionsBtn) {
      newOptionsBtn.addEventListener('click', (event) => {
        // Save preference to v2 before navigating
        optionHandler.setPreferredOptionsPage('v2');
        
        // Prevent default link behavior
        event.preventDefault();
        
        // Open v2 options page in a new tab
        browserDetector.getApi().tabs.create({
          url: browserDetector.getApi().runtime.getURL('interface/options/options-v2.html')
        });
      });
    }
  }

  /**
   * Displays the current extension version from manifest.json
   */
  function displayVersion() {
    const versionDisplay = document.getElementById('version-display');
    if (versionDisplay) {
      const version = browserDetector.getApi().runtime.getManifest().version;
      versionDisplay.textContent = 'Version ' + version;
    }
  }

  /**
   * Sets the value of the form based on the saved options.
   */
  function setFormValues() {
    
    handleAnimationsEnabled();
    advancedCookieInput.checked = optionHandler.getCookieAdvanced();
    showDevtoolsInput.checked = optionHandler.getDevtoolsEnabled();
    animationsEnabledInput.checked = optionHandler.getAnimationsEnabled();
    exportFormatInput.value = optionHandler.getExportFormat();
    extraInfoInput.value = optionHandler.getExtraInfo();
    themeInput.value = optionHandler.getTheme();
    buttonBarPositionInput.value = optionHandler.getButtonBarTop() ? 'top' : 'bottom';
    adsEnabledInput.checked = optionHandler.getAdsEnabled();
    // Set action button position select
    const actionPositionSelect = document.getElementById('action-button-position');
    if (actionPositionSelect) {
      actionPositionSelect.value = optionHandler.getActionButtonPosition();
    }

    if (!browserDetector.isSafari()) {
      document
        .querySelectorAll('.github-sponsor')
        .forEach((el) => el.classList.remove('hidden'));
    }
  }

  /**
   * Sets the different input listeners to save the form changes.
   */
  function setInputEvents() {
    advancedCookieInput.addEventListener('change', (event) => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setCookieAdvanced(advancedCookieInput.checked);
    });
    showDevtoolsInput.addEventListener('change', (event) => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setDevtoolsEnabled(showDevtoolsInput.checked);
    });
    animationsEnabledInput.addEventListener('change', (event) => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setAnimationsEnabled(animationsEnabledInput.checked);
      handleAnimationsEnabled();
    });
    exportFormatInput.addEventListener('change', (event) => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setExportFormat(exportFormatInput.value);
    });
    extraInfoInput.addEventListener('change', (event) => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setExtraInfo(extraInfoInput.value);
    });
    themeInput.addEventListener('change', (event) => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setTheme(themeInput.value);
      themeHandler.updateTheme();
    });
    buttonBarPositionInput.addEventListener('change', (event) => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setButtonBarTop(buttonBarPositionInput.value === 'top');
    });
    adsEnabledInput.addEventListener('change', (event) => {
      if (!event.isTrusted) {
        return;
      }
      optionHandler.setAdsEnabled(adsEnabledInput.checked);
    });
    // Listen for change in action button position
    const actionPositionInput = document.getElementById('action-button-position');
    if (actionPositionInput) {
      actionPositionInput.addEventListener('change', (event) => {
        if (!event.isTrusted) return;
        optionHandler.setActionButtonPosition(event.target.value);
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

    // Add event listener for the import cookies button
    document
      .getElementById('import-cookies')
      .addEventListener('click', () => {
        // Trigger the hidden file input
        document.getElementById('cookie-file-input').click();
      });
    
    // Add event listener for the file input change event
    document
      .getElementById('cookie-file-input')
      .addEventListener('change', async (event) => {
        await importCookiesFromJson(event);
      });

    // Add event listener for the reset confirmations button
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

    document
      .getElementById('revoke-all-permissions')
      .addEventListener('click', async () => {
        try {
          // Create a message element instead of using confirm dialog
          const confirmationContainer = document.createElement('div');
          confirmationContainer.className = 'confirmation-dialog';
          confirmationContainer.innerHTML = `
            <div class="confirmation-message">
              <p>Are you sure you want to revoke permissions for all sites?</p>
              <p>This will restrict Cookie-Editor's ability to manage cookies across websites.</p>
              <div class="button-group">
                <button id="confirm-revoke" class="danger">Revoke All</button>
                <button id="cancel-revoke">Cancel</button>
              </div>
            </div>
          `;
          document.body.appendChild(confirmationContainer);
          
          // Set up listeners for the buttons
          document.getElementById('confirm-revoke').addEventListener('click', async () => {
            document.body.removeChild(confirmationContainer);
            
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
          });
          
          document.getElementById('cancel-revoke').addEventListener('click', () => {
            document.body.removeChild(confirmationContainer);
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
      } catch (e) {
        showNotification('Error requesting domain permission.', true);
      }
    });
  }

  /**
   * Get permissions for All urls.
   */
  async function getAllPermissions() {
    const hasPermissions =
      await permissionHandler.checkPermissions('<all_urls>');
    if (!hasPermissions) {
      await permissionHandler.requestPermission('<all_urls>');
    }
  }

  /**
   * Get all cookies for the browser
   */
  async function getAllCookies() {
    await getAllPermissions();
    return new Promise((resolve, reject) => {
      cookieHandler.getAllCookiesInBrowser(function (cookies) {
        const loadedCookies = [];
        for (const cookie of cookies) {
          const id = Cookie.hashCode(cookie);
          loadedCookies[id] = new Cookie(id, cookie, optionHandler);
        }
        resolve(loadedCookies);
      });
    });
  }

  /**
   * Delete all cookies.
   */
  async function deleteAllCookies() {
    try {
      // Create a confirmation dialog element instead of using alert/confirm
      const confirmationContainer = document.createElement('div');
      confirmationContainer.className = 'confirmation-dialog';
      confirmationContainer.innerHTML = `
        <div class="confirmation-message">
          <p>Are you sure you want to delete ALL your cookies?</p>
          <div class="button-group">
            <button id="confirm-delete" class="danger">Continue</button>
            <button id="cancel-delete">Cancel</button>
          </div>
        </div>
      `;
      document.body.appendChild(confirmationContainer);
      
      // Set up the event listeners for the buttons
      document.getElementById('confirm-delete').addEventListener('click', async () => {
        // Remove the first dialog
        document.body.removeChild(confirmationContainer);
        
        // Create the second confirmation dialog
        const secondConfirmationContainer = document.createElement('div');
        secondConfirmationContainer.className = 'confirmation-dialog';
        secondConfirmationContainer.innerHTML = `
          <div class="confirmation-message">
            <p>Type CONFIRM (all caps) to delete all cookies:</p>
            <input type="text" id="confirm-text-input" />
            <div class="button-group">
              <button id="proceed-delete" class="danger">Delete All</button>
              <button id="cancel-delete-2">Cancel</button>
            </div>
          </div>
        `;
        document.body.appendChild(secondConfirmationContainer);
        
        // Set up event listener for second dialog
        document.getElementById('proceed-delete').addEventListener('click', async () => {
          const confirmText = document.getElementById('confirm-text-input').value;
          if (confirmText !== 'CONFIRM') {
            // Show error message
            const errorMessage = document.createElement('p');
            errorMessage.className = 'error-message';
            errorMessage.textContent = 'You must type CONFIRM exactly.';
            secondConfirmationContainer.querySelector('.confirmation-message').appendChild(errorMessage);
            return;
          }
          
          // Remove the second dialog
          document.body.removeChild(secondConfirmationContainer);
          
          // Perform the deletion
          const cookies = await getAllCookies();
          for (const cookieId in cookies) {
            if (!Object.prototype.hasOwnProperty.call(cookies, cookieId)) {
              continue;
            }
            const exportedCookie = cookies[cookieId].cookie;
            const url = 'https://' + exportedCookie.domain + exportedCookie.path;
            cookieHandler.removeCookie(exportedCookie.name, url);
          }
          
          // Show success message
          const successDialog = document.createElement('div');
          successDialog.className = 'confirmation-dialog';
          successDialog.innerHTML = `
            <div class="confirmation-message">
              <p>All your cookies were deleted</p>
              <button id="ok-button">OK</button>
            </div>
          `;
          document.body.appendChild(successDialog);
          document.getElementById('ok-button').addEventListener('click', () => {
            document.body.removeChild(successDialog);
          });
        });
        
        document.getElementById('cancel-delete-2').addEventListener('click', () => {
          document.body.removeChild(secondConfirmationContainer);
        });
      });
      
      document.getElementById('cancel-delete').addEventListener('click', () => {
        document.body.removeChild(confirmationContainer);
      });
    } catch (error) {
      console.error('Error deleting all cookies:', error);
      showNotification('An error occurred while deleting cookies. Please try again.', true);
    }
  }

  /**
   * Export all cookies in the JSON format.
   */
  async function exportCookiesAsJson() {
    try {
      const cookies = await getAllCookies();
      const cookieArray = Object.values(cookies);
      
      const exportedCookies = [];
      for (const cookie of cookieArray) {
        exportedCookies.push(cookie.cookie);
      }
      
      const format = new JsonFormat();
      const jsonData = format.export(exportedCookies);
      
      // Copy to clipboard
      copyText(jsonData);
      
      // Create a download link for the JSON data
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cookies-export.json';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      
      // Cleanup after download is triggered
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      
      showNotification(`${cookieArray.length} cookies exported and copied to clipboard!`, false);
    } catch (error) {
      console.error('Error exporting cookies as JSON:', error);
      showNotification('Error exporting cookies. Please try again.', true);
    }
  }

  /**
   * Export all cookies in the Netscape format.
   */
  async function exportCookiesAsNetscape() {
    try {
      const cookies = await getAllCookies();
      const cookieArray = Object.values(cookies);
      
      const exportedCookies = [];
      for (const cookie of cookieArray) {
        exportedCookies.push(cookie.cookie);
      }
      
      const format = new NetscapeFormat();
      const netscapeData = format.export(exportedCookies);
      
      // Copy to clipboard
      copyText(netscapeData);
      
      // Create a download link for the Netscape data
      const blob = new Blob([netscapeData], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cookies-export.txt';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      
      // Cleanup after download is triggered
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      
      showNotification(`${cookieArray.length} cookies exported and copied to clipboard!`, false);
    } catch (error) {
      console.error('Error exporting cookies as Netscape format:', error);
      showNotification('Error exporting cookies. Please try again.', true);
    }
  }

  /**
   * Copy some text to the user's clipboard.
   * @param {string} text Text to copy.
   */
  function copyText(text) {
    const fakeText = document.createElement('textarea');
    fakeText.classList.add('clipboardCopier');
    fakeText.textContent = text;
    document.body.appendChild(fakeText);
    fakeText.focus();
    fakeText.select();
    // TODO: switch to clipboard API.
    document.execCommand('Copy');
    document.body.removeChild(fakeText);
  }

  /**
   * Enables or disables the animations based on the options.
   */
  function handleAnimationsEnabled() {
    if (optionHandler.getAnimationsEnabled()) {
      document.body.classList.remove('notransition');
    } else {
      document.body.classList.add('notransition');
    }
  }

  /**
   * Displays a notification message to the user
   * @param {string} message - Message to display
   * @param {boolean} isError - Whether this is an error message
   * @param {number} duration - How long to show the message (ms), 0 for no auto-hide
   */
  function showNotification(message, isError = false, duration = 4000) {
    if (!notificationElement) return;
    
    // Hide any existing notification first
    hideNotification();
    
    // Small delay to ensure transition works
    setTimeout(() => {
      // Set the message and styling
      notificationElement.textContent = message;
      notificationElement.classList.remove('hidden', 'success', 'error');
      
      if (isError) {
        notificationElement.classList.add('error');
      } else {
        notificationElement.classList.add('success');
      }
      
      // Auto-hide after duration if specified
      if (duration > 0) {
        setTimeout(() => {
          hideNotification();
        }, duration);
      }
    }, 50);
  }

  /**
   * Hides the notification element
   */
  function hideNotification() {
    if (notificationElement) {
      notificationElement.classList.add('hidden');
    }
  }

  /**
   * Resets all confirmation dialog preferences
   */
  async function resetConfirmationDialogs() {
    try {
      // Set all confirmations to true explicitly before removing them
      await storageHandler.setLocal('showDeleteConfirmation', true);
      await storageHandler.setLocal('showDeleteAllConfirmation', true);
      await storageHandler.setLocal('showOptionsDeleteAllConfirmation', true);
      await storageHandler.setLocal('showProfileLoadConfirmation', true);
      await storageHandler.setLocal('showDeleteProfileConfirmation', true);
      await storageHandler.setLocal('showBatchDeleteConfirmation', true);
      
      // Also remove them to be extra safe
      await storageHandler.removeLocal('showDeleteConfirmation');
      await storageHandler.removeLocal('showDeleteAllConfirmation');
      await storageHandler.removeLocal('showOptionsDeleteAllConfirmation');
      await storageHandler.removeLocal('showProfileLoadConfirmation');
      await storageHandler.removeLocal('showDeleteProfileConfirmation');
      await storageHandler.removeLocal('showBatchDeleteConfirmation');
      
      // Also clear the old localStorage key for batch delete confirmation
      localStorage.removeItem('dontShowBatchDeleteConfirmation');
      
      console.log('Successfully reset all confirmation dialogs');
      showNotification('✓ All confirmation dialogs have been reset successfully!', false, 4000);
    } catch (err) {
      console.error('Error resetting confirmation dialogs:', err);
      showNotification('❌ Error resetting confirmation dialogs. Please try again.', true, 4000);
    }
  }

  /**
   * Import cookies from a JSON file.
   * @param {Event} event The change event from the file input.
   */
  async function importCookiesFromJson(event) {
    try {
      const file = event.target.files[0];
      if (!file) {
        return; // No file selected
      }

      // Read the file
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          // Parse the file content as JSON
          let cookieData;
          try {
            cookieData = JSON.parse(e.target.result);
          } catch (parseError) {
            showNotification('Error parsing JSON file: ' + parseError.message, true);
            return;
          }

          // Validate cookie data
          if (!cookieData) {
            showNotification('The imported file contains no data', true);
            return;
          }

          // Get a preview count of how many cookies we're importing
          const cookiesArray = normalizeCookieData(cookieData);
          const cookieCount = cookiesArray.length;

          if (cookieCount === 0) {
            showNotification('No valid cookies found in the file', true);
            return;
          }

          // Create an enhanced confirm dialog with import options
          const confirmationContainer = document.createElement('div');
          confirmationContainer.className = 'confirmation-dialog';
          confirmationContainer.innerHTML = `
            <div class="confirmation-message">
              <p>Import ${cookieCount} cookies from ${file.name}?</p>
              <p>Choose how to handle the import:</p>
              
              <div class="import-options">
                <div class="import-option">
                  <input type="radio" id="import-merge" name="import-strategy" value="merge" checked>
                  <label for="import-merge">
                    <strong>Merge</strong>
                    <span class="import-description">Add new cookies, keep existing ones if they have the same name</span>
                  </label>
                </div>
                
                <div class="import-option">
                  <input type="radio" id="import-replace" name="import-strategy" value="replace">
                  <label for="import-replace">
                    <strong>Replace</strong>
                    <span class="import-description">Overwrite existing cookies with the same name</span>
                  </label>
                </div>
                
                <div class="import-option">
                  <input type="radio" id="import-clear" name="import-strategy" value="clear">
                  <label for="import-clear">
                    <strong>Clear & Import</strong>
                    <span class="import-description">Delete all existing cookies first, then import (CAUTION!)</span>
                  </label>
                </div>
              </div>
              
              <div class="button-group">
                <button id="confirm-import">Import Cookies</button>
                <button id="cancel-import">Cancel</button>
              </div>
            </div>
          `;
          document.body.appendChild(confirmationContainer);

          // Set up event listeners for the buttons
          document.getElementById('confirm-import').addEventListener('click', async () => {
            // Get the selected import strategy
            const strategy = document.querySelector('input[name="import-strategy"]:checked').value;
            document.body.removeChild(confirmationContainer);
            
            // Show loading notification
            showNotification(`Processing ${cookieCount} cookies...`, false, 0);
            
            // Handle the Clear & Import strategy - delete all cookies first
            if (strategy === 'clear') {
              // Create a secondary confirmation for Clear & Import since it's destructive
              const clearConfirmContainer = document.createElement('div');
              clearConfirmContainer.className = 'confirmation-dialog';
              clearConfirmContainer.innerHTML = `
                <div class="confirmation-message">
                  <p class="warning">WARNING: This will delete ALL your existing cookies first!</p>
                  <p>Type DELETE to confirm:</p>
                  <input type="text" id="confirm-delete-text" />
                  <div class="button-group">
                    <button id="proceed-clear-import" class="danger">Clear & Import</button>
                    <button id="cancel-clear-import">Cancel</button>
                  </div>
                </div>
              `;
              document.body.appendChild(clearConfirmContainer);
              
              document.getElementById('proceed-clear-import').addEventListener('click', async () => {
                const confirmText = document.getElementById('confirm-delete-text').value;
                if (confirmText !== 'DELETE') {
                  // Show error message
                  const errorMessage = document.createElement('p');
                  errorMessage.className = 'error-message';
                  errorMessage.textContent = 'You must type DELETE exactly.';
                  clearConfirmContainer.querySelector('.confirmation-message').appendChild(errorMessage);
                  return;
                }
                
                document.body.removeChild(clearConfirmContainer);
                
                // Delete all existing cookies
                showNotification('Deleting all existing cookies...', false, 0);
                await clearAllCookies();
                
                // Now import the cookies
                importCookiesWithStrategy(cookieData, 'merge');
              });
              
              document.getElementById('cancel-clear-import').addEventListener('click', () => {
                document.body.removeChild(clearConfirmContainer);
                showNotification('Import canceled', false);
                event.target.value = '';
              });
              
              return;
            }
            
            // For Merge or Replace strategies, import directly
            importCookiesWithStrategy(cookieData, strategy);
          });
          
          document.getElementById('cancel-import').addEventListener('click', () => {
            document.body.removeChild(confirmationContainer);
            // Reset the file input value
            event.target.value = '';
          });
        } catch (error) {
          console.error('Error parsing imported cookies:', error);
          showNotification('Error parsing cookies: ' + error.message, true);
          
          // Reset the file input value
          event.target.value = '';
        }
      };
      
      reader.onerror = () => {
        console.error('Error reading file');
        showNotification('Error reading file. Please try again.', true);
        
        // Reset the file input value
        event.target.value = '';
      };
      
      reader.readAsText(file);
    } catch (error) {
      console.error('Error setting up cookie import:', error);
      showNotification('Error setting up cookie import: ' + error.message, true);
      
      // Reset the file input value
      event.target.files[0] = null;
    }
  }
  
  /**
   * Import cookies using the specified strategy
   * @param {Object} cookieData - The cookie data to import
   * @param {string} strategy - The import strategy ('merge' or 'replace')
   */
  async function importCookiesWithStrategy(cookieData, strategy) {
    try {
      const startTime = new Date().getTime();
      let importedCount = 0;
      let skippedCount = 0;
      
      showNotification('Processing cookies...', false, 0);
      
      // Convert the data into a standardized format - array of cookie objects
      const cookiesArray = normalizeCookieData(cookieData);
      
      // Get existing cookies if using merge strategy
      let existingCookies = {};
      if (strategy === 'merge') {
        const allCookies = await getAllCookies();
        // Create a lookup map of existing cookies by name+domain+path
        for (const cookieId in allCookies) {
          if (!Object.prototype.hasOwnProperty.call(allCookies, cookieId)) {
            continue;
          }
          const cookie = allCookies[cookieId].cookie;
          const key = getCookieKey(cookie);
          existingCookies[key] = cookie;
        }
      }
      
      // Process each cookie in the normalized array
      for (const cookieInfo of cookiesArray) {
        try {
          // Skip if missing required properties
          if (!cookieInfo.domain || !cookieInfo.name) {
            skippedCount++;
            continue;
          }
          
          // Create the URL from domain and path
          const path = cookieInfo.path || '/';
          const domain = cookieInfo.domain.startsWith('.') ? cookieInfo.domain.substr(1) : cookieInfo.domain;
          const url = (cookieInfo.secure ? 'https://' : 'http://') + domain + path;
          
          // For merge strategy, check if we should skip this cookie
          if (strategy === 'merge') {
            const cookieKey = getCookieKey(cookieInfo);
            if (existingCookies[cookieKey]) {
              skippedCount++;
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
          await setCookie(newCookie, newCookie.url);
          importedCount++;
        } catch (cookieError) {
          console.error('Error importing cookie:', cookieError, cookieInfo);
          skippedCount++;
        }
      }
      
      const endTime = new Date().getTime();
      const timeElapsed = (endTime - startTime) / 1000;
      
      if (importedCount > 0) {
        showNotification(`${importedCount} cookies imported in ${timeElapsed.toFixed(2)}s. ${skippedCount} cookies skipped.`, false);
      } else {
        showNotification(`No cookies imported. ${skippedCount} cookies skipped.`, true);
      }
      
      // Reset the file input value
      document.getElementById('cookie-file-input').value = '';
    } catch (error) {
      console.error('Error importing cookies:', error);
      showNotification('Error importing cookies: ' + error.message, true);
    }
  }
  
  /**
   * Normalizes cookie data into a standard array format regardless of input format.
   * @param {Object|Array} cookieData - The cookie data to normalize.
   * @returns {Array} - Array of standardized cookie objects.
   */
  function normalizeCookieData(cookieData) {
    if (!cookieData) {
      return [];
    }
    
    let result = [];
    
    // Handle if data is already an array
    if (Array.isArray(cookieData)) {
      // Process each item in the array
      for (const item of cookieData) {
        if (!item) continue;
        
        // If the item has a cookie property, extract it
        if (item.cookie && typeof item.cookie === 'object') {
          result.push(item.cookie);
        } 
        // Otherwise use the item directly if it looks like a cookie
        else if (typeof item === 'object' && item.name && item.domain) {
          result.push(item);
        }
      }
      return result;
    }
    
    // Handle if data is a single cookie object
    if (typeof cookieData === 'object' && cookieData.name && cookieData.domain) {
      return [cookieData];
    }
    
    // Handle if data is an object with cookie properties or nested structures
    if (typeof cookieData === 'object') {
      for (const key in cookieData) {
        if (!Object.prototype.hasOwnProperty.call(cookieData, key)) {
          continue;
        }
        
        const item = cookieData[key];
        if (!item) continue;
        
        // Extract cookie from our cookie-editor format
        if (item.cookie && typeof item.cookie === 'object') {
          result.push(item.cookie);
        } 
        // Just a regular cookie object directly in the property
        else if (typeof item === 'object' && item.name && item.domain) {
          result.push(item);
        }
        // Chrome export format - domain with an array of cookies
        else if (typeof item === 'object' && Array.isArray(item.cookies)) {
          for (const cookie of item.cookies) {
            if (cookie && cookie.name && cookie.domain) {
              result.push(cookie);
            }
          }
        }
      }
    }
    
    return result;
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
   * Clears all cookies without confirmation (for internal use, like clear & import).
   * @returns {Promise<number>} The number of deleted cookies
   */
  async function clearAllCookies() {
    showNotification('Deleting all existing cookies...', false, 0);
    const existingCookies = await getAllCookies();
    let deletedCount = 0;
    
    for (const cookieId in existingCookies) {
      if (!Object.prototype.hasOwnProperty.call(existingCookies, cookieId)) {
        continue;
      }
      const exportedCookie = existingCookies[cookieId].cookie;
      const domain = exportedCookie.domain.startsWith('.') ? exportedCookie.domain.substr(1) : exportedCookie.domain;
      const url = (exportedCookie.secure ? 'https://' : 'http://') + domain + exportedCookie.path;
      
      await cookieHandler.removeCookie(exportedCookie.name, url);
      deletedCount++;
    }
    
    showNotification(`Deleted ${deletedCount} cookies`, false);
    return deletedCount;
  }

  /**
   * Wrapper for cookieHandler.saveCookie that returns a Promise
   * @param {Object} cookie - The cookie to save
   * @param {string} url - The URL to save the cookie to
   * @returns {Promise<Object>} - The saved cookie
   */
  function setCookie(cookie, url) {
    return new Promise((resolve, reject) => {
      cookieHandler.saveCookie(cookie, url, (error, savedCookie) => {
        if (error) {
          reject(new Error(error));
        } else {
          resolve(savedCookie);
        }
      });
    });
  }
});

