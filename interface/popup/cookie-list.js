import { CookieHandlerDevtools } from '../devtools/cookieHandlerDevtools.js';
import { BrowserDetector } from '../lib/browserDetector.js';
import { Cookie } from '../lib/cookie.js';
import { GenericStorageHandler } from '../lib/genericStorageHandler.js';
import { HeaderstringFormat } from '../lib/headerstringFormat.js';
import { JsonFormat } from '../lib/jsonFormat.js';
import { NetscapeFormat } from '../lib/netscapeFormat.js';
import { ExportFormats } from '../lib/options/exportFormats.js';
import { OptionsHandler } from '../lib/optionsHandler.js';
import { PermissionHandler } from '../lib/permissionHandler.js';
import { ProfileManager } from '../lib/profileManager.js';
import { ThemeHandler } from '../lib/themeHandler.js';
import { CookieHandlerPopup } from './cookieHandlerPopup.js';
import { ResizeHandler } from '../lib/resizeHandler.js';
import { HistoryHandler } from '../lib/historyHandler.js';

// Cookie sharing imports
import { extractSharedCookiesFromUrl, formatExpiration } from '../lib/sharing/cookieSharing.js';

(function () {
  ('use strict');

  let containerCookie;
  let cookiesListHtml;
  let pageTitleContainer;
  let notificationElement;
  let loadedCookies = {};
  let disableButtons = false;
  let profileSelector;
  let domainSelector;
  let currentDomain = '';
  let allDomains = [];
  let selectedDomain = '';
  // Flag to control including parent-domain cookies (persisted)
  let includeParentCookies = false;
  let hasRequestedPermission = false; // Permission request tracking
  let showDeleteConfirmation = true; // Flag to control delete confirmation display
  let showDeleteAllConfirmation = true; // Flag to control delete all confirmation display
  let showProfileLoadConfirmation = true; // Flag to control profile load confirmation display
  let showDeleteProfileConfirmation = true; // Flag to control delete profile confirmation display
  let activeDeleteCookieName = null; // Store the name of cookie being deleted
  let activeCopyMenu = null; // Store the active copy menu element
  
  // Track the last refresh time to prevent too frequent updates
  let lastCookieRefreshTimestamp = 0;
  const MIN_REFRESH_INTERVAL = 1500; // Minimum 1.5 seconds between refreshes
  
  // Add a timestamp variable for cookie modification checks
  let lastCookieModificationCheckTime = 0;
  const MIN_MODIFICATION_CHECK_INTERVAL = 3000; // 3 seconds minimum between checks
  
  /**
   * Helper function to find the Cookie object associated with a cookie element.
   * @param {Element} cookieElement - The DOM element representing the cookie.
   * @return {Cookie|null} The Cookie object or null if not found.
   */
  function findCookieObject(cookieElement) {
    const cookieId = cookieElement.dataset.id;
    const cookieName = cookieElement.dataset.name;
    
    // Find the cookie in loadedCookies
    if (loadedCookies) {
      // Handle if loadedCookies is an object (the expected case)
      if (typeof loadedCookies === 'object' && !Array.isArray(loadedCookies)) {
        if (cookieId && loadedCookies[cookieId]) {
          return loadedCookies[cookieId].cookie;
        }
        
        // If not found by ID, try to find by name
        for (const id in loadedCookies) {
          if (loadedCookies[id].cookie && loadedCookies[id].cookie.name === cookieName) {
            return loadedCookies[id].cookie;
          }
        }
      } 
      // Handle if loadedCookies is somehow an array (fallback)
      else if (Array.isArray(loadedCookies)) {
        for (const cookie of loadedCookies) {
          if (cookie.name === cookieName && String(cookie.id) === cookieId) {
            return cookie;
          }
        }
      }
    }
    
    return null;
  }

  // Performance optimization: Add cookie caching
  const cookieCache = {
    domain: '',
    url: '',
    cookies: [],
    timestamp: 0,
    maxAge: 15000, // Cache cookies for 15 seconds (increased from 1 second)
    isValid: function(url) {
      return this.url === url && 
             Date.now() - this.timestamp < this.maxAge;
    },
    store: function(url, cookies) {
      this.url = url;
      this.cookies = cookies;
      this.timestamp = Date.now();
      this.domain = getDomainFromUrl(url);
    },
    clear: function() {
      this.domain = '';
      this.url = '';
      this.cookies = [];
      this.timestamp = 0;
    }
  };

  // Periodically clear cookieCache to free memory
  setInterval(() => {
    cookieCache.clear();
  }, 300000); // every 5 minutes

  const notificationQueue = [];
  let notificationTimeout;

  let cookieChangeTimeout = null;
  let isProfileLoading = false; // Flag to prevent double refresh during profile loading

  const browserDetector = new BrowserDetector();
  const permissionHandler = new PermissionHandler(browserDetector);
  const storageHandler = new GenericStorageHandler(browserDetector);
  const optionHandler = new OptionsHandler(browserDetector, storageHandler);
  const themeHandler = new ThemeHandler(optionHandler);
  // Defer heavy modules to dynamic import at runtime
  let AdHandler;
  let Animate;
  // Placeholder for dynamic ad/animation modules
  let adHandler;
  const cookieHandler = window.isDevtools
    ? new CookieHandlerDevtools(browserDetector)
    : new CookieHandlerPopup(browserDetector);
  const profileManager = new ProfileManager(storageHandler, browserDetector);
  const historyHandler = new HistoryHandler(browserDetector, cookieHandler);

  // Global flag to prevent multiple shared data import dialogs
  let sharedDataProcessingInProgress = false;
  let associatedTabId = null; // Store the ID of the tab the side panel is attached to

  /**
   * Helper function to determine if running in the side panel context.
   * Checks for the absence of an element known only to exist in the popup.
   * @returns {boolean} True if likely running in the side panel, false otherwise.
   */
  function isSidePanel() {
    // Check if a core popup element like profile management is missing
    return !document.getElementById('profile-management');
  }

  document.addEventListener('DOMContentLoaded', async function () {
    // Measure synchronous initialization time
    // Prevent duplicate listener binding if popup reloads within same session
    if (window._initialized) return;
    window._initialized = true;

    // Inject styles for domain"settings gear and menu
    const style = document.createElement('style');
    style.textContent = `
      .domain-selector-wrapper { position: relative; display: flex; align-items: center; }
      #domain-settings-button { border: none; background: transparent; margin-right: 4px; cursor: pointer; }
      #domain-settings-button .icon { width: 16px; height: 16px; fill: var(--primary-text-color); }
      #domain-settings-menu { position: absolute; top: calc(100% + 4px); left: 0; background-color: white; border: 1px solid var(--primary-border-color); border-radius: 4px; padding: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.2); z-index: 1000; }
      #domain-settings-menu.hidden { display: none; }
      #domain-settings-menu label { font-size: 13px; color: var(--primary-text-color); display: flex; align-items: center; }
      #domain-settings-menu input { margin-right: 6px; }
      [data-theme="dark"] #domain-settings-menu { background-color: var(--menu-surface-color); border-color: var(--secondary-border-color); }
    `;
    document.head.appendChild(style);

    containerCookie = document.getElementById('cookie-container');
    notificationElement = document.getElementById('notification');
    pageTitleContainer = document.getElementById('pageTitle');
    
    // Add event listeners to the cookie container
    addEventListeners();
    
    // These might be null in side panel, check before use
    profileSelector = document.getElementById('profile-selector');
    domainSelector = document.getElementById('domain-selector');
    
    // End measuring synchronous initialization
    
    // Load options before proceeding
    await optionHandler.loadOptions();

    // Apply user preference for action button layout: left or below
    const actionLayout = optionHandler.getActionButtonPosition();
    if (actionLayout === 'below') {
      document.body.classList.add('action-buttons-below');
    } else {
      document.body.classList.remove('action-buttons-below');
    }

    // Initialize animations right after options are loaded
    handleAnimationsEnabled();

    // --- BEGIN ADDITION: Load confirmation settings ---
    showDeleteConfirmation = await storageHandler.getLocal('showDeleteConfirmation', true); // Default to true if not set
    showDeleteAllConfirmation = await storageHandler.getLocal('showDeleteAllConfirmation', true); // Default to true if not set
    showProfileLoadConfirmation = await storageHandler.getLocal('showProfileLoadConfirmation', true); // Default to true if not set
    showDeleteProfileConfirmation = await storageHandler.getLocal('showDeleteProfileConfirmation', true); // Default to true if not set
    // --- END ADDITION ---

    await themeHandler.updateTheme();
    
    // Defer heavy module loads (animations, ads, resize) to idle time
    (window.requestIdleCallback || (cb => setTimeout(cb, 50)))(() => {
      import('../lib/animate.js')
        .then(mod => { Animate = mod.Animate; })
        .catch(err => console.error('Error loading animate module:', err))

      import('../lib/ads/adHandler.js')
        .then(adMod => {
        AdHandler = adMod.AdHandler;
        adHandler = new AdHandler(browserDetector, storageHandler, optionHandler);
        handleAd();
        })
        .catch(err => console.error('Error loading ad module:', err))
    });
    
    // Initialize resize handler
    if (!isSidePanel()) {
      const resizeHandler = new ResizeHandler(storageHandler);
      await resizeHandler.initialize(document.body, pageTitleContainer);
    }
    
    // Set up the history buttons
    setupHistoryButtons();
    
    // --- Popup-Specific Initializations --- 
    if (!isSidePanel()) {
      const profilePanel = document.getElementById('profile-management'); // We know this exists here
      const profileToggle = document.getElementById('profile-toggle');
      const profileHeader = profilePanel.querySelector('.panel-section-header');
      const profileActionsButton = document.getElementById('profile-actions');
      const domainProfileMenu = document.getElementById('domain-profile-menu');
      const exportDomainBtn = document.getElementById('export-domain-profiles');
      const importDomainBtn = document.getElementById('import-domain-profiles');
      const shareCookiesButton = document.getElementById('share-cookies');

      // Initialize profile panel state from user preferences
      await initProfilePanelState(); // Run sequentially

      // Add event listeners for toggling profile panel
      if (profileHeader) {
        profileHeader.addEventListener('click', function(e) {
          if (profileActionsButton && (e.target === profileActionsButton || profileActionsButton.contains(e.target))) {
            return;
          }
          toggleProfilePanel();
        });
      }
      if (profileToggle) {
        profileToggle.addEventListener('click', function(e) {
          e.stopPropagation();
          toggleProfilePanel();
        });
      }
      // Add event listeners for domain profile actions
      if (profileActionsButton) {
        profileActionsButton.addEventListener('click', toggleDomainActionsMenu);
      }
      if (exportDomainBtn) {
        exportDomainBtn.addEventListener('click', exportDomainProfiles);
      }
      if (importDomainBtn) {
        importDomainBtn.addEventListener('click', importDomainProfiles);
      }
      // Share cookies button event listener
      if (shareCookiesButton) {
        shareCookiesButton.addEventListener('click', handleShareCookiesClick);
      }
      // Close menu when clicking outside
      if (domainProfileMenu && profileActionsButton) {
        document.addEventListener('click', function(e) {
          if (domainProfileMenu.classList.contains('visible') && 
              e.target !== profileActionsButton && 
              !profileActionsButton.contains(e.target) && 
              e.target !== domainProfileMenu && 
              !domainProfileMenu.contains(e.target)) {
            domainProfileMenu.classList.remove('visible');
          }
        });
      }

      // Initialize profile management UI 
      initProfileManagement(); // Run sequentially
    }
    // --- End Popup-Specific Initializations ---

    // Initialize domain selector event listener (COMMON) - add only once
    if (domainSelector) { 
      domainSelector.addEventListener('change', handleDomainSelectionChange);
      
      // Initialize domain selector dropdown (defer population)
      initDomainSelector(); // Run async in background, don't await
    }

    // Initialize the notification container (common)
    notificationElement.parentElement.style.display = 'block';
    notificationElement.parentElement.style.opacity = '0';
    notificationElement.parentElement.style.pointerEvents = 'none';
    // Only show when there's an active notification
    setTimeout(() => {
      if (notificationElement.classList.contains('fadeInUp')) {
        notificationElement.parentElement.style.opacity = '1';
      }
    }, 100);

    await initWindow();

    await checkForPendingSharedCookies();
    
    /**
     * Adds event listeners for elements inside the cookie list.
     */
    function addEventListeners() {
      containerCookie.addEventListener('click', function (e) {
        // Handle click on copy options button
        if (e.target.closest('button.copy-options-button')) {
          copyOptionsButton(e);
          return;
        }

        // Handle click on delete button (in header or expando)
        const deleteBtn = e.target.closest('button.delete');
        if (deleteBtn) {
          deleteButton(e); // deleteButton handles finding the cookie
          return;
        }
        
        // Handle click on save button in header
        const headerSaveBtn = e.target.closest('.header .btns button.save');
        if (headerSaveBtn) {
          e.stopPropagation(); // Stop event bubbling
          e.preventDefault(); // Prevent default action
          
          const cookieElement = headerSaveBtn.closest('li.cookie');
          if (cookieElement) {
            const header = cookieElement.querySelector('.header');
            
            // Only process the save if the cookie is already expanded
            if (!header.classList.contains('active')) {
              // Prevent any action when cookie is collapsed
              return false; // Return false to ensure no further propagation
            }
            
            // Find and process the form
            const form = cookieElement.querySelector('form');
            if (form) {
              saveCookieForm(form);
            }
          }
          return false; // Return false to ensure no further propagation
        }

        // --- BEGIN ADDITION: Listener for SAVE button in expando ---
        const saveBtn = e.target.closest('.expando .action-btns button.save');
        if (saveBtn) {
          // Find the form associated with this save button
          e.stopPropagation(); // Stop event bubbling
          e.preventDefault(); // Prevent default action
          
          const expando = saveBtn.closest('.expando');
          if (expando) {
            const form = expando.querySelector('form');
            if (form) {
              saveCookieForm(form);
            }
          }
          return false; // Return false to ensure no further propagation
        }
        // --- END ADDITION ---

        // Handle click on cookie header (expand/collapse)
        // Ensure click wasn't on a button inside the header
        if (e.target.closest('.header') && !e.target.closest('.header .btns button')) {
          expandCookie(e);
          return;
        }
      });

      // --- BEGIN REMOVAL: General submit listener ---
      // containerCookie.addEventListener('submit', (e) => {
      //   e.preventDefault();
      //   const form = e.target;
      //   if (form.classList.contains('create')) {
      //     document.getElementById('button-bar-add').classList.remove('active');
      //     document.getElementById('button-bar-default').classList.add('active');
      //   }
      //   saveCookieForm(form);
      //   return false;
      // });
      // --- END REMOVAL ---
    }

    /**
     * Expands the HTML cookie element.
     * @param {element} e Element to expand.
     */
    function expandCookie(e) {
      // Extra safety check - don't expand if target is or is inside a button
      if (e.target.closest('button')) {
        return;
      }
      
      // Don't expand if we're clicking in the checkbox area during selection mode
      if (e.target.closest('.cookie-checkbox-container') || 
          e.target.classList.contains('cookie-checkbox')) {
        return;
      }
      
      const parent = e.target.closest('li');
      const header = parent.querySelector('.header');
      const expando = parent.querySelector('.expando');

      // Check if we have any animation timeouts on this element and clear them
      if (expando._toggleSlideTimeout) {
        clearTimeout(expando._toggleSlideTimeout);
      }

      Animate.toggleSlide(expando);
      header.classList.toggle('active');
      header.ariaExpanded = header.classList.contains('active');
      expando.ariaHidden = !header.classList.contains('active');
    }

    /**
     * Handles clicks on the delete button of a cookie.
     * @param {Element} e Delete button element.
     * @return {false} returns false to prevent click event propagation.
     */
    function deleteButton(e) {
      e.preventDefault();
      
      const listElement = e.target.closest('li');
      if (!listElement) {
        console.error('Could not find parent li element for delete button');
        sendNotification('Error finding cookie to delete', true);
        return false;
      }
      
      const cookieName = listElement.dataset.name;
      const cookieId = listElement.dataset.cookieId;
      
      if (!cookieName) {
        console.error('Cookie element is missing name data attribute');
        sendNotification('Error identifying cookie to delete', true);
        return false;
      }
      
      // Check for batch deletion bypass flag
      if (window.bypassDeleteConfirmation === true) {
        // Delete immediately without confirmation - used for batch deletions
        removeCookie({cookieId: cookieId, name: cookieName}, null, (result) => {
          if (!result) {
            console.warn(`Potential issues deleting cookie: ${cookieName}`);
          }
        });
        return false;
      }
      
      // Check if we should show the confirmation
      if (showDeleteConfirmation) {
        showDeleteConfirmationDialog(cookieName, cookieId);
      } else {
        // Delete immediately if confirmations are disabled
        // Pass the cookieId to ensure exact cookie deletion
        removeCookie({cookieId: cookieId, name: cookieName}, null, (result) => {
          if (!result) {
            console.warn(`Potential issues deleting cookie: ${cookieName}`);
          }
        });
      }
      
      return false;
    }

    /**
     * Shows the delete confirmation dialog
     * @param {string} cookieName Name of the cookie to delete
     * @param {string} cookieId ID of the cookie to delete
     */
    function showDeleteConfirmationDialog(cookieName, cookieId) {
      // Store the cookie data for use when confirmed
      activeDeleteCookieName = {
        name: cookieName,
        cookieId: cookieId
      };
      
      // Check if template exists
      const templateEl = document.getElementById('tmp-confirm-delete');
      if (!templateEl) {
        console.error("Delete confirmation template not found in the DOM!");
        sendNotification("Error showing delete confirmation", true);
        // Fall back to immediate deletion
        removeCookie(activeDeleteCookieName);
        return;
      }
      
      // Create the dialog from template
      const template = document.importNode(
        templateEl.content,
        true
      );
      const dialog = template.querySelector('#confirm-delete-dialog');
      document.body.appendChild(dialog);
      
      // Set up event listeners
      const cancelButton = dialog.querySelector('#cancel-delete');
      const confirmButton = dialog.querySelector('#confirm-delete');
      const closeXButton = dialog.querySelector('#cancel-delete-x');
      const dontShowAgainCheckbox = dialog.querySelector('#dont-show-again');
      
      cancelButton.addEventListener('click', () => {
        closeDeleteConfirmationDialog();
      });
      
      closeXButton.addEventListener('click', () => {
        closeDeleteConfirmationDialog();
      });
      
      confirmButton.addEventListener('click', async () => {
        // Update the setting if checkbox is checked
        if (dontShowAgainCheckbox.checked) {
          showDeleteConfirmation = false;
          // Save this preference to storage
          await storageHandler.setLocal('showDeleteConfirmation', false);
        }
        
        // Delete the cookie with error handling
        removeCookie(activeDeleteCookieName, null, (result) => {
          if (!result) {
            console.warn(`Potential issues deleting cookie: ${typeof activeDeleteCookieName === 'object' ? activeDeleteCookieName.name : activeDeleteCookieName}`);
          }
        });
        
        // Close the dialog
        closeDeleteConfirmationDialog();
      });
      
      // Close on ESC key
      document.addEventListener('keydown', handleDialogEscapeKey);
      
      // Show the dialog with animation
      setTimeout(() => {
        dialog.classList.add('visible');
      }, 10);
    }
    
    /**
     * Closes the delete confirmation dialog
     */
    function closeDeleteConfirmationDialog() {
      const dialog = document.getElementById('confirm-delete-dialog');
      if (dialog) {
        // Remove event listener
        document.removeEventListener('keydown', handleDialogEscapeKey);
        
        // Remove the dialog with animation
        dialog.classList.remove('visible');
        setTimeout(() => {
          if (dialog.parentNode) {
            dialog.parentNode.removeChild(dialog);
          }
        }, 300);
      }
    }
    
    /**
     * Handles escape key press to close dialogs
     * @param {KeyboardEvent} e Keyboard event
     */
    function handleDialogEscapeKey(e) {
      if (e.key === 'Escape') {
        // Check if each dialog exists before trying to close it
        if (document.getElementById('confirm-delete-dialog')) {
          closeDeleteConfirmationDialog();
        }
        
        if (document.getElementById('confirm-delete-all-dialog')) {
          closeDeleteAllConfirmationDialog();
        }
        
        // Check for import dialogs - removed since they handle their own Escape key events
        
        // Close any open copy menus
        closeCopyOptionsMenu();
      }
    }
    
    /**
     * Handles clicks on the copy options button for a cookie.
     * Toggles the copy menu, sets up copy actions, and manages closing.
     */
    function copyOptionsButton(e) {
      e.stopPropagation(); // Prevent event bubbling
      const button = e.target.closest('button.copy-options-button');
      const cookieElement = button.closest('.cookie');
      const cookieId = cookieElement ? cookieElement.dataset.cookieId : null;
      const cookieObj = cookieId ? loadedCookies[cookieId] : null;

      if (!cookieElement || !cookieObj) {
        console.error('Could not find cookie element or object for copy action.');
        return;
      }

      const menu = cookieElement.querySelector('.copy-options-menu');
      if (!menu) {
        console.error('Could not find copy options menu element.');
        return;
      }

      const isVisible = menu.style.display === 'block';

      // Always close any currently active menu first
      closeCopyOptionsMenu();
      
      if (!isVisible) {
        // Show the menu
        menu.style.display = 'block';
        activeCopyMenu = menu; // Set this menu as active

        // --- Add listeners for copy actions inside THIS specific menu ---
        const copyNameBtn = menu.querySelector('.copy-name');
        const copyValueBtn = menu.querySelector('.copy-value');
        const copyJsonBtn = menu.querySelector('.copy-cookie');

        const copyNameHandler = async (e) => {
          e.stopPropagation();
          // Get the cookie directly from the object we already found
          const cookieName = cookieObj?.cookie?.name;
          
          //console.log('Attempting to copy cookie name:', cookieName);
          
          if (cookieName !== undefined && cookieName !== null) {
            const success = await copyText(cookieName);
            if (success) {
              sendNotification('Copied cookie name to clipboard', false);
              if (cookieObj && typeof cookieObj.showSuccessAnimationOnButton === 'function') {
                cookieObj.showSuccessAnimationOnButton('button.copy-options-button');
              }
            } else {
              sendNotification('Failed to copy cookie name', true);
            }
          } else {
            sendNotification('Failed to copy: cookie name is empty', true);
          }
          closeCopyOptionsMenu();
        };

        const copyValueHandler = async (e) => {
          e.stopPropagation();
          // Get the cookie directly from the object we already found
          const cookieValue = cookieObj?.cookie?.value;
          
          //console.log('Attempting to copy cookie value:', cookieValue);
          
          if (cookieValue !== undefined && cookieValue !== null) {
            const success = await copyText(cookieValue);
            if (success) {
              sendNotification('Copied cookie value to clipboard', false);
              if (cookieObj && typeof cookieObj.showSuccessAnimationOnButton === 'function') {
                cookieObj.showSuccessAnimationOnButton('button.copy-options-button');
              }
            } else {
              sendNotification('Failed to copy cookie value', true);
            }
          } else {
            sendNotification('Failed to copy: cookie value is empty', true);
          }
          closeCopyOptionsMenu();
        };

        const copyJsonHandler = async (e) => {
          e.stopPropagation();
          // Get the cookie directly from the object we already found
          const cookie = cookieObj?.cookie;
          
          if (cookie) {
            //console.log('Attempting to copy whole cookie:', cookie);
            const json = JSON.stringify(cookie, null, 2);
            const success = await copyText(json);
            if (success) {
              sendNotification('Copied whole cookie (JSON) to clipboard', false);
              if (cookieObj && typeof cookieObj.showSuccessAnimationOnButton === 'function') {
                cookieObj.showSuccessAnimationOnButton('button.copy-options-button');
              }
            } else {
              sendNotification('Failed to copy cookie JSON', true);
            }
          } else {
            sendNotification('Failed to copy: cookie object is empty', true);
          }
          closeCopyOptionsMenu();
        };

        // Remove any existing listeners first to prevent duplicates
        if (copyNameBtn) {
          copyNameBtn.removeEventListener('click', copyNameBtn._copyHandler);
          copyNameBtn._copyHandler = copyNameHandler;
          copyNameBtn.addEventListener('click', copyNameHandler);
        }
        
        if (copyValueBtn) {
          copyValueBtn.removeEventListener('click', copyValueBtn._copyHandler);
          copyValueBtn._copyHandler = copyValueHandler;
          copyValueBtn.addEventListener('click', copyValueHandler);
        }
        
        if (copyJsonBtn) {
          copyJsonBtn.removeEventListener('click', copyJsonBtn._copyHandler);
          copyJsonBtn._copyHandler = copyJsonHandler;
          copyJsonBtn.addEventListener('click', copyJsonHandler);
        }

        // Add listener to close when clicking outside
      document.addEventListener('click', handleClickOutside);
      }
    }
    
    /**
     * Closes the currently active copy options menu, if any.
     */
    function closeCopyOptionsMenu() {
      if (activeCopyMenu) {
        activeCopyMenu.style.display = 'none';
        // Remove the generic outside click listener when closing
        document.removeEventListener('click', handleClickOutside);
          activeCopyMenu = null;
      }
    }
    
    /**
     * Handles clicks outside the active copy menu to close it.
     */
    function handleClickOutside(e) {
      if (activeCopyMenu) {
        // Find the button associated with the active menu
        const parentCookie = activeCopyMenu.closest('.cookie');
        const toggleButton = parentCookie ? parentCookie.querySelector('button.copy-options-button') : null;

        // Close if the click is outside the menu AND outside its toggle button
        if (!activeCopyMenu.contains(e.target) && (!toggleButton || !toggleButton.contains(e.target))) {
        closeCopyOptionsMenu();
        }
      }
    }

    /**
     * Handles saving a cookie from a form.
     * @param {element} form Form element that contains the cookie fields.
     * @return {false} returns false to prevent click event propagation.
     */
    function saveCookieForm(form) {
      const isCreateForm = form.classList.contains('create');

      // Find the parent LI element
      const liElement = form.closest('li.cookie');

      const id = form.dataset.id;
      const name = form.querySelector('input[name="name"]').value;
      const value = form.querySelector('textarea[name="value"]').value;

      let domain;
      let path;
      let pathOption = 'default'; // Default option is root path
      let expiration;
      let sameSite;
      let hostOnly;
      let session;
      let secure;
      let httpOnly;

      if (!isCreateForm) {
        domain = form.querySelector('input[name="domain"]').value;
        path = form.querySelector('input[name="path"]').value;
        
        // Path option is always 'custom' for edit form since we removed the radio buttons
        pathOption = 'custom';
        
        expiration = form.querySelector('input[name="expiration"]').value;
        sameSite = form.querySelector('select[name="sameSite"]').value;
        hostOnly = form.querySelector('input[name="hostOnly"]').checked;
        session = form.querySelector('input[name="session"]').checked;
        secure = form.querySelector('input[name="secure"]').checked;
        httpOnly = form.querySelector('input[name="httpOnly"]').checked;
      } else {
        // For the create form, check if custom path is enabled
        const customPathToggle = form.querySelector('#custom-path-toggle');
        path = form.querySelector('input[name="path"]')?.value || '/';
        
        if (customPathToggle && customPathToggle.checked) {
          // If custom path is enabled, get the path option from radio buttons
          const pathDefaultRadio = form.querySelector('input[name="pathOption"][value="default"]');
          const pathCurrentRadio = form.querySelector('input[name="pathOption"][value="current"]');
          const pathCustomRadio = form.querySelector('input[name="pathOption"][value="custom"]');
          
          if (pathDefaultRadio && pathDefaultRadio.checked) {
            pathOption = 'default';
          } else if (pathCurrentRadio && pathCurrentRadio.checked) {
            pathOption = 'current';
          } else if (pathCustomRadio && pathCustomRadio.checked) {
            pathOption = 'custom';
          }
        } else {
          // If custom path is not enabled, always use default (root) path
          pathOption = 'default';
          path = '/';
        }
      }
      
      saveCookie(
        id,
        name,
        value,
        domain,
        path,
        pathOption,
        expiration,
        sameSite,
        hostOnly,
        session,
        secure,
        httpOnly,
        null, // Placeholder for onComplete callback if needed later
        liElement // Pass the LI element reference
      );

      if (form.classList.contains('create')) {
        // Update the button bar UI
        document.getElementById('button-bar-add').classList.remove('active');
        document.getElementById('button-bar-default').classList.add('active');
        
        // Get the stored domain from the form if available
        const formStoredDomain = form.dataset && form.dataset.domain;
        
        // Use stored domain if available, fallback to global selectedDomain
        const domainToUse = formStoredDomain || selectedDomain;
        
        // Use the domain to determine which view to refresh
        if (domainToUse) {
          // Ensure the domain selector is synchronized
          if (domainSelector && domainToUse !== domainSelector.value) {
            domainSelector.value = domainToUse;
            selectedDomain = domainToUse;
          }
          
          showCookiesForSelectedDomain(true);
        } else {
          showCookiesForTab();
        }
      }

      return false;
    }

    /**
     * Creates or saves changes to a cookie.
     * @param {string} id HTML ID assigned to the cookie.
     * @param {string} name Name of the cookie.
     * @param {string} value Value of the cookie.
     * @param {string} domain
     * @param {string} path
     * @param {string} pathOption 'default', 'current', or 'custom'
     * @param {string} expiration
     * @param {string} sameSite
     * @param {boolean} hostOnly
     * @param {boolean} session
     * @param {boolean} secure
     * @param {boolean} httpOnly
     * @param {function} [onComplete] Optional callback function(error, savedCookie)
     * @param {Element} [liElement] Optional reference to the cookie's LI element
     */
    function saveCookie(
      id,
      name,
      value,
      domain,
      path,
      pathOption,
      expiration,
      sameSite,
      hostOnly,
      session,
      secure,
      httpOnly,
      onComplete,
      liElement
    ) {
      const cookieContainer = loadedCookies[id];
      let cookie = cookieContainer ? cookieContainer.cookie : null;
      let oldName;
      let oldHostOnly;
      
      // Store the original cookie for history tracking (deep clone to avoid reference issues)
      const originalCookie = cookie ? JSON.parse(JSON.stringify(cookie)) : null;

      if (cookie) {
        oldName = cookie.name;
        oldHostOnly = cookie.hostOnly;
      } else {
        cookie = {};
        oldName = name;
        oldHostOnly = hostOnly;
        
        // For new cookies, set default values based on current tab
        if (domain === undefined) {
          const url = new URL(getCurrentTabUrl());
          if (url && url.hostname) {
            domain = url.hostname;
            cookie.domain = domain;
          }
        }
        
        // Handle path based on pathOption
        if (pathOption === 'default' || pathOption === undefined) {
          // Default to root path
          cookie.path = '/';
        } else if (pathOption === 'current') {
          // Use current URL path
          const url = new URL(getCurrentTabUrl());
          if (url && url.pathname) {
            cookie.path = url.pathname;
          } else {
            cookie.path = '/';
          }
        } else if (pathOption === 'custom') {
          // Use custom path if provided, otherwise default to root
          cookie.path = path || '/';
        }
        
        // Set some sensible defaults for new cookies
        if (sameSite === undefined) {
          cookie.sameSite = 'lax';
        }
        
        if (session === undefined) {
          cookie.session = true;
        }
        
        if (secure === undefined) {
          // Set secure automatically for HTTPS sites
          const url = new URL(getCurrentTabUrl());
          cookie.secure = (url.protocol === 'https:');
        }
        
        if (httpOnly === undefined) {
          cookie.httpOnly = false;
        }
      }

      cookie.name = name;
      cookie.value = value;

      if (domain !== undefined) {
        cookie.domain = domain;
      }
      
      // For existing cookies being edited, apply path based on pathOption
      if (cookie.id) { // This is an existing cookie
        if (path !== undefined) {
          cookie.path = path;
        }
      } else if (path !== undefined && pathOption === 'custom') {
        // For new cookies with custom path
        cookie.path = path;
      }
      
      if (sameSite !== undefined) {
        cookie.sameSite = sameSite;
      }
      if (hostOnly !== undefined) {
        cookie.hostOnly = hostOnly;
      }
      if (session !== undefined) {
        cookie.session = session;
      }
      if (secure !== undefined) {
        cookie.secure = secure;
      } else if (!cookie) { // Only set default for new cookies
        // Default 'secure' based on the *target* URL protocol
        const targetUrl = getCurrentTabUrl(); // This will now correctly use https for selected domains
        try {
          const urlObj = new URL(targetUrl);
          cookie.secure = urlObj.protocol === 'https:';
        } catch (e) {
          cookie.secure = false; // Default to false if URL parsing fails
        }
      }
      if (httpOnly !== undefined) {
        cookie.httpOnly = httpOnly;
      }

      if (cookie.session) {
        cookie.expirationDate = null;
      } else {
        cookie.expirationDate = new Date(expiration).getTime() / 1000;
      }

      const urlToUse = getCurrentTabUrl();
      
      // Get a deep copy of the final cookie state to record in history
      const newCookieState = JSON.parse(JSON.stringify(cookie));

      // Using promise approach for better flow control
      function performSave() {
        return new Promise((resolve, reject) => {
          // We need the original path from the cookie to check if it changed
          const oldPath = originalCookie ? originalCookie.path : null;
          const newPath = cookie.path;
          const pathChanged = oldPath && newPath && oldPath !== newPath;
          
          // Check if the name has changed or the path has changed
          if (oldName !== name || pathChanged) {
            // Either name or path has changed - we need to delete the old cookie first
            
            // Ensure we're using the original cookie's path in the URL when removing
            let urlWithPath = urlToUse;
            if (originalCookie && originalCookie.path) {
              try {
                const oldPath = originalCookie.path;
                const urlObj = new URL(urlToUse);
                urlWithPath = `${urlObj.protocol}//${urlObj.host}${oldPath}`;
              } catch (e) {
                console.error('Error building URL with path for cookie deletion:', e);
              }
            }
            
            cookieHandler.removeCookie(oldName, urlWithPath, () => {
              // After deleting old cookie, save the new one
              cookieHandler.saveCookie(cookie, urlToUse, (error, savedCookie) => {
              if (error) {
                  reject(error);
                  return;
                }
                
                // Clear to refresh on next load
                cookieCache.clear();
                
                // Record this operation in history
                if (originalCookie) {
                  // This is an edit of an existing cookie
                  historyHandler.recordOperation('edit', originalCookie, newCookieState, urlToUse);
                  } else {
                  // This is a new cookie creation
                  historyHandler.recordOperation('create', null, newCookieState, urlToUse);
                }
                updateHistoryButtons();
                
                resolve(savedCookie);
              });
        });
      } else {
            // No name or path change, just save the cookie
            cookieHandler.saveCookie(cookie, urlToUse, (error, savedCookie) => {
            if (error) {
                reject(error);
                return;
              }
              
              // Clear to refresh on next load
              cookieCache.clear();
              
              // Record this operation in history
              if (originalCookie) {
                // This is an edit of an existing cookie
                historyHandler.recordOperation('edit', originalCookie, newCookieState, urlToUse);
            } else {
                // This is a new cookie creation
                historyHandler.recordOperation('create', null, newCookieState, urlToUse);
              }
              updateHistoryButtons();
              
              resolve(savedCookie);
            });
          }
        });
      }

      performSave()
        .then(savedCookie => {
          // If saving was successful and this is for an existing cookie
          if (cookieContainer) {
            // Update the existing cookie with the saved cookie
            cookieContainer.cookie = savedCookie;
            
            // If we have the HTML element, update it directly
            if (liElement) {
              cookieContainer.updateHtml(savedCookie, liElement);
              cookieContainer.showSuccessAnimation(liElement);
              // Add call to showSaveConfirmation
              cookieContainer.showSaveConfirmation();
            } else {
              // Otherwise find the element by ID
              const element = document.getElementById(id);
              if (element) {
                cookieContainer.updateHtml(savedCookie, element);
                cookieContainer.showSuccessAnimation(element);
                // Add call to showSaveConfirmation
                cookieContainer.showSaveConfirmation();
              }
            }
            
            // Inform the user of success
            sendNotification('Cookie saved successfully.', false);
            
            // Call the onComplete callback if provided
            if (onComplete) {
              onComplete(null, savedCookie);
            }
      } else {
            // This is a new cookie
            sendNotification('Cookie created successfully.', false);
            
            if (onComplete) {
              onComplete(null, savedCookie);
            }
            
            // Add the new cookie to loadedCookies if it wasn't added elsewhere
            if (savedCookie && savedCookie.name === name) {
              const cookieId = Cookie.hashCode(savedCookie);
              if (!loadedCookies[cookieId]) {
                loadedCookies[cookieId] = new Cookie(cookieId, savedCookie, optionHandler);
                //console.log(`Added new cookie to loadedCookies: ${name}`);
              }
            }
          }
          
          // Check if cookies have been modified
          setTimeout(() => {
            checkIfCookiesModified();
          }, 50); // Small delay to ensure all other operations completed
        })
        .catch(error => {
          console.error('Error saving cookie:', error);
          sendNotification('Failed to save cookie: ' + error, true);
          if (onComplete) {
            onComplete(error, null);
          }
        });
    }

    document.getElementById('create-cookie').addEventListener('click', () => {
      // Check both flags to prevent running during ANY transition
      if (disableButtons || isAnimating) { 
        return;
      }
      
      // Disable interaction during animation
      disableButtons = true;
      
      // Create the form outside the animation
      const newForm = createHtmlFormCookie();
      
      // Store the current selected domain to restore it later
      const currentSelectedDomain = selectedDomain;
      
      // Immediately modify UI state to prevent flickering
      document.getElementById('button-bar-default').classList.remove('active');
      document.getElementById('button-bar-add').classList.add('active');
      
      // Store domain data for form submission
      if (newForm.dataset) {
        newForm.dataset.domain = currentSelectedDomain;
      }
      
      // First pause any active CSS transitions
      document.body.classList.add('notransition');
      
      // Force a reflow to apply the notransition class
      void document.body.offsetHeight;
      
      // If there's a pending cookie change refresh, clear it to prevent
      // the add cookie form from being replaced by the cookie list
      if (cookieChangeTimeout !== null) {
        clearTimeout(cookieChangeTimeout);
        cookieChangeTimeout = null;
        //console.log('[create-cookie] Cleared pending cookie refresh to prevent UI flickering');
      }
      
      // Prepare for animation with a short delay
      setTimeout(() => {
        // Re-enable transitions just before animation starts
        document.body.classList.remove('notransition');
        
        // Start the page transition animation
        Animate.transitionPage(
          containerCookie,
          containerCookie.firstChild,
          newForm,
          'left',
          () => {
            // Re-enable buttons after animation completes
            disableButtons = false;
            
            // Focus the name field after transition completes
            const nameField = document.getElementById('name-create');
            if (nameField) nameField.focus();
            
            // Setup custom path checkbox and path options
            const pathOptions = document.querySelector('.path-options');
            const pathInput = document.querySelector('.input-path');
            const customPathToggle = document.getElementById('custom-path-toggle');
            const defaultRadio = document.querySelector('.input-path-default');
            const currentRadio = document.querySelector('.input-path-current');
            const customRadio = document.querySelector('.input-path-custom');
            
            if (pathInput && customPathToggle && defaultRadio && currentRadio && customRadio) {
              // Set default state - path is "/"
              pathInput.value = "/";
              defaultRadio.checked = true;
              
              // Add event listener for the custom path checkbox
              customPathToggle.addEventListener('change', () => {
                if (customPathToggle.checked) {
                  pathOptions.style.display = 'block';
                  
                  // Update the path input value based on the selected radio button
                  if (defaultRadio.checked) {
                    pathInput.value = "/";
                    pathInput.disabled = true;
                  } else if (currentRadio.checked) {
                    const url = new URL(getCurrentTabUrl());
                    pathInput.value = url.pathname || "/";
                    pathInput.disabled = true;
                  } else if (customRadio.checked) {
                    pathInput.value = "";
                    pathInput.disabled = false;
                    pathInput.focus();
                  }
                } else {
                  pathOptions.style.display = 'none';
                }
              });
              
              // Add event listeners for radio buttons
              defaultRadio.addEventListener('change', () => {
                if (defaultRadio.checked) {
                  pathInput.value = "/";
                  pathInput.disabled = true;
                }
              });
              
              currentRadio.addEventListener('change', () => {
                if (currentRadio.checked) {
                  const url = new URL(getCurrentTabUrl());
                  pathInput.value = url.pathname || "/";
                  pathInput.disabled = true;
                }
              });
              
              customRadio.addEventListener('change', () => {
                if (customRadio.checked) {
                  pathInput.value = "";
                  pathInput.disabled = false;
                  pathInput.focus();
                }
              });
            }
          },
          optionHandler.getAnimationsEnabled(),
        );
      }, 30);
      
      return false;
    });

    document
      .getElementById('delete-all-cookies')
      .addEventListener('click', async () => {
        const buttonIcon = document
          .getElementById('delete-all-cookies')
          .querySelector('use');
        if (buttonIcon.getAttribute('href') === '../sprites/solid.svg#check') {
          return;
        }
        
        if (loadedCookies && Object.keys(loadedCookies).length) {
          // Check if we should show the confirmation dialog
          if (showDeleteAllConfirmation) {
            showDeleteAllConfirmationDialog();
          } else {
            // Delete immediately if confirmation is disabled
            await deleteAllCookiesInCurrentView();
          }
        }
      });
      
    /**
     * Shows the confirmation dialog for deleting all cookies
     */
    function showDeleteAllConfirmationDialog() {
      // Create the dialog from template
      const template = document.importNode(
        document.getElementById('tmp-confirm-delete-all').content,
        true
      );
      const dialog = template.querySelector('#confirm-delete-all-dialog');
      document.body.appendChild(dialog);
      
      // Set up event listeners
      const cancelButton = dialog.querySelector('#cancel-delete-all');
      const confirmButton = dialog.querySelector('#confirm-delete-all');
      const closeXButton = dialog.querySelector('#cancel-delete-all-x');
      const dontShowAgainCheckbox = dialog.querySelector('#dont-show-again-all');
      
      cancelButton.addEventListener('click', () => {
        closeDeleteAllConfirmationDialog();
      });
      
      closeXButton.addEventListener('click', () => {
        closeDeleteAllConfirmationDialog();
      });
      
      confirmButton.addEventListener('click', async () => {
        // Update the setting if checkbox is checked
        if (dontShowAgainCheckbox.checked) {
          showDeleteAllConfirmation = false;
          // Save this preference to storage
          await storageHandler.setLocal('showDeleteAllConfirmation', false);
        }
        
        // Delete all cookies
        await deleteAllCookiesInCurrentView();
        
        // Close the dialog
        closeDeleteAllConfirmationDialog();
      });
      
      // Close on ESC key (already handled by handleDialogEscapeKey)
      document.addEventListener('keydown', handleDialogEscapeKey);
      
      // Show the dialog with animation
      setTimeout(() => {
        dialog.classList.add('visible');
      }, 10);
    }
    
    /**
     * Closes the delete all confirmation dialog
     */
    function closeDeleteAllConfirmationDialog() {
      const dialog = document.getElementById('confirm-delete-all-dialog');
      if (dialog) {
        // Remove event listener
        document.removeEventListener('keydown', handleDialogEscapeKey);
        
        // Remove the dialog with animation
        dialog.classList.remove('visible');
        setTimeout(() => {
          if (dialog.parentNode) {
            dialog.parentNode.removeChild(dialog);
          }
        }, 300);
      }
    }
    
    /**
     * Deletes all cookies currently displayed in the view
     */
    async function deleteAllCookiesInCurrentView() {
      const buttonIcon = document
        .getElementById('delete-all-cookies')
        .querySelector('use');
        
      // Store all cookies for history tracking before removal
      const cookiesToDeleteDetails = [];
      const originalCookiesForHistory = [];
      const currentBaseUrl = getCurrentTabUrl(); // Get base URL once

      for (const cookieId in loadedCookies) {
        if (Object.prototype.hasOwnProperty.call(loadedCookies, cookieId)) {
          const cookieData = loadedCookies[cookieId].cookie;
          // Store full original data for history
          originalCookiesForHistory.push(JSON.parse(JSON.stringify(cookieData)));

          // Store details needed for direct deletion
          const detail = {
            name: cookieData.name,
            domain: cookieData.domain,
            path: cookieData.path || '/',
            storeId: cookieData.storeId
          };

          // Construct specific URL for this cookie's deletion
          let urlForDelete = currentBaseUrl;
          try {
            const cleanDomain = detail.domain && detail.domain.startsWith('.') ? detail.domain.substring(1) : detail.domain;
            const urlObj = new URL(currentBaseUrl);
            if (cleanDomain) {
              urlForDelete = `${urlObj.protocol}//${cleanDomain}${detail.path}`;
            } else {
              urlForDelete = `${urlObj.protocol}//${urlObj.host}${detail.path}`;
            }
          } catch (e) {
            console.error('Error building URL for bulk delete:', e);
            // Fallback URL construction
            if (detail.domain) {
              const cleanDomain = detail.domain.startsWith('.') ? detail.domain.substring(1) : detail.domain;
              urlForDelete = `https://${cleanDomain}${detail.path}`;
            } else {
              urlForDelete = currentBaseUrl;
            }
          }
          detail.url = urlForDelete; // Add the constructed URL to the details
          cookiesToDeleteDetails.push(detail);
        }
      }
        
      // Create an array of promises for cookie removal
      const removalPromises = [];
      for (const detail of cookiesToDeleteDetails) {
          removalPromises.push(
            new Promise((resolve) => {
            // Call cookieHandler.removeCookie directly, bypassing the wrapper
            cookieHandler.removeCookie(detail.name, detail.url, detail.storeId, (result) => {
              if (!result) {
                console.warn(`Failed to delete cookie during bulk operation: ${detail.name} at ${detail.url}`);
              }
              resolve(); // Resolve promise even if deletion failed for one cookie
              });
            })
          );
      }
      
      // Wait for all cookies to be removed
      await Promise.all(removalPromises);
      
      // Reset loadedCookies to empty
      loadedCookies = {};
      
      // Update the search placeholder to show 0 cookies
      updateSearchPlaceholder();
      
      // Record the bulk deletion in history if we have cookies data
      if (originalCookiesForHistory.length > 0) {
        historyHandler.recordOperation('deleteAll', originalCookiesForHistory, null, currentBaseUrl);
        updateHistoryButtons();
      }
      
      // Explicitly check if cookies have been modified after bulk deletion
      // This ensures profile state is updated when deleting all cookies
      //console.log("[delete-all-cookies] All cookies deleted, updating profile state");
      await checkIfCookiesModified();
      
      // Change the button icon
      buttonIcon.setAttribute('href', '../sprites/solid.svg#check');
      
      // Refresh the cookie list
      if (selectedDomain) {
        await showCookiesForSelectedDomain();
      } else {
        await showCookiesForTab();
      }
      
      // Show notification
      sendNotification('All cookies were deleted', false);
      
      // Reset the button icon after a delay
      setTimeout(() => {
        buttonIcon.setAttribute('href', '../sprites/solid.svg#trash');
      }, 1500);
    }

    document.getElementById('export-cookies').addEventListener('click', () => {
      if (disableButtons) {
        hideExportMenu();
        return;
      }
      handleExportButtonClick();
    });

    document.getElementById('import-cookies').addEventListener('click', () => {
      // Check both flags to prevent running during ANY transition
      if (disableButtons || isAnimating) { 
        return;
      }

      // REMOVED: isAnimating = false; - This was potentially causing issues
      
      // Disable interaction during animation
      disableButtons = true;
      
      // Create the form outside the animation
      const newForm = createHtmlFormImport();
      
      // Store the current selected domain to restore it later
      const currentSelectedDomain = selectedDomain;
      
      // Immediately modify UI state to prevent flickering
      document.getElementById('button-bar-default').classList.remove('active');
      document.getElementById('button-bar-import').classList.add('active');
      
      // Store domain data for form submission
      if (newForm.dataset) {
        newForm.dataset.domain = currentSelectedDomain;
      }
      
      // First pause any active CSS transitions
      document.body.classList.add('notransition');
      
      // Force a reflow to apply the notransition class
      void document.body.offsetHeight;
      
      // If there's a pending cookie change refresh, clear it to prevent
      // the import form from being replaced by the cookie list
      if (cookieChangeTimeout !== null) {
        clearTimeout(cookieChangeTimeout);
        cookieChangeTimeout = null;
        //console.log('[import-cookies] Cleared pending cookie refresh to prevent UI flickering');
      }
      
      // Prepare for animation with a short delay
      setTimeout(() => {
        // Re-enable transitions just before animation starts
        document.body.classList.remove('notransition');
        
        // Start the page transition animation
        Animate.transitionPage(
          containerCookie,
          containerCookie.firstChild,
          newForm,
          'left',
          () => {
            // Re-enable buttons after animation completes
            disableButtons = false;
            
            // Focus the textarea after transition completes
            const contentField = document.getElementById('content-import');
            if (contentField) contentField.focus();
          },
          optionHandler.getAnimationsEnabled(),
        );
      }, 30);
      
      return false;
    });

    document.getElementById('return-list-add').addEventListener('click', () => {
      if (disableButtons) return;
      disableButtons = true;
      
      // Store button bars for reference
      const addButtonBar = document.getElementById('button-bar-add');
      const defaultButtonBar = document.getElementById('button-bar-default');
      
      // Update the button bar UI immediately for visual feedback
      addButtonBar.classList.remove('active');
      defaultButtonBar.classList.add('active');
      
      // Pause CSS transitions for the animation
      document.body.classList.add('notransition'); void document.body.offsetHeight;
      setTimeout(async () => {
        document.body.classList.remove('notransition');
        // Check permissions for current tab URL
        const currentUrl = cookieHandler.currentTab?.url;
        try {
          const hasPerm = await permissionHandler.checkPermissions(currentUrl);
          if (!hasPerm) {
            await showNoPermission();
            disableButtons = false;
            return;
          }
        } catch (error) {
          await showNoPermission();
          disableButtons = false;
          return;
        }
        
        // Use stored form domain if available
        const form = containerCookie.querySelector('form');
        const formStoredDomain = form?.dataset?.domain;
        
        if (formStoredDomain) {
          if (domainSelector && formStoredDomain !== domainSelector.value) {
            domainSelector.value = formStoredDomain;
            selectedDomain = formStoredDomain;
          }
          
          // Ensure the UI state is consistent
          showCookiesForSelectedDomain(true)
            .finally(() => { 
              disableButtons = false;
              
              // Double-check UI state after animation completes
              addButtonBar.classList.remove('active');
              defaultButtonBar.classList.add('active');
            });
        } else {
          showCookiesForTab(true)
            .finally(() => { 
              disableButtons = false;
              
              // Double-check UI state after animation completes
              addButtonBar.classList.remove('active');
              defaultButtonBar.classList.add('active');
            });
        }
      }, 30);
    });
    
    document
      .getElementById('return-list-import')
      .addEventListener('click', () => {
        if (disableButtons) return;
        disableButtons = true;
        
        // Store button bars for reference
        const importButtonBar = document.getElementById('button-bar-import');
        const defaultButtonBar = document.getElementById('button-bar-default');
        
        // Update the button bar UI immediately for visual feedback
        importButtonBar.classList.remove('active');
        defaultButtonBar.classList.add('active');
        
        // Pause CSS transitions for the animation
        document.body.classList.add('notransition'); void document.body.offsetHeight;
        setTimeout(() => {
          document.body.classList.remove('notransition');
          
          // Use stored form domain if available
          const form = containerCookie.querySelector('form');
          const formStoredDomain = form?.dataset?.domain;
          
          if (formStoredDomain) {
            if (domainSelector && formStoredDomain !== domainSelector.value) {
              domainSelector.value = formStoredDomain;
              selectedDomain = formStoredDomain;
            }
            
            // Ensure the UI state is consistent
            showCookiesForSelectedDomain(true)
              .finally(() => { 
                disableButtons = false;
                
                // Double-check UI state after animation completes
                importButtonBar.classList.remove('active');
                defaultButtonBar.classList.add('active');
              });
          } else {
            showCookiesForTab(true)
              .finally(() => { 
                disableButtons = false;
                
                // Double-check UI state after animation completes
                importButtonBar.classList.remove('active');
                defaultButtonBar.classList.add('active');
              });
          }
        }, 30);
      });

    containerCookie.addEventListener('submit', (e) => {
      e.preventDefault();
      
      // Check if this is the create form
      const form = e.target;
      if (form.classList.contains('create')) {
        // Update the button bar UI
        document.getElementById('button-bar-add').classList.remove('active');
        document.getElementById('button-bar-default').classList.add('active');
      }
      
      saveCookieForm(form);
      return false;
    });

    document
      .getElementById('save-create-cookie')
      .addEventListener('click', () => {
        const form = document.querySelector('form.create');
        if (!form) return; // Should not happen
        
        // --- Keep button bar update here for immediate visual feedback ---
        document.getElementById('button-bar-add').classList.remove('active');
        document.getElementById('button-bar-default').classList.add('active');
        // --- End button bar update ---

        // Save the cookie and trigger return navigation on completion
        saveCookieForm(form, (error, savedCookie) => {
          if (!error) {
            // Simulate clicking the return button to navigate back
            // Use a small timeout to allow the save notification to potentially display first
            setTimeout(() => {
                const returnButton = document.getElementById('return-list-add');
                if (returnButton) {
                  returnButton.click();
                } else {
                  // Fallback: If button not found, refresh manually (less ideal)
                  console.warn("Could not find #return-list-add, refreshing manually after save.");
                  const domainToUse = form.dataset?.domain || selectedDomain;
                  if (domainToUse) {
                    showCookiesForSelectedDomain(true);
                  } else {
                    showCookiesForTab(true);
                  }
                }
            }, 50); // Small delay
          } else {
             // Error is handled by saveCookie sending a notification
             // Revert button bar if save failed?
             //console.log("Save failed, keeping user on add screen.");
             document.getElementById('button-bar-add').classList.add('active');
             document.getElementById('button-bar-default').classList.remove('active');
          }
        });
      });

    document
      .getElementById('save-import-cookie')
      .addEventListener('click', (e) => {
        const buttonIcon = document
          .getElementById('save-import-cookie')
          .querySelector('use');
        if (
          buttonIcon.getAttribute('href') !== '../sprites/solid.svg#file-import'
        ) {
          return;
        }

        const json = document.querySelector('textarea').value;
        // ADDED: Check if import field is empty or whitespace
        if (!json || !json.trim()) {
          sendNotification('Import field is empty.', true);
          // Reset button icon if needed (though it shouldn't have changed)
          if (buttonIcon.getAttribute('href') !== '../sprites/solid.svg#file-import') {
              buttonIcon.setAttribute('href', '../sprites/solid.svg#file-import');
          }
          return;
        }
        
        // Get the form to retrieve the stored domain
        const form = document.querySelector('form.import');
        const formStoredDomain = form && form.dataset && form.dataset.domain;
        
        // Use stored domain if available, fallback to current selected domain
        const domainToUse = formStoredDomain || selectedDomain;
        
        // Ensure the domain selector is synchronized
        if (domainSelector && domainToUse && domainToUse !== domainSelector.value) {
          domainSelector.value = domainToUse;
          selectedDomain = domainToUse;
          currentDomain = domainToUse;
        }
        
        let cookies;
        try {
          cookies = JsonFormat.parse(json);
        } catch (error) {
          
          try {
            cookies = HeaderstringFormat.parse(json);
          } catch (error) {
            
            try {
              cookies = NetscapeFormat.parse(json);
            } catch (error) {
              console.error('Import error:', error);
              // IMPROVED: Give a more specific error message mentioning formats
              sendNotification('Failed to parse import text. Use JSON, Netscape, or HeaderString format.', true);
              // Reset button icon
              buttonIcon.setAttribute('href', '../sprites/solid.svg#file-import');
              return;
            }
          }
        }
        
        // ADDED: Ensure 'cookies' is an array before iterating
        if (!Array.isArray(cookies)) {
            // If it's a single valid cookie object, wrap it in an array
            if (cookies && typeof cookies === 'object' && cookies.name && cookies.value !== undefined) { // Check for name and value presence
                 //console.log("Import detected single cookie object, wrapping in array.");
                 cookies = [cookies];
            } else {
                // If it's not an array and not a recognizable single cookie object, it's an invalid format
                console.error("Parsed import data is not an array or a valid single cookie object:", cookies);
                sendNotification('Imported data is not in a valid format (expected array of cookies).', true);
                buttonIcon.setAttribute('href', '../sprites/solid.svg#file-import'); // Reset icon
                return; // Stop processing
          }
        }
        
        buttonIcon.setAttribute('href', '../sprites/solid.svg#check');
        
        // Get URL to use for cookie import
        const urlToUse = domainToUse ? `https://${domainToUse}/` : getCurrentTabUrl();
        
        // Store the imported cookies for history tracking
        const importedCookies = [];
        
        let cookiesImported = 0;
        let cookiesTotal = cookies.length;
        let errorText = '';
        
        const updateProgress = () => {
          cookiesImported++;
          if (cookiesImported >= cookiesTotal) {
            // --- Keep button bar update here for immediate visual feedback ---
            document.getElementById('button-bar-import').classList.remove('active');
            document.getElementById('button-bar-default').classList.add('active');
            // --- End button bar update ---
            
            // Record the import operation in history
            if (importedCookies.length > 0) {
              historyHandler.recordOperation('importCookies', null, importedCookies, urlToUse);
              updateHistoryButtons();
            }
            
            // Handle any errors (just notification)
            if (errorText) {
              sendNotification(errorText, true);
            } else {
              sendNotification(`${cookiesTotal} cookie${cookiesTotal !== 1 ? 's' : ''} imported successfully.`, false);
            }
            
            // Check if cookies have been modified after the import
            setTimeout(() => {
              checkIfCookiesModified();
            }, 100);
            
            // Reset button icon after a delay
            setTimeout(() => {
              const icon = document.getElementById('save-import-cookie')?.querySelector('use');
              if (icon) {
                 icon.setAttribute('href', '../sprites/solid.svg#file-import');
              }
            }, 1500);
            
            // Simulate clicking the return button to navigate back
            // Use a small timeout to allow the import notification to potentially display first
            setTimeout(() => {
                const returnButton = document.getElementById('return-list-import');
                if (returnButton) {
                  returnButton.click();
                } else {
                  // Fallback: If button not found, refresh manually (less ideal)
                  console.warn("Could not find #return-list-import, refreshing manually after import.");
                  const currentForm = document.querySelector('form.import'); // Get form again just in case
                  const domainToUse = currentForm?.dataset?.domain || selectedDomain;
            if (domainToUse) {
              showCookiesForSelectedDomain(true);
            } else {
              showCookiesForTab(true);
            }
                }
            }, 50); // Small delay
          }
        };
        
        cookies.forEach((cookie) => {
          // Make sure we are using the right store ID. This is in case we are
          // importing from a basic store ID and the current user is using
          // custom containers
          cookie.storeId = cookieHandler.currentTab.cookieStoreId;
          
          if (cookie.sameSite && cookie.sameSite === 'unspecified') {
            cookie.sameSite = null;
          }
          
          cookieHandler.saveCookie(cookie, urlToUse, (error, savedCookie) => {
            if (error) {
              console.error('Error importing cookie:', error);
              errorText = 'Error importing one or more cookies';
            } else if (savedCookie) {
              // Add successfully imported cookie to the array for history tracking
              importedCookies.push(JSON.parse(JSON.stringify(savedCookie)));
            }
            updateProgress();
          });
        });
      });

    const mainMenuContent = document.querySelector('#main-menu-content');
    const mainMenuButton = document.querySelector('#main-menu-button');
    
    mainMenuButton.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      
      // Toggle rotation class on the button for animation effect
      if (mainMenuContent.classList.contains('visible')) {
        mainMenuButton.classList.remove('active');
        
        // Add a slight delay before hiding the menu
        setTimeout(() => {
          mainMenuContent.classList.remove('visible');
        }, 50);
      } else {
        mainMenuButton.classList.add('active');
        
        // Add a slight delay before showing the menu for a smoother effect
        setTimeout(() => {
          mainMenuContent.classList.add('visible');
          
          // Position the menu dynamically relative to the button
          const buttonRect = mainMenuButton.getBoundingClientRect();
          mainMenuContent.style.top = `${buttonRect.bottom + 8}px`;
          mainMenuContent.style.right = `${window.innerWidth - buttonRect.right}px`;
        }, 50);
      }
    });

    document.addEventListener('click', function (e) {
      // Clicks in the main menu should not dismiss it.
      if (
        mainMenuButton.contains(e.target) ||
        mainMenuContent.contains(e.target) ||
        !mainMenuContent.classList.contains('visible')
      ) {
        return;
      }
      
      // First remove the active class from the button
      mainMenuButton.classList.remove('active');
      
      // Then hide the menu with a slight delay
      setTimeout(() => {
        mainMenuContent.classList.remove('visible');
      }, 50);
    });

    document.addEventListener('click', function (e) {
      const exportMenu = document.querySelector('#export-menu');
      // Clicks in the export menu should not dismiss it.
      if (!exportMenu || exportMenu.contains(e.target)) {
        return;
      }

      const exportButton = document.querySelector('#export-cookies');
      if (!exportButton || exportButton.contains(e.target)) {
        return;
      }

      
      hideExportMenu();
    });

    document
      .querySelector('#advanced-toggle-all')
      .addEventListener('change', function (e) {
        optionHandler.setCookieAdvanced(e.target.checked);
        showCookiesForTab();
      });

    document
      .querySelector('#menu-all-options')
      .addEventListener('click', function (e) {
        const preferredPage = optionHandler.getPreferredOptionsPage();

        if (preferredPage === 'v2') {
          // Open v2 options page in a new tab
          browserDetector.getApi().tabs.create({
            url: browserDetector.getApi().runtime.getURL('interface/options/options-v2.html')
          });
        } else {
          // Open original options page as popup (default behavior)
          if (browserDetector.getApi().runtime.openOptionsPage) {
            browserDetector.getApi().runtime.openOptionsPage();
          } else {
          window.open(
            browserDetector
              .getApi()
              .runtime.getURL('interface/options/options.html'),
          );
        }
        }
      });

    notificationElement.addEventListener('animationend', (e) => {
      if (notificationElement.classList.contains('fadeInUp')) {
        return;
      }

      triggerNotification();
    });

    // Add handler for the notification dismiss button, if it exists
    const notificationDismissButton = document.getElementById('notification-dismiss');
    if (notificationDismissButton) {
      notificationDismissButton.addEventListener('click', (e) => {
        hideNotification();
      });
    }

    adjustWidthIfSmaller();

    if (chrome && chrome.runtime && chrome.runtime.getBrowserInfo) {
      chrome.runtime.getBrowserInfo(function (info) {
        const mainVersion = info.version.split('.')[0];
        if (mainVersion < 57) {
          containerCookie.style.height = '600px';
        }
      });
    }

    // Check if there are pending shared cookies to import
    (async function() {
    await checkForPendingSharedCookies();
    })();
    
    // Add event listeners for cookie value and JSON copying from Cookie class
    document.addEventListener('cookie-copy-name', async function(e) {
      const { cookieId, cookieName } = e.detail;
      if (!cookieName && cookieName !== '') {
        console.error('Cannot copy cookie name: name is empty or undefined');
        sendNotification('Failed to copy: cookie name is empty', true);
        return;
      }
      
      //console.log('Copying cookie name from custom event:', cookieName);
      const success = await copyText(cookieName);
      
      if (success) {
        sendNotification('Copied cookie name to clipboard', false);
        // Show success animation if possible
        const cookieObj = loadedCookies[cookieId];
        if (cookieObj && typeof cookieObj.showSuccessAnimationOnButton === 'function') {
          cookieObj.showSuccessAnimationOnButton('button.copy-options-button');
        }
      } else {
        sendNotification('Failed to copy cookie name', true);
      }
    });
    
    document.addEventListener('cookie-copy-value', async function(e) {
      const { cookieId, cookieValue } = e.detail;
      if (!cookieValue && cookieValue !== '') {
        console.error('Cannot copy cookie value: value is empty or undefined');
        sendNotification('Failed to copy: cookie value is empty', true);
        return;
      }
      
      //console.log('Copying cookie value from custom event:', cookieValue);
      const success = await copyText(cookieValue);
      
      if (success) {
        sendNotification('Copied cookie value to clipboard', false);
        // Show success animation if possible
        const cookieObj = loadedCookies[cookieId];
        if (cookieObj && typeof cookieObj.showSuccessAnimationOnButton === 'function') {
          cookieObj.showSuccessAnimationOnButton('button.copy-options-button');
        }
      } else {
        sendNotification('Failed to copy cookie value', true);
      }
    });
    
    document.addEventListener('cookie-copy-json', async function(e) {
      const { cookieId, cookie } = e.detail;
      if (!cookie) {
        console.error('Cannot copy cookie JSON: cookie object is empty or undefined');
        sendNotification('Failed to copy: cookie object is empty', true);
        return;
      }
      
      //console.log('Copying cookie JSON from custom event:', cookie);
      const json = JSON.stringify(cookie, null, 2);
      const success = await copyText(json);
      
      if (success) {
        sendNotification('Copied whole cookie (JSON) to clipboard', false);
        // Show success animation if possible
        const cookieObj = loadedCookies[cookieId];
        if (cookieObj && typeof cookieObj.showSuccessAnimationOnButton === 'function') {
          cookieObj.showSuccessAnimationOnButton('button.copy-options-button');
        }
      } else {
        sendNotification('Failed to copy cookie JSON', true);
      }
    });

    // Add event listeners for theme selector
    const themeSelector = document.getElementById('theme-selector');
    
    // Set the initial value based on current theme setting or default to auto
    const currentTheme = optionHandler.getTheme() || 'auto';
    themeSelector.value = currentTheme;
    
    // No longer force auto to dark - let it use the system preference
    
    themeSelector.addEventListener('change', function(e) {
      const newTheme = e.target.value;
      optionHandler.setTheme(newTheme);
      themeHandler.updateTheme();
    });

    // Listen for theme changes from other parts of the extension
    optionHandler.on('optionsChanged', function(oldOptions) {
      if (oldOptions.theme !== optionHandler.getTheme()) {
        themeSelector.value = optionHandler.getTheme();
      }
    });

    // Load & initialize parent-domain toggle setting
    includeParentCookies = await storageHandler.getLocal('includeParentDomainCookies', false);
    // Create settings gear and menu for parent-domain inclusion
    const domainSettingsBtn = document.createElement('button');
    domainSettingsBtn.id = 'domain-settings-button';
    domainSettingsBtn.title = 'Domain filter settings';
    domainSettingsBtn.innerHTML = '<svg class="icon"><use href="../sprites/solid.svg#user-cog"></use></svg>';
    const settingsMenu = document.createElement('div');
    settingsMenu.id = 'domain-settings-menu';
    settingsMenu.classList.add('hidden');
    const checkboxLabel = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'include-parent-checkbox';
    checkbox.checked = includeParentCookies;
    checkboxLabel.appendChild(checkbox);
    checkboxLabel.appendChild(document.createTextNode('Include parent domain cookies'));
    settingsMenu.appendChild(checkboxLabel);
    // Reposition gear before the domain dropdown
    const wrapper = domainSelector.parentNode;
    wrapper.style.position = 'relative';
    wrapper.insertBefore(domainSettingsBtn, domainSelector);
    wrapper.insertBefore(settingsMenu, domainSelector);
    // Toggle settings menu open/close
    domainSettingsBtn.addEventListener('click', e => {
      e.stopPropagation();
      settingsMenu.classList.toggle('hidden');
    });
    checkbox.addEventListener('change', async () => {
      includeParentCookies = checkbox.checked;
      await storageHandler.setLocal('includeParentDomainCookies', includeParentCookies);
      if (selectedDomain) {
        await showCookiesForSelectedDomain(true);
      } else {
        await showCookiesForTab(true);
      }
      // Dispatch event after refresh completes
      document.dispatchEvent(new CustomEvent('cookieListRefreshed'));
    });
    
    // Add document click listener to close settings menu when clicking outside
    document.addEventListener('click', (e) => {
      if (settingsMenu && !settingsMenu.classList.contains('hidden')) {
        if (!settingsMenu.contains(e.target) && e.target !== domainSettingsBtn) {
          settingsMenu.classList.add('hidden');
        }
      }
    });
  });

  // == End document ready == //

  let isAnimating = false; // Flag to prevent concurrent animations
  
  /**
   * Displays the cookies for the current tab.
   * @param {boolean} forceExecution If true, bypasses the disableButtons and isAnimating checks
   * @return {Promise} Promise that resolves when the operation completes
   */
  async function showCookiesForTab(forceExecution = false) {
    //console.log('[showCookiesForTab] Called. Current Tab:', JSON.stringify(cookieHandler.currentTab));
    if (!cookieHandler.currentTab) {
      //console.log('[showCookiesForTab] No current tab available yet');
      return;
    }
    
    // Only check flags if not forcing execution
    if (!forceExecution && disableButtons) {
      return;
    }
    
    // Prevent concurrent animations if not forcing execution
    if (!forceExecution && isAnimating) {
      return;
    }

    // Set animation flag to indicate operation in progress
    isAnimating = true;

    // Get the current tab URL's domain
    const currentUrl = cookieHandler.currentTab?.url; // Use optional chaining
    const domain = currentUrl ? profileManager.getDomainFromUrl(currentUrl) : null;
    
    // Reset the permission requested flag if the domain has changed
    if (currentDomain !== domain) {
      //console.log('[showCookiesForTab] Domain changed, resetting hasRequestedPermission flag.');
      hasRequestedPermission = false;
      // Update currentDomain for side panel context
      currentDomain = domain;
    }
    
    // Update the "Current tab domain" option in the domain selector only if it exists
    if (domain && domainSelector && domainSelector.options.length > 0) {
      domainSelector.options[0].textContent = `Current tab domain (${domain})`;
    }
    
    // Clear selectedDomain when showing cookies for the current tab
    // This ensures we don't have a stale selection
    if (domainSelector) {
      selectedDomain = '';
      domainSelector.value = '';
    }
    
    // Set subtitle to the current domain
    const subtitleLine = document.querySelector('.titles h2');
    if (subtitleLine) {
      subtitleLine.textContent = domain || cookieHandler.currentTab.url;
    }

    // --- BEGIN: Check for both HTTPS and HTTP permissions ---
    let hasHttpsPerm = false;
    let hasHttpPerm = false;
    let permissionsCheckError = null;
    try {
      if (domain) {
        // Pass forceExecution flag to checkPermissions
        hasHttpsPerm = await permissionHandler.checkPermissions(`https://${domain}`, forceExecution);
        hasHttpPerm = await permissionHandler.checkPermissions(`http://${domain}`, forceExecution);
      } else {
        // If domain couldn't be determined, fallback to checking current URL if possible
        if (currentUrl) {
           // Pass forceExecution flag to checkPermissions
           hasHttpsPerm = await permissionHandler.checkPermissions(currentUrl, forceExecution);
           // Assume http perm is needed if https is granted but domain is unknown
           hasHttpPerm = hasHttpsPerm; 
        } else {
           throw new Error("Cannot determine domain or URL for permission check.");
        }
      }
    } catch (error) {
      permissionsCheckError = error; // Store error
      // fallback to old logic if error
      try {
        if (currentUrl) {
          // Pass forceExecution flag to checkPermissions
          const hasPermissions = await permissionHandler.checkPermissions(currentUrl, forceExecution);
          if (!hasPermissions) {
            // Pass domain if available, even in error fallback
            showNoPermission({ domain: domain });
            isAnimating = false;
            return;
          }
          // If permission exists despite error, proceed cautiously
          hasHttpsPerm = true;
          hasHttpPerm = true;
        } else {
           throw new Error("Cannot determine URL for fallback permission check.")
        }
      } catch (error2) {
        console.error('Fallback permission check failed:', error2);
        // Pass domain if available, even in final error path
        showNoPermission({ domain: domain });
        isAnimating = false;
        return;
      }
    }

    if (!hasHttpsPerm || !hasHttpPerm) {
      showNoPermission({
        requireHttp: domain && currentUrl?.startsWith('https') && !hasHttpPerm, // Only require http if on https and http perm is missing
        domain: domain
      });
      isAnimating = false;
      return;
    }
    // --- END: Check for both HTTPS and HTTP permissions ---

    const tab = cookieHandler.currentTab;
    
    // Update the current domain
    if (!isSidePanel() && tab && tab.url) {
      const newDomain = profileManager.getDomainFromUrl(tab.url);
      
      if (newDomain !== currentDomain || (profileSelector && profileSelector.options.length <= 1)) {
        currentDomain = newDomain;
        // Avoid blocking the main thread with profile selector update
        setTimeout(() => {
          updateProfileSelector(currentDomain).catch(error => {
            console.error('Error updating profile selector:', error);
          });
        }, 0);
      }
    }

    // Return a promise that resolves when cookies are displayed
    return new Promise((resolve) => {
      //console.log(`[showCookiesForTab] Getting cookies for URL: ${currentUrl}`);
      
      // Always clear cache when explicitly showing cookies for tab to prevent stale data
      cookieCache.clear(); // <-- Restore cache clearing here
      // Begin updated logic: fetch cookies by domain rather than by URL, merging www and root when appropriate
      const domainsToFetch = [currentDomain];
      const normalizedDomain = currentDomain.toLowerCase();
      if (normalizedDomain.startsWith('www.')) {
        const canonicalDomain = currentDomain.substring(4);
        if (canonicalDomain && canonicalDomain !== currentDomain) {
          domainsToFetch.push(canonicalDomain);
        }
      }
      // Conditionally add fallback for non-www subdomains: include root domain
      if (includeParentCookies) {
        const parts = normalizedDomain.split('.');
        if (parts.length > 2) {
          const rootDomain = parts.slice(-2).join('.');
          if (rootDomain && !domainsToFetch.includes(rootDomain)) {
            domainsToFetch.push(rootDomain);
          }
        }
      }
      //console.log(`[showCookiesForTab] Fetching cookies for domains: ${domainsToFetch.join(', ')}`);
      if (domainsToFetch.length === 1) {
        getCookiesForDomainWrapper(currentDomain, function (cookies) {
          // Filter cookies to only exact domain matches (exclude subdomains)
          const exact = cookies.filter(cookie => {
            const cd = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
            return cd === currentDomain;
          });
          //console.log(`[showCookiesForTab] Received ${cookies.length} cookies, ${exact.length} exact matches for domain: ${currentDomain}`);
          cookieCache.store(currentUrl, exact);
          renderCookiesWithAnimation(exact, resolve);
        });
      } else {
        const mergedCookies = [];
        let pendingFetches = domainsToFetch.length;
        domainsToFetch.forEach(domain => {
          getCookiesForDomainWrapper(domain, function (cookies) {
            // Only exact matches for this domain
            const exact = cookies.filter(cookie => {
              const cd = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
              return cd === domain;
            });
            mergedCookies.push(...exact);
            if (--pendingFetches === 0) {
              // Deduplicate cookies by name, domain, and path
              const seen = new Set();
              const uniqueCookies = [];
              mergedCookies.forEach(cookie => {
                const key = `${cookie.name}|${cookie.domain}|${cookie.path}`;
                if (!seen.has(key)) {
                  seen.add(key);
                  uniqueCookies.push(cookie);
                }
              });
              //console.log(`[showCookiesForTab] Filtered & merged cookies. Unique after dedupe: ${uniqueCookies.length}`);
              cookieCache.store(currentUrl, uniqueCookies);
              renderCookiesWithAnimation(uniqueCookies, resolve);
            }
          });
        });
      }
      // End updated logic
    });
  }
  
  // Helper function to render cookies with proper animation
  function renderCookiesWithAnimation(cookies, resolve) {
    // Cleanup old Cookie objects
    Object.keys(loadedCookies).forEach(id => {
      const cookieObj = loadedCookies[id];
      if (cookieObj && typeof cookieObj.destroy === 'function') {
        cookieObj.destroy();
      }
    });
    loadedCookies = {};
    cookies = cookies.sort(sortCookiesByName);
    // Show correct button bar
    document.getElementById('button-bar-add').classList.remove('active');
    document.getElementById('button-bar-import').classList.remove('active');
    document.getElementById('button-bar-default').classList.add('active');
    // Handle empty state
    if (cookies.length === 0) {
      showNoCookies().then(() => {
        isAnimating = false;
        resolve();
      });
      return;
    }
    
    // Initial list and search bar
    cookiesListHtml = document.createElement('ul');
    cookiesListHtml.appendChild(generateSearchBar());
    
    // Add the column header
    const headerTemplate = document.importNode(
      document.getElementById('tmp-cookie-list-header').content,
      true
    );
    cookiesListHtml.appendChild(headerTemplate);
    
    // Create document fragment and batch-render cookies
    const fragment = document.createDocumentFragment();
    cookies.forEach(cookie => {
      const id = Cookie.hashCode(cookie);
      loadedCookies[id] = new Cookie(id, cookie, optionHandler);
      fragment.appendChild(loadedCookies[id].html);
    });
    
    cookiesListHtml.appendChild(fragment);
    
    // Update the search placeholder after cookies are loaded
    updateSearchPlaceholder(cookiesListHtml.querySelector('#searchField'));
    
    // Perform animation if there's existing content
    if (containerCookie.firstChild) {
      Animate.transitionPage(
        containerCookie,
        containerCookie.firstChild,
        cookiesListHtml,
        'right',
        () => {
          isAnimating = false;
          resolve();
        },
        optionHandler.getAnimationsEnabled()
      );
    } else {
      // No animation needed if there's no existing content
      containerCookie.innerHTML = '';
      containerCookie.appendChild(cookiesListHtml);
      isAnimating = false;
      resolve();
    }
  }
  
  // Find the renderCookies function and update it to include the header
  function renderCookies(cookies, resolve) {
    clearChildren(cookiesListHtml);
    
    if (!cookies || !Object.keys(cookies).length) {
      cookiesListHtml.appendChild(generateSearchBar());
      showNoCookies();
      if (typeof resolve === 'function') {
        resolve();
      }
      return;
    }
    
    cookiesListHtml.appendChild(generateSearchBar());
    
    // Add the column header
    const headerTemplate = document.importNode(
      document.getElementById('tmp-cookie-list-header').content,
      true
    );
    cookiesListHtml.appendChild(headerTemplate);
    
    const cookiesList = [];
    for (const cookieId in cookies) {
      // Insert rest of the renderCookies function unchanged
      cookiesList.push(cookies[cookieId]);
    }
    
    cookiesList.sort(sortCookiesByName);
    
    cookiesList.forEach(cookie => {
      const id = Cookie.hashCode(cookie);
      loadedCookies[id] = new Cookie(id, cookie, optionHandler);
      cookiesListHtml.appendChild(loadedCookies[id].html);
    });
    
    if (containerCookie.firstChild) {
      isAnimating = true;
      Animate.transitionPage(containerCookie, containerCookie.firstChild, cookiesListHtml, 'right', () => { 
        isAnimating = false; 
        // Update placeholder after animation completes
        updateSearchPlaceholder();
        resolve(); 
      }, optionHandler.getAnimationsEnabled());
    } else {
      containerCookie.appendChild(cookiesListHtml);
      // Update placeholder after DOM is updated
      updateSearchPlaceholder();
      resolve();
    }
  }
  
  /**
   * Custom wrapper for getCookiesForDomain that properly handles side panel context
   * 
   * @param {string} domain The domain to get cookies for
   * @param {Function} callback Function called with the results
   */
  function getCookiesForDomainWrapper(domain, callback) {
    //console.log('[getCookiesForDomainWrapper] Getting cookies for domain:', domain);
    
    if (!isSidePanel()) {
      // In popup context, use the regular function
      cookieHandler.getCookiesForDomain(domain, callback);
      return;
    }
    
    // In side panel context, we need a different approach
    // because cookieHandler.currentTab contains the side panel tab, not the content tab
    
    // Get all cookies for the specified domain without storeId restriction
    const browserAPI = browserDetector.getApi();
    const filter = { domain: domain };
    
    //console.log('[getCookiesForDomainWrapper] Using custom side panel approach with filter:', filter);
    
    if (browserDetector.supportsPromises()) {
      browserAPI.cookies.getAll(filter)
        .then(cookies => {
          //console.log(`[getCookiesForDomainWrapper] Found ${cookies.length} cookies for domain ${domain}`);
          callback(cookies);
        })
        .catch(error => {
          console.error('[getCookiesForDomainWrapper] Error getting cookies:', error);
          callback([]);
        });
    } else {
      browserAPI.cookies.getAll(filter, cookies => {
        const error = browserAPI.runtime.lastError;
        if (error) {
          console.error('[getCookiesForDomainWrapper] Error getting cookies:', error);
          callback([]);
      return;
        }
        //console.log(`[getCookiesForDomainWrapper] Found ${cookies.length} cookies for domain ${domain}`);
        callback(cookies);
      });
    }
  }

  /**
   * Shows cookies for the selected domain
   * @param {boolean} forceExecution If true, bypasses the disableButtons check
   * @returns {Promise} Promise that resolves when the operation completes
   */
  function showCookiesForSelectedDomain(forceExecution = false) {
    //console.log('[showCookiesForSelectedDomain] Called. selectedDomain:', selectedDomain, 'forceExecution:', forceExecution);
    
    // Only check flags if not forcing execution (when called from domain selector)
    if (!forceExecution && disableButtons) {
      //console.log('[showCookiesForSelectedDomain] Skipped due to disableButtons flag.');
      return Promise.resolve(); // Return resolved Promise instead of undefined
    }
    
    // Prevent concurrent animations if not forcing execution
    if (!forceExecution && isAnimating) {
      //console.log('[showCookiesForSelectedDomain] Skipped due to isAnimating flag.');
      return Promise.resolve(); // Return resolved Promise instead of undefined
    }
    
    // If selectedDomain is empty, explicitly show cookies for current tab
    // This is a safeguard in case this function is called directly
    if (!selectedDomain) {
      //console.log('[showCookiesForSelectedDomain] No selectedDomain, falling back to showCookiesForTab.');
      return showCookiesForTab(); // This already returns a Promise
    }
    
    //console.log('[showCookiesForSelectedDomain] Getting cookies for domain:', selectedDomain);
    // Return a promise that resolves when cookies are displayed, with optional parent-domain inclusion
    return new Promise((resolve) => {
      // Build domains list: selected + optional root fallback
      const domainsToFetch = [selectedDomain];
      if (includeParentCookies) {
        const parts = selectedDomain.toLowerCase().split('.');
        if (parts.length > 2) {
          const root = parts.slice(-2).join('.');
          if (root && !domainsToFetch.includes(root)) domainsToFetch.push(root);
        }
      }
      const merged = [];
      let pending = domainsToFetch.length;
      domainsToFetch.forEach(domain => {
        getCookiesForDomainWrapper(domain, cookies => {
          const exact = cookies.filter(c => {
            const cd = c.domain.startsWith('.') ? c.domain.substring(1) : c.domain;
            return cd === domain;
          });
          merged.push(...exact);
          if (--pending === 0) {
            // Dedupe and sort
            const seen = new Set();
            const unique = [];
            merged.forEach(c => {
              const key = `${c.name}|${c.domain}|${c.path}`;
              if (!seen.has(key)) { seen.add(key); unique.push(c); }
            });
            const sorted = unique.sort(sortCookiesByName);
            // Render or empty state
        loadedCookies = {};
        if (sorted.length === 0) {
          const html = document.importNode(document.getElementById('tmp-empty').content, true).querySelector('p');
          html.textContent = `No cookies found for domain: ${selectedDomain}`;
          if (containerCookie.firstChild) {
            isAnimating = true;
                Animate.transitionPage(containerCookie, containerCookie.firstChild, html, 'right', () => { 
                  isAnimating = false; 
                  // Update placeholder to show 0 cookies
                  updateSearchPlaceholder();
                  resolve(); 
                }, optionHandler.getAnimationsEnabled());
          } else {
            containerCookie.appendChild(html);
            // Update placeholder to show 0 cookies
            updateSearchPlaceholder();
            resolve();
          }
            } else {
        cookiesListHtml = document.createElement('ul');
        cookiesListHtml.appendChild(generateSearchBar());
        
        // Add the column header
        const headerTemplate = document.importNode(
          document.getElementById('tmp-cookie-list-header').content,
          true
        );
        cookiesListHtml.appendChild(headerTemplate);
        
              sorted.forEach(c => {
                const id = Cookie.hashCode(c);
                loadedCookies[id] = new Cookie(id, c, optionHandler);
          cookiesListHtml.appendChild(loadedCookies[id].html);
        });
              
              // Update the search placeholder after adding cookies
              updateSearchPlaceholder(cookiesListHtml.querySelector('#searchField'));
              
        if (containerCookie.firstChild) {
          isAnimating = true;
                Animate.transitionPage(containerCookie, containerCookie.firstChild, cookiesListHtml, 'right', () => { 
                  isAnimating = false; 
                  // Update placeholder after animation completes
                  updateSearchPlaceholder();
                  resolve(); 
                }, optionHandler.getAnimationsEnabled());
        } else {
          containerCookie.appendChild(cookiesListHtml);
          // Update placeholder after DOM is updated
          updateSearchPlaceholder();
          resolve();
              }
            }
        }
        });
      });
    });
  }

  /**
   * Displays a message to the user to let them know that no cookies are
   * available for the current page.
   * @return {Promise} Promise that resolves when the operation completes
   */
  function showNoCookies() {
    if (disableButtons) {
      return Promise.resolve();
    }
    
    // Reset tracking variable
    cookiesListHtml = null;
    
    // Get the no-cookies message template
    const html = document
      .importNode(document.getElementById('tmp-empty').content, true)
      .querySelector('p');
    
    // If we already have the no-cookies message, do nothing
    if (containerCookie.firstChild && containerCookie.firstChild.id === 'no-cookie') {
      return Promise.resolve();
    }
    
    // Return a promise for the animation
    return new Promise((resolve) => {
      if (containerCookie.firstChild) {
        // Animate transition from current content to no-cookies message
        Animate.transitionPage(
          containerCookie,
          containerCookie.firstChild,
          html,
          'right',
          resolve,
          optionHandler.getAnimationsEnabled()
        );
      } else {
        // If no existing content, just add the message directly
        containerCookie.appendChild(html);
        resolve();
      }
    });
  }

  /**
   * Displays a message to the user to let them know that the extension doesn't
   * have permission to access the cookies for this page.
   * @return {Promise} Promise that resolves when the operation completes
   */
  function showNoPermission(opts) {
    // ignore disableButtons to always show the permission prompt
    // if (disableButtons) {
    //   return Promise.resolve();
    // }
    
    // Reset tracking variable
    cookiesListHtml = null;
    
    // Get the no-permission message template
    const html = document
      .importNode(document.getElementById('tmp-no-permission').content, true)
      .querySelector('div');
    
    // Update UI state
    document.getElementById('button-bar-add').classList.remove('active');
    document.getElementById('button-bar-import').classList.remove('active');
    // KEEP THE DEFAULT BUTTON BAR ACTIVE
    document.getElementById('button-bar-default').classList.add('active');
    
    // Special handling for Firefox
    if (
      browserDetector.isFirefox() &&
      typeof browserDetector.getApi().devtools !== 'undefined'
    ) {
      html.querySelector('div').textContent =
        "Go to your settings (about:addons) or open the extension's popup to " +
        'adjust your permissions.';
    }
    
    // If permission was already requested, update the message to indicate this
    if (hasRequestedPermission) {
      const messageDiv = html.querySelector('div');
      messageDiv.innerHTML = 'Permission request was denied.<br>Click the permission button again or check your browser settings to enable cookie access.';
    }
    
    // If we already have the no-permission message, do nothing
    if (containerCookie.firstChild && containerCookie.firstChild.id === 'no-permission') {
      return Promise.resolve();
    }
    
    // Return a promise for the animation
    return new Promise((resolve) => {
      if (containerCookie.firstChild) {
        // Animate transition from current content to no-permission message
        Animate.transitionPage(
          containerCookie,
          containerCookie.firstChild,
          html,
          'right',
          () => {
            // Add event listeners after animation completes
            setupPermissionButtons(opts);
            resolve();
          },
          optionHandler.getAnimationsEnabled()
        );
      } else {
        // If no existing content, just add the message directly
        containerCookie.appendChild(html);
        setupPermissionButtons(opts);
        resolve();
      }
    });
    
    // Helper function to set up permission request buttons
    function setupPermissionButtons(opts) {
      const requestBtn = document.getElementById('request-permission');
      const requestAllBtn = document.getElementById('request-permission-all');

      if (!requestBtn || !requestAllBtn) return; // Elements might not exist

      requestBtn.focus();
      // Add click handler for current site permission request
      requestBtn.addEventListener('click', async (event) => {
          // Prevent multiple clicks while processing
          requestBtn.disabled = true;
          requestAllBtn.disabled = true;
          hasRequestedPermission = true;
          let targetDomain = opts?.domain;
          let targetUrl = cookieHandler.currentTab?.url;
          
          // Try to get domain if not passed in opts
          if (!targetDomain && targetUrl) {
              targetDomain = profileManager.getDomainFromUrl(targetUrl);
          }
          
          // If we still don't have a domain, show an error
          if (!targetDomain) {
              console.error("Cannot request permission: Domain is unknown.");
              showPermissionImpossible(); // Or show a specific error message
              requestBtn.disabled = false; // Re-enable button
              requestAllBtn.disabled = false;
              return;
          }
          
          // Check if we can request permissions for this (derived) URL
          const checkUrl = targetUrl || `https://${targetDomain}`;
          if (!permissionHandler.canHavePermissions(checkUrl)) {
            showPermissionImpossible();
            requestBtn.disabled = false; // Re-enable button
            requestAllBtn.disabled = false;
            return;
          }
          
          try {
            // Always request both HTTP and HTTPS permissions for the domain
            const urlToRequest = `https://${targetDomain}`;
            const granted = await permissionHandler.requestPermission(urlToRequest);
            if (granted) {
              // Refresh domain list in the background
              if (domainSelector) { // Check if dropdown exists
                initDomainSelector(); 
              }
              // --- BEGIN IMMEDIATE UI UPDATE --- 
              clearChildren(containerCookie);
              // Optional: Add a temporary loading message
              const loadingMsg = document.createElement('p');
              loadingMsg.textContent = 'Loading cookies...';
              loadingMsg.style.textAlign = 'center';
              loadingMsg.style.marginTop = '2em';
              containerCookie.appendChild(loadingMsg);
              // --- END IMMEDIATE UI UPDATE --- 
              showCookiesForTab(true); // Force execution to ensure refresh
            } else {
              showNoPermission(opts);
              requestBtn.disabled = false; // Re-enable button on failure/denial
              requestAllBtn.disabled = false;
            }
          } catch (error) {
            console.error('Permission request error:', error);
            showPermissionImpossible();
            requestBtn.disabled = false; // Re-enable button on error
            requestAllBtn.disabled = false;
          }
        });
      // Add click handler for all sites permission request via background
      requestAllBtn.addEventListener('click', (event) => {
          // Prevent multiple clicks while processing
          requestBtn.disabled = true;
          requestAllBtn.disabled = true;
          hasRequestedPermission = true;
          const api = browserDetector.getApi();
          if (api.runtime && api.runtime.sendMessage) {
            api.runtime.sendMessage(
              { type: 'permissionsRequest', params: '<all_urls>' },
              (granted) => {
                if (granted) {
                  // Refresh domain list in the background
                  if (domainSelector) { // Check if dropdown exists
                    initDomainSelector(); 
                  }
                  // --- BEGIN IMMEDIATE UI UPDATE --- 
                  clearChildren(containerCookie);
                  // Optional: Add a temporary loading message
                  const loadingMsg = document.createElement('p');
                  loadingMsg.textContent = 'Loading cookies...';
                  loadingMsg.style.textAlign = 'center';
                  loadingMsg.style.marginTop = '2em';
                  containerCookie.appendChild(loadingMsg);
                  // --- END IMMEDIATE UI UPDATE --- 
                  showCookiesForTab(true); // Force execution here too
                } else {
                   showNoPermission(opts); // Show prompt again if denied
                   requestBtn.disabled = false; // Re-enable buttons
                   requestAllBtn.disabled = false;
                }
              }
            );
          } else {
            // Fallback if runtime messaging isn't available (shouldn't happen)
            requestBtn.disabled = false;
            requestAllBtn.disabled = false;
          }
        });
    }
  }

  /**
   * Displays a message to the user to let them know that the extension can't
   * get permission to access the cookies for this page due to them being
   * internal pages.
   * @return {Promise} Promise that resolves when the operation completes
   */
  function showPermissionImpossible() {
    // ignore disableButtons to always show the permission-impossible prompt
    // if (disableButtons) {
    //   return Promise.resolve();
    // }
    
    // Reset tracking variable
    cookiesListHtml = null;
    
    // Get the permission-impossible message template
    const html = document
      .importNode(
        document.getElementById('tmp-permission-impossible').content,
        true,
      )
      .querySelector('div');

    // Update UI state
    document.getElementById('button-bar-add').classList.remove('active');
    document.getElementById('button-bar-import').classList.remove('active');
    // KEEP THE DEFAULT BUTTON BAR ACTIVE
    document.getElementById('button-bar-default').classList.add('active');
    
    // If we already have the permission-impossible message, do nothing
    if (containerCookie.firstChild && containerCookie.firstChild.id === 'permission-impossible') {
      return Promise.resolve();
    }
    
    // Return a promise for the animation
    return new Promise((resolve) => {
      if (containerCookie.firstChild) {
        // Animate transition from current content to permission-impossible message
        Animate.transitionPage(
          containerCookie,
          containerCookie.firstChild,
          html,
          'right',
          resolve,
          optionHandler.getAnimationsEnabled()
        );
      } else {
        // If no existing content, just add the message directly
        containerCookie.appendChild(html);
        resolve();
      }
    });
  }

  /**
   * Shows the current version number in the interface.
   */
  function showVersion() {
    const versionElement = document.getElementById('version');
    if (versionElement) {
    const version = browserDetector.getApi().runtime.getManifest().version;
      versionElement.textContent = 'v' + version;
    }
  }

  /**
   * Enables or disables the animations based on the options.
   */
  function handleAnimationsEnabled() {
    // Make sure the document.body exists before trying to modify its classes
    if (!document.body) {
      // If body doesn't exist yet, schedule this to run after a short delay
      setTimeout(handleAnimationsEnabled, 50);
      return;
    }

    if (optionHandler.getAnimationsEnabled()) {
      document.body.classList.remove('notransition');
    } else {
      document.body.classList.add('notransition');
    }
  }

  /**
   * Creates the HTML representation of a cookie.
   * @param {string} name Name of the cookie.
   * @param {string} value Value of the cookie.
   * @param {string} id HTML ID to use for the cookie.
   * @return {string} the HTML of the cookie.
   */
  function createHtmlForCookie(name, value, id) {
    const cookie = new Cookie(
      id,
      {
        name: name,
        value: value,
      },
      optionHandler,
    );

    return cookie.html;
  }

  /**
   * Creates the HTML form to allow editing a cookie.
   * @return {string} The HTML for the form.
   */
  function createHtmlFormCookie() {
    const template = document.importNode(
      document.getElementById('tmp-create').content,
      true,
    );
    return template.querySelector('form');
  }

  /**
   * Creates the HTML form to allow importing cookies.
   * @return {string} The HTML for the form.
   */
  function createHtmlFormImport() {
    const template = document.importNode(
      document.getElementById('tmp-import').content,
      true,
    );
    return template.querySelector('form');
  }

  /**
   * Handles the logic of the export button, depending on user preferences.
   */
  function handleExportButtonClick() {
    const exportOption = optionHandler.getExportFormat();
    switch (exportOption) {
      case ExportFormats.Ask:
        toggleExportMenu();
        break;
      case ExportFormats.JSON:
        exportToJson();
        break;
      case ExportFormats.HeaderString:
        exportToHeaderstring();
        break;
      case ExportFormats.Netscape:
        exportToNetscape();
        break;
    }
  }

  /**
   * Toggles the visibility of the export menu.
   */
  function toggleExportMenu() {
    if (document.getElementById('export-menu')) {
      hideExportMenu();
    } else {
      showExportMenu();
    }
  }

  /**
   * Shows the export menu.
   */
  function showExportMenu() {
    const template = document.importNode(
      document.getElementById('tmp-export-options').content,
      true,
    );
    const exportMenu = template.getElementById('export-menu');
    
    // Get the export button and its position
    const exportButton = document.getElementById('export-cookies');
    const buttonRect = exportButton.getBoundingClientRect();
    
    // Position the menu above the button in the viewport
    exportMenu.style.position = 'fixed';
    
    // Check if the button is in the top half of the window to determine arrow direction
    const isButtonInTopHalf = buttonRect.top < window.innerHeight / 2;
    
    if (isButtonInTopHalf) {
      // Position below the button
      exportMenu.style.top = `${buttonRect.bottom + 15}px`; // Position below button with gap
      exportMenu.style.bottom = 'auto';
      
      // Add class for arrow styling
      exportMenu.classList.add('arrow-top');
    } else {
      // Position above the button
      exportMenu.style.bottom = `${window.innerHeight - buttonRect.top + 15}px`; // Position above button with gap
      exportMenu.style.top = 'auto';
      
      // Add class for arrow styling
      exportMenu.classList.add('arrow-bottom');
    }
    
    // Horizontal positioning - align with button
    exportMenu.style.right = `${window.innerWidth - buttonRect.right + 15}px`; // Align to button right edge with adjustment
    
    document.body.appendChild(exportMenu); // Append to body for proper z-index stacking

    document.getElementById('export-json').focus();
    document
      .getElementById('export-json')
      .addEventListener('click', (event) => {
        exportToJson();
      });
    document
      .getElementById('export-headerstring')
      .addEventListener('click', (event) => {
        exportToHeaderstring();
      });
    document
      .getElementById('export-netscape')
      .addEventListener('click', (event) => {
        exportToNetscape();
      });
  }

  /**
   * Hides the export menu.
   */
  function hideExportMenu() {
    const exportMenu = document.getElementById('export-menu');
    if (exportMenu) {
      exportMenu.parentElement.removeChild(exportMenu);
      document.activeElement.blur();
    }
  }

  if (typeof createHtmlFormCookie === 'undefined') {
    // This should not happen anyway ;)
    // eslint-disable-next-line no-func-assign
    createHtmlFormCookie = createHtmlForCookie;
  }

  /**
   * Exports all the cookies for the current tab in the JSON format.
   */
  async function exportToJson() {
    hideExportMenu();
    const buttonIcon = document
      .getElementById('export-cookies')
      .querySelector('use');
    if (buttonIcon.getAttribute('href') === '../sprites/solid.svg#check') {
      return;
    }

    const jsonText = JsonFormat.format(loadedCookies);
    const success = await copyText(jsonText);

    if (success) {
      buttonIcon.setAttribute('href', '../sprites/solid.svg#check');
    sendNotification('Cookies exported to clipboard as JSON', false);
    setTimeout(() => {
      buttonIcon.setAttribute('href', '../sprites/solid.svg#file-export');
    }, 1500);
    } else {
      sendNotification('Failed to export cookies to clipboard', true);
    }
  }

  /**
   * Exports all the cookies for the current tab in the header string format.
   */
  async function exportToHeaderstring() {
    hideExportMenu();
    const buttonIcon = document
      .getElementById('export-cookies')
      .querySelector('use');
    if (buttonIcon.getAttribute('href') === '../sprites/solid.svg#check') {
      return;
    }

    const headerString = HeaderstringFormat.format(loadedCookies);
    const success = await copyText(headerString);

    if (success) {
      buttonIcon.setAttribute('href', '../sprites/solid.svg#check');
    sendNotification('Cookies exported to clipboard as Header String', false);
    setTimeout(() => {
      buttonIcon.setAttribute('href', '../sprites/solid.svg#file-export');
    }, 1500);
    } else {
      sendNotification('Failed to export cookies to clipboard', true);
    }
  }

  /**
   * Exports all the cookies for the current tab in the Netscape format.
   */
  async function exportToNetscape() {
    hideExportMenu();
    const buttonIcon = document
      .getElementById('export-cookies')
      .querySelector('use');
    if (buttonIcon.getAttribute('href') === '../sprites/solid.svg#check') {
      return;
    }

    const netscapeFormat = NetscapeFormat.format(loadedCookies);
    const success = await copyText(netscapeFormat);

    if (success) {
      buttonIcon.setAttribute('href', '../sprites/solid.svg#check');
      sendNotification('Cookies exported to clipboard as Netscape Format', false);
    setTimeout(() => {
      buttonIcon.setAttribute('href', '../sprites/solid.svg#file-export');
    }, 1500);
    } else {
      sendNotification('Failed to export cookies to clipboard', true);
    }
  }

  /**
   * Removes a cookie from the current tab.
   * @param {string} name Name of the cookie to remove.
   * @param {string} url Url of the tab that contains the cookie.
   * @param {function} callback
   */
  function removeCookie(name, url, callback) {
    // First, find the exact cookie we want to delete
    let cookieToDelete = null;
    let cookieId = null;
    
    // If we're given a specific cookie ID, use that to find the cookie
    if (typeof name === 'object' && name.cookieId) {
      cookieId = name.cookieId;
      if (loadedCookies[cookieId]) {
        cookieToDelete = loadedCookies[cookieId].cookie;
        name = cookieToDelete.name; // Use the name from the found cookie
      }
    } else {
      // Otherwise, find the cookie by name (potential issue: might find first matching name, not specific path)
      // TODO: Refine this find logic if multiple cookies share the same name but different paths/domains in loadedCookies
      cookieId = Object.keys(loadedCookies).find(id => 
      loadedCookies[id].cookie.name === name
    );
    
      if (cookieId) {
        cookieToDelete = loadedCookies[cookieId].cookie;
      }
    }

    // If we couldn't find the cookie to delete, bail out
    if (!cookieToDelete) {
      console.warn(`Could not find cookie "${name}" to delete.`);
      if (callback) callback(null); // Indicate failure
      return;
    }
    
    // Save the original cookie for history tracking
    let originalCookie = JSON.parse(JSON.stringify(cookieToDelete));
    const targetName = originalCookie.name;
    const targetPath = originalCookie.path;
    const targetDomain = originalCookie.domain;
    const targetStoreId = originalCookie.storeId;
    const targetSecure = originalCookie.secure; // Added: Get secure flag
    
    // Find and remove the cookie from the UI immediately
    if (cookieId && loadedCookies[cookieId] && loadedCookies[cookieId].html) {
      const cookieElement = loadedCookies[cookieId].html;
      if (cookieElement && cookieElement.parentNode) {
        cookieElement.parentNode.removeChild(cookieElement);
      }
      // Remove from our loaded cookies object
      delete loadedCookies[cookieId];
      
      // Update the search placeholder to reflect the change
      updateSearchPlaceholder();
    }
    
    // Ensure we have a valid base URL for operations
    let baseUrl = url || getCurrentTabUrl();
    
    // Construct the specific URL for deletion targeting the exact cookie
    let urlForDelete = baseUrl;
    try {
      // Determine protocol based on cookie's secure flag
      const protocol = targetSecure ? 'https://' : 'http://'; // Added: Determine protocol

      // Remove leading dot from domain if present
      const cleanDomain = targetDomain && targetDomain.startsWith('.')
        ? targetDomain.substring(1) : targetDomain;

      const cookiePath = targetPath || '/';

      if (cleanDomain) {
        // CONSTRUCTS URL from cookie protocol + cookie domain + cookie path
        urlForDelete = `${protocol}${cleanDomain}${cookiePath}`; // Modified
      } else {
        // Use host if domain isn't specified (e.g., hostOnly cookies)
        // Need the host from the baseUrl for host-only cookies
        const urlObj = new URL(baseUrl);
        // CONSTRUCTS URL from cookie protocol + tab host + cookie path
        urlForDelete = `${protocol}${urlObj.host}${cookiePath}`; // Modified
      }
    } catch (e) {
      console.error('Error constructing specific URL for deletion:', e);
      // Fallback URL construction if primary fails
      if (targetDomain) {
        // Determine protocol based on cookie's secure flag for fallback too
        const protocol = targetSecure ? 'https://' : 'http://'; // Added
        const cleanDomain = targetDomain.startsWith('.') ? targetDomain.substring(1) : targetDomain;
        const cookiePath = targetPath || '/';
        // Assume protocol based on secure flag
        urlForDelete = `${protocol}${cleanDomain}${cookiePath}`; // Modified
      } else {
         // If domain is also missing, we might be unable to delete effectively
         console.error("Cannot reliably construct delete URL without domain info.");
         // Attempt deletion with base URL anyway? Or fail? For now, proceed with baseUrl.
         // This fallback remains potentially problematic but is unchanged.
         urlForDelete = baseUrl;
      }
    }

    // --- Start Delete-Recreate Logic ---
    
    // 1. Fetch all cookies matching the domain (and implicitly the storeId via context)
    cookieHandler.getCookiesForDomain(targetDomain, (allDomainCookies) => {
      if (!allDomainCookies) {
         console.error("Failed to fetch domain cookies, cannot proceed with safe delete.");
         if (callback) callback(null); // Indicate potential failure
         // Maybe attempt a simple delete anyway? For now, we stop.
         return;
      }

      // 2. Filter for cookies with the same name but DIFFERENT path
      const cookiesToRecreate = allDomainCookies.filter(cookie => 
        cookie.name === targetName &&
        cookie.path !== targetPath &&
        cookie.storeId === targetStoreId // Ensure same storeId
      );
      
      // Keep only necessary details for recreation, prevent circular refs
      const recreationData = cookiesToRecreate.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite,
        expirationDate: c.expirationDate,
        storeId: c.storeId,
        hostOnly: c.hostOnly, // Include hostOnly
        session: !c.expirationDate // Determine session based on expirationDate
      }));

      // 3. Perform the deletion (which might delete more than intended)
      cookieHandler.removeCookie(targetName, urlForDelete, targetStoreId, function (result) {
        
        // 4. Recreate the other cookies
        // Use Promise.all to handle multiple async save operations
        const recreatePromises = recreationData.map(cookieData => {
          return new Promise((resolve, reject) => {
            // We need to use cookieHandler.saveCookie directly here,
            // as the saveCookie function in this file is for UI forms.
            // Construct the necessary URL for saving.
             let urlForSave = baseUrl; // Start with base
             try {
                const cleanDomain = cookieData.domain && cookieData.domain.startsWith('.') ? cookieData.domain.substring(1) : cookieData.domain;
                const cookiePath = cookieData.path || '/';
                const urlObj = new URL(baseUrl);
                if (cleanDomain) {
                   urlForSave = `${urlObj.protocol}//${cleanDomain}${cookiePath}`;
                } else {
                   urlForSave = `${urlObj.protocol}//${urlObj.host}${cookiePath}`;
                }
             } catch(e) {
                console.error('Error constructing URL for cookie recreation:', e);
                // Fallback
                 if (cookieData.domain) {
                   const cleanDomain = cookieData.domain.startsWith('.') ? cookieData.domain.substring(1) : cookieData.domain;
                   const cookiePath = cookieData.path || '/';
                   urlForSave = `https://${cleanDomain}${cookiePath}`;
                 } else {
                   // If domain is missing, saving might be problematic
                   urlForSave = baseUrl;
                 }
             }

            // Note: prepareCookie within saveCookie needs these fields.
            const cookieToSave = {
               name: cookieData.name,
               value: cookieData.value,
               domain: cookieData.domain,
               path: cookieData.path,
               secure: cookieData.secure,
               httpOnly: cookieData.httpOnly,
               sameSite: cookieData.sameSite,
               expirationDate: cookieData.expirationDate,
               storeId: cookieData.storeId,
               hostOnly: cookieData.hostOnly // Pass hostOnly
               // session is implied by null expirationDate in prepareCookie
            };
             
            // Use cookieHandler.saveCookie
            cookieHandler.saveCookie(cookieToSave, urlForSave, (error, savedCookie) => {
              if (error) {
                console.error(`Failed to recreate cookie: ${cookieData.name} (${cookieData.path})`, error);
                reject(error); // Reject promise on failure
              } else {
                //console.log(`Successfully recreated cookie: ${savedCookie.name} (${savedCookie.path})`);
                resolve(savedCookie); // Resolve promise on success
              }
            });
          });
        });

        Promise.allSettled(recreatePromises).then(recreationResults => {
          // Log any failures during recreation
          recreationResults.forEach((res, index) => {
            if (res.status === 'rejected') {
               console.error(`Recreation failed for cookie index ${index}:`, res.reason);
            }
          });

          // Original deletion result handling
          if (!result && !originalCookie) {
            console.warn(`Attempted to delete potentially "ghost" cookie "${targetName}" - refreshing cookie list`);
            setTimeout(() => {
              cookieCache.clear();
              if (selectedDomain) {
                showCookiesForSelectedDomain(true);
              } else {
                showCookiesForTab(true);
              }
            }, 100);
          }
          
          // Record the *intended* deletion in history 
          if (originalCookie) {
             // Use the original target cookie for history, not any recreated ones
            historyHandler.recordOperation('delete', originalCookie, null, urlForDelete || baseUrl);
            updateHistoryButtons();
          }
      
          // Execute original callback
          if (callback) {
            callback(result); // Pass the result of the *initial* delete call
          }
          
          // Clear cache and refresh UI after cookie recreation
          cookieCache.clear();
        });
      });
    });
    // --- End Delete-Recreate Logic ---
    
    // Check if cookies have been modified (original timeout moved)
    // This check should happen after recreation attempts
    setTimeout(() => {
      checkIfCookiesModified();
    }, 300); // Increased delay
  }

  /**
   * Handles when the cookies change.
   */
  function onCookiesChanged(changeInfo) {
    // Skip automatic UI refresh for cookie removal events (UI deletion)
    if (changeInfo && changeInfo.removed) {
      //console.log('[onCookiesChanged] Skipping refresh for cookie removal event.');
      return;
    }
    
    // Clear the cache when cookies change
    cookieCache.clear();
    
    // Skip refresh under certain conditions
    const activeExpandos = document.querySelectorAll('.header.active');
    const isAddOrImportActive = containerCookie.querySelector('form.create, form.import');
    
    // Don't refresh during these states:
    // - During profile loading
    // - When expandos/forms are active
    // - When already animating
    // - When a refresh happened too recently
    const now = Date.now();
    if (isProfileLoading || 
        activeExpandos.length > 0 || 
        isAddOrImportActive || 
        isAnimating || 
        (now - lastCookieRefreshTimestamp < MIN_REFRESH_INTERVAL)) {
      //console.log('[onCookiesChanged] Skipping refresh because of active UI state or rate limiting.');
      // Try to update just the placeholder if possible
      if (!isAnimating) {
        updateSearchPlaceholder();
      }
      return;
    }

    // Debounce refreshes to avoid multiple rapid updates
    if (window._cookieRefreshTimeout) {
      clearTimeout(window._cookieRefreshTimeout);
    }
    
    window._cookieRefreshTimeout = setTimeout(() => {
      window._cookieRefreshTimeout = null;
      lastCookieRefreshTimestamp = Date.now(); // Record refresh time
      
      // Choose the appropriate refresh method
      let refreshPromise;
      if (selectedDomain) {
        refreshPromise = showCookiesForSelectedDomain(true);
      } else {
        refreshPromise = showCookiesForTab();
      }
      
      // After refreshing, check for modifications - but only if needed
      refreshPromise.then(() => {
        // Ensure the search placeholder is updated after the refresh
        updateSearchPlaceholder();
        
        // Add a delay before checking for modifications
        setTimeout(() => {
          // Only check if modifications matter (we have profiles)
          if (currentDomain && profileSelector && profileSelector.value) {
            checkIfCookiesModified();
          }
        }, 1000); // Increased delay
      }).catch(error => {
        console.error('Error refreshing cookies:', error);
        // Update placeholder even on error
        updateSearchPlaceholder();
      });
    }, 800); // Increased debounce delay
  }

  /**
   * Evaluates two cookies to determine which comes first when sorting them.
   * @param {object} a First cookie.
   * @param {object} b Second cookie.
   * @return {int} -1 if a should show first, 0 if they are equal, otherwise 1.
   */
  function sortCookiesByName(a, b) {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    
    // Check if the getSortDirection function exists (added by cookie-sort.js)
    if (typeof window.getSortDirection === 'function') {
      const sortDirection = window.getSortDirection();
      // If sort direction is 'desc', reverse the comparison
      if (sortDirection === 'desc') {
        return bName < aName ? -1 : bName > aName ? 1 : 0;
      }
    }
    
    // Default ascending sort
    return aName < bName ? -1 : aName > bName ? 1 : 0;
  }

  /**
   * Initialize the window.
   * @param {object} _tab The current Tab.
   */
  async function initWindow(_tab) {
    // Determine the relevant tab ID
    let currentTab;
    
    try {
      // PERFORMANCE OPTIMIZATION: Use a single tabs query for both contexts
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tabs && tabs.length > 0) {
        currentTab = tabs[0];
        
        if (isSidePanel()) {
          associatedTabId = currentTab.id;
          //console.log("Side Panel initialized for tab:", associatedTabId);
        } else {
          //console.log("Popup initialized for tab:", currentTab.id);
        }
      } else {
        throw new Error("Could not determine active tab in current window.");
      }
    } catch (error) {
      console.error(isSidePanel() ? "Side Panel: " : "Popup: ", "Error getting current tab:", error);
      containerCookie.innerHTML = '<div class="container">Could not get current tab information.</div>';
      return; // Stop execution
    }

    // Store the tab object for later use
    cookieHandler.currentTab = currentTab;

    // PERFORMANCE OPTIMIZATION: Only show version and handle animations immediately, defer the rest
    showVersion();
    moveButtonBar();
    handleAnimationsEnabled();
    
    // PERFORMANCE OPTIMIZATION: Set up event listeners after initial render has started
    setTimeout(() => {
      // Set up event listeners
      optionHandler.on('optionsChanged', onOptionsChanged);
      cookieHandler.on('cookiesChanged', onCookiesChanged);
      
      // Set up the ready handler
      cookieHandler.on('ready', async () => {
        //console.log('Cookie handler is ready, showing cookies for tab');
        
        // Request immediate cookie check from the background script
        if (cookieHandler.currentTab && cookieHandler.currentTab.url) {
          requestBackgroundCookieCheck(cookieHandler.currentTab.url);
        }
        
        // Allow a small delay for the tab to be fully initialized
        setTimeout(() => {
          showCookiesForTab();
        }, 50);
      });
      
      // Check if cookieHandler is already ready (this happens if tab was already initialized)
      // and trigger cookie load immediately in that case
      if (cookieHandler.isReady && cookieHandler.currentTab) {
        //console.log('Cookie handler already ready when listener attached, showing cookies for tab');
        if (cookieHandler.currentTab.url) {
          requestBackgroundCookieCheck(cookieHandler.currentTab.url);
        }
        // Defer cookie loading to idle time
        (window.requestIdleCallback || (cb => setTimeout(cb, 0)))(async () => {
          await showCookiesForTab();
        });
      }
      
      // PERFORMANCE OPTIMIZATION: Set up message listener after initial render
      setupMessageListener();
      
      // Initialize domain selector only if it exists
      if (domainSelector) {
        domainSelector.addEventListener('change', handleDomainSelectionChange);
        initDomainSelector(); // Run async in background, don't await
      }
      
      // PERFORMANCE OPTIMIZATION: Defer popup-specific initializations 
      if (!isSidePanel()) {
        setTimeout(() => {
          initProfilePanelState().catch(error => {
            console.error("Error initializing profile panel state:", error);
          });
          
          initProfileManagement();
          
          // Check for pending shared cookies in the next event loop cycle
          setTimeout(() => {
            checkForPendingSharedCookies().catch(error => {
              console.error("Error checking for pending shared cookies:", error);
            });
          }, 0);
        }, 100);
      }
      
      document.querySelector('#advanced-toggle-all').checked =
        optionHandler.getCookieAdvanced();
    }, 0);
  }
  
  /**
   * Set up the message listener for browser runtime messages
   * PERFORMANCE OPTIMIZATION: Extracted from initWindow to make code cleaner
   */
  function setupMessageListener() {
    chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
      //console.log('[onMessage] Received message:', JSON.stringify(message));
      
      if (message.action === 'requestCookieRefresh') {
        //console.log('[onMessage] Handling requestCookieRefresh for tab:', message.tabId);
        let refreshNeeded = false;
        
        if (isSidePanel()) {
          //console.log('[onMessage] Side Panel context. Associated Tab ID:', associatedTabId);
          // Side Panel: Check against the stored associated tab ID
          if (associatedTabId && message.tabId === associatedTabId) {
            //console.log('[onMessage] Side Panel: Tab ID matches. Refresh needed.');
            // If the URL changed for our associated tab, update internal state
            if (message.url && cookieHandler.currentTab) {
              //console.log('[onMessage] Side Panel: Updating internal URL to:', message.url);
              cookieHandler.currentTab.url = message.url; 
            }
            refreshNeeded = true;
          } else {
            //console.log('[onMessage] Side Panel: Tab ID does NOT match associated ID.');
          }
        } else {
          //console.log('[onMessage] Popup context.');
          // Popup: Use query to get the current tab for comparison
          try {
              const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
              if (tabs && tabs.length > 0 && message.tabId === tabs[0].id) {
                //console.log('[onMessage] Popup: Tab ID matches. Refresh needed.');
                refreshNeeded = true;
              } else {
                //console.log('[onMessage] Popup: Tab ID does NOT match current tab ID.');
              }
          } catch (error) {
              console.error("Popup: Error querying current tab for refresh check:", error);
          }
        }
  
        if (refreshNeeded) {
            //console.log('[onMessage] Refresh needed. Checking buttons/animation state...');
            // Avoid refreshing if a save operation is in progress
            if (!disableButtons && !isAnimating) { 
                //console.log('[onMessage] Calling showCookiesForTab()...');
                showCookiesForTab(); // Refreshes the cookie list UI
            } else {
                //console.log('[onMessage] Refresh skipped due to disableButtons or isAnimating flag.');
            }
        } else {
            //console.log('[onMessage] Refresh NOT needed for this message.');
        }
      }
    });
  }

  /**
   * Request the background script to check for shared cookies in a URL
   * @param {string} url - URL to check
   */
  function requestBackgroundCookieCheck(url) {
    try {
      const sendPromise = browserDetector.getApi().runtime.sendMessage({
        type: 'checkForSharedCookies',
        params: { url }
      });
      
      // Handle promise-based browser APIs
      if (sendPromise && typeof sendPromise.catch === 'function') {
        sendPromise.catch(error => {
          // Ignore message channel closed errors which happen when popup closes
          // These are expected and not a problem
          if (error.message && error.message.includes('message channel closed')) {
            //console.log('Message channel closed while checking for cookies - this is normal when popup closes');
          } else {
            console.error('Error requesting cookie check:', error);
          }
        });
      }
    } catch (error) {
      // This is a more serious error, but still suppress it as it might happen when popup is closing
      console.error('Error sending message to background script:', error);
    }
  }

  /**
   * Initialize the profile management functionality
   */
  function initProfileManagement() {
    // Exit if in side panel
    if (isSidePanel()) return;
    
    // Ensure profile selector exists before adding listeners
    if (!profileSelector) return;

    const saveBtn = document.getElementById('save-profile');
    const loadBtn = document.getElementById('load-profile');
    const editBtn = document.getElementById('edit-profile');
    const deleteBtn = document.getElementById('delete-profile');

    // Add event listeners for profile management only if buttons exist
    if (saveBtn) saveBtn.addEventListener('click', saveCurrentAsProfile);
    if (loadBtn) loadBtn.addEventListener('click', loadSelectedProfile);
    if (editBtn) editBtn.addEventListener('click', editSelectedProfile);
    if (deleteBtn) deleteBtn.addEventListener('click', deleteSelectedProfile);
    
    // Add profile selector change event
    profileSelector.addEventListener('change', handleProfileSelectionChange);
    
    // Remove any existing profile import/export buttons from main menu
    // since we're now handling these in the profile actions submenu
    const menuContent = document.getElementById('main-menu-content');
    const importAllProfilesBtn = document.getElementById('import-all-profiles');
    const exportAllProfilesBtn = document.getElementById('export-all-profiles');
    
    // Remove buttons if they exist in the main menu
    if (importAllProfilesBtn && importAllProfilesBtn.parentElement === menuContent) {
      menuContent.removeChild(importAllProfilesBtn);
    }
    
    if (exportAllProfilesBtn && exportAllProfilesBtn.parentElement === menuContent) {
      menuContent.removeChild(exportAllProfilesBtn);
    }
  }

  /**
   * Gets the URL of the current tab or constructs a URL for the selected domain.
   * @return {string} The URL of the current tab or selected domain, otherwise empty string.
   */
  function getCurrentTabUrl() {
    // If a domain is selected in the dropdown, construct an HTTPS URL for it
    if (selectedDomain) {
      // Always default to https for selected domains
      return `https://${selectedDomain}/`; // Use template literal for clarity
    }
    
    // Otherwise use the current tab's URL
    if (cookieHandler.currentTab) {
      return cookieHandler.currentTab.url;
    }
    return '';
  }

  /**
   * Gets the domain of an URL.
   * @param {string} url URL to extract the domain from.
   * @return {string} The domain extracted.
   */
  function getDomainFromUrl(url) {
    const matches = url.match(/^https?:\/\/([^/?#]+)(?:[/?#]|$)/i);
    return matches && matches[1];
  }

  /**
   * Adds a notification to the notification queue.
   * @param {string} message Message to display in the notification.
   * @param {boolean} isError Whether this is an error message.
   */
  function sendNotification(message, isError) {
    notificationQueue.push(message);
    triggerNotification();
  }

  /**
   * Generates the HTML for the search bar.
   * @return {string} The HTML to display the search bar.
   */
  function generateSearchBar() {
    const searchBarContainer = document.importNode(
      document.getElementById('tmp-search-bar').content,
      true,
    );
    
    const searchField = searchBarContainer.getElementById('searchField');
    const searchNames = searchBarContainer.getElementById('searchNames');
    const searchValues = searchBarContainer.getElementById('searchValues');
    const searchOptionsToggle = searchBarContainer.getElementById('searchOptionsToggle');
    const searchOptionsContainer = searchBarContainer.getElementById('searchOptionsContainer');
    
    // Update the search placeholder with cookie count
    updateSearchPlaceholder(searchField);
    
    // Load initial search options from storage
    try {
      const savedOptions = optionHandler.getSearchOptions();
      searchNames.checked = savedOptions.searchNames;
      searchValues.checked = savedOptions.searchValues;
    } catch (e) {
      console.error('Error loading search options:', e);
      // Fall back to defaults from HTML template
    }
    
    // Update search options in storage and apply filtering
    const updateSearchOptions = () => {
      const options = {
        searchNames: searchNames.checked,
        searchValues: searchValues.checked
      };
      
      // Save options to persist between sessions
      optionHandler.setSearchOptions(options);
      
      // Filter cookies with current options when checkboxes change
      if (searchField.value) {
        filterCookies(searchField, searchField.value, options);
      }
    };
    
    // Toggle search options visibility
    searchOptionsToggle.addEventListener('click', (e) => {
      if (searchOptionsContainer.classList.contains('collapsed')) {
        searchOptionsContainer.classList.remove('collapsed');
        searchOptionsContainer.classList.add('expanded');
        // No need to move the toggle button - it stays in place
      } else {
        searchOptionsContainer.classList.remove('expanded');
        searchOptionsContainer.classList.add('collapsed');
      }
    });
    
    // Add event listeners for search options
    searchNames.addEventListener('change', updateSearchOptions);
    searchValues.addEventListener('change', updateSearchOptions);
    
    // Modified to pass search options to filterCookies
    searchField.addEventListener('keyup', (e) => {
      const options = {
        searchNames: searchNames.checked,
        searchValues: searchValues.checked
      };
      filterCookies(e.target, e.target.value, options);
    });
    
    return searchBarContainer;
  }

  /**
   * Updates the search field placeholder with the total number of cookies.
   * @param {HTMLElement} searchField - The search input element to update (optional)
   */
  function updateSearchPlaceholder(searchField) {
    // If no search field is provided, try to get it from the DOM
    if (!searchField) {
      searchField = document.getElementById('searchField');
      if (!searchField) return; // Exit if no search field found
    }
    
    // Get the total number of cookies
    const cookieCount = loadedCookies ? Object.keys(loadedCookies).length : 0;
    
    // Update the placeholder
    searchField.placeholder = `Search (${cookieCount} cookies)`;
  }

  /**
   * Starts displaying the next notification in the queue if there is one.
   * This will also make sure that wer are not already in the middle of
   * displaying a notification already.
   */
  function triggerNotification() {
    if (!notificationQueue || !notificationQueue.length) {
      return;
    }
    if (notificationTimeout) {
      return;
    }
    if (notificationElement.classList.contains('fadeInUp')) {
      return;
    }

    showNotification();
  }

  /**
   * Displays a notification message.
   * @param {string} message Message to be displayed.
   * @param {boolean} isError Whether this is an error message.
   */
  function showNotification(message, isError) {
    if (notificationTimeout) {
      return;
    }

    // If direct message is provided, use it; otherwise get from queue
    const notificationMessage = message || notificationQueue.shift();
    
    if (!notificationMessage) {
      return;
    }

    // Make sure the container is visible without causing layout shift
    notificationElement.parentElement.style.display = 'block';
    notificationElement.parentElement.style.opacity = '1';
    notificationElement.parentElement.style.pointerEvents = 'none';
    
    notificationElement.querySelector('#notification-dismiss').style.display = 'block';
    notificationElement.querySelector('span').textContent = notificationMessage;
    notificationElement.querySelector('span').setAttribute('role', 'alert');
    notificationElement.classList.add('fadeInUp');
    notificationElement.classList.remove('fadeOutDown');

    // Add error class if it's an error message
    if (isError) {
      notificationElement.classList.add('error');
    } else {
      notificationElement.classList.remove('error');
    }

    notificationTimeout = setTimeout(() => {
      hideNotification();
    }, 1500);
  }

  /**
   * Hides a notification.
   */
  function hideNotification() {
    if (notificationTimeout) {
      clearTimeout(notificationTimeout);
      notificationTimeout = null;
    }

    notificationElement.querySelector('span').setAttribute('role', '');
    notificationElement.classList.remove('fadeInUp');
    notificationElement.classList.add('fadeOutDown');
    notificationElement.querySelector('#notification-dismiss').style.display = 'none';
    
    // Don't hide the container, just make it invisible
    setTimeout(() => {
      if (!notificationElement.classList.contains('fadeInUp')) {
        notificationElement.parentElement.style.opacity = '0';
        notificationElement.parentElement.style.pointerEvents = 'none';
      }
    }, 200); // match animation duration
  }

  /**
   * Copy some text to the user's clipboard using the modern Clipboard API with fallbacks.
   * @param {string} text Text to copy.
   * @return {Promise<boolean>} Whether the copy was successful.
   */
  async function copyText(text) {
    if (text === undefined || text === null) {
      console.error('Attempted to copy null/undefined text to clipboard');
      return false;
    }
    
    // Convert non-string values to string
    text = String(text);
    
    if (text.length === 0) {
      console.warn('Copying empty string to clipboard');
      // Continue with copy - empty string is valid to copy
    }

    try {
      // Modern Clipboard API method
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        //console.log('Text copied using Clipboard API');
        return true;
      }
    } catch (err) {
      console.warn('Clipboard API failed, trying fallback:', err);
      // Continue to fallback
    }

    // Classic execCommand fallback
    try {
      const textArea = document.createElement('textarea');
      
      // Style the textarea to be as hidden as possible but still functional
      Object.assign(textArea.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '2em',
        height: '2em',
        padding: '0',
        border: 'none',
        outline: 'none',
        boxShadow: 'none',
        background: 'transparent',
        zIndex: '9999'
      });
      
      textArea.value = text;
      document.body.appendChild(textArea);
      
      // Try multiple selection approaches
      textArea.focus();
      textArea.select();
      
      // Try to select text in case the standard select() didn't work
      try {
        const range = document.createRange();
        range.selectNodeContents(textArea);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        textArea.setSelectionRange(0, text.length);
      } catch (selectErr) {
        console.warn('Advanced text selection failed:', selectErr);
        // Continue with copy attempt anyway
      }
      
      // Execute copy command
      const successful = document.execCommand('copy');
      
      // Cleanup
      document.body.removeChild(textArea);
      
      if (successful) {
        //console.log('Text copied using execCommand fallback');
        return true;
      } else {
        console.error('execCommand copy failed');
        return false;
      }
    } catch (err) {
      console.error('All clipboard methods failed:', err);
      return false;
    }
  }

  /**
   * Checks if a value is an arary.
   * @param {any} value Value to evaluate.
   * @return {boolean} true if the value is an array, otherwise false.
   */
  function isArray(value) {
    return value && typeof value === 'object' && value.constructor === Array;
  }

  /**
   * Clears all the children of an element.
   * @param {element} element Element to clear its children.
   */
  function clearChildren(element) {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  /**
   * Adjusts the width of the interface if the container it's in is smaller than
   * a specific size.
   */
  function adjustWidthIfSmaller() {
    // Keep fixed size - no longer adjusting width
    // The popup now has a fixed width of 500px and height of 600px
    return;
  }

  /**
   * Filters the cookies based on keywords. Used for searching.
   * @param {element} target The searchbox.
   * @param {*} filterText The text to search for.
   * @param {object} options Search options containing searchNames and searchValues flags.
   */
  function filterCookies(target, filterText, options = null) {
    // Use saved options if none provided
    if (!options) {
      options = optionHandler.getSearchOptions();
    }
    
    // Get the currently displayed cookie list element
    const currentCookieList = document.getElementById('cookie-container').querySelector('ul');
    if (!currentCookieList) {
      // If the list element doesn't exist for some reason, exit early.
      return;
    }
    const cookies = currentCookieList.querySelectorAll('.cookie');
    filterText = filterText.toLowerCase();

    if (filterText) {
      target.classList.add('content');
    } else {
      target.classList.remove('content');
    }

    // If no search options are selected, default to searching names
    if (!options.searchNames && !options.searchValues) {
      options.searchNames = true;
    }

    // Helper to get cookie value from data attributes or cookie store
    function getCookieValueForSearch(cookieElement) {
      // Try to get from the loaded cookie data structure first
      const cookieName = cookieElement.children[0]
        .getElementsByTagName('span')[0]
        .textContent;
      
      // Look through loadedCookies array to find matching cookie
      if (loadedCookies && loadedCookies.length) {
        for (const cookie of loadedCookies) {
          if (cookie.name === cookieName) {
            return cookie.value.toLowerCase();
          }
        }
      }
      
      // Fallback to DOM element
      const valueInput = cookieElement.querySelector('.input-value');
      return valueInput ? valueInput.value.toLowerCase() : '';
    }

    for (let i = 0; i < cookies.length; i++) {
      const cookieElement = cookies[i];
      let foundMatch = false;
      
      if (!filterText) {
        // If no filter text, show all cookies
        foundMatch = true;
      } else {
        // Check cookie name if option is enabled
        if (options.searchNames) {
          const cookieName = cookieElement.children[0]
            .getElementsByTagName('span')[0]
            .textContent.toLowerCase();
          if (cookieName.indexOf(filterText) > -1) {
            foundMatch = true;
          }
        }
        
        // Check cookie value if option is enabled and no match found yet
        if (!foundMatch && options.searchValues) {
          const cookieValue = getCookieValueForSearch(cookieElement);
          if (cookieValue && cookieValue.indexOf(filterText) > -1) {
            foundMatch = true;
          }
        }
      }
      
      if (foundMatch) {
        cookieElement.classList.remove('hide');
      } else {
        cookieElement.classList.add('hide');
      }
    }
  }

  /**
   * Handles the main logic of displaying ads. This will check if there are any
   * ads that can be displayed and will select a random one to display if there
   * are more than one valid option.
   */
  async function handleAd() {
    const canShow = await adHandler.canShowAnyAd();
    if (!canShow) {
      return;
    }
    const selectedAd = await adHandler.getRandomValidAd();
    if (selectedAd === false) {
      
      return;
    }
    clearAd();
    const adItemHtml = displayAd(selectedAd);
    document.getElementById('ad-container').appendChild(adItemHtml);
  }
  /**
   * Removes the currently displayed ad from the interface.
   */
  function clearAd() {
    clearChildren(document.getElementById('ad-container'));
  }

  /**
   * Creates the HTML to display an ad and assigns the event handlers.
   * @param {object} adObject Ad to display.
   * @return {string} The HTML representation of the ad.
   */
  function displayAd(adObject) {
    const template = document.importNode(
      document.getElementById('tmp-ad-item').content,
      true,
    );
    const link = template.querySelector('.ad-link a');
    link.textContent = adObject.text;
    link.title = adObject.tooltip;
    link.href = adObject.url;

    template.querySelector('.dont-show').addEventListener('click', (e) => {
      clearAd();
      adHandler.markAdAsDismissed(adObject);
    });
    template.querySelector('.later').addEventListener('click', (e) => {
      clearAd();
    });

    return template;
  }

  /**
   * Handles the changes required to the interface when the options are changed
   * by an external source.
   * @param {Option} oldOptions the options before changes.
   */
  function onOptionsChanged(oldOptions) {
    handleAnimationsEnabled();
    moveButtonBar();
    if (oldOptions.advancedCookies != optionHandler.getCookieAdvanced()) {
      document.querySelector('#advanced-toggle-all').checked =
        optionHandler.getCookieAdvanced();
      showCookiesForTab();
    }

    if (oldOptions.extraInfo != optionHandler.getExtraInfo()) {
      showCookiesForTab();
    }
  }

  /**
   * Moves the button bar to the top or bottom depending on the user preference
   */
  function moveButtonBar() {
    const siblingElement = optionHandler.getButtonBarTop()
      ? document.getElementById('pageTitle').nextSibling
      : document.body.lastChild;
    document.querySelectorAll('.button-bar').forEach((bar) => {
      siblingElement.parentNode.insertBefore(bar, siblingElement);
      if (optionHandler.getButtonBarTop()) {
        document.body.classList.add('button-bar-top');
      } else {
        document.body.classList.remove('button-bar-top');
      }
    });
  }

  // ----- Profile Management Functions -----

  /**
   * Updates the profile selector with available profiles
   * @param {string} domain - The domain to show profiles for
   */
  async function updateProfileSelector(domain) {
    // Exit if in side panel
    if (isSidePanel()) return;
    
    try {
      if (!profileSelector) return;
      
      // Get profiles and metadata for domain
      // Force cache invalidation by calling _invalidateCache first
      profileManager._invalidateCache();
      const profileNames = await profileManager.getProfileNamesForDomain(domain);
      const metadata = await profileManager.getProfileMetadataForDomain(domain);
      
      // Clear existing options except the first one (placeholder)
      while (profileSelector.options.length > 1) {
        profileSelector.remove(1);
      }
      
      // Add options for each profile
      profileNames.sort().forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        profileSelector.appendChild(option);
      });
      
      // Update button states
      document.getElementById('load-profile').disabled = profileNames.length === 0;
      document.getElementById('edit-profile').disabled = profileNames.length === 0;
      
      // Select the currently loaded profile if there is one
      let selectedIndex = 0; // Default to placeholder

      if (metadata.lastLoaded) {
        for (let i = 0; i < profileSelector.options.length; i++) {
          if (profileSelector.options[i].value === metadata.lastLoaded) {
            selectedIndex = i;
            break;
          }
        }
      }
      
      // Apply the selection
      profileSelector.selectedIndex = selectedIndex;
      
      // Trigger change event to update button states
      const event = new Event('change');
      profileSelector.dispatchEvent(event);
      
      // Update the visual indicators
      await updateProfileStatusIndicator(domain);
    } catch (error) {
      console.error('Error updating profile selector:', error);
    }
  }

  /**
   * Updates the profile status indicator
   * @param {string} domain - The current domain
   */
  async function updateProfileStatusIndicator(domain) {
    // Exit if in side panel
    if (isSidePanel()) return;
    if (!domain) return;
    
    try {
      //console.log(`[updateProfileStatusIndicator] Getting metadata for domain: ${domain}`);
      const metadata = await profileManager.getProfileMetadataForDomain(domain);
      //console.log(`[updateProfileStatusIndicator] Metadata received:`, JSON.stringify(metadata));
      
      const statusContainer = document.getElementById('profile-status');
      
      // Ensure status container exists
      if (!statusContainer) {
        console.warn('[updateProfileStatusIndicator] Status container not found in DOM');
        return;
      }
      
      // Reset all option texts to their original names first
      if (profileSelector) {
        const profileNames = await profileManager.getProfileNamesForDomain(domain);
        for (let i = 0; i < profileSelector.options.length; i++) {
          const optionValue = profileSelector.options[i].value;
          if (optionValue && profileNames.includes(optionValue)) {
            profileSelector.options[i].textContent = optionValue;
          }
        }
      }
      
      if (metadata.lastLoaded) {
        // Get the Load button
        const loadBtn = document.getElementById('load-profile');
        
        if (metadata.modified) {
          //console.log(`[updateProfileStatusIndicator] Setting modified state for "${metadata.lastLoaded}"`);
          // Set status to modified
          statusContainer.textContent = `Modified since loading "${metadata.lastLoaded}"`;
          statusContainer.className = 'profile-status modified';
          
          // Enable the Load button for modified profiles
          if (loadBtn && profileSelector && profileSelector.value === metadata.lastLoaded) {
            loadBtn.disabled = false;
          }
          
          // Update the profile selector option text for the loaded profile
          if (profileSelector) {
            for (let i = 0; i < profileSelector.options.length; i++) {
              if (profileSelector.options[i].value === metadata.lastLoaded) {
                profileSelector.options[i].textContent = `${metadata.lastLoaded} (modified)`;
                break;
              }
            }
          }
        } else {
          //console.log(`[updateProfileStatusIndicator] Setting loaded (unmodified) state for "${metadata.lastLoaded}"`);
          // Set status to loaded (unmodified)
          statusContainer.textContent = `Currently loaded: ${metadata.lastLoaded}`;
          statusContainer.className = 'profile-status loaded';
          
          // Disable Load button for already loaded profiles that aren't modified
          if (loadBtn && profileSelector && profileSelector.value === metadata.lastLoaded) {
            loadBtn.disabled = true;
          }
          
          // Update the profile selector option text for the loaded profile
          if (profileSelector) {
            for (let i = 0; i < profileSelector.options.length; i++) {
              if (profileSelector.options[i].value === metadata.lastLoaded) {
                profileSelector.options[i].textContent = `${metadata.lastLoaded} (loaded)`;
                break;
              }
            }
          }
        }
      } else {
        //console.log(`[updateProfileStatusIndicator] No profile loaded, setting "none" state`);
        // No profile loaded
        statusContainer.textContent = 'No profile loaded';
        statusContainer.className = 'profile-status none';
      }
    } catch (error) {
      console.error('Error updating profile status indicator:', error);
    }
  }

  /**
   * Handles changes to the profile selection
   */
  function handleProfileSelectionChange() {
    // Exit if in side panel
    if (isSidePanel()) return;
    // Ensure profile selector exists
    if (!profileSelector) return;

    const isSelected = profileSelector.value !== "";
    const loadBtn = document.getElementById('load-profile');
    const editBtn = document.getElementById('edit-profile');
    const deleteBtn = document.getElementById('delete-profile');

    if (loadBtn) loadBtn.disabled = !isSelected;
    if (editBtn) editBtn.disabled = !isSelected;
    if (deleteBtn) deleteBtn.disabled = !isSelected;
    
    // Get the metadata to see if the selected profile is the currently loaded one
    const selectedProfile = profileSelector.value;
    if (selectedProfile && currentDomain) {
      // This is an async operation but we don't need to wait for it
      profileManager.getProfileMetadataForDomain(currentDomain)
        .then(metadata => {
          // If the selected profile is the currently loaded one, disable the load button
          if (loadBtn && metadata.lastLoaded === selectedProfile && !metadata.modified) {
            loadBtn.disabled = true;
          }
        })
        .catch(error => {
          console.error('Error checking profile metadata:', error);
        });
    }
  }

  /**
   * Prompts for a profile name
   * @return {Promise<string|null>} The entered profile name or null if canceled
   */
  async function promptProfileName() {
    return new Promise(resolve => {
      const template = document.importNode(
        document.getElementById('tmp-profile-name').content,
        true
      );
      
      const formContainer = document.createElement('div');
      formContainer.className = 'profile-name-prompt';
      formContainer.appendChild(template);
      
      // Add to form to page
      document.body.appendChild(formContainer);
      
      // Create buttons
      const buttonContainer = document.createElement('div');
      buttonContainer.style.display = 'flex';
      buttonContainer.style.justifyContent = 'flex-end';
      buttonContainer.style.gap = '8px';
      buttonContainer.style.marginTop = '12px';
      
      const cancelButton = document.createElement('button');
      cancelButton.textContent = 'Cancel';
      cancelButton.type = 'button'; // Explicitly set type to button
      cancelButton.style.padding = '6px 12px';
      
      const saveButton = document.createElement('button');
      saveButton.textContent = 'Save';
      saveButton.type = 'button'; // Explicitly set type to button
      saveButton.className = 'primary';
      saveButton.style.padding = '6px 12px';
      
      buttonContainer.appendChild(cancelButton);
      buttonContainer.appendChild(saveButton);
      
      const form = formContainer.querySelector('form');
      form.appendChild(buttonContainer);
      
      // Prevent default form submission
      form.onsubmit = function(e) {
        e.preventDefault();
        handleSave();
        return false;
      };
      
      // Position in center of screen
      formContainer.style.position = 'fixed';
      formContainer.style.top = '0';
      formContainer.style.left = '0';
      formContainer.style.right = '0';
      formContainer.style.bottom = '0';
      formContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
      formContainer.style.display = 'flex';
      formContainer.style.alignItems = 'center';
      formContainer.style.justifyContent = 'center';
      formContainer.style.zIndex = '1000';
      
      const formElement = formContainer.querySelector('form');
      formElement.style.backgroundColor = 'var(--primary-surface-color)';
      formElement.style.padding = '20px';
      formElement.style.borderRadius = '8px';
      formElement.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
      
      // Focus the input
      const input = formElement.querySelector('input');
      input.focus();
      
      // Event handlers
      const handleCancel = () => {
        document.body.removeChild(formContainer);
        resolve(null);
      };
      
      const handleSave = () => {
        const profileName = input.value.trim();
        if (profileName) {
          document.body.removeChild(formContainer);
          resolve(profileName);
        } else {
          input.focus();
        }
      };
      
      // Attach events
      cancelButton.addEventListener('click', handleCancel);
      saveButton.addEventListener('click', handleSave);
      
      // Handle escape key
      document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', escHandler);
          handleCancel();
        }
      });
    });
  }

  /**
   * Saves current cookies as a new profile
   */
  async function saveCurrentAsProfile() {
    // Exit if in side panel
    if (isSidePanel()) return;
    if (!currentDomain) {
      sendNotification('Cannot determine current domain.', true);
      return;
    }
    
    // Prompt for profile name
    const profileName = await promptProfileName();
    if (!profileName) return;
    
    // Get all cookies for current domain
    const cookies = [];
    for (const id in loadedCookies) {
      cookies.push(loadedCookies[id].cookie);
    }
    
    if (cookies.length === 0) {
      sendNotification('No cookies to save for this domain.', true);
      return;
    }
    
    // Save the profile
    const success = await profileManager.saveProfile(currentDomain, profileName, cookies);
    
    if (success) {
      sendNotification(`Profile "${profileName}" saved successfully.`, false);
      await updateProfileSelector(currentDomain);
      
      // Select the newly created profile
      for (let i = 0; i < profileSelector.options.length; i++) {
        if (profileSelector.options[i].value === profileName) {
          profileSelector.selectedIndex = i;
          handleProfileSelectionChange();
          break;
        }
      }
    } else {
      sendNotification('Failed to save profile.', true);
    }
  }

  /**
   * Confirms an action with the user
   * @param {string} message - Message to show
   * @return {Promise<boolean>} User confirmation result
   */
  function confirmAction(message) {
    return showImportConfirmationDialog(message).then(result => result.confirmed);
  }

  /**
   * Loads the selected profile
   */
  async function loadSelectedProfile() {
    if (!profileSelector || !profileSelector.value) {
      sendNotification('Please select a profile first', true);
      return;
    }
    
    const profileName = profileSelector.value;
    
    // Only show confirmation if preference is set to true
    let shouldLoad = true;
    if (showProfileLoadConfirmation) {
      const result = await showImportConfirmationDialog(
        `Are you sure you want to load the profile "${profileName}"? This will replace your current cookies for this domain.`,
        'Load Profile Confirmation'
      );
      
      shouldLoad = result.confirmed;
      
      // Save the "Don't ask again" preference if checked
      if (result.confirmed && result.dontAskAgain) {
        showProfileLoadConfirmation = false;
        await storageHandler.setLocal('showProfileLoadConfirmation', false);
      }
    }
    
    if (!shouldLoad) {
      sendNotification('Profile load cancelled.', false);
      return;
    }

    const selectedProfile = await profileManager.getProfile(currentDomain, profileName);
    
    //console.log('Loading profile:', profileName, 'Data:', selectedProfile);
    
    if (!selectedProfile) {
      sendNotification('Profile data not found', true);
      return;
    }
    
    // Handle both new format (object with cookies array) and legacy format (array of cookies directly)
    let cookiesToLoad = selectedProfile;
    
    if (!Array.isArray(selectedProfile)) {
      if (selectedProfile.cookies && Array.isArray(selectedProfile.cookies)) {
        cookiesToLoad = selectedProfile.cookies;
      } else {
        console.error('Invalid profile structure:', selectedProfile);
        sendNotification('Invalid profile data structure', true);
        return;
      }
    }
    
    if (cookiesToLoad.length === 0) {
      sendNotification('Profile contains no cookies', true);
      return;
    }
      
    // Show loading indicator
    const buttonIcon = document.getElementById('load-profile')?.querySelector('use');
    if (buttonIcon) {
      buttonIcon.setAttribute('href', '../sprites/solid.svg#spinner');
      document.getElementById('load-profile').classList.add('loading');
    }
    
    // Set flag to prevent double refresh
    isProfileLoading = true;
    
    try {
      // First get the current cookies to store for history
      const currentUrl = getCurrentTabUrl();
      const currentCookies = [];
      
      // Get all cookies for the current domain (to store for history)
      await new Promise((resolve) => {
        cookieHandler.getAllCookies((cookies) => {
          if (cookies && Array.isArray(cookies)) {
            // Deep clone the cookies to avoid reference issues
            cookies.forEach(cookie => {
              currentCookies.push(JSON.parse(JSON.stringify(cookie)));
            });
          }
          resolve();
          });
        });
        
      // Delete all existing cookies first
      const domainToUse = currentDomain || getDomainFromUrl(getCurrentTabUrl());
      await deleteAllCookiesForDomain(domainToUse);
      
      // Track loaded profile cookies for history
      const loadedProfileCookies = [];
      
      // Then import the profile cookies
      const cookiesToImport = cookiesToLoad;
      const loadPromises = [];
      
      // Prepare all cookies for importing
      for (const cookie of cookiesToImport) {
        loadPromises.push(
          new Promise((resolve) => {
            // Add the cookie to the store
            cookieHandler.saveCookie(cookie, currentUrl, (error, savedCookie) => {
              if (error) {
                console.error(`Error loading cookie ${cookie.name}:`, error);
              } else if (savedCookie) {
                // Add to our tracking for history
                loadedProfileCookies.push(JSON.parse(JSON.stringify(savedCookie)));
              }
              resolve();
            });
          })
        );
      }
      
      // Wait for all cookies to be imported
      await Promise.all(loadPromises);
      
      // --- BEGIN ADDITION: Update profile manager state ---
      // Mark the profile as loaded in the profile manager
      await profileManager.setProfileAsLoaded(currentDomain, profileName);
      // --- END ADDITION ---
      
      // Record the profile loading operation in history
      if (currentCookies.length > 0 || loadedProfileCookies.length > 0) {
        historyHandler.recordOperation('loadProfile', currentCookies, loadedProfileCookies, currentUrl);
        updateHistoryButtons();
      }
      
      // Refresh the cookie list
      if (selectedDomain) {
        showCookiesForSelectedDomain(true);
      } else {
        showCookiesForTab();
      }
      
      // Update profile status to indicate profile is loaded
      await updateProfileStatusIndicator(currentDomain);
      
      // Show success message
      sendNotification(`Loaded profile: ${profileName}`, false);
    } catch (error) {
      console.error('Error loading profile:', error);
      sendNotification('Error loading profile', true);
    } finally {
      // Reset the button icon
      if (buttonIcon) {
        buttonIcon.setAttribute('href', '../sprites/solid.svg#upload');
        document.getElementById('load-profile').classList.remove('loading');
      }
      
      // Reset the profile loading flag after a small delay
      // This gives time for the UI to finish refreshing before allowing automatic refreshes
      setTimeout(() => {
        isProfileLoading = false;
      }, 500);
    }
  }
  
  /**
   * Updates the page with the cookies found for a tab without updating the profile selector
   * This is a variant of showCookiesForTab() that skips profile selector updates
   */
  async function showCookiesForTabWithoutProfileUpdate() {
    if (!cookieHandler.currentTab) {
      return;
    }
    if (disableButtons) {
      return;
    }

    document.getElementById('button-bar-add').classList.remove('active');
    document.getElementById('button-bar-import').classList.remove('active');
    document.getElementById('button-bar-default').classList.add('active');
    
    const domain = getDomainFromUrl(cookieHandler.currentTab.url);
    const subtitleLine = document.querySelector('.titles h2');
    if (subtitleLine) {
      subtitleLine.textContent = domain || cookieHandler.currentTab.url;
    }

    if (!permissionHandler.canHavePermissions(cookieHandler.currentTab.url)) {
      showPermissionImpossible();
      return;
    }
    if (!cookieHandler.currentTab) {
      showNoCookies();
      return;
    }
    
    // Reset the permission requested flag when checking a new site
    if (currentDomain !== domain) {
      hasRequestedPermission = false;
    }
    
    const hasPermissions = await permissionHandler.checkPermissions(
      cookieHandler.currentTab.url,
    );
    if (!hasPermissions) {
      showNoPermission();
      return;
    }

    return new Promise((resolve) => {
      cookieHandler.getAllCookies(function (cookies) {
        cookies = cookies.sort(sortCookiesByName);
  
        loadedCookies = {};
  
        if (cookies.length === 0) {
          showNoCookies();
          resolve();
          return;
        }
  
        cookiesListHtml = document.createElement('ul');
        cookiesListHtml.appendChild(generateSearchBar());
        
        // Add the column header
        const headerTemplate = document.importNode(
          document.getElementById('tmp-cookie-list-header').content,
          true
        );
        cookiesListHtml.appendChild(headerTemplate);
        
        cookies.forEach(function (cookie) {
          const id = Cookie.hashCode(cookie);
          loadedCookies[id] = new Cookie(id, cookie, optionHandler);
          cookiesListHtml.appendChild(loadedCookies[id].html);
        });
  
        if (containerCookie.firstChild) {
          disableButtons = true;
          Animate.transitionPage(
            containerCookie,
            containerCookie.firstChild,
            cookiesListHtml,
            'right',
            () => {
              disableButtons = false;
              resolve();
            },
            optionHandler.getAnimationsEnabled(),
          );
        } else {
          containerCookie.appendChild(cookiesListHtml);
          resolve();
        }
      });
    });
  }

  /**
   * Deletes all cookies for the current domain or a specified domain
   * @param {string} [domainToUse] Optional domain to use instead of the current one
   * @return {Promise} A promise that resolves when all cookies are deleted
   */
  async function deleteAllCookiesForDomain(domainToUse) {
    return new Promise(async (resolve) => {
      try {
        const domain = domainToUse || selectedDomain || getDomainFromUrl(cookieHandler.currentTab.url);
        if (!domain) {
          resolve();
          return;
        }
        
        // Get all cookies in browser to find all related to this domain
        const allCookies = await new Promise(resolve => {
          cookieHandler.getAllCookiesInBrowser(resolve);
        });
        
        // Find all cookies related to the target domain
        // This includes cookies set for the exact domain, parent domains, and subdomains
        const domainCookies = allCookies.filter(cookie => {
          const cookieDomain = cookie.domain.startsWith('.') ? 
            cookie.domain.substring(1) : cookie.domain;
          
          // Match exact domain
          if (cookieDomain === domain) {
            return true;
          }
          
          // Match domain.com cookies for sub.domain.com
          if (domain.endsWith(cookieDomain) && 
              domain.charAt(domain.length - cookieDomain.length - 1) === '.') {
            return true;
          }
          
          // Match sub.domain.com cookies for domain.com
          if (cookieDomain.endsWith(domain) &&
              cookieDomain.charAt(cookieDomain.length - domain.length - 1) === '.') {
            return true;
          }
          
          return false;
        });
        
        if (domainCookies.length === 0) {
          resolve();
          return;
        }
        
        // Group cookies by domain and path for more efficient deletion
        const cookieGroups = {};
        domainCookies.forEach(cookie => {
          const key = `${cookie.domain}|${cookie.path}`;
          if (!cookieGroups[key]) {
            cookieGroups[key] = [];
          }
          cookieGroups[key].push(cookie);
        });
        
        // Counts of remaining cookies to track completion
        let remainingGroups = Object.keys(cookieGroups).length;
        const maxRetries = 2; // Allow up to 2 retries for each cookie
        
        // Process each cookie group with its own URL construction
        for (const [groupKey, cookies] of Object.entries(cookieGroups)) {
          const [cookieDomain, cookiePath] = groupKey.split('|');
          
          // Determine protocol based on current tab URL
          let protocol = 'https:';
          if (cookieHandler.currentTab && cookieHandler.currentTab.url) {
            protocol = cookieHandler.currentTab.url.startsWith('https:') ? 'https:' : 'http:';
          }
          
          // Construct URL with proper domain and path
          const cleanDomain = cookieDomain.startsWith('.') ? 
            cookieDomain.substring(1) : cookieDomain;
          const url = `${protocol}//${cleanDomain}${cookiePath}`;
          
          // Process cookies in this group
          try {
            // Delete cookies in this group
            await deleteCookieGroup(cookies, url, maxRetries);
            remainingGroups--;
            
            if (remainingGroups === 0) {
              resolve();
            }
          } catch (error) {
            console.error('Error deleting cookie group:', error);
            remainingGroups--;
            if (remainingGroups === 0) {
              resolve();
            }
          }
        }
      } catch (error) {
        console.error('Error in deleteAllCookiesForDomain:', error);
        resolve(); // Resolve anyway to continue the process
      }
    });
  }
  
  /**
   * Deletes a group of cookies that share the same domain and path
   * @param {Array} cookies - Cookies to delete
   * @param {string} url - URL to use for deletion
   * @param {number} maxRetries - Maximum number of retries
   * @return {Promise} A promise that resolves when all cookies in group are deleted
   */
  async function deleteCookieGroup(cookies, url, maxRetries) {
    return new Promise(async (resolve, reject) => {
      try {
        let remaining = cookies.length;
        
        // Define a function to delete a single cookie with retries
        const deleteCookieWithRetry = async (cookie, retriesLeft) => {
          try {
            await new Promise((resolveDelete, rejectDelete) => {
              cookieHandler.removeCookie(cookie.name, url, (result) => {
                if (result) {
                  resolveDelete();
                } else {
                  // If null result, consider it a failure
                  rejectDelete(new Error('Failed to delete cookie'));
                }
              });
            });
            
            // Success case
            remaining--;
            if (remaining === 0) {
              resolve();
            }
          } catch (error) {
            if (retriesLeft > 0) {
              // Small delay before retry
              await new Promise(r => setTimeout(r, 30));
              return deleteCookieWithRetry(cookie, retriesLeft - 1);
            } else {
              console.error(`Failed to delete cookie ${cookie.name} after all retries`);
              remaining--;
              if (remaining === 0) {
                resolve();
              }
            }
          }
        };
        
        // Process all cookies in parallel but with individual retry logic
        const deletePromises = cookies.map(cookie => 
          deleteCookieWithRetry(cookie, maxRetries)
        );
        
        // Wait for all deletes to complete or fail
        await Promise.allSettled(deletePromises);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Checks if cookies have been modified from the loaded profile
   */
  async function checkIfCookiesModified() {
    // Exit early if no domain or no cookie updates needed
    if (!currentDomain || isSidePanel()) return;
    
    // Exit if we're already checking cookies to prevent cascading updates
    if (window._isCheckingCookies) return;
    
    // Apply time-based throttling to prevent too frequent checks
    const now = Date.now();
    if (now - lastCookieModificationCheckTime < MIN_MODIFICATION_CHECK_INTERVAL) {
      //console.log(`[checkIfCookiesModified] Throttling check, last check was ${now - lastCookieModificationCheckTime}ms ago`);
      return;
    }
    
    lastCookieModificationCheckTime = now;
    
    try {
      window._isCheckingCookies = true;
      
      // Extract current cookies
      const currentCookies = [];
      for (const id in loadedCookies) {
        currentCookies.push(loadedCookies[id].cookie);
      }
      
      // Log cookie state for debugging
      //console.log(`[checkIfCookiesModified] Checking ${currentCookies.length} cookies against loaded profile for domain ${currentDomain}`);
      
      // Check if cookies have been modified
      const modified = await profileManager.checkIfCookiesModified(currentDomain, currentCookies);
      
      // If we needed to update the UI, update both the status indicator and profile selector
      if (!isSidePanel()) {
        //console.log(`[checkIfCookiesModified] Modified status: ${modified}, updating UI`);
        // Only call updateProfileSelector once
        await updateProfileSelector(currentDomain);
      }
    } finally {
      window._isCheckingCookies = false;
    }
  }

  /**
   * Deletes the selected profile
   */
  async function deleteSelectedProfile() {
    // Exit if in side panel
    if (isSidePanel()) return;
    if (!currentDomain || !profileSelector.value) {
      sendNotification('No profile selected.', true);
      return;
    }
    
    const profileName = profileSelector.value;
    
    // Confirm before deleting with dedicated dialog
    let shouldDelete = true;
    if (showDeleteProfileConfirmation) {
      const result = await showDeleteProfileConfirmationDialog(
        `Are you sure you want to delete the profile "${profileName}"?`
      );
      shouldDelete = result.confirmed;
      if (result.confirmed && result.dontAskAgain) {
        showDeleteProfileConfirmation = false;
        await storageHandler.setLocal('showDeleteProfileConfirmation', false);
      }
    }
    if (!shouldDelete) {
      return;
    }

    // Delete the profile
    const success = await profileManager.deleteProfile(currentDomain, profileName);

    if (success) {
      sendNotification(`Profile "${profileName}" deleted.`, false);
      await updateProfileSelector(currentDomain);
    } else {
      sendNotification('Failed to delete profile.', true);
    }
  }

  /**
   * Exports all profiles to a JSON file
   */
  async function exportAllProfiles() {
    // Exit if in side panel (profile export is popup only? Check requirements)
    // Assuming profile management is popup-only for now.
    if (isSidePanel()) return;
    try {
      const jsonString = await profileManager.exportAllProfiles();
      
      // Create file for download
      const blob = new Blob([jsonString], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      
      // Generate filename with date
      const date = new Date().toISOString().split('T')[0];
      const filename = `cookie-editor-profiles-${date}.json`;
      
      // Trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      
      // Clean up
      URL.revokeObjectURL(url);
      sendNotification('All profiles exported successfully.', false);
    } catch (error) {
      console.error('Export error:', error);
      sendNotification('Failed to export profiles.', true);
    }
  }

  /**
   * Imports profiles from a JSON file
   */
  async function importAllProfiles() {
    // Exit if in side panel
    if (isSidePanel()) return;
    
    // Create file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    
    fileInput.onchange = async function() {
      if (!fileInput.files || fileInput.files.length === 0) return;
      try {
        const files = Array.from(fileInput.files);
        const allProfiles = await profileManager.getAllProfiles();
        const existing = allProfiles[currentDomain] && Object.keys(allProfiles[currentDomain]).length > 0;
        if (existing) {
          const proceed = await showImportMergeDialog();
          if (!proceed) {
            sendNotification('Import cancelled.', false);
              return;
            }
        }
        let importedCount = 0;
        for (const file of files) {
          try {
            const text = await file.text();
            const importedData = JSON.parse(text);
            const profiles = importedData[currentDomain];
            if (profiles && typeof profiles === 'object') {
              if (!allProfiles[currentDomain]) allProfiles[currentDomain] = {};
              for (const name in profiles) {
                allProfiles[currentDomain][name] = profiles[name];
                importedCount++;
                }
              } else {
              sendNotification(`No profiles for ${currentDomain} in file ${file.name}.`, true);
            }
          } catch (err) {
            console.error(`Error importing file ${file.name}:`, err);
            sendNotification(`Failed to import ${file.name}: ${err.message}`, true);
          }
        }
            await storageHandler.setLocal(profileManager.profileStorageKey, allProfiles);
            profileManager._invalidateCache();
        await updateProfileSelector(currentDomain);
        sendNotification(`${importedCount} profiles imported successfully for ${currentDomain}.`, false);
          } catch (error) {
        console.error('Domain import error:', error);
            sendNotification('Failed to import domain profiles: ' + error.message, true);
          }
        };
    fileInput.click();
  }

  /**
   * Opens a dialog to edit the selected profile
   */
  async function editSelectedProfile() {
    // Exit if in side panel
    if (isSidePanel()) return;
    if (!currentDomain || !profileSelector.value) {
      sendNotification('No profile selected.', true);
      return;
    }
    
    const profileName = profileSelector.value;
    
    // Open profile edit dialog
    const newName = await promptProfileEdit(profileName);
    if (!newName || newName === profileName) return;
    
    // Rename the profile
    const success = await profileManager.renameProfile(currentDomain, profileName, newName);
    
    if (success) {
      sendNotification(`Profile renamed to "${newName}".`, false);
      await updateProfileSelector(currentDomain);
      
      // Select the renamed profile
      for (let i = 0; i < profileSelector.options.length; i++) {
        if (profileSelector.options[i].value === newName) {
          profileSelector.selectedIndex = i;
          handleProfileSelectionChange();
          break;
        }
      }
    } else {
      sendNotification('Failed to rename profile. The name may already be in use.', true);
    }
  }

  /**
   * Prompts for editing a profile
   * @param {string} currentName - Current profile name
   * @return {Promise<string|null>} The new profile name or null if canceled
   */
  async function promptProfileEdit(currentName) {
    return new Promise(resolve => {
      const template = document.importNode(
        document.getElementById('tmp-profile-edit').content,
        true
      );
      
      const formContainer = document.createElement('div');
      formContainer.className = 'profile-edit-prompt';
      formContainer.appendChild(template);
      
      // Add form to page
      document.body.appendChild(formContainer);
      
      // Create buttons
      const buttonContainer = document.createElement('div');
      buttonContainer.style.display = 'flex';
      buttonContainer.style.justifyContent = 'flex-end';
      buttonContainer.style.gap = '8px';
      buttonContainer.style.marginTop = '12px';
      
      const cancelButton = document.createElement('button');
      cancelButton.textContent = 'Cancel';
      cancelButton.type = 'button';
      cancelButton.style.padding = '6px 12px';
      
      const saveButton = document.createElement('button');
      saveButton.textContent = 'Save';
      saveButton.type = 'button';
      saveButton.className = 'primary';
      saveButton.style.padding = '6px 12px';
      
      buttonContainer.appendChild(cancelButton);
      buttonContainer.appendChild(saveButton);
      
      const form = formContainer.querySelector('form');
      form.appendChild(buttonContainer);
      
      // Set current name as default value
      const input = form.querySelector('input');
      input.value = currentName;
      
      // Prevent default form submission
      form.onsubmit = function(e) {
        e.preventDefault();
        handleSave();
        return false;
      };
      
      // Position in center of screen
      formContainer.style.position = 'fixed';
      formContainer.style.top = '0';
      formContainer.style.left = '0';
      formContainer.style.right = '0';
      formContainer.style.bottom = '0';
      formContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
      formContainer.style.display = 'flex';
      formContainer.style.alignItems = 'center';
      formContainer.style.justifyContent = 'center';
      formContainer.style.zIndex = '1000';
      
      const formElement = formContainer.querySelector('form');
      formElement.style.backgroundColor = 'var(--primary-surface-color)';
      formElement.style.padding = '20px';
      formElement.style.borderRadius = '8px';
      formElement.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
      
      // Focus the input and select all text
      input.focus();
      input.select();
      
      // Event handlers
      const handleCancel = () => {
        document.body.removeChild(formContainer);
        resolve(null);
      };
      
      const handleSave = () => {
        const newName = input.value.trim();
        if (newName) {
          document.body.removeChild(formContainer);
          resolve(newName);
        } else {
          input.focus();
        }
      };
      
      // Attach events
      cancelButton.addEventListener('click', handleCancel);
      saveButton.addEventListener('click', handleSave);
      
      // Handle escape key
      document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', escHandler);
          handleCancel();
        }
      });
    });
  }

  /**
   * Toggles the profile panel between expanded and collapsed states
   */
  function toggleProfilePanel() {
    // Exit if in side panel
    if (isSidePanel()) return;
    const profilePanel = document.getElementById('profile-management');
    const isCollapsed = profilePanel.classList.contains('collapsed');
    
    // Important: Save panel state to user preferences BEFORE animation
    // This ensures the state is saved even if the animation is interrupted
    const newExpandedState = isCollapsed;
    saveProfilePanelState(newExpandedState);
    
    if (isCollapsed) {
      // EXPANDING
      // Set explicit initial height to ensure we start from the collapsed state
      profilePanel.style.height = '40px';
      
      // Force browser to recognize the current height state
      void profilePanel.offsetHeight;
      
      // First remove the collapsed class which will update the CSS height target
      profilePanel.classList.remove('collapsed');
      
      // Give browser a single frame to register the class change
      window.requestAnimationFrame(() => {
        // Now explicitly set the target height to ensure a smooth transition
        profilePanel.style.height = '148px';
        
        // Once transition completes, remove the inline style to revert to CSS control
        profilePanel.addEventListener('transitionend', function cleanupExpandHeight() {
          profilePanel.style.height = '';
          profilePanel.removeEventListener('transitionend', cleanupExpandHeight);
        }, { once: true });
      });
    } else {
      // COLLAPSING
      // Get current height to start transition from the right point
      const currentHeight = `${profilePanel.offsetHeight}px`;
      profilePanel.style.height = currentHeight;
      
      // Force browser to recognize the current height
      void profilePanel.offsetHeight;
      
      // Set target collapsed height
      window.requestAnimationFrame(() => {
        profilePanel.style.height = '40px';
        
        // Wait for transition to complete before adding collapsed class
        profilePanel.addEventListener('transitionend', function addCollapsedClass() {
          profilePanel.classList.add('collapsed');
          // Remove inline height after class is added
          profilePanel.style.height = '';
          profilePanel.removeEventListener('transitionend', addCollapsedClass);
        }, { once: true });
      });
    }
  }
  
  /**
   * Initializes the profile panel state from user preferences
   */
  async function initProfilePanelState() {
    // Exit if in side panel
    if (isSidePanel()) return;
    try {
      const isExpanded = await storageHandler.getLocal('profilePanelExpanded', false);
      //console.log('Loaded profile panel state:', isExpanded);
      
      if (isExpanded) {
        const profilePanel = document.getElementById('profile-management');
        profilePanel.classList.remove('collapsed');
        // The CSS handles the icon rotation, no need to change the href
      }
    } catch (error) {
      console.error('Error initializing profile panel state:', error);
    }
  }
  
  /**
   * Custom wrapper for getAllDomains that handles side panel context correctly
   * 
   * @param {Function} callback Function called with the results
   */
  function getAllDomainsWrapper(callback) {
    //console.log('[getAllDomainsWrapper] Getting all domains');
    
    if (!isSidePanel()) {
      // In popup context, use the regular function
      cookieHandler.getAllDomains(callback);
      return;
    }
    
    // In side panel context, we need to get all domains manually
    const browserAPI = browserDetector.getApi();
    
    if (browserDetector.supportsPromises()) {
      browserAPI.cookies.getAll({})
        .then(cookies => {
          const domains = extractDomainsFromCookies(cookies);
          //console.log(`[getAllDomainsWrapper] Found ${domains.length} domains`);
          callback(domains);
        })
        .catch(error => {
          console.error('[getAllDomainsWrapper] Error getting domains:', error);
          callback([]);
        });
    } else {
      browserAPI.cookies.getAll({}, cookies => {
        const error = browserAPI.runtime.lastError;
        if (error) {
          console.error('[getAllDomainsWrapper] Error getting domains:', error);
          callback([]);
          return;
        }
        const domains = extractDomainsFromCookies(cookies);
        //console.log(`[getAllDomainsWrapper] Found ${domains.length} domains`);
        callback(domains);
      });
    }
  }
  
  /**
   * Extract unique domains from cookie list
   * 
   * @param {Array} cookies List of cookie objects
   * @return {Array} List of unique domains
   */
  function extractDomainsFromCookies(cookies) {
    const domainSet = new Set();
    
    cookies.forEach(cookie => {
      if (cookie.domain) {
        // Strip leading dot from domains (e.g. ".example.com" -> "example.com")
        const domain = cookie.domain.startsWith('.') ? 
          cookie.domain.substring(1) : cookie.domain;
        domainSet.add(domain);
      }
    });
    
    return Array.from(domainSet);
  }
  
  /**
   * Initializes the domain selector with all domains that have cookies.
   * The population is done asynchronously after the main UI loads.
   */
  function initDomainSelector() {
    // Exit if selector doesn't exist (should always exist now)
    if (!domainSelector) return;

    // PERFORMANCE OPTIMIZATION: Don't load domains immediately on popup open
    // Just update the current domain text and set up a lazy loading mechanism
    
    // Update the "Current tab domain" text if we have a current domain
    if (currentDomain && domainSelector.options.length > 0) {
      // Display the canonical domain (strip www.) for consistency with profile/cookie handling
      const canonicalDomain = currentDomain.toLowerCase().startsWith('www.') ? currentDomain.substring(4) : currentDomain;
      domainSelector.options[0].textContent = `Current tab domain (${canonicalDomain})`;
    }
    
    // Add custom domain option right after "Current tab domain"
    addCustomDomainOption();
    
    // Add a placeholder option that indicates loading will happen
    const loadOption = document.createElement('option');
    loadOption.value = "__load__";
    loadOption.textContent = "Loading domains...";
    loadOption.disabled = true;
    domainSelector.appendChild(loadOption);
    
    // IMPROVEMENT: Start loading domains in the background after a short delay
    // to avoid blocking the initial popup display
    setTimeout(() => {
      // Ensure selector still exists and check loading flag
      if (!domainSelector) return;
      if (!domainSelector._isLoading) {
          domainSelector._isLoading = true;
          // Ensure loading option exists and is marked as loading
          const loadingOption = Array.from(domainSelector.options).find(opt => opt.value === '__load__');
          if (loadingOption) {
              loadingOption.textContent = "Loading domains...";
              loadingOption.disabled = true;
          } else {
              // If loading option somehow doesn't exist, abort background load
              domainSelector._isLoading = false;
              return;
          }
      } else {
          // If already loading (e.g. mousedown triggered first), don't start again
          return;
      }


      getAllDomainsWrapper((domains) => {
        // This callback runs when domains are fetched
        if (!domainSelector) {
            // Popup closed, clear flag if it was set by this timeout
            if (domainSelector && domainSelector._isLoading) domainSelector._isLoading = false;
            return;
        }

        // Explicitly remove the loading option if it still exists
        const currentLoadingOption = Array.from(domainSelector.options).find(opt => opt.value === '__load__');
        if (currentLoadingOption) {
            domainSelector.removeChild(currentLoadingOption);
        }

        // Clear existing dynamically added domain options (beyond index 1: Current, Custom)
        while (domainSelector.options.length > 2) {
          domainSelector.remove(2); // Remove from the end
        }

        // Populate the domain selector
        domains.sort().forEach((domain) => {
          const option = document.createElement('option');
          option.value = domain;
          option.textContent = domain;
          domainSelector.appendChild(option);
        });

        // Clear loading flag
        domainSelector._isLoading = false;

        // NOTE: No need to programmatically open dropdown here,
        // this is the background load. It should only open on user interaction (mousedown).
      });
    }, 150); // Short delay to allow the popup to render first

    // IMPROVEMENT: Add a mousedown event to ensure domains are loaded
    // if background loading hasn't completed yet
    const loadDomains = function(event) {
      // Check if domains are already loaded (more than 2 options: Current, Custom + at least one domain)
      // We check > 2 because the loading option is removed upon completion.
      // Also ensure the loading option itself is gone before removing the listener.
      if (domainSelector.options.length > 2) {
          const loadingOption = Array.from(domainSelector.options).find(opt => opt.value === '__load__');
          if (!loadingOption) { // Ensure loading option is gone
              // Remove this event listener if already loaded
              domainSelector.removeEventListener('mousedown', loadDomains);
              return;
          }
      }

      // Find the loading option
      const loadingOption = Array.from(domainSelector.options).find(opt => opt.value === '__load__');

      // If loading is actually needed (loading option exists and not already loading)
      if (loadingOption && !domainSelector._isLoading) {
        event.preventDefault();
        event.stopPropagation();

        // Set flag to prevent multiple loads
        domainSelector._isLoading = true;

        // Update loading option state
        loadingOption.textContent = "Loading domains...";
        loadingOption.disabled = true;

        // Start fetching domains
        getAllDomainsWrapper((domains) => {
          // Callback runs when domains are fetched
          if (!domainSelector) return; // Check again in case popup closed

          // Explicitly remove the loading option if it still exists
          const currentLoadingOption = Array.from(domainSelector.options).find(opt => opt.value === '__load__');
          if (currentLoadingOption) {
              domainSelector.removeChild(currentLoadingOption);
          }

          // Remove any dynamically added domain options (beyond index 1: Current, Custom) before repopulating
          while (domainSelector.options.length > 2) {
            domainSelector.remove(2); // Remove from the end after the fixed ones
          }

          // Populate the domain selector
          domains.sort().forEach((domain) => {
            const option = document.createElement('option');
            option.value = domain;
            option.textContent = domain;
            domainSelector.appendChild(option);
          });

          // Clear loading flag
          domainSelector._isLoading = false;

          // Now that domains are loaded, trigger the dropdown to open
          setTimeout(() => {
            if (domainSelector) {
              // Programmatically open the dropdown by simulating a mousedown event
              const openEvent = new MouseEvent('mousedown');
              domainSelector.dispatchEvent(openEvent);
            }
          }, 0); // Use timeout 0 to allow UI update before dispatching event
        });
      } else if (domainSelector._isLoading) {
          // If it's already loading (_isLoading is true), prevent default but don't start another load
          event.preventDefault();
          event.stopPropagation();
      }
      // Otherwise (loading option not present, or _isLoading is false but loadingOption missing),
      // allow the default mousedown action (opening the dropdown).
    };

    domainSelector.addEventListener('mousedown', loadDomains);
  }

  /**
   * Adds a custom domain input option to the domain selector dropdown
   */
  function addCustomDomainOption() {
    // Check if custom option already exists to prevent duplicates
    const existingCustomOption = Array.from(domainSelector.options).find(opt => opt.value === "__custom__");
    if (existingCustomOption) return;
    
    // Check if input field already exists to prevent duplicates
    const existingInput = document.getElementById('custom-domain-input');
    if (existingInput) existingInput.remove();
    
    // Create option for custom domain entry
    const customOption = document.createElement('option');
    customOption.value = "__custom__";
    customOption.textContent = "Enter custom domain...";
    customOption.classList.add('custom-domain-option');
    
    // Insert the custom option as the second option (index 1) right after "Current tab domain"
    if (domainSelector.options.length > 0) {
      // If there's only one option (Current tab domain), just append it
      if (domainSelector.options.length === 1) {
        domainSelector.appendChild(customOption);
      } else {
        // Otherwise insert it after the first option
        domainSelector.insertBefore(customOption, domainSelector.options[1]);
      }
    } else {
      domainSelector.appendChild(customOption);
    }
    
    // Create input element that will appear when custom option is selected
    const customDomainInput = document.createElement('input');
    customDomainInput.type = 'text';
    customDomainInput.id = 'custom-domain-input';
    customDomainInput.placeholder = 'example.com';
    customDomainInput.style.display = 'none';
    customDomainInput.style.width = '100%';
    customDomainInput.style.boxSizing = 'border-box';
    customDomainInput.style.padding = '5px';
    customDomainInput.style.margin = '5px 0';
    domainSelector.parentNode.insertBefore(customDomainInput, domainSelector.nextSibling);
    
    // Remove existing event listener if it exists
    domainSelector.removeEventListener('change', handleDomainSelectorChange);
    
    // Event listener for when domain selector changes
    function handleDomainSelectorChange() {
      if (domainSelector.value === '__custom__') {
        // Hide the dropdown and show the input field
        domainSelector.style.display = 'none';
        customDomainInput.style.display = 'block';
        customDomainInput.focus();
      }
    }
    
    // Add the event listener
    domainSelector.addEventListener('change', handleDomainSelectorChange);
    
    // Event listener for when Enter is pressed in custom domain input
    customDomainInput.addEventListener('keydown', async function(e) {
      if (e.key === 'Enter') {
        const customDomain = this.value.trim();
        
        if (customDomain) {
          try {
            // Create proper URL format to check permissions
            let customUrl;
            if (customDomain.includes('://')) {
              customUrl = customDomain;
            } else {
              customUrl = 'https://' + customDomain;
            }
            
            // Check if we can request permissions
            if (!permissionHandler.canHavePermissions(customUrl)) {
              showPermissionImpossible();
              // Reset UI state
              resetCustomDomainUI();
              return;
            }
            
            // Check if we already have permission
            const hasPermission = await permissionHandler.checkPermissions(customUrl);
            
            if (!hasPermission) {
              // Request permission
              const granted = await permissionHandler.requestPermission(customUrl);
              if (!granted) {
                showNoPermission();
                // Reset UI state
                resetCustomDomainUI();
                return;
              }
            }
            
            // Update the selected domain
            selectedDomain = customDomain;
            currentDomain = customDomain;
            
            // Clear cookie cache
            cookieCache.clear();
            
            // Reset UI state
            customDomainInput.style.display = 'none';
            domainSelector.style.display = 'block';
            
            // Add option for this domain if it doesn't exist
            let domainExists = false;
            let customOptionIndex = -1;
            
            // Check if domain already exists and find custom option index
            for (let i = 0; i < domainSelector.options.length; i++) {
              if (domainSelector.options[i].value === customDomain) {
                domainExists = true;
                domainSelector.selectedIndex = i;
              }
              if (domainSelector.options[i].value === "__custom__") {
                customOptionIndex = i;
              }
            }
            
            if (!domainExists && customDomain !== "") {
              const newOption = document.createElement('option');
              newOption.value = customDomain;
              newOption.textContent = customDomain;
              
              // Add new domain right after the custom domain option
              if (customOptionIndex !== -1 && customOptionIndex + 1 < domainSelector.options.length) {
                domainSelector.insertBefore(newOption, domainSelector.options[customOptionIndex + 1]);
              } else {
                // Fallback to appending at the end
                domainSelector.appendChild(newOption);
              }
              domainSelector.value = customDomain;
            }
            
            // Update profile selector
            if (!isSidePanel() && profileSelector) {
              updateProfileSelector(currentDomain).catch(error => {
                console.error('Error updating profile selector for custom domain:', error);
              });
            }
            
            // Show cookies for this domain
            isAnimating = true;
            showCookiesForSelectedDomain(true).then(() => {
              isAnimating = false;
            }).catch(error => {
              console.error('Error showing cookies for custom domain:', error);
              isAnimating = false;
            });
          } catch (error) {
            console.error('Error processing custom domain:', error);
            showNoPermission();
            // Reset UI state
            resetCustomDomainUI();
          }
        } else {
          // Reset UI state if empty input
          resetCustomDomainUI();
        }
      } else if (e.key === 'Escape') {
        // Reset UI state on Escape
        resetCustomDomainUI();
      }
    });
    
    // Function to reset the custom domain UI state
    function resetCustomDomainUI() {
      customDomainInput.style.display = 'none';
      domainSelector.style.display = 'block';
      domainSelector.value = '';
      // Explicitly clear selected domain and trigger change handler
      selectedDomain = '';
      handleDomainSelectionChange(); 
    }
    
    // Handle clicking outside the input - use capturing phase to ensure it runs before other handlers
    document.addEventListener('click', function handleOutsideClick(e) {
      if (e.target !== customDomainInput && 
          e.target !== domainSelector && 
          customDomainInput.style.display === 'block') {
        resetCustomDomainUI();
      }
    }, true);
  }
  
  /**
   * Handles when a user selects a different domain from the dropdown.
   */
  function handleDomainSelectionChange() {
    // Exit if selector doesn't exist
    if (!domainSelector) return;
    
    //console.log('[handleDomainSelectionChange] Called. Selected value:', domainSelector.value);
    
    // Skip custom domain option as it's handled separately
    if (domainSelector.value === '__custom__') {
      return;
    }
    
    // Get the selected domain
    selectedDomain = domainSelector.value;
    
    // Update current domain for profile management
    currentDomain = selectedDomain;
    
    // IMPORTANT: Clear cookie cache when changing domains
    cookieCache.clear();
    
    // Check if we're currently in the add cookie or import cookie screens
    const isInAddCookieScreen = document.getElementById('button-bar-add').classList.contains('active');
    const isInImportScreen = document.getElementById('button-bar-import').classList.contains('active');
    
    // If we're in the add or import screens, update the domain data without switching views
    if (isInAddCookieScreen || isInImportScreen) {
      //console.log('[handleDomainSelectionChange] In add/import screen, updating domain data without view change');
      
      // Update profile selector only if it exists (popup only feature)
      if (!isSidePanel() && profileSelector) {
        updateProfileSelector(currentDomain).catch(error => {
          console.error('Error updating profile selector for new domain:', error);
        });
      }
      
      // Update the form's domain data
      const form = containerCookie.querySelector('form');
      if (form && form.dataset) {
        form.dataset.domain = selectedDomain;
        //console.log('[handleDomainSelectionChange] Updated form domain data to:', selectedDomain);
      }
      
      return;
    }
    
    // Check flags before proceeding with view change
    if (disableButtons || isAnimating) {
      //console.log('[handleDomainSelectionChange] Skipped due to disableButtons or isAnimating flag.');
      return;
    }
    
    //console.log('[handleDomainSelectionChange] Current flags - disableButtons:', disableButtons, 'isAnimating:', isAnimating);
    
    // Update profile selector only if it exists (popup only feature)
    if (!isSidePanel() && profileSelector) {
      updateProfileSelector(currentDomain).catch(error => {
        console.error('Error updating profile selector for new domain:', error);
      });
    }
    
    // Set animation flag to indicate operation in progress
    isAnimating = true;
    
    //console.log('[handleDomainSelectionChange] Calling showCookiesForSelectedDomain for selected domain:', selectedDomain, 'isAnimating:', isAnimating);
    
    try {
      // Check if user selected "Current tab domain" (empty value)
      if (selectedDomain === '') {
        // If empty value selected, show cookies for current tab
        //console.log('[handleDomainSelectionChange] Empty domain selected, showing cookies for current tab');
        
        // Use a promise with timeout to ensure isAnimating flag gets reset
        const loadingPromise = showCookiesForTab(true);
        
        // Set a timeout to ensure flag is reset even if promise hangs
        const timeoutId = setTimeout(() => {
          //console.log('[handleDomainSelectionChange] Safety timeout triggered, resetting animation flag.');
          isAnimating = false;
          
          // Update search placeholder even if there was a timeout
          updateSearchPlaceholder();
        }, 5000); // 5 second safety timeout
        
        loadingPromise.then(() => {
          //console.log('[handleDomainSelectionChange] showCookiesForTab Promise resolved, resetting animation flag.');
          clearTimeout(timeoutId); // Clear the safety timeout
          isAnimating = false;
          
          // Update search placeholder after cookies are loaded
          updateSearchPlaceholder();
        }).catch(error => {
          console.error('[handleDomainSelectionChange] Error in showCookiesForTab:', error);
          clearTimeout(timeoutId); // Clear the safety timeout
          isAnimating = false;
          
          // Update search placeholder even if there was an error
          updateSearchPlaceholder();
        });
      } else {
        // For any other domain, show cookies for selected domain
        // Pass forceExecution=true to bypass the disableButtons and isAnimating checks
        
        // Use a promise with timeout to ensure isAnimating flag gets reset
        const loadingPromise = showCookiesForSelectedDomain(true);
        
        // Set a timeout to ensure flag is reset even if promise hangs
        const timeoutId = setTimeout(() => {
          //console.log('[handleDomainSelectionChange] Safety timeout triggered, resetting animation flag.');
          isAnimating = false;
          
          // Update search placeholder even if there was a timeout
          updateSearchPlaceholder();
        }, 5000); // 5 second safety timeout
        
        loadingPromise.then(() => {
          //console.log('[handleDomainSelectionChange] showCookiesForSelectedDomain Promise resolved, resetting animation flag.');
          clearTimeout(timeoutId); // Clear the safety timeout
          isAnimating = false;
          
          // Update search placeholder after cookies are loaded
          updateSearchPlaceholder();
        }).catch(error => {
          console.error('[handleDomainSelectionChange] Error in showCookiesForSelectedDomain:', error);
          clearTimeout(timeoutId); // Clear the safety timeout
          isAnimating = false;
          
          // Update search placeholder even if there was an error
          updateSearchPlaceholder();
        });
      }
    } catch (error) {
      // Catch any synchronous errors
      console.error('[handleDomainSelectionChange] Unexpected error:', error);
      isAnimating = false;
      
      // Update search placeholder even if there was an error
      updateSearchPlaceholder();
    }
  }
  
  /**
   * Saves the profile panel state to user preferences
   * @param {boolean} isExpanded - Whether the panel is expanded
   */
  function saveProfilePanelState(isExpanded) {
    // Exit if in side panel
    if (isSidePanel()) return;
    //console.log('Saving profile panel state:', isExpanded ? 'expanded' : 'collapsed');
    storageHandler.setLocal('profilePanelExpanded', isExpanded)
      .catch(error => console.error('Error saving profile panel state:', error));
  }

  /**
   * Toggles the visibility of the domain profile actions menu
   * @param {Event} e - Click event
   */
  function toggleDomainActionsMenu(e) {
    // Exit if in side panel
    if (isSidePanel()) return;
    e.stopPropagation();
    
    const domainProfileMenu = document.getElementById('domain-profile-menu');
    const domainProfilesSubmenu = document.getElementById('domain-profiles-submenu-content');
    const allProfilesSubmenu = document.getElementById('all-profiles-submenu-content');
    const button = document.getElementById('profile-actions');
    
    // Toggle visibility of main menu
    const isVisible = domainProfileMenu.classList.contains('visible');
    
    if (!isVisible) {
      // Position the menu relative to the button
      const buttonRect = button.getBoundingClientRect();
      domainProfileMenu.style.top = `${buttonRect.bottom + 5}px`;
      domainProfileMenu.style.left = `${buttonRect.left - 170}px`; // Align right edge with button
      
      // Show the main menu
      domainProfileMenu.classList.add('visible');
      
      // Hide submenus
      domainProfilesSubmenu.classList.remove('visible');
      allProfilesSubmenu.classList.remove('visible');
      
      // Set up event listeners for submenu navigation
      setupSubmenuListeners();
    } else {
      // Hide all menus
      hideAllMenus();
    }
  }

  /**
   * Sets up event listeners for the profile submenu navigation
   */
  function setupSubmenuListeners() {
    const domainProfileMenu = document.getElementById('domain-profile-menu');
    const domainProfilesSubmenu = document.getElementById('domain-profiles-submenu-content');
    const allProfilesSubmenu = document.getElementById('all-profiles-submenu-content');
    
    // Domain Profiles submenu button
    const domainProfilesBtn = document.getElementById('domain-profiles-submenu');
    if (domainProfilesBtn) {
      // Remove existing listeners to prevent duplicates
      const newDomainProfilesBtn = domainProfilesBtn.cloneNode(true);
      if (domainProfilesBtn.parentNode) {
        domainProfilesBtn.parentNode.replaceChild(newDomainProfilesBtn, domainProfilesBtn);
      }
      
      newDomainProfilesBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        domainProfileMenu.classList.remove('visible');
        domainProfilesSubmenu.classList.add('visible');
        
        // Position submenu in the same spot as the main menu
        domainProfilesSubmenu.style.top = domainProfileMenu.style.top;
        domainProfilesSubmenu.style.left = domainProfileMenu.style.left;
      });
    }
    
    // All Profiles submenu button
    const allProfilesBtn = document.getElementById('all-profiles-submenu');
    if (allProfilesBtn) {
      // Remove existing listeners to prevent duplicates
      const newAllProfilesBtn = allProfilesBtn.cloneNode(true);
      if (allProfilesBtn.parentNode) {
        allProfilesBtn.parentNode.replaceChild(newAllProfilesBtn, allProfilesBtn);
      }
      
      newAllProfilesBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        domainProfileMenu.classList.remove('visible');
        allProfilesSubmenu.classList.add('visible');
        
        // Position submenu in the same spot as the main menu
        allProfilesSubmenu.style.top = domainProfileMenu.style.top;
        allProfilesSubmenu.style.left = domainProfileMenu.style.left;
      });
    }
    
    // Back buttons
    const domainProfilesBack = document.getElementById('domain-profiles-back');
    if (domainProfilesBack) {
      // Remove existing listeners to prevent duplicates
      const newDomainProfilesBack = domainProfilesBack.cloneNode(true);
      if (domainProfilesBack.parentNode) {
        domainProfilesBack.parentNode.replaceChild(newDomainProfilesBack, domainProfilesBack);
      }
      
      newDomainProfilesBack.addEventListener('click', (e) => {
        e.stopPropagation();
        domainProfilesSubmenu.classList.remove('visible');
        domainProfileMenu.classList.add('visible');
      });
    }
    
    const allProfilesBack = document.getElementById('all-profiles-back');
    if (allProfilesBack) {
      // Remove existing listeners to prevent duplicates
      const newAllProfilesBack = allProfilesBack.cloneNode(true);
      if (allProfilesBack.parentNode) {
        allProfilesBack.parentNode.replaceChild(newAllProfilesBack, allProfilesBack);
      }
      
      newAllProfilesBack.addEventListener('click', (e) => {
        e.stopPropagation();
        allProfilesSubmenu.classList.remove('visible');
        domainProfileMenu.classList.add('visible');
      });
    }
    
    const exportDomainBtn = document.getElementById('export-domain-profiles');
    if (exportDomainBtn) {
      // Remove existing listeners to prevent duplicates
      const newExportDomainBtn = exportDomainBtn.cloneNode(true);
      if (exportDomainBtn.parentNode) {
        exportDomainBtn.parentNode.replaceChild(newExportDomainBtn, exportDomainBtn);
      }
      
      newExportDomainBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideAllMenus();
        exportDomainProfiles();
      });
    }
    
    // Import and export buttons in all profiles submenu
    const importAllBtn = document.getElementById('import-all-profiles');
    if (importAllBtn) {
      // Remove existing listeners to prevent duplicates
      const newImportAllBtn = importAllBtn.cloneNode(true);
      if (importAllBtn.parentNode) {
        importAllBtn.parentNode.replaceChild(newImportAllBtn, importAllBtn);
      }
      
      newImportAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideAllMenus();
        importAllProfiles();
      });
    }
    
    const exportAllBtn = document.getElementById('export-all-profiles');
    if (exportAllBtn) {
      // Remove existing listeners to prevent duplicates
      const newExportAllBtn = exportAllBtn.cloneNode(true);
      if (exportAllBtn.parentNode) {
        exportAllBtn.parentNode.replaceChild(newExportAllBtn, exportAllBtn);
      }
      
      newExportAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideAllMenus();
        exportAllProfiles();
      });
    }
    
    // Close menus when clicking outside
    document.addEventListener('click', function closeMenusHandler(e) {
      const domainProfileMenu = document.getElementById('domain-profile-menu');
      const domainProfilesSubmenu = document.getElementById('domain-profiles-submenu-content');
      const allProfilesSubmenu = document.getElementById('all-profiles-submenu-content');
      const profileActionsButton = document.getElementById('profile-actions');
      
      const isProfileButton = e.target === profileActionsButton || profileActionsButton.contains(e.target);
      const isMainMenu = e.target === domainProfileMenu || domainProfileMenu.contains(e.target);
      const isDomainSubmenu = e.target === domainProfilesSubmenu || domainProfilesSubmenu.contains(e.target);
      const isAllSubmenu = e.target === allProfilesSubmenu || allProfilesSubmenu.contains(e.target);
      
      if (!isProfileButton && !isMainMenu && !isDomainSubmenu && !isAllSubmenu) {
        hideAllMenus();
        document.removeEventListener('click', closeMenusHandler);
      }
    });
  }

  /**
   * Hides all profile action menus
   */
  function hideAllMenus() {
    const domainProfileMenu = document.getElementById('domain-profile-menu');
    const domainProfilesSubmenu = document.getElementById('domain-profiles-submenu-content');
    const allProfilesSubmenu = document.getElementById('all-profiles-submenu-content');
    
    domainProfileMenu.classList.remove('visible');
    domainProfilesSubmenu.classList.remove('visible');
    allProfilesSubmenu.classList.remove('visible');
  }

  /**
   * Exports profiles for just the current domain
   */
  async function exportDomainProfiles() {
    // Exit if in side panel
    if (isSidePanel()) return;
    if (!currentDomain) {
      sendNotification('No domain detected.', true);
      return;
    }
    
    try {
      // Hide the menu
      document.getElementById('domain-profile-menu').classList.remove('visible');
      
      // Get profiles for current domain only
      const allProfiles = await profileManager.getAllProfiles();
      
      if (!allProfiles[currentDomain] || Object.keys(allProfiles[currentDomain]).length === 0) {
        sendNotification('No profiles exist for this domain.', true);
        return;
      }
      
      // Create a new object with just the current domain
      const domainProfiles = { 
        [currentDomain]: allProfiles[currentDomain] 
      };
      
      // Convert to JSON
      const jsonString = JSON.stringify(domainProfiles, null, 2);
      
      // Create file for download
      const blob = new Blob([jsonString], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      
      // Generate filename with domain and date
      const date = new Date().toISOString().split('T')[0];
      const domainSafe = currentDomain.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const filename = `cookie-editor-${domainSafe}-profiles-${date}.json`;
      
      // Trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      
      // Clean up
      URL.revokeObjectURL(url);
      sendNotification(`Profiles for ${currentDomain} exported successfully.`, false);
    } catch (error) {
      console.error('Domain export error:', error);
      sendNotification('Failed to export domain profiles.', true);
    }
  }

  /**
   * Imports profiles for just the current domain
   */
  async function importDomainProfiles() {
    // Exit if in side panel
    if (isSidePanel()) return;

    // Get current domain context *before* file selection
    // Assuming 'currentDomain' is accessible in this scope
    const domainForImport = currentDomain;
    if (!domainForImport) {
        sendNotification("No active domain specified for import.", false);
        return;
    }

    // Create file input - allow multiple files
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json'; // Accept JSON files explicitly
    fileInput.multiple = true; // Allow selecting multiple files

    fileInput.onchange = async function() {
        if (!fileInput.files || fileInput.files.length === 0) {
            sendNotification("Import canceled: No files selected.", false);
            return;
        }

        const files = Array.from(fileInput.files);
        let totalImportedCount = 0;
        let totalOverwrittenCount = 0;
        let totalSkippedCount = 0;
        let totalFailedFiles = 0;

        // Let user know we are starting
        sendNotification(`Processing ${files.length} file(s)...`, false);

        for (const file of files) {
            let fileImported = 0; // Count new profiles from this file
            let fileOverwritten = 0; // Count overwritten profiles from this file
            let fileSkipped = 0; // Count skipped profiles from this file

            try {
                const content = await file.text();
                const data = JSON.parse(content);

                // --- Check format: Standard Array or Profile Object ---
                if (Array.isArray(data)) {
                    // --- Handle Standard Cookie Array Export ---
                    console.log(`File ${file.name}: Detected standard cookie array format.`);
                    if (data.length === 0) {
                        sendNotification(`Skipping ${file.name}: The JSON array is empty.`, true);
                        fileSkipped++; // Count as skipped
                    } else {
                        // Basic check: does the first item look like a cookie?
                        const firstItem = data[0];
                        if (typeof firstItem !== 'object' || firstItem === null || !firstItem.name || !firstItem.value || !firstItem.domain) {
                            sendNotification(`Skipping ${file.name}: Array does not appear to contain valid cookie objects.`, true);
                            fileSkipped++; // Count as skipped
                        } else {
                            // Prompt for profile name FOR THIS FILE
                            // Use a default suggestion based on filename minus extension
                            const defaultNameSuggestion = file.name.replace(/\.[^/.]+$/, ""); // Simple extension removal
                            const profileName = await promptProfileName(`Enter profile name for: ${file.name}`, defaultNameSuggestion);

                            if (!profileName) {
                                sendNotification(`Import skipped for ${file.name}: No profile name provided.`, false);
                                fileSkipped++;
                            } else {
                                // Check conflict for this specific name
                                const existingProfiles = await profileManager.getProfilesForDomain(domainForImport);
                                let overwrite = false;
                                if (existingProfiles && existingProfiles[profileName]) {
                                    overwrite = await confirmAction(
                                        `Profile "${profileName}" already exists for domain ${domainForImport} (from file ${file.name}). Overwrite?`,
                                        'Import Conflict', 'Overwrite'
                                    );
                                    if (!overwrite) {
                                        sendNotification(`Import skipped for ${file.name} to avoid overwrite.`, false);
                                        fileSkipped++;
                                    }
                                }

                                if (!existingProfiles[profileName] || overwrite) {
                                    // Save the profile
                                    await profileManager.saveProfile(domainForImport, profileName, data);
                                    if (overwrite) {
                                        fileOverwritten++;
                                        sendNotification(`File ${file.name}: Overwrote profile "${profileName}" with ${data.length} cookies.`, false);
                                    } else {
                                        fileImported++;
                                        sendNotification(`File ${file.name}: Imported ${data.length} cookies as new profile "${profileName}".`, false);
                                    }
                                }
                            }
                        }
                    }

                } else if (typeof data === 'object' && data !== null) {
                    // --- Handle Existing Profile Object Format ---
                    console.log(`File ${file.name}: Detected profile object format.`);
                    // Basic validation of the imported data structure
                    // Allow flexibility: check only for 'profiles' object
                    if (!data.profiles || typeof data.profiles !== 'object') {
                         // Try to find profiles under a domain key if 'profiles' key is missing
                         let potentialDomainKey = Object.keys(data).find(key => typeof data[key] === 'object' && data[key] !== null && Object.keys(data[key]).length > 0);
                         if (potentialDomainKey && typeof data[potentialDomainKey] === 'object') {
                             console.log(`Found profiles under domain key '${potentialDomainKey}' in ${file.name}. Treating as profile format.`);
                             // Re-assign data structure to match expected format for simplicity downstream
                             data.profiles = data[potentialDomainKey];
                             data.domain = potentialDomainKey; // Assume the key is the intended domain
                             data.type = 'CookieEditorDomainProfiles'; // Assume type
                         } else {
                            sendNotification(`Skipping ${file.name}: Invalid profile file format. Expected a 'profiles' object or a structure like { "domain.com": { "profileName": [...] } }.`, true);
                            fileSkipped++; // Count whole file as skipped
                            continue; // Go to next file
                         }
                    }

                    // Determine the domain to save under
                    let effectiveDomain = domainForImport;
                    const importDomain = data.domain; // Domain specified in the file, if any

                    if (importDomain && importDomain !== domainForImport) {
                        const proceed = await confirmAction(
                            `File ${file.name} contains profiles for domain "${importDomain}". Import these profiles for the current domain "${domainForImport}" anyway?`,
                            'Domain Mismatch', 'Import Anyway'
                        );
                        if (!proceed) {
                            sendNotification(`Import skipped for file ${file.name} due to domain mismatch.`, false);
                            fileSkipped += Object.keys(data.profiles).length; // Skip all profiles in this file
                            continue; // Go to next file
                        }
                        sendNotification(`Importing profiles from "${importDomain}" into "${domainForImport}" for file ${file.name}.`, false);
                    }

                    const profilesToImport = data.profiles;
                    const profileNames = Object.keys(profilesToImport);

                    if (profileNames.length === 0) {
                        sendNotification(`No profiles found in file ${file.name}.`, false);
                        continue; // Go to next file
                    }

                    // Check all conflicts within this file first
                    const existingProfiles = await profileManager.getProfilesForDomain(effectiveDomain);
                    const conflicts = profileNames.filter(name => existingProfiles && existingProfiles[name]);
                    let overwriteConfirmed = false; // Default to false

                    if (conflicts.length > 0) {
                        const conflictMessage = conflicts.length === 1
                            ? `Profile "${conflicts[0]}" already exists.`
                            : `Profiles "${conflicts.join('", "')}" already exist.`;
                        overwriteConfirmed = await confirmAction(
                            `File ${file.name}: ${conflictMessage} Overwrite existing profile(s)?`,
                            'Import Conflict', 'Overwrite'
                        );
                        if (!overwriteConfirmed) {
                            sendNotification(`Skipping ${conflicts.length} conflicting profile(s) in ${file.name}.`, false);
                        }
                    }

                    // Perform the import for profiles within this file
                    for (const profileName of profileNames) {
                        const profileDataOrArray = profilesToImport[profileName];

                        // Validate profile structure: should be array or object with .cookies array
                        let cookiesToSave = null;
                        if (Array.isArray(profileDataOrArray)) {
                            cookiesToSave = profileDataOrArray; // Allow direct array format
                        } else if (profileDataOrArray && Array.isArray(profileDataOrArray.cookies)) {
                            cookiesToSave = profileDataOrArray.cookies; // Extract from { cookies: [...] }
                        }

                        if (!cookiesToSave || !Array.isArray(cookiesToSave)) {
                            console.warn(`Skipping invalid profile structure for '${profileName}' in file ${file.name}. Expected array or {cookies: [...]}.`);
                            fileSkipped++;
                            continue; // Skip this profile
                        }

                        const isConflict = conflicts.includes(profileName);

                        if (!isConflict || overwriteConfirmed) {
                            // Save the profile (using the extracted cookies array)
                            await profileManager.saveProfile(effectiveDomain, profileName, cookiesToSave);
                            if (isConflict) {
                                fileOverwritten++;
                            } else {
                                fileImported++;
                            }
                        } else {
                            // Was a conflict, but user chose not to overwrite
                            fileSkipped++;
                        }
                    }
                     let fileSummary = `File ${file.name}: ${fileImported} new, ${fileOverwritten} overwritten, ${fileSkipped} skipped.`;
                     sendNotification(fileSummary, false);

                } else {
                    // --- Handle Invalid Format ---
                    sendNotification(`Skipping ${file.name}: Invalid file content (not a JSON array or recognized profile object).`, true);
                    totalFailedFiles++; // Use a specific counter for files that couldn't be parsed/understood at all
                }

            } catch (error) {
                console.error(`Error processing file ${file.name}:`, error);
                sendNotification(`Import failed for ${file.name}: ${error.message}`, true);
                totalFailedFiles++;
            } finally {
                 // Accumulate counts for the final summary
                 totalImportedCount += fileImported;
                 totalOverwrittenCount += fileOverwritten;
                 // Adjust skip count based on file-level skips vs profile-level skips
                 // If a file failed parsing, it contributes 1 to totalFailedFiles, not skips.
                 // If a file was skipped due to no name or domain mismatch, it contributes its potential profiles to totalSkippedCount.
                 // For simplicity now, accumulate fileSkipped from loops.
                 totalSkippedCount += fileSkipped;
            }
        } // End loop files

        // --- Final Summary ---
        let summaryParts = [`Import finished. ${files.length} file(s) processed.`];
        if (totalImportedCount > 0) summaryParts.push(`${totalImportedCount} new profile(s) added.`);
        if (totalOverwrittenCount > 0) summaryParts.push(`${totalOverwrittenCount} profile(s) overwritten.`);
        if (totalSkippedCount > 0) summaryParts.push(`${totalSkippedCount} profile(s) skipped.`);
        if (totalFailedFiles > 0) summaryParts.push(`${totalFailedFiles} file(s) failed processing.`);

        sendNotification(summaryParts.join(' '), totalFailedFiles > 0);

        // Refresh the profile selector UI to reflect changes
        if (totalImportedCount > 0 || totalOverwrittenCount > 0) {
             await updateProfileSelector(domainForImport);
        }

        // Clean up the dynamically created file input element
        if (fileInput.parentNode) {
            fileInput.remove();
        }
    }; // End onchange

    // Temporarily add to body to trigger click, then remove (removal happens in onchange now)
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    fileInput.click();

     // Hide the domain actions menu after initiating the process
     if (domainProfileMenu) domainProfileMenu.classList.remove('visible');
     document.removeEventListener('click', closeDomainActionsMenuOnClickOutside);
}

  // Cookie sharing functions
  /**
   * Handles clicking the share cookies button.
   * @param {Event} event - Click event
   */
  function handleShareCookiesClick(event) {
    // Exit if in side panel (sharing might be popup-only?)
    if (isSidePanel()) return;
    event.preventDefault();
    event.stopPropagation(); // Prevent event bubbling
    
    // Check if dialog is already open
    const existingDialog = document.querySelector('.share-dialog');
    if (existingDialog) {
      // If dialog is already open, close it
      existingDialog.remove();
      return;
    }
    
    // If dialog is not open, proceed to create and show it
    
    // Get the current domain (either selected or from current tab)
    const domain = selectedDomain || getDomainFromUrl(cookieHandler.currentTab.url);
    
    if (!domain) {
      sendNotification('Cannot share cookies: Invalid domain', true);
            return;
        }

    // Get cookies for the domain or current tab
    const getCookiesPromise = selectedDomain 
      ? new Promise(resolve => {
          cookieHandler.getCookiesForDomain(selectedDomain, resolve);
        })
      : new Promise(resolve => {
          cookieHandler.getAllCookies(resolve);
        });
    
    // Get profiles for the domain in parallel
    const getProfilesPromise = profileManager.getProfilesForDomain(domain);
    
    // Wait for both cookies and profiles to load
    Promise.all([getCookiesPromise, getProfilesPromise])
      .then(([cookies, profiles]) => {
      if (!cookies || cookies.length === 0) {
          if (Object.keys(profiles).length === 0) {
            sendNotification('No cookies or profiles found to share', true);
        return;
          }
      }
      
        showShareDialog(cookies, domain, profiles);
    });
  }
  
  /**
   * Shows the share dialog with the generated URL.
   * @param {Array} cookies - Array of cookie objects
   * @param {string} domain - Domain these cookies are for
   * @param {Object} profiles - Object containing domain profiles
   */
  async function showShareDialog(cookies, domain, profiles) {
    // Dynamically load share helpers
    const { createShareableUrl, createShareableProfilesUrl } = await import('../lib/sharing/cookieSharing.js');
    // Clone the template
    const template = document.importNode(
      document.getElementById('tmp-share-dialog').content,
      true
    );
    
    const dialogElement = template.querySelector('.share-dialog');
    const shareProfilesCheckbox = template.getElementById('share-profiles');
    const profileSelectorContainer = template.querySelector('.share-profile-selector-container');
    const profileSelector = template.getElementById('share-profile-selector');
    const encryptCheckbox = template.getElementById('share-encrypt');
    const passwordContainer = template.querySelector('.password-container');
    const passwordField = template.getElementById('share-password');
    const showPasswordBtn = template.getElementById('show-password');
    const passwordStrength = template.getElementById('password-strength');
    const urlField = template.getElementById('share-url-field');
    const copyButton = template.getElementById('copy-share-url');
    const cancelButton = template.getElementById('share-cancel');
    const closeXButton = template.getElementById('share-close-x');
    
    // Add tooltip to URL field
    const permissionTooltip = `Recipients will need cookie permissions for ${domain} to import these cookies.`;
    urlField.title = permissionTooltip;
    copyButton.title = permissionTooltip;
    
    // Add visual indicator that there's tooltip information
    const urlLabel = urlField.parentElement.querySelector('label');
    if (urlLabel) {
      urlLabel.innerHTML = `URL <span class="info-icon" title="${permissionTooltip}">\
        <svg class="icon" width="12" height="12">\
          <use href="../sprites/solid.svg#circle-info"></use>\
        </svg>\
      </span>`;
      
      // Style the info icon
      const infoIcon = urlLabel.querySelector('.info-icon');
      if (infoIcon) {
        infoIcon.style.cssText = `
          display: inline-flex;
          align-items: center;
          margin-left: 4px;
          cursor: help;
          color: var(--text-secondary, #666);
        `;
      }
    }
    
    // Fill profile selector with available profiles
    if (profiles && Object.keys(profiles).length > 0) {
      // Add individual profile options
      Object.keys(profiles).forEach(profileName => {
        const option = document.createElement('option');
        option.value = profileName;
        option.textContent = profileName;
        profileSelector.appendChild(option);
      });
    } else {
      // Disable profile sharing if no profiles exist
      shareProfilesCheckbox.disabled = true;
      shareProfilesCheckbox.title = "No profiles available for this domain";
    }
    
    // Position the dialog above the profile menu
    const profileMenu = document.getElementById('profile-management');
    const profileRect = profileMenu.getBoundingClientRect();
    const mainWrapper = document.querySelector('.main-content-wrapper');
    const wrapperRect = mainWrapper.getBoundingClientRect();
    
    // Position at the top of the main wrapper, above the profile menu
    dialogElement.style.position = 'absolute';
    dialogElement.style.bottom = (wrapperRect.bottom - profileRect.top + 10) + 'px';
    dialogElement.style.left = '50%';
    dialogElement.style.transform = 'translateX(-50%)';
    dialogElement.style.zIndex = '100';
    
    // Generate the shareable URL
    const updateShareUrl = async () => {
      // expiration removed: always no expiration
      const expires = false;
      
      // Check if sharing profiles or cookies
      if (shareProfilesCheckbox.checked && profileSelector.value) {
        // Show "generating..." while preparing
        urlField.value = "Generating URL...";
        
        // Get the selected profile or all profiles
        let profilesData = {};
        if (profileSelector.value === 'all') {
          profilesData = profiles;
        } else {
          const profileName = profileSelector.value;
          profilesData = { [profileName]: profiles[profileName] };
        }
        
        try {
          if (encryptCheckbox.checked && passwordField.value) {
            // Generate URL with encryption
            const shareUrl = await createShareableProfilesUrl(profilesData, domain, expires, {
              encrypted: true,
              password: passwordField.value
            });
            urlField.value = shareUrl;
          } else {
            // Standard non-encrypted URL
            const shareUrl = await createShareableProfilesUrl(profilesData, domain, expires);
            urlField.value = shareUrl;
          }
        } catch (error) {
          console.error('Error creating profile URL:', error);
          urlField.value = "Error creating URL";
        }
      } else {
        // Original cookie sharing functionality
        if (encryptCheckbox.checked && passwordField.value) {
          urlField.value = "Generating encrypted URL...";
          
          try {
            // Generate URL with encryption
            const shareUrl = await createShareableUrl(cookies, domain, expires, {
              encrypted: true,
              password: passwordField.value
            });
            urlField.value = shareUrl;
          } catch (error) {
            console.error('Error creating encrypted URL:', error);
            urlField.value = "Error creating encrypted URL";
          }
                    } else {
          // Standard non-encrypted URL
          const shareUrl = await createShareableUrl(cookies, domain, expires);
          urlField.value = shareUrl;
        }
      }
    };
    
    // Handler for showing/hiding password
    showPasswordBtn.addEventListener('click', () => {
      if (passwordField.type === 'password') {
        passwordField.type = 'text';
        showPasswordBtn.querySelector('use').setAttribute('href', '../sprites/solid.svg#eye-slash');
                        } else {
        passwordField.type = 'password';
        showPasswordBtn.querySelector('use').setAttribute('href', '../sprites/solid.svg#eye');
      }
    });
    
    // Password strength evaluation
    passwordField.addEventListener('input', async () => {
      const password = passwordField.value;
      
      try {
        // Import the evaluatePasswordStrength function dynamically
        const { evaluatePasswordStrength } = await import('../lib/sharing/encryptionUtils.js');
        const strength = evaluatePasswordStrength(password);
        
        // Update the feedback
        passwordStrength.textContent = strength.feedback;
        
        // Clear existing classes
        passwordStrength.className = 'password-strength';
        
        // Add appropriate class
        if (strength.level) {
          passwordStrength.classList.add(strength.level);
        }
        
        // Update URL with new password
        updateShareUrl();
      } catch (error) {
        console.error('Error evaluating password strength:', error);
      }
    });
    
    // Toggle password field visibility
    encryptCheckbox.addEventListener('change', function() {
      if (this.checked) {
        passwordContainer.style.display = 'block';
        passwordField.focus();
                            } else {
        passwordContainer.style.display = 'none';
      }
      
      // Update URL when encryption toggle changes
      updateShareUrl();
    });
    
    // Toggle profile selector visibility when checkbox is clicked
    shareProfilesCheckbox.addEventListener('change', function() {
      if (this.checked) {
        profileSelectorContainer.style.display = 'block';
      } else {
        profileSelectorContainer.style.display = 'none';
      }
      
      // Update URL when sharing mode changes
      updateShareUrl();
    });
    
    // Update URL when profile selection changes
    profileSelector.addEventListener('change', updateShareUrl);
    
    // Set initial URL
    updateShareUrl();
    
    // Copy URL button
    copyButton.addEventListener('click', () => {
      urlField.select();
      copyText(urlField.value);
      copyButton.querySelector('use').setAttribute('href', '../sprites/solid.svg#check');
      setTimeout(() => {
        copyButton.querySelector('use').setAttribute('href', '../sprites/solid.svg#copy');
      }, 1500);
    });
    
    // Cancel button
    cancelButton.addEventListener('click', () => {
      dialogElement.remove();
      removeHashFromUrl();
      
      // Clear storage and badge
      browserDetector.getApi().storage.local.remove('pendingSharedData');
      clearBadge();
      
      // Reset the processing flag
      sharedDataProcessingInProgress = false;
    });
    
    // Handle the Close X button click
    closeXButton.addEventListener('click', () => {
      dialogElement.remove();
      removeHashFromUrl();
      
      // Clear storage and badge
      browserDetector.getApi().storage.local.remove('pendingSharedData');
      clearBadge();
      
      // Reset the processing flag
      sharedDataProcessingInProgress = false;
    });
    
    // Close dialog when pressing Escape
    document.addEventListener('keydown', function closeDialogOnEscape(e) {
      if (e.key === 'Escape') {
        dialogElement.remove();
        document.removeEventListener('keydown', closeDialogOnEscape);
      }
    });
    
    // Add the dialog to the page
    document.body.appendChild(dialogElement);
  }
  
  /**
   * Checks if current URL has shared cookies and shows the import dialog.
   */
  function checkForSharedCookies() {
    // Only check for shared cookies if we have a current tab
    if (!cookieHandler.currentTab || !cookieHandler.currentTab.url) {
      console.warn('checkForSharedCookies: No current tab or URL available');
      return;
    }
    
    // Request background script to check the URL
    requestBackgroundCookieCheck(cookieHandler.currentTab.url);
    
    // First check if we have permission to access this domain
    permissionHandler.checkPermissions(cookieHandler.currentTab.url)
      .then(hasPermission => {
        // Only proceed if we have permission for this domain
        if (!hasPermission) {
          //console.log('No permission to check for shared cookies on this domain');
          return;
        }
        
        //console.log('Checking for shared cookies in URL:', cookieHandler.currentTab.url);
        
        // Check if the URL contains shared cookies
        const sharedData = extractSharedCookiesFromUrl(cookieHandler.currentTab.url);
        
        if (!sharedData) {
          //console.log('No shared cookies found in URL');
          return;
        }
        
        console.log('Found shared cookies data:',
          sharedData.encrypted ? 'Encrypted data' :
          `${sharedData.c?.length || 0} cookies for domain ${sharedData.d || 'unknown'}`);
        console.log('Shared data details:', {
          type: sharedData.type,
          encrypted: sharedData.encrypted,
          hasParams: sharedData.params ? 'Yes' : 'No',
          domain: sharedData.d
        });
        
        // Update the badge through background script
        updateBadge(
          "!",
          "#FF0000",
          `Cookie-Editor Plus: ${sharedData.c?.length || 0} cookies available to import for ${sharedData.d || 'this site'}`
        );
        
        // Store the shared cookies in local storage
        browserDetector.getApi().storage.local.set({
          pendingSharedCookies: {
            url: cookieHandler.currentTab.url,
            tabId: cookieHandler.currentTabId,
            timestamp: Date.now(),
            expiresIn: 15 * 60 * 1000 // 15 minutes in milliseconds
          }
        });
        
        // Display the appropriate dialog
        if (sharedData.encrypted) {
          // Set flag to prevent concurrent operations
          sharedDataProcessingInProgress = true;
          
          // Show password prompt and handle the resolved decrypted data
          // Pass the data type from the URL to ensure proper handling
          showPasswordPrompt(sharedData.params, sharedData.type)
            .then(decryptedData => {
              // Check if decryption was successful or user canceled
              if (!decryptedData) {
                sharedDataProcessingInProgress = false;
                return;
              }
              
              // Process the decrypted data
              if (decryptedData.type === 'profiles') {
                // Handle profiles
                const profiles = decryptedData.p;
                const domain = decryptedData.d;
                
                if (!profiles || !domain) {
                  sendNotification('Invalid shared profile data', true);
                  sharedDataProcessingInProgress = false;
                  return;
                }
                
                // Prompt user to confirm import
                showImportProfilesDialog(decryptedData);
                                    } else {
                // Handle cookies
                const cookies = decryptedData.c;
                const domain = decryptedData.d;
                
                if (!cookies || !cookies.length || !domain) {
                  sendNotification('Invalid shared cookie data', true);
                  sharedDataProcessingInProgress = false;
                  return;
                }
                
                // Show import confirmation dialog
                showImportDialog({
                  cookies,
                  domain,
                  expires: decryptedData.e,
                  timestamp: decryptedData.t
                });
              }
              
              // Clear the URL hash
              removeHashFromUrl();
            })
            .catch(error => {
              console.error('Error processing decrypted data:', error);
              sharedDataProcessingInProgress = false;
            });
        } else {
          console.log('Showing import dialog for shared cookies');
          showImportDialog(sharedData);
        }
      })
      .catch(error => {
        console.error('Error checking for shared cookies:', error);
      });
  }

  /**
   * Updates the badge on the extension icon
   * @param {string} text - Badge text
   * @param {string} color - Badge background color
   * @param {string} title - Badge title/tooltip
   */
  function updateBadge(text, color, title) {
    try {
      const sendPromise = browserDetector.getApi().runtime.sendMessage({
        type: 'updateBadge',
        params: {
          text: text,
          color: color,
          title: title
        }
      });
      
      // Handle promise-based responses for browsers that support them
      if (sendPromise && typeof sendPromise.catch === 'function') {
        sendPromise.catch(error => {
          // Suppress errors that happen when popup is closing
          console.log('Badge update message failed, popup may be closing');
        });
      }
    } catch (error) {
      // Suppress errors that happen when popup is closing
      console.log('Error updating badge, popup may be closing');
    }
  }

  /**
   * Clears the badge on the extension icon
   */
  function clearBadge() {
    try {
      const sendPromise = browserDetector.getApi().runtime.sendMessage({
        type: 'clearBadge'
      });
      
      // Handle promise-based responses for browsers that support them
      if (sendPromise && typeof sendPromise.catch === 'function') {
        sendPromise.catch(error => {
          // Suppress errors that happen when popup is closing
          //console.log('Badge clear message failed, popup may be closing');
        });
      }
    } catch (error) {
      // Suppress errors that happen when popup is closing
      //console.log('Error clearing badge, popup may be closing');
    }
  }

  /**
   * Checks if there are pending shared cookies stored in local storage.
   */
  async function checkForPendingSharedCookies() {
    // Prevent multiple concurrent checks
    if (sharedDataProcessingInProgress) {
      return;
    }

    try {
      sharedDataProcessingInProgress = true;

      // Check for pending data in storage
      const pendingData = await storageHandler.getLocal('pendingSharedData');
      
      if (!pendingData) {
        sharedDataProcessingInProgress = false;
        return;
      }
      
      // Clear the stored data right away
      await safeStorageRemove('pendingSharedData');
      
      // If there's encrypted data that requires a password
      if (pendingData.encrypted) {
        // Show password prompt
        const decryptedData = await showPasswordPrompt(pendingData.params, pendingData.type || 'cookies');
        
        if (!decryptedData) {
          // User canceled or decryption failed
          sharedDataProcessingInProgress = false;
          return;
        }
        
        // Process the decrypted data
        if (decryptedData.type === 'profiles') {
          // Handle profiles
          const profiles = decryptedData.p;
          const domain = decryptedData.d;
          
          if (!profiles || !domain) {
            sendNotification('Invalid shared profile data', true);
            sharedDataProcessingInProgress = false;
            return;
          }
          
          // Prompt user to confirm import
          showImportProfilesDialog(decryptedData);
                    } else {
          // Handle cookies (existing functionality)
          const cookies = decryptedData.c;
          const domain = decryptedData.d;
          
          if (!cookies || !cookies.length || !domain) {
            sendNotification('Invalid shared cookie data', true);
            sharedDataProcessingInProgress = false;
            return;
          }
          
          // Show import confirmation dialog
          showImportDialog({
            cookies,
            domain,
            expires: decryptedData.e,
            timestamp: decryptedData.t
          });
        }
      } else if (pendingData.type === 'profiles') {
        // Handle non-encrypted profiles
        const profiles = pendingData.p;
        const domain = pendingData.d;
        
        if (!profiles || !domain) {
          sendNotification('Invalid shared profile data', true);
          sharedDataProcessingInProgress = false;
          return;
        }
        
        // Prompt user to confirm import
        showImportProfilesDialog(pendingData);
                        } else {
        // Handle non-encrypted cookies (existing functionality)
        const cookies = pendingData.c;
        const domain = pendingData.d;
        
        if (!cookies || !cookies.length || !domain) {
          sendNotification('Invalid shared cookie data', true);
          sharedDataProcessingInProgress = false;
          return;
        }
        
        // Show import confirmation dialog
        showImportDialog({
          cookies,
          domain,
          expires: pendingData.e,
          timestamp: pendingData.t
        });
      }
      
      // Clear the URL hash
      removeHashFromUrl();
      
    } catch (error) {
      console.error('Error checking for pending shared cookies:', error);
      sharedDataProcessingInProgress = false;
    }
  }
  
  /**
   * Shows a dialog to confirm profile import
   * @param {Object} sharedData - The shared profile data
   */
  function showImportProfilesDialog(sharedData) {
    // Clone the template
    const template = document.importNode(
      document.getElementById('tmp-import-confirm').content,
      true
    );
    
    const dialogElement = template.querySelector('.share-dialog');
    const titleElement = dialogElement.querySelector('h3');
    const domainElement = template.querySelector('#shared-domain');
    const cookieCountElement = template.querySelector('#cookie-count');
    const cookieExpiryElement = template.querySelector('#cookie-expiry');
    const importOptions = dialogElement.querySelector('.import-options');
    const cancelButton = template.querySelector('#import-cancel');
    const mergeButton = template.querySelector('#import-merge');
    const overwriteButton = template.querySelector('#import-overwrite');
    
    // Position the dialog (centered)
    dialogElement.style.position = 'absolute';
    dialogElement.style.top = '50%';
    dialogElement.style.left = '50%';
    dialogElement.style.transform = 'translate(-50%, -50%)';
    dialogElement.style.zIndex = '100';
    
    // Update dialog content for profiles
    titleElement.textContent = 'Import Shared Profiles';
    domainElement.textContent = sharedData.d;
    
    // Count profiles
    const profileCount = Object.keys(sharedData.p).length;
    cookieCountElement.textContent = `${profileCount} profile${profileCount !== 1 ? 's' : ''}`;
    
    // Show expiration
    if (sharedData.e === 0) {
      cookieExpiryElement.textContent = 'No expiration';
    } else {
      cookieExpiryElement.textContent = formatExpiration(sharedData.e);
    }
    
    // Update option descriptions
    importOptions.innerHTML = `
      <div class="option-description">
        <strong>Overwrite:</strong> Replace existing profiles with shared ones
      </div>
      <div class="option-description">
        <strong>Merge:</strong> Add shared profiles without replacing existing ones
      </div>
    `;
    
    // Add event listeners
    cancelButton.addEventListener('click', () => {
      dialogElement.remove();
      sharedDataProcessingInProgress = false;
    });
    
    mergeButton.addEventListener('click', async () => {
      dialogElement.remove();
      await importSharedProfiles(sharedData, false);
      sharedDataProcessingInProgress = false;
    });
    
    overwriteButton.addEventListener('click', async () => {
      dialogElement.remove();
      await importSharedProfiles(sharedData, true);
      sharedDataProcessingInProgress = false;
    });
    
    // Add the dialog to the page
    document.querySelector('.main-content-wrapper').appendChild(dialogElement);
  }
  
  /**
   * Imports profiles from shared data
   * @param {Object} sharedData - The shared profile data
   * @param {boolean} overwrite - Whether to overwrite existing profiles
   */
  async function importSharedProfiles(sharedData, overwrite) {
    const domain = sharedData.d;
    const profiles = sharedData.p;
    
    try {
      // If overwriting, get existing profiles first
      let existingProfiles = {};
      if (!overwrite) {
        existingProfiles = await profileManager.getProfilesForDomain(domain);
      }
      
      // Create merged profiles object
      const mergedProfiles = { ...existingProfiles };
      
      // Add shared profiles
      for (const [name, cookies] of Object.entries(profiles)) {
        mergedProfiles[name] = cookies;
      }
      
      // Get all profiles
      const allProfiles = await profileManager.getAllProfiles();
      
      // Update with the new/merged profiles
      allProfiles[domain] = mergedProfiles;
      
      // Save back to storage
      await storageHandler.setLocal(profileManager.profileStorageKey, allProfiles);
      
      // Update UI
      await updateProfileSelector(domain);
      
      // Show success message
      const profileCount = Object.keys(profiles).length;
      sendNotification(
        `Successfully imported ${profileCount} profile${profileCount !== 1 ? 's' : ''} for ${domain}`,
        false
      );
      
      // Remove the URL hash
      removeHashFromUrl();
      
      // Clear storage and badge
      browserDetector.getApi().storage.local.remove('pendingSharedData');
      clearBadge();
      
    } catch (error) {
      console.error('Error importing profiles:', error);
      sendNotification('Failed to import profiles', true);
      
      // Still clean up even if there was an error
      removeHashFromUrl();
      browserDetector.getApi().storage.local.remove('pendingSharedData');
      clearBadge();
    }
  }
  
  /**
   * Safely remove an item from storage with error handling for closed message channels
   * @param {string} key - Storage key to remove
   * @returns {Promise<void>}
   */
  async function safeStorageRemove(key) {
    return new Promise((resolve) => {
      try {
        browserDetector.getApi().storage.local.remove(key, () => {
          // Check for error
          const error = browserDetector.getApi().runtime.lastError;
          if (error) {
            console.log(`Storage remove warning: ${error.message}`);
          }
          resolve();
        });
      } catch (e) {
        console.log('Storage remove failed, likely popup closing');
        resolve();
      }
    });
  }
  
  /**
   * Safely clear badge with error handling
   */
  async function safeClearBadge() {
    return new Promise((resolve) => {
      try {
        clearBadge();
        resolve();
      } catch (e) {
        console.log('Clear badge failed, likely popup closing');
        resolve();
      }
    });
  }
  
  /**
   * Shows a password prompt to decrypt encrypted cookie or profile data
   * @param {object} encryptedParams - The encrypted data parameters
   * @param {string} dataType - The type of data ('cookies' or 'profiles')
   * @return {Promise<object|null>} Decrypted data or null if canceled
   */
  async function showPasswordPrompt(encryptedParams, dataType = 'cookies') {
    // Check if a dialog is already open
    if (document.querySelector('.share-dialog')) {
      sharedDataProcessingInProgress = false;
      return null;
    }
    
    return new Promise(async (resolve) => {
      // Clone the template
      const template = document.importNode(
        document.getElementById('tmp-password-prompt').content,
        true
      );
      
      const dialogElement = template.querySelector('.share-dialog');
      const titleElement = dialogElement.querySelector('h3');
      const descriptionElement = dialogElement.querySelector('p');
      const passwordField = template.querySelector('#decrypt-password');
      const showPasswordBtn = template.querySelector('#show-decrypt-password');
      const errorMessage = template.querySelector('#decrypt-error');
      const cancelButton = template.querySelector('#decrypt-cancel');
      const confirmButton = template.querySelector('#decrypt-confirm');
      
      // Customize based on dataType
      if (dataType === 'profiles') {
        titleElement.textContent = 'Enter Password';
        descriptionElement.textContent = 'This URL contains password-encrypted profiles. Please enter the password to decrypt and import them.';
                            } else {
        titleElement.textContent = 'Enter Password';
        descriptionElement.textContent = 'This URL contains password-encrypted cookies. Please enter the password to decrypt and import them.';
      }
      
      // Add the dialog to the DOM first (before positioning)
      document.body.appendChild(dialogElement);
      
      // Position the dialog (centered)
      dialogElement.style.position = 'absolute';
      dialogElement.style.top = '50%';
      dialogElement.style.left = '50%';
      dialogElement.style.transform = 'translate(-50%, -50%)';
      dialogElement.style.zIndex = '100';
      
      // Show/Hide password toggle
      showPasswordBtn.addEventListener('click', () => {
        if (passwordField.type === 'password') {
          passwordField.type = 'text';
          showPasswordBtn.querySelector('use').setAttribute('href', '../sprites/solid.svg#eye-slash');
                        } else {
          passwordField.type = 'password';
          showPasswordBtn.querySelector('use').setAttribute('href', '../sprites/solid.svg#eye');
        }
      });
      
      // Cancel button
      cancelButton.addEventListener('click', () => {
        dialogElement.remove();
        removeHashFromUrl();
        
        // Clear storage and badge
        browserDetector.getApi().storage.local.remove('pendingSharedData');
        clearBadge();
        
        // Reset processing flag
        sharedDataProcessingInProgress = false;
        resolve(null);
      });
      
      // Close (X) button
      const closeXButton = template.querySelector('#decrypt-cancel-x');
      if (closeXButton) {
        closeXButton.addEventListener('click', () => {
          cancelButton.click(); // Reuse the cancel logic
        });
      }
      
      // Add Enter key handler for the password field
      passwordField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          confirmButton.click();
        }
      });
      
      // Decrypt button
      confirmButton.addEventListener('click', async () => {
        const password = passwordField.value;
        
        if (!password) {
          errorMessage.textContent = 'Please enter a password';
          errorMessage.style.display = 'block';
          passwordField.focus();
          return;
        }
        
        // Disable UI during decryption
        confirmButton.disabled = true;
        passwordField.disabled = true;
        errorMessage.style.display = 'none';
        
        try {
          // Import decryption functions
          const { decryptCookies, decryptProfiles } = await import('../lib/sharing/cookieSharing.js');
          
          //console.log('Decrypting profiles with data type:', dataType);
          
          // Attempt to decrypt based on the known data type first
          let decryptedData = null;
          let success = false;
          
          if (dataType === 'profiles') {
            // Try profile decryption first
            try {
              decryptedData = await decryptProfiles(encryptedParams, password);
              if (decryptedData) {
                success = true;
                //console.log('Successfully decrypted profile data');
                dialogElement.remove();
                resolve({
                  type: 'profiles',
                  ...decryptedData
                });
                return;
              }
            } catch (error) {
              //console.log('Failed to decrypt as profile data, will try cookies as fallback', error);
            }
            
            // Fallback to cookie decryption
            if (!success) {
              try {
                decryptedData = await decryptCookies(encryptedParams, password);
                if (decryptedData) {
                  //console.log('Successfully decrypted cookie data (fallback)');
                  dialogElement.remove();
                  resolve({
                    type: 'cookies',
                    ...decryptedData
                  });
                  return;
                }
              } catch (fallbackError) {
                //console.log('Both decryption attempts failed');
                throw new Error('Failed to decrypt data');
              }
            }
                } else {
            // Default is cookie decryption first
            try {
              decryptedData = await decryptCookies(encryptedParams, password);
              if (decryptedData) {
                success = true;
                //console.log('Successfully decrypted cookie data');
                dialogElement.remove();
                resolve({
                  type: 'cookies',
                  ...decryptedData
                });
                return;
              }
            } catch (error) {
              //console.log('Failed to decrypt as cookie data, will try profiles as fallback', error);
            }
            
            // Fallback to profile decryption
            if (!success) {
              try {
                decryptedData = await decryptProfiles(encryptedParams, password);
                if (decryptedData) {
                  //console.log('Successfully decrypted profile data (fallback)');
                  dialogElement.remove();
                  resolve({
                    type: 'profiles',
                    ...decryptedData
                  });
                  return;
                }
              } catch (fallbackError) {
                //console.log('Both decryption attempts failed');
                throw new Error('Failed to decrypt data');
              }
            }
          }
          
          // If we get here, both attempts failed
          throw new Error('Failed to decrypt data with the provided password');
            } catch (error) {
          console.error('Decryption error:', error);
          errorMessage.textContent = 'Invalid password or corrupted data';
          errorMessage.style.display = 'block';
          
          // Re-enable UI
          confirmButton.disabled = false;
          passwordField.disabled = false;
          passwordField.value = '';
          passwordField.focus();
          
          // Don't reset the flag here - let them try again
        }
      });
      
      // Add to DOM
      document.body.appendChild(dialogElement);
      
      // Focus the password field
      setTimeout(() => {
        passwordField.focus();
      }, 50);
    });
  }
  
  /**
   * Shows the dialog to confirm importing shared cookies.
   * @param {object} sharedData - The decoded cookie data
   */
  function showImportDialog(sharedData) {
    // Check if a dialog is already open
    if (document.querySelector('.share-dialog')) {
      return;
    }
    
    // Ensure we have cookies in the expected format
    const cookies = sharedData.c || sharedData.cookies || [];
    const domain = sharedData.d || sharedData.domain || '';
    const expires = sharedData.e || sharedData.expires || 0;
    
    if (!cookies.length || !domain) {
      sendNotification('Invalid shared cookie data', true);
      return;
    }
    
    // Clone the template
    const template = document.importNode(
      document.getElementById('tmp-import-confirm').content,
      true
    );
    
    const dialogElement = template.querySelector('.share-dialog');
    const domainSpan = template.querySelector('#shared-domain');
    const cookieCount = template.querySelector('#cookie-count');
    const cookieExpiry = template.querySelector('#cookie-expiry');
    const cancelButton = template.querySelector('#import-cancel');
    const mergeButton = template.querySelector('#import-merge');
    const overwriteButton = template.querySelector('#import-overwrite');
    
    // Position the dialog (centered)
    dialogElement.style.position = 'absolute';
    dialogElement.style.top = '50%';
    dialogElement.style.left = '50%';
    dialogElement.style.transform = 'translate(-50%, -50%)';
    dialogElement.style.zIndex = '100';
    
    // Fill in details
    domainSpan.textContent = domain;
    cookieCount.textContent = `${cookies.length} cookie${cookies.length !== 1 ? 's' : ''}`;
    cookieExpiry.textContent = formatExpiration(expires);
    
    // Cancel button
    cancelButton.addEventListener('click', () => {
      dialogElement.remove();
      removeHashFromUrl();
      
      // Clear storage and badge
      browserDetector.getApi().storage.local.remove('pendingSharedData');
      clearBadge();
    });
    
    // Merge button - just add cookies without removing existing ones
    mergeButton.addEventListener('click', async () => {
      // Import each cookie without removing existing ones
      let errorCount = 0;
      for (const cookie of cookies) {
        try {
          await new Promise((resolve, reject) => {
            cookieHandler.saveCookie(cookie, `https://${domain}`, (error) => {
              if (error) {
                errorCount++;
                reject(error);
              } else {
                resolve();
              }
            });
          });
        } catch (error) {
          console.error('Error importing cookie:', error);
        }
      }
      
      // Show notification about the result
      if (errorCount > 0) {
        sendNotification(`Merged cookies with ${errorCount} errors`, true);
      } else {
        sendNotification(`Successfully merged ${cookies.length} cookies`, false);
      }
      
      // Remove the dialog and hash from URL
      dialogElement.remove();
      removeHashFromUrl();
      
      // Clear storage and badge
      browserDetector.getApi().storage.local.remove('pendingSharedData');
      clearBadge();
      
      // Refresh the cookie list
      showCookiesForTab();
      
      // Reset the processing flag
      sharedDataProcessingInProgress = false;
    });
    
    // Overwrite button - delete all existing cookies and add the new ones
    overwriteButton.addEventListener('click', async () => {
      try {
        // First delete all existing cookies for the domain
        await deleteAllCookiesForDomain(domain);
        
        // Then import the new cookies
        let errorCount = 0;
        for (const cookie of cookies) {
          try {
            await new Promise((resolve, reject) => {
              cookieHandler.saveCookie(cookie, `https://${domain}`, (error) => {
                if (error) {
                  errorCount++;
                  reject(error);
                } else {
                  resolve();
                }
              });
            });
          } catch (error) {
            console.error('Error importing cookie:', error);
          }
        }
        
        // Show notification about the result
        if (errorCount > 0) {
          sendNotification(`Overwrote cookies with ${errorCount} errors`, true);
        } else {
          sendNotification(`Successfully overwrote with ${cookies.length} cookies`, false);
        }
      } catch (error) {
        console.error('Error overwriting cookies:', error);
        sendNotification('Error overwriting cookies', true);
      }
      
      // Remove the dialog and hash from URL
      dialogElement.remove();
      removeHashFromUrl();
      
      // Clear storage and badge
      browserDetector.getApi().storage.local.remove('pendingSharedData');
      clearBadge();
      
      // Refresh the cookie list
      showCookiesForTab();
      
      // Reset the processing flag
      sharedDataProcessingInProgress = false;
    });
    
    // Add to DOM
    document.querySelector('.main-content-wrapper').appendChild(dialogElement);
  }
  
  /**
   * Removes the hash part from the current URL to prevent re-importing.
   */
  function removeHashFromUrl() {
    try {
      // Make sure tabs API is available
      if (!browserDetector.getApi().tabs) {
        console.warn('Tabs API not available, cannot remove hash from URL');
        return;
      }
      
      // Get the current tab and update URL
      browserDetector.getApi().tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0) {
          const currentTab = tabs[0];
          const url = currentTab.url;
          
          // Only modify if URL has a hash
          if (url.includes('#')) {
            const urlWithoutHash = url.split('#')[0];
            browserDetector.getApi().tabs.update(currentTab.id, { url: urlWithoutHash });
            //console.log('Removed hash from URL:', url, '->', urlWithoutHash);
          }
        }
      });
    } catch (error) {
      console.error('Error removing hash from URL:', error);
    }
  }
  
  // Properly check for shared cookies when the extension loads
  // We need to wait for the cookie handler to be fully initialized
  if (!cookieHandler.isReady) {
    // If not ready yet, set up event listener for when it's ready
    cookieHandler.on('ready', () => {
      //console.log('Cookie handler is ready, checking for shared cookies');
      
      // Only check for pending shared data if not already processing
      if (!sharedDataProcessingInProgress) {
        // First check for any pending shared cookies in storage
        checkForPendingSharedCookies();
      }
      
      // Then check the current tab URL
      if (cookieHandler.currentTab && cookieHandler.currentTab.url) {
        //console.log('Checking URL for shared cookies:', cookieHandler.currentTab.url);
        checkForSharedCookies();
      } else {
        console.warn('No current tab information available');
      }
    });
  } else {
    // Already ready, check directly
    //console.log('Cookie handler already ready, checking for shared cookies');
    
    // Only check for pending shared data if not already processing
    if (!sharedDataProcessingInProgress) {
      checkForPendingSharedCookies();
    }
    
    if (cookieHandler.currentTab && cookieHandler.currentTab.url) {
      //console.log('Checking URL for shared cookies:', cookieHandler.currentTab.url);
      checkForSharedCookies();
    }
  }

  /**
   * Set up the event listeners for the undo and redo buttons
   */
  function setupHistoryButtons() {
    const undoButton = document.getElementById('undo-button');
    const redoButton = document.getElementById('redo-button');
    
    if (undoButton && redoButton) {
      // Add event listeners for undo and redo buttons
      undoButton.addEventListener('click', handleUndo);
      redoButton.addEventListener('click', handleRedo);
      
      // Listen for history changes to update button states
      historyHandler.onHistoryChange(updateHistoryButtons);
      
      // Initialize button states
      updateHistoryButtons();
    }
  }
  
  /**
   * Update the undo and redo button states based on history availability
   */
  function updateHistoryButtons() {
    const undoButton = document.getElementById('undo-button');
    const redoButton = document.getElementById('redo-button');
    
    if (undoButton && redoButton) {
      undoButton.disabled = !historyHandler.canUndo();
      redoButton.disabled = !historyHandler.canRedo();
    }
  }
  
  /**
   * Handle undo button click
   */
  function handleUndo() {
    if (historyHandler.canUndo()) {
      disableButtons = true; // Prevent user interaction during undo
      
      historyHandler.undo((operation) => {
        if (operation) {
          // Refresh the cookie list to show changes
          if (selectedDomain) {
            showCookiesForSelectedDomain(true);
          } else {
            showCookiesForTab();
          }
          
          // Show notification
          sendNotification('Operation undone', false);
        } else {
          sendNotification('Failed to undo operation', true);
        }
        
        disableButtons = false; // Re-enable interaction
      });
    }
  }
  
  /**
   * Handle redo button click
   */
  function handleRedo() {
    if (historyHandler.canRedo()) {
      disableButtons = true; // Prevent user interaction during redo
      
      historyHandler.redo((operation) => {
        if (operation) {
          // Refresh the cookie list to show changes
          if (selectedDomain) {
            showCookiesForSelectedDomain(true);
          } else {
            showCookiesForTab();
          }
          
          // Show notification
          sendNotification('Operation redone', false);
        } else {
          sendNotification('Failed to redo operation', true);
        }
        
        disableButtons = false; // Re-enable interaction
      });
    }
  }

  document.addEventListener('click', function(e) {
    if (!document.querySelector('#main-menu-button').contains(e.target) &&
        !document.querySelector('#main-menu-content').contains(e.target)) {
      document.querySelector('#main-menu-content').classList.remove('visible');
    }
  });

  /**
   * Shows the import confirmation dialog
   * @param {string} message Message to display
   * @param {string} title Title of the dialog
   * @return {Promise<boolean>} User confirmation result
   */
  function showImportConfirmationDialog(message, title = 'Import Confirmation') {
    return new Promise((resolve) => {
      // Create the dialog from template
      const template = document.importNode(
        document.getElementById('tmp-confirm-import-domain').content,
        true
      );
      
      const dialog = template.querySelector('#confirm-import-dialog');
      const titleElement = dialog.querySelector('#import-dialog-title');
      const messageElement = dialog.querySelector('#import-dialog-message');
      const dontShowAgainCheckbox = dialog.querySelector('#dont-show-again-import');
      
      // Set dialog content
      titleElement.textContent = title;
      messageElement.textContent = message;
      
      document.body.appendChild(dialog);
      
      // Set up event listeners
      const cancelButton = dialog.querySelector('#cancel-import');
      const confirmButton = dialog.querySelector('#confirm-import');
      const closeXButton = dialog.querySelector('#cancel-import-x');
      
      // Custom escape key handler just for this dialog
      const escapeKeyHandler = function(e) {
        if (e.key === 'Escape') {
          closeDialog();
          resolve({ confirmed: false, dontAskAgain: false });
        }
      };
      
      cancelButton.addEventListener('click', () => {
        closeDialog();
        resolve({ confirmed: false, dontAskAgain: false });
      });
      
      closeXButton.addEventListener('click', () => {
        closeDialog();
        resolve({ confirmed: false, dontAskAgain: false });
      });
      
      confirmButton.addEventListener('click', () => {
        const dontAskAgain = dontShowAgainCheckbox.checked;
        closeDialog();
        resolve({ confirmed: true, dontAskAgain });
      });
      
      // Close on ESC key with our local handler
      document.addEventListener('keydown', escapeKeyHandler);
      
      // Function to close the dialog
      function closeDialog() {
        const dialogElement = document.getElementById('confirm-import-dialog');
        if (dialogElement) {
          // Remove event listener
          document.removeEventListener('keydown', escapeKeyHandler);
          
          // Remove dialog with animation
          dialogElement.classList.remove('visible');
          setTimeout(() => {
            if (dialogElement.parentNode) {
              dialogElement.parentNode.removeChild(dialogElement);
            }
          }, 300);
        }
      }
      
      // Show dialog with animation
      setTimeout(() => {
        dialog.classList.add('visible');
      }, 10);
    });
  }

  /**
   * Shows the merge confirmation dialog for import
   * @return {Promise<boolean>} User confirmation result
   */
  function showImportMergeDialog() {
    return new Promise((resolve) => {
      // Create the dialog from template
      const template = document.importNode(
        document.getElementById('tmp-confirm-import-merge').content,
        true
      );
      
      const dialog = template.querySelector('#confirm-import-merge-dialog');
      document.body.appendChild(dialog);
      
      // Set up event listeners
      const cancelButton = dialog.querySelector('#cancel-import-merge');
      const confirmButton = dialog.querySelector('#confirm-import-merge');
      const closeXButton = dialog.querySelector('#cancel-import-merge-x');
      
      // Custom escape key handler just for this dialog
      const escapeKeyHandler = function(e) {
        if (e.key === 'Escape') {
          closeDialog();
          resolve(false);
        }
      };
      
      cancelButton.addEventListener('click', () => {
        closeDialog();
        resolve(false);
      });
      
      closeXButton.addEventListener('click', () => {
        closeDialog();
        resolve(false);
      });
      
      confirmButton.addEventListener('click', () => {
        closeDialog();
        resolve(true);
      });
      
      // Close on ESC key with our local handler
      document.addEventListener('keydown', escapeKeyHandler);
      
      // Function to close the dialog
      function closeDialog() {
        const dialogElement = document.getElementById('confirm-import-merge-dialog');
        if (dialogElement) {
          // Remove event listener
          document.removeEventListener('keydown', escapeKeyHandler);
          
          // Remove dialog with animation
          dialogElement.classList.remove('visible');
          setTimeout(() => {
            if (dialogElement.parentNode) {
              dialogElement.parentNode.removeChild(dialogElement);
            }
          }, 300);
        }
      }
      
      // Show dialog with animation
      setTimeout(() => {
        dialog.classList.add('visible');
      }, 10);
    });
  }

  // Helper to render cookies in showCookiesForSelectedDomain
  function renderDomainCookies(cookies, resolve) {
    // Reset state
    loadedCookies = {};
    if (cookies.length === 0) {
      const html = document.importNode(document.getElementById('tmp-empty').content, true).querySelector('p');
      html.textContent = `No cookies found for domain: ${selectedDomain}`;
      if (containerCookie.firstChild) {
        isAnimating = true;
        Animate.transitionPage(containerCookie, containerCookie.firstChild, html, 'right', () => { 
          isAnimating = false; 
          // Update placeholder to show 0 cookies
          updateSearchPlaceholder();
          resolve(); 
        }, optionHandler.getAnimationsEnabled());
      } else {
        containerCookie.appendChild(html);
        // Update placeholder to show 0 cookies
        updateSearchPlaceholder();
        resolve();
      }
      return;
    }
    // Build list
    const ul = document.createElement('ul');
    ul.appendChild(generateSearchBar());
    
    // Add the column header
    const headerTemplate = document.importNode(
      document.getElementById('tmp-cookie-list-header').content,
      true
    );
    ul.appendChild(headerTemplate);
    
    cookies.forEach(cookie => {
      const id = Cookie.hashCode(cookie);
      loadedCookies[id] = new Cookie(id, cookie, optionHandler);
      ul.appendChild(loadedCookies[id].html);
    });
    // Animate
    if (containerCookie.firstChild) {
      isAnimating = true;
      Animate.transitionPage(containerCookie, containerCookie.firstChild, ul, 'right', () => { 
        isAnimating = false; 
        // Update placeholder after animation completes
        updateSearchPlaceholder();
        resolve(); 
      }, optionHandler.getAnimationsEnabled());
    } else {
      containerCookie.appendChild(ul);
      // Update placeholder after DOM is updated
      updateSearchPlaceholder();
      resolve();
    }
  }

  setupHistoryButtons();
  // Inject a force refresh button in various contexts (popup, sidepanel, devtools, mobile)
  const refreshButton = document.createElement('button');
  refreshButton.id = 'refresh-button';
  refreshButton.className = 'share-button'; // Apply the same class as the share button
  refreshButton.title = 'Force Refresh Cookie List\nHold to refresh current tab';
  refreshButton.setAttribute('aria-label', 'Force Refresh Cookie List. Hold to refresh current tab');
  refreshButton.innerHTML = '<svg class="icon"><use href="../sprites/solid.svg#sync"></use></svg>';
  
  // Variables for long-press functionality
  let pressTimer = null;
  let isLongPress = false;
  let longPressAnimation = null;
  
  // Attach mousedown event for long-press detection
  refreshButton.addEventListener('mousedown', () => {
    isLongPress = false;
    
    // Create and add the visual feedback element
    const feedback = document.createElement('div');
    feedback.className = 'long-press-feedback';
    feedback.style.cssText = `
      position: absolute;
      bottom: 0;
      left: 0;
      height: 4px;
      background: #4285f4;
      width: 0%;
      transition: width 1s linear;
    `;
    refreshButton.style.position = 'relative';
    refreshButton.style.overflow = 'hidden';
    refreshButton.appendChild(feedback);
    
    // Animate the feedback element
    requestAnimationFrame(() => {
      feedback.style.width = '100%';
    });
    
    longPressAnimation = feedback;
    
    // Set up the timer for the long-press action
    pressTimer = setTimeout(() => {
      isLongPress = true;
      // Refresh the current tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
          chrome.tabs.reload(tabs[0].id);
          sendNotification('Current tab refreshed', false);
        }
      });
      
      // Reset the visual feedback
      if (longPressAnimation && longPressAnimation.parentNode) {
        longPressAnimation.parentNode.removeChild(longPressAnimation);
      }
      longPressAnimation = null;
    }, 1000); // 1 second for long-press
  });
  
  // Clear timer if mouse is released or moved out
  refreshButton.addEventListener('mouseup', () => {
    clearTimeout(pressTimer);
    // Reset the visual feedback
    if (longPressAnimation && longPressAnimation.parentNode) {
      longPressAnimation.parentNode.removeChild(longPressAnimation);
    }
    longPressAnimation = null;
  });
  
  refreshButton.addEventListener('mouseleave', () => {
    clearTimeout(pressTimer);
    // Reset the visual feedback
    if (longPressAnimation && longPressAnimation.parentNode) {
      longPressAnimation.parentNode.removeChild(longPressAnimation);
    }
    longPressAnimation = null;
  });
  
  // Attach click handler with animation and notification
  refreshButton.addEventListener('click', async (event) => {
    // Prevent default action if it was a long press
    if (isLongPress) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    
    try {
      // Disable buttons during refresh to prevent concurrent actions
      disableButtons = true;
      // Perform the refresh (force execution)
      if (selectedDomain) {
        await showCookiesForSelectedDomain(true);
      } else {
        await showCookiesForTab(true);
      }
      // Show confirmation notification
      sendNotification('Cookie list refreshed', false);
    } catch (error) {
      console.error('Error during manual refresh:', error);
      sendNotification('Failed to refresh cookies', true);
            } finally {
      disableButtons = false;
    }
  });

  // Insert before the share button
  const domainSelectorContainer = document.querySelector('#domain-selector-container .container');
  const shareButton = document.getElementById('share-cookies');
  if (domainSelectorContainer && shareButton) {
    domainSelectorContainer.insertBefore(refreshButton, shareButton);
  } else {
    // Fallback: insert into history controls if available (popup)
    const historyControls = document.getElementById('history-controls');
    if (historyControls) {
      historyControls.insertBefore(refreshButton, historyControls.firstChild);
    } else {
      // Fallback: insert before version or main-menu in the title bar
      const pageTitleEl = document.getElementById('pageTitle');
      if (pageTitleEl) {
        const versionEl = document.getElementById('version');
        if (versionEl && versionEl.parentElement === pageTitleEl) {
          pageTitleEl.insertBefore(refreshButton, versionEl);
        } else {
          const mainMenuEl = document.getElementById('main-menu');
          if (mainMenuEl && mainMenuEl.parentElement === pageTitleEl) {
            pageTitleEl.insertBefore(refreshButton, mainMenuEl);
          } else {
            // Last resort: append to title bar
            pageTitleEl.appendChild(refreshButton);
          }
        }
      }
    }
  }

  /**
   * Shows the delete profile confirmation dialog
   * @param {string} message Message to display
   * @param {string} title Title of the dialog
   * @return {Promise<{confirmed: boolean, dontAskAgain: boolean}>} User confirmation result
   */
  function showDeleteProfileConfirmationDialog(message, title = 'Delete Profile Confirmation') {
    return new Promise((resolve) => {
      const template = document.importNode(
        document.getElementById('tmp-confirm-delete-profile').content,
        true
      );
      const dialog = template.querySelector('#confirm-delete-profile-dialog');
      const titleElement = dialog.querySelector('#delete-profile-dialog-title');
      const messageElement = dialog.querySelector('#delete-profile-dialog-message');
      const dontShowAgainCheckbox = dialog.querySelector('#dont-show-again-delete-profile');

      titleElement.textContent = title;
      messageElement.textContent = message;

      document.body.appendChild(dialog);

      const cancelButton = dialog.querySelector('#cancel-delete-profile');
      const confirmButton = dialog.querySelector('#confirm-delete-profile');
      const closeXButton = dialog.querySelector('#cancel-delete-profile-x');

      const escapeKeyHandler = function(e) {
        if (e.key === 'Escape') {
          closeDialog();
          resolve({ confirmed: false, dontAskAgain: false });
        }
      };

      cancelButton.addEventListener('click', () => {
        closeDialog();
        resolve({ confirmed: false, dontAskAgain: false });
      });

      closeXButton.addEventListener('click', () => {
        closeDialog();
        resolve({ confirmed: false, dontAskAgain: false });
      });

      confirmButton.addEventListener('click', () => {
        const dontAskAgain = dontShowAgainCheckbox.checked;
        closeDialog();
        resolve({ confirmed: true, dontAskAgain });
      });

      document.addEventListener('keydown', escapeKeyHandler);

      function closeDialog() {
        const dialogElement = document.getElementById('confirm-delete-profile-dialog');
        if (dialogElement) {
          document.removeEventListener('keydown', escapeKeyHandler);
          dialogElement.classList.remove('visible');
          setTimeout(() => {
            if (dialogElement.parentNode) {
              dialogElement.parentNode.removeChild(dialogElement);
            }
          }, 300);
        }
      }

      setTimeout(() => {
        dialog.classList.add('visible');
      }, 10);
    });
  }

  // Add unloading cleanup
  window.addEventListener('beforeunload', () => {
    if (containerCookie) {
      clearChildren(containerCookie);
    }
    loadedCookies = {};
  });

  // Make required functions available to other modules via the window object
  function exportFunctionsForSelectionModule() {
    window.findCookieObject = findCookieObject;
    window.showShareDialog = showShareDialog;
    window.getDomainFromUrl = getDomainFromUrl;
    window.sendNotification = sendNotification;
    window.cookieHandler = cookieHandler;
    window.selectedDomain = selectedDomain;
  }
  
  // Export functions when document is loaded
  document.addEventListener('DOMContentLoaded', exportFunctionsForSelectionModule);
})();