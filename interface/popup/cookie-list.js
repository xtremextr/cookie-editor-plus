import { CookieHandlerDevtools } from '../devtools/cookieHandlerDevtools.js';
import { AdHandler } from '../lib/ads/adHandler.js';
import { Animate } from '../lib/animate.js';
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

// Cookie sharing imports
import { createShareableUrl, extractSharedCookiesFromUrl, formatExpiration, createShareableProfilesUrl } from '../lib/sharing/cookieSharing.js';

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
  let hasRequestedPermission = false; // Permission request tracking
  let showDeleteConfirmation = true; // Flag to control delete confirmation display
  let showDeleteAllConfirmation = true; // Flag to control delete all confirmation display
  let activeDeleteCookieName = null; // Store the name of cookie being deleted
  let activeCopyMenu = null; // Store the active copy menu element
  
  // Performance optimization: Add cookie caching
  const cookieCache = {
    domain: '',
    url: '',
    cookies: [],
    timestamp: 0,
    maxAge: 5000, // Cache cookies for 5 seconds (increased from 1 second)
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

  const notificationQueue = [];
  let notificationTimeout;

  let cookieChangeTimeout = null;

  const browserDetector = new BrowserDetector();
  const permissionHandler = new PermissionHandler(browserDetector);
  const storageHandler = new GenericStorageHandler(browserDetector);
  const optionHandler = new OptionsHandler(browserDetector, storageHandler);
  const themeHandler = new ThemeHandler(optionHandler);
  const adHandler = new AdHandler(
    browserDetector,
    storageHandler,
    optionHandler,
  );
  const cookieHandler = window.isDevtools
    ? new CookieHandlerDevtools(browserDetector)
    : new CookieHandlerPopup(browserDetector);
  const profileManager = new ProfileManager(storageHandler, browserDetector);

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
    containerCookie = document.getElementById('cookie-container');
    notificationElement = document.getElementById('notification');
    pageTitleContainer = document.getElementById('pageTitle');
    
    // Add event listeners to the cookie container
    addEventListeners();
    
    // These might be null in side panel, check before use
    profileSelector = document.getElementById('profile-selector');
    domainSelector = document.getElementById('domain-selector');
    
    // Load options before proceeding
    await optionHandler.loadOptions();
    await themeHandler.updateTheme();
    await handleAd();
    
    // Initialize resize handler
    if (!isSidePanel()) {
      const resizeHandler = new ResizeHandler(storageHandler);
      await resizeHandler.initialize(document.body, pageTitleContainer);
    }
    
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
      console.log('Adding domain selector change listener.');
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
        notificationElement.parentElement.style.pointerEvents = 'auto';
      }
    }, 100);

    await initWindow();

    // Check for pending shared data AFTER main UI initialization is complete
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
        
        // Handle click on delete button
        if (e.target.closest('button.delete')) {
          deleteButton(e);
          return;
        }
        
        // Handle click on cookie header (expand/collapse)
        if (e.target.closest('.header') && !e.target.closest('button')) {
          expandCookie(e);
          return;
        }
      });
    }

    /**
     * Expands the HTML cookie element.
     * @param {element} e Element to expand.
     */
    function expandCookie(e) {
      const parent = e.target.closest('li');
      const header = parent.querySelector('.header');
      const expando = parent.querySelector('.expando');

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
      const cookieName = listElement.dataset.name;
      
      // Check if we should show the confirmation
      if (showDeleteConfirmation) {
        showDeleteConfirmationDialog(cookieName);
      } else {
        // Delete immediately if confirmations are disabled
        removeCookie(cookieName);
      }
      
      return false;
    }

    /**
     * Shows the delete confirmation dialog
     * @param {string} cookieName Name of the cookie to delete
     */
    function showDeleteConfirmationDialog(cookieName) {
      // Store the cookie name for use when confirmed
      activeDeleteCookieName = cookieName;
      
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
      
      confirmButton.addEventListener('click', () => {
        // Update the setting if checkbox is checked
        if (dontShowAgainCheckbox.checked) {
          showDeleteConfirmation = false;
          // Save this preference to storage
          storageHandler.setLocal('showDeleteConfirmation', false);
        }
        
        // Delete the cookie
        removeCookie(activeDeleteCookieName);
        
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
        
        // Close any open copy menus
        closeCopyOptionsMenu();
      }
    }
    
    /**
     * Handles clicks on the copy options button
     * @param {Event} e Click event
     * @return {false} returns false to prevent click event propagation
     */
    function copyOptionsButton(e) {
      e.preventDefault();
      e.stopPropagation();
      
      // Close any open menu first
      closeCopyOptionsMenu();
      
      const buttonElement = e.target.closest('button');
      const listElement = buttonElement.closest('li');
      const cookieName = listElement.dataset.name;
      
      // Get the cookie data
      const cookieId = Object.keys(loadedCookies).find(id => 
        loadedCookies[id].cookie.name === cookieName
      );
      
      if (!cookieId || !loadedCookies[cookieId]) {
        return false;
      }
      
      const cookie = loadedCookies[cookieId].cookie;
      
      // Get the copy options menu from the button's parent container
      const copyMenu = buttonElement.closest('.copy-options-container').querySelector('.copy-options-menu');
      if (!copyMenu) {
        return false;
      }
      
      // Show the menu
      copyMenu.style.display = 'block';
      activeCopyMenu = copyMenu;
      
      // Add click handlers to the menu buttons
      const copyWholeButton = copyMenu.querySelector('.copy-cookie');
      const copyValueButton = copyMenu.querySelector('.copy-value');
      
      if (copyWholeButton) {
        copyWholeButton.addEventListener('click', () => {
          // Format the cookie as JSON and copy
          const cookieJson = JSON.stringify(cookie, null, 2);
          copyText(cookieJson);
          sendNotification('Copied cookie to clipboard', false);
          closeCopyOptionsMenu();
        });
      }
      
      if (copyValueButton) {
        copyValueButton.addEventListener('click', () => {
          // Copy just the value
          copyText(cookie.value);
          sendNotification('Copied cookie value to clipboard', false);
          closeCopyOptionsMenu();
        });
      }
      
      // Handle clicks outside to close
      document.addEventListener('click', handleClickOutside);
      
      return false;
    }
    
    /**
     * Closes the copy options menu
     */
    function closeCopyOptionsMenu() {
      if (activeCopyMenu) {
        // Remove event listener
        document.removeEventListener('click', handleClickOutside);
        
        // Hide with animation then remove
        activeCopyMenu.classList.remove('visible');
        
        setTimeout(() => {
          if (activeCopyMenu.parentNode) {
            activeCopyMenu.parentNode.removeChild(activeCopyMenu);
          }
          activeCopyMenu = null;
        }, 200);
      }
    }
    
    /**
     * Handles clicks outside the active menu
     * @param {Event} e Click event
     */
    function handleClickOutside(e) {
      if (activeCopyMenu && !activeCopyMenu.contains(e.target)) {
        closeCopyOptionsMenu();
      }
    }

    /**
     * Handles saving a cookie from a form.
     * @param {element} form Form element that contains the cookie fields.
     * @return {false} returns false to prevent click event propagation.
     */
    function saveCookieForm(form) {
      const isCreateForm = form.classList.contains('create');

      const id = form.dataset.id;
      const name = form.querySelector('input[name="name"]').value;
      const value = form.querySelector('textarea[name="value"]').value;

      let domain;
      let path;
      let expiration;
      let sameSite;
      let hostOnly;
      let session;
      let secure;
      let httpOnly;

      if (!isCreateForm) {
        domain = form.querySelector('input[name="domain"]').value;
        path = form.querySelector('input[name="path"]').value;
        expiration = form.querySelector('input[name="expiration"]').value;
        sameSite = form.querySelector('select[name="sameSite"]').value;
        hostOnly = form.querySelector('input[name="hostOnly"]').checked;
        session = form.querySelector('input[name="session"]').checked;
        secure = form.querySelector('input[name="secure"]').checked;
        httpOnly = form.querySelector('input[name="httpOnly"]').checked;
      }
      saveCookie(
        id,
        name,
        value,
        domain,
        path,
        expiration,
        sameSite,
        hostOnly,
        session,
        secure,
        httpOnly,
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
     * @param {string} expiration
     * @param {string} sameSite
     * @param {boolean} hostOnly
     * @param {boolean} session
     * @param {boolean} secure
     * @param {boolean} httpOnly
     */
    function saveCookie(
      id,
      name,
      value,
      domain,
      path,
      expiration,
      sameSite,
      hostOnly,
      session,
      secure,
      httpOnly,
    ) {
      

      const cookieContainer = loadedCookies[id];
      let cookie = cookieContainer ? cookieContainer.cookie : null;
      let oldName;
      let oldHostOnly;

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
        
        if (path === undefined) {
          const url = new URL(getCurrentTabUrl());
          if (url && url.pathname) {
            path = url.pathname;
            cookie.path = path;
          } else {
            cookie.path = '/';
          }
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
      if (path !== undefined) {
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
        if (!cookie.expirationDate) {
          // Reset it to null because on safari it is NaN and causes failures.
          cookie.expirationDate = null;
          cookie.session = true;
        }
      }

      if (oldName !== name || oldHostOnly !== hostOnly) {
        cookieHandler.removeCookie(oldName, getCurrentTabUrl(), function () {
          cookieHandler.saveCookie(
            cookie,
            getCurrentTabUrl(),
            function (error, cookie) {
              if (error) {
                sendNotification(error, true);
                return;
              }
              if (browserDetector.isSafari()) {
                onCookiesChanged();
              }
              if (cookieContainer) {
                cookieContainer.showSuccessAnimation();
              }
              
              // Check if cookies have been modified from loaded profile
              checkIfCookiesModified();
            },
          );
        });
      } else {
        // Should probably put in a function to prevent duplication
        cookieHandler.saveCookie(
          cookie,
          getCurrentTabUrl(),
          function (error, cookie) {
            if (error) {
              sendNotification(error, true);
              return;
            }
            if (browserDetector.isSafari()) {
              onCookiesChanged();
            }
            if (cookieContainer) {
              cookieContainer.showSuccessAnimation();
            }
            
            // Check if cookies have been modified from loaded profile
            checkIfCookiesModified();
          },
        );
      }
    }

    document.getElementById('create-cookie').addEventListener('click', () => {
      // Check both flags to prevent running during ANY transition
      if (disableButtons || isAnimating) { 
        return;
      }

      // REMOVED: isAnimating = false; - This was potentially causing issues
      
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
          storageHandler.setLocal('showDeleteAllConfirmation', false);
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
        
      // Create an array of promises for cookie removal
      const removalPromises = [];
      for (const cookieId in loadedCookies) {
        if (Object.prototype.hasOwnProperty.call(loadedCookies, cookieId)) {
          const cookieName = loadedCookies[cookieId].cookie.name;
          removalPromises.push(
            new Promise((resolve) => {
              removeCookie(cookieName, null, () => {
                resolve();
              });
            })
          );
        }
      }
      
      // Wait for all cookies to be removed
      await Promise.all(removalPromises);
      
      // Reset loadedCookies to empty
      loadedCookies = {};
      
      // Explicitly check if cookies have been modified after bulk deletion
      // This ensures profile state is updated when deleting all cookies
      console.log("[delete-all-cookies] All cookies deleted, updating profile state");
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
      if (disableButtons) {
        return;
      }
      
      // Disable interaction during animation
      disableButtons = true;
      
      // Get the form to retrieve domain information
      const form = containerCookie.querySelector('form');
      // Get the stored domain from the form if available
      const formStoredDomain = form && form.dataset && form.dataset.domain;
      
      // Update button bar state
      document.getElementById('button-bar-add').classList.remove('active');
      document.getElementById('button-bar-default').classList.add('active');
      
      // First pause any active CSS transitions
      document.body.classList.add('notransition');
      
      // Force a reflow to apply the notransition class
      void document.body.offsetHeight;
      
      // Prepare for animation with a short delay
      setTimeout(() => {
        // Re-enable transitions just before animation starts
        document.body.classList.remove('notransition');
      
        // Use the stored domain if available
        if (formStoredDomain) {
          // Ensure the domain selector is synchronized
          if (domainSelector && formStoredDomain !== domainSelector.value) {
            domainSelector.value = formStoredDomain;
            selectedDomain = formStoredDomain;
          }
          
          // Get cookies for the selected domain
          getCookiesForDomainWrapper(formStoredDomain, function(cookies) {
            cookies = cookies.sort(sortCookiesByName);
            
            loadedCookies = {};
            
            if (cookies.length === 0) {
              // Create the empty cookies message
              const html = document
                .importNode(document.getElementById('tmp-empty').content, true)
                .querySelector('p');
              
              html.textContent = `No cookies found for domain: ${formStoredDomain}`;
              
              // Transition directly to the empty state
              Animate.transitionPage(
                containerCookie,
                containerCookie.firstChild,
                html,
                'right',
                () => {
                  disableButtons = false;
                },
                optionHandler.getAnimationsEnabled()
              );
              return;
            }
            
            // Create the cookie list
            cookiesListHtml = document.createElement('ul');
            cookiesListHtml.appendChild(generateSearchBar());
            cookies.forEach(function (cookie) {
              const id = Cookie.hashCode(cookie);
              loadedCookies[id] = new Cookie(id, cookie, optionHandler);
              cookiesListHtml.appendChild(loadedCookies[id].html);
            });
            
            // Direct animation from the add form to the cookie list
            Animate.transitionPage(
              containerCookie,
              containerCookie.firstChild,
              cookiesListHtml,
              'right',
              () => {
                disableButtons = false;
              },
              optionHandler.getAnimationsEnabled()
            );
          });
        } else {
          // Default behavior - get all cookies
          cookieHandler.getAllCookies(function (cookies) {
            cookies = cookies.sort(sortCookiesByName);
            
            loadedCookies = {};
            
            if (cookies.length === 0) {
              // Create the empty cookies message
              const html = document
                .importNode(document.getElementById('tmp-empty').content, true)
                .querySelector('p');
              
              // Transition directly to the empty state
              Animate.transitionPage(
                containerCookie,
                containerCookie.firstChild,
                html,
                'right',
                () => {
                  disableButtons = false;
                },
                optionHandler.getAnimationsEnabled()
              );
              return;
            }
            
            // Create the cookie list
            cookiesListHtml = document.createElement('ul');
            cookiesListHtml.appendChild(generateSearchBar());
            cookies.forEach(function (cookie) {
              const id = Cookie.hashCode(cookie);
              loadedCookies[id] = new Cookie(id, cookie, optionHandler);
              cookiesListHtml.appendChild(loadedCookies[id].html);
            });
            
            // Direct animation from the add form to the cookie list
            Animate.transitionPage(
              containerCookie,
              containerCookie.firstChild,
              cookiesListHtml,
              'right',
              () => {
                disableButtons = false;
              },
              optionHandler.getAnimationsEnabled()
            );
          });
        }
      }, 30);
    });
    
    document
      .getElementById('return-list-import')
      .addEventListener('click', () => {
        if (disableButtons) {
          return;
        }
        
        // Disable interaction during animation
        disableButtons = true;
        
        // Get the form to retrieve domain information
        const form = containerCookie.querySelector('form');
        // Get the stored domain from the form if available
        const formStoredDomain = form && form.dataset && form.dataset.domain;
        
        // Update button bar state
        document.getElementById('button-bar-import').classList.remove('active');
        document.getElementById('button-bar-default').classList.add('active');
        
        // First pause any active CSS transitions
        document.body.classList.add('notransition');
        
        // Force a reflow to apply the notransition class
        void document.body.offsetHeight;
        
        // Prepare for animation with a short delay
        setTimeout(() => {
          // Re-enable transitions just before animation starts
          document.body.classList.remove('notransition');
        
          // Use the stored domain if available
          if (formStoredDomain) {
            // Ensure the domain selector is synchronized
            if (domainSelector && formStoredDomain !== domainSelector.value) {
              domainSelector.value = formStoredDomain;
              selectedDomain = formStoredDomain;
            }
            
            // Get cookies for the selected domain
            getCookiesForDomainWrapper(formStoredDomain, function(cookies) {
              cookies = cookies.sort(sortCookiesByName);
              
              loadedCookies = {};
              
              if (cookies.length === 0) {
                // Create the empty cookies message
                const html = document
                  .importNode(document.getElementById('tmp-empty').content, true)
                  .querySelector('p');
                
                html.textContent = `No cookies found for domain: ${formStoredDomain}`;
                
                // Transition directly to the empty state  
                Animate.transitionPage(
                  containerCookie,
                  containerCookie.firstChild,
                  html,
                  'right',
                  () => {
                    disableButtons = false;
                  },
                  optionHandler.getAnimationsEnabled()
                );
                return;
              }
              
              // Create the cookie list
              cookiesListHtml = document.createElement('ul');
              cookiesListHtml.appendChild(generateSearchBar());
              cookies.forEach(function (cookie) {
                const id = Cookie.hashCode(cookie);
                loadedCookies[id] = new Cookie(id, cookie, optionHandler);
                cookiesListHtml.appendChild(loadedCookies[id].html);
              });
              
              // Direct animation from the import form to the cookie list
              Animate.transitionPage(
                containerCookie,
                containerCookie.firstChild,
                cookiesListHtml,
                'right',
                () => {
                  disableButtons = false;
                },
                optionHandler.getAnimationsEnabled()
              );
            });
          } else {
            // Default behavior - get all cookies
            cookieHandler.getAllCookies(function (cookies) {
              cookies = cookies.sort(sortCookiesByName);
              
              loadedCookies = {};
              
              if (cookies.length === 0) {
                // Create the empty cookies message
                const html = document
                  .importNode(document.getElementById('tmp-empty').content, true)
                  .querySelector('p');
                
                // Transition directly to the empty state  
                Animate.transitionPage(
                  containerCookie,
                  containerCookie.firstChild,
                  html,
                  'right',
                  () => {
                    disableButtons = false;
                  },
                  optionHandler.getAnimationsEnabled()
                );
                return;
              }
              
              // Create the cookie list
              cookiesListHtml = document.createElement('ul');
              cookiesListHtml.appendChild(generateSearchBar());
              cookies.forEach(function (cookie) {
                const id = Cookie.hashCode(cookie);
                loadedCookies[id] = new Cookie(id, cookie, optionHandler);
                cookiesListHtml.appendChild(loadedCookies[id].html);
              });
              
              // Direct animation from the import form to the cookie list
              Animate.transitionPage(
                containerCookie,
                containerCookie.firstChild,
                cookiesListHtml,
                'right',
                () => {
                  disableButtons = false;
                },
                optionHandler.getAnimationsEnabled()
              );
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
        // Get the form to retrieve domain data
        const form = document.querySelector('form.create');
        
        // First update the button bars
        document.getElementById('button-bar-add').classList.remove('active');
        document.getElementById('button-bar-default').classList.add('active');
        
        // Then save the cookie
        saveCookieForm(form);
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
        
        buttonIcon.setAttribute('href', '../sprites/solid.svg#check');
        
        // Get URL to use for cookie import
        const urlToUse = domainToUse ? `https://${domainToUse}/` : getCurrentTabUrl();
        
        let cookiesImported = 0;
        let cookiesTotal = cookies.length;
        let errorText = '';
        
        const updateProgress = () => {
          cookiesImported++;
          if (cookiesImported >= cookiesTotal) {
            // Update button bar UI to back to main view
            document.getElementById('button-bar-import').classList.remove('active');
            document.getElementById('button-bar-default').classList.add('active');
            
            // Handle any errors
            if (errorText) {
              sendNotification(errorText, true);
            } else {
              sendNotification(`${cookiesTotal} cookie${cookiesTotal !== 1 ? 's' : ''} imported successfully.`, false);
            }
            
            // Reset button icon after a delay
            setTimeout(() => {
              buttonIcon.setAttribute('href', '../sprites/solid.svg#file-import');
            }, 1500);
            
            // Update view with the new cookies
            if (domainToUse) {
              showCookiesForSelectedDomain(true);
            } else {
              showCookiesForTab(true);
            }
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
          
          cookieHandler.saveCookie(cookie, urlToUse, (error, cookie) => {
            if (error) {
              console.error('Error importing cookie:', error);
              errorText = 'Error importing one or more cookies';
            }
            updateProgress();
          });
        });
      });

    const mainMenuContent = document.querySelector('#main-menu-content');
    document
      .querySelector('#main-menu-button')
      .addEventListener('click', function (e) {
        mainMenuContent.classList.toggle('visible');
      });

    document.addEventListener('click', function (e) {
      // Clicks in the main menu should not dismiss it.
      if (
        document.querySelector('#main-menu').contains(e.target) ||
        !mainMenuContent.classList.contains('visible')
      ) {
        return;
      }
      
      mainMenuContent.classList.remove('visible');
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
        if (browserDetector.getApi().runtime.openOptionsPage) {
          browserDetector.getApi().runtime.openOptionsPage();
        } else {
          window.open(
            browserDetector
              .getApi()
              .runtime.getURL('interface/options/options.html'),
          );
        }
      });

    notificationElement.addEventListener('animationend', (e) => {
      if (notificationElement.classList.contains('fadeInUp')) {
        return;
      }

      triggerNotification();
    });

    document
      .getElementById('notification-dismiss')
      .addEventListener('click', (e) => {
        hideNotification();
      });

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
  });

  // == End document ready == //

  let isAnimating = false; // Flag to prevent concurrent animations
  
  /**
   * Displays the cookies for the current tab.
   * @param {boolean} forceExecution If true, bypasses the disableButtons and isAnimating checks
   * @return {Promise} Promise that resolves when the operation completes
   */
  async function showCookiesForTab(forceExecution = false) {
    console.log('[showCookiesForTab] Called. Current Tab:', JSON.stringify(cookieHandler.currentTab));
    if (!cookieHandler.currentTab) {
      console.log('[showCookiesForTab] No current tab available yet');
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

    // Get the current tab URL's domain
    const currentUrl = cookieHandler.currentTab.url;
    const domain = getDomainFromUrl(currentUrl);
    
    // Reset the permission requested flag if the domain has changed
    if (currentDomain !== domain) {
      console.log('[showCookiesForTab] Domain changed, resetting hasRequestedPermission flag.');
      hasRequestedPermission = false;
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
    
    console.log(`[showCookiesForTab] Checking permissions for: ${currentUrl}`);
    // Check if permissions are available
    try {
      const hasPermissions = await permissionHandler.checkPermissions(currentUrl);
      if (!hasPermissions) {
        console.log('[showCookiesForTab] No permissions, showing permission prompt.');
        showNoPermission();
        return;
      }
    } catch (error) {
      console.error('Error checking permissions:', error);
      showNoPermission();
      return;
    }
    
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
      console.log(`[showCookiesForTab] Getting cookies for URL: ${currentUrl}`);
      
      // Always clear cache when explicitly showing cookies for tab to prevent stale data
      cookieCache.clear(); // <-- Restore cache clearing here
      
      // Get all cookies for the current tab
      cookieHandler.getAllCookies(function (cookies) {
        console.log(`[showCookiesForTab] Received ${cookies.length} cookies.`);
        
        // Update the cache
        cookieCache.store(currentUrl, cookies);
        
        // Render the cookies
        renderCookies(cookies, resolve);
      });
    });
  }
  
  // PERFORMANCE OPTIMIZATION: Separate cookie rendering logic
  function renderCookies(cookies, resolve) {
    // Sort cookies by name
    cookies = cookies.sort(sortCookiesByName);
    
    // Reset loaded cookies tracking
    loadedCookies = {};
    
    // Make sure the correct button bar is displayed
    document.getElementById('button-bar-add').classList.remove('active');
    document.getElementById('button-bar-import').classList.remove('active');
    document.getElementById('button-bar-default').classList.add('active');
    
    // Handle case with no cookies
    if (cookies.length === 0) {
      showNoCookies();
      resolve();
      return;
    }
    
    // Create cookie list element
    cookiesListHtml = document.createElement('ul');
    cookiesListHtml.appendChild(generateSearchBar());
    
    // Create fragment to minimize DOM operations
    const fragment = document.createDocumentFragment();
    
    // Add each cookie to the fragment
    cookies.forEach(function (cookie) {
      const id = Cookie.hashCode(cookie);
      loadedCookies[id] = new Cookie(id, cookie, optionHandler);
      fragment.appendChild(loadedCookies[id].html);
    });
    
    // Add all cookies at once
    cookiesListHtml.appendChild(fragment);
    
    // Determine if we need to animate the transition
    if (containerCookie.firstChild) {
      const useAnimations = optionHandler.getAnimationsEnabled();
      
      // Set the animation flag to prevent concurrent animations
      isAnimating = true;
      
      // Perform the transition from current content to new cookie list
      Animate.transitionPage(
        containerCookie,
        containerCookie.firstChild,
        cookiesListHtml,
        'right',
        () => {
          isAnimating = false; // Reset the animation flag when done
          resolve();
        },
        useAnimations
      );
    } else {
      // If no existing content, just add the cookie list directly
      containerCookie.appendChild(cookiesListHtml);
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
    console.log('[getCookiesForDomainWrapper] Getting cookies for domain:', domain);
    
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
    
    console.log('[getCookiesForDomainWrapper] Using custom side panel approach with filter:', filter);
    
    if (browserDetector.supportsPromises()) {
      browserAPI.cookies.getAll(filter)
        .then(cookies => {
          console.log(`[getCookiesForDomainWrapper] Found ${cookies.length} cookies for domain ${domain}`);
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
        console.log(`[getCookiesForDomainWrapper] Found ${cookies.length} cookies for domain ${domain}`);
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
    console.log('[showCookiesForSelectedDomain] Called. selectedDomain:', selectedDomain, 'forceExecution:', forceExecution);
    
    // Only check flags if not forcing execution (when called from domain selector)
    if (!forceExecution && disableButtons) {
      console.log('[showCookiesForSelectedDomain] Skipped due to disableButtons flag.');
      return Promise.resolve(); // Return resolved Promise instead of undefined
    }
    
    // Prevent concurrent animations if not forcing execution
    if (!forceExecution && isAnimating) {
      console.log('[showCookiesForSelectedDomain] Skipped due to isAnimating flag.');
      return Promise.resolve(); // Return resolved Promise instead of undefined
    }
    
    // If selectedDomain is empty, explicitly show cookies for current tab
    // This is a safeguard in case this function is called directly
    if (!selectedDomain) {
      console.log('[showCookiesForSelectedDomain] No selectedDomain, falling back to showCookiesForTab.');
      return showCookiesForTab(); // This already returns a Promise
    }
    
    console.log('[showCookiesForSelectedDomain] Getting cookies for domain:', selectedDomain);
    // Return a promise that resolves when cookies are displayed
    return new Promise((resolve) => {
      // Use our wrapper function instead of cookieHandler.getCookiesForDomain directly
      getCookiesForDomainWrapper(selectedDomain, function (cookies) {
        console.log(`[showCookiesForSelectedDomain] Received ${cookies.length} cookies for domain: ${selectedDomain}`);
        // Sort cookies by name
        cookies = cookies.sort(sortCookiesByName);
        
        // Reset loaded cookies tracking
        loadedCookies = {};
        
        // Handle case with no cookies
        if (cookies.length === 0) {
          const html = document
            .importNode(document.getElementById('tmp-empty').content, true)
            .querySelector('p');
          
          html.textContent = `No cookies found for domain: ${selectedDomain}`;
          
          if (containerCookie.firstChild) {
            // Set the animation flag to prevent concurrent animations
            isAnimating = true;
            
            Animate.transitionPage(
              containerCookie,
              containerCookie.firstChild,
              html,
              'right',
              () => {
                isAnimating = false; // Reset the animation flag when done
                resolve();
              },
              optionHandler.getAnimationsEnabled()
            );
          } else {
            containerCookie.appendChild(html);
            resolve();
          }
          return;
        }
        
        // Create cookie list element
        cookiesListHtml = document.createElement('ul');
        cookiesListHtml.appendChild(generateSearchBar());
        
        // Add each cookie to the list
        cookies.forEach(function (cookie) {
          const id = Cookie.hashCode(cookie);
          loadedCookies[id] = new Cookie(id, cookie, optionHandler);
          cookiesListHtml.appendChild(loadedCookies[id].html);
        });
        
        // Perform the transition with animation
        if (containerCookie.firstChild) {
          // Set the animation flag to prevent concurrent animations
          isAnimating = true;
          
          Animate.transitionPage(
            containerCookie,
            containerCookie.firstChild,
            cookiesListHtml,
            'right',
            () => {
              isAnimating = false; // Reset the animation flag when done
              resolve();
            },
            optionHandler.getAnimationsEnabled()
          );
        } else {
          containerCookie.appendChild(cookiesListHtml);
          resolve();
        }
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
  function showNoPermission() {
    if (disableButtons) {
      return Promise.resolve();
    }
    
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
    // document.getElementById('button-bar-default').classList.remove('active');
    
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
            setupPermissionButtons();
            resolve();
          },
          optionHandler.getAnimationsEnabled()
        );
      } else {
        // If no existing content, just add the message directly
        containerCookie.appendChild(html);
        setupPermissionButtons();
        resolve();
      }
    });
    
    // Helper function to set up permission request buttons
    function setupPermissionButtons() {
      document.getElementById('request-permission').focus();
      
      // Add click handler for current site permission request
      document
        .getElementById('request-permission')
        .addEventListener('click', async (event) => {
          hasRequestedPermission = true;
          
          // Check if we can request permissions for this URL
          if (!permissionHandler.canHavePermissions(cookieHandler.currentTab.url)) {
            showPermissionImpossible();
            return;
          }
          
          try {
            const isPermissionGranted = await permissionHandler.requestPermission(
              cookieHandler.currentTab.url,
            );
            
            if (isPermissionGranted) {
              showCookiesForTab();
            }
          } catch (error) {
            console.error('Permission request error:', error);
            showPermissionImpossible();
          }
        });
      
      // Add click handler for all sites permission request
      document
        .getElementById('request-permission-all')
        .addEventListener('click', async (event) => {
          hasRequestedPermission = true;
          
          try {
            const isPermissionGranted =
              await permissionHandler.requestPermission('<all_urls>');
            
            if (isPermissionGranted) {
              showCookiesForTab();
            }
          } catch (error) {
            console.error('Permission request error:', error);
            showPermissionImpossible();
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
    if (disableButtons) {
      return Promise.resolve();
    }
    
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
    // document.getElementById('button-bar-default').classList.remove('active');
    
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
  function exportToJson() {
    hideExportMenu();
    const buttonIcon = document
      .getElementById('export-cookies')
      .querySelector('use');
    if (buttonIcon.getAttribute('href') === '../sprites/solid.svg#check') {
      return;
    }

    buttonIcon.setAttribute('href', '../sprites/solid.svg#check');
    copyText(JsonFormat.format(loadedCookies));

    sendNotification('Cookies exported to clipboard as JSON', false);
    setTimeout(() => {
      buttonIcon.setAttribute('href', '../sprites/solid.svg#file-export');
    }, 1500);
  }

  /**
   * Exports all the cookies for the current tab in the header string format.
   */
  function exportToHeaderstring() {
    hideExportMenu();
    const buttonIcon = document
      .getElementById('export-cookies')
      .querySelector('use');
    if (buttonIcon.getAttribute('href') === '../sprites/solid.svg#check') {
      return;
    }

    buttonIcon.setAttribute('href', '../sprites/solid.svg#check');
    copyText(HeaderstringFormat.format(loadedCookies));

    sendNotification('Cookies exported to clipboard as Header String', false);
    setTimeout(() => {
      buttonIcon.setAttribute('href', '../sprites/solid.svg#file-export');
    }, 1500);
  }

  /**
   * Exports all the cookies for the current tab in the Netscape format.
   */
  function exportToNetscape() {
    hideExportMenu();
    const buttonIcon = document
      .getElementById('export-cookies')
      .querySelector('use');
    if (buttonIcon.getAttribute('href') === '../sprites/solid.svg#check') {
      return;
    }

    buttonIcon.setAttribute('href', '../sprites/solid.svg#check');
    copyText(NetscapeFormat.format(loadedCookies));

    sendNotification('Cookies exported to clipboard as Netscape format', false);
    setTimeout(() => {
      buttonIcon.setAttribute('href', '../sprites/solid.svg#file-export');
    }, 1500);
  }

  /**
   * Removes a cookie from the current tab.
   * @param {string} name Name of the cookie to remove.
   * @param {string} url Url of the tab that contains the cookie.
   * @param {function} callback
   */
  function removeCookie(name, url, callback) {
    // Store a reference to the cookie for UI updates
    const cookieId = Object.keys(loadedCookies).find(id => 
      loadedCookies[id].cookie.name === name
    );
    
    // If we found the cookie in our loaded cookies, remove it from UI immediately
    if (cookieId && loadedCookies[cookieId] && loadedCookies[cookieId].html) {
      const cookieElement = loadedCookies[cookieId].html;
      if (cookieElement && cookieElement.parentNode) {
        cookieElement.parentNode.removeChild(cookieElement);
      }
      // Remove from our loaded cookies object
      delete loadedCookies[cookieId];
    }
    
    // Then send the request to actually remove it
    cookieHandler.removeCookie(name, url || getCurrentTabUrl(), function (e) {
      if (callback) {
        callback();
      }
      if (browserDetector.isSafari()) {
        onCookiesChanged();
      }
    });
    
    // Check if cookies have been modified from loaded profile
    // Use a small timeout to ensure this runs after cookie is fully removed
    setTimeout(() => {
      checkIfCookiesModified();
    }, 50);
  }

  /**
   * Handles when the cookies change.
   */
  function onCookiesChanged() {
    // PERFORMANCE OPTIMIZATION: Clear the cache when cookies change
    cookieCache.clear(); // <-- Restore cache clearing here
    
    if (cookieChangeTimeout !== null) {
      clearTimeout(cookieChangeTimeout);
    }
    
    // Don't refresh if any cookie expandos are currently open
    const activeExpandos = document.querySelectorAll('.header.active');
    if (activeExpandos.length > 0) {
      console.log('[onCookiesChanged] Skipping refresh because cookies are expanded:', activeExpandos.length);
      return;
    }
    
    cookieChangeTimeout = setTimeout(function () {
      cookieChangeTimeout = null;
      if (selectedDomain) {
        showCookiesForSelectedDomain(true);
      } else {
        showCookiesForTab();
      }
    }, 2000); // Increased from 500ms to 2000ms to reduce refresh frequency
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
          console.log("Side Panel initialized for tab:", associatedTabId);
        } else {
          console.log("Popup initialized for tab:", currentTab.id);
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
    
    // PERFORMANCE OPTIMIZATION: Set up cookie handler first to start loading cookies as soon as possible
    if (cookieHandler.isReady && cookieHandler.currentTab) {
      console.log('Cookie handler already ready, showing cookies for tab');
      
      // Request cookie check from background script
      if (cookieHandler.currentTab.url) {
        requestBackgroundCookieCheck(cookieHandler.currentTab.url);
      }
      
      // Start loading cookies immediately
      showCookiesForTab();
    }
    
    // PERFORMANCE OPTIMIZATION: Set up event listeners after initial render has started
    setTimeout(() => {
      // Set up event listeners
      optionHandler.on('optionsChanged', onOptionsChanged);
      cookieHandler.on('cookiesChanged', onCookiesChanged);
      
      // Set up the ready handler
      cookieHandler.on('ready', async () => {
        console.log('Cookie handler is ready, showing cookies for tab');
        
        // Request immediate cookie check from the background script
        if (cookieHandler.currentTab && cookieHandler.currentTab.url) {
          requestBackgroundCookieCheck(cookieHandler.currentTab.url);
        }
        
        // Allow a small delay for the tab to be fully initialized
        setTimeout(() => {
          showCookiesForTab();
        }, 50);
      });
      
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
      console.log('[onMessage] Received message:', JSON.stringify(message));
      
      if (message.action === 'requestCookieRefresh') {
        console.log('[onMessage] Handling requestCookieRefresh for tab:', message.tabId);
        let refreshNeeded = false;
        
        if (isSidePanel()) {
          console.log('[onMessage] Side Panel context. Associated Tab ID:', associatedTabId);
          // Side Panel: Check against the stored associated tab ID
          if (associatedTabId && message.tabId === associatedTabId) {
            console.log('[onMessage] Side Panel: Tab ID matches. Refresh needed.');
            // If the URL changed for our associated tab, update internal state
            if (message.url && cookieHandler.currentTab) {
              console.log('[onMessage] Side Panel: Updating internal URL to:', message.url);
              cookieHandler.currentTab.url = message.url; 
            }
            refreshNeeded = true;
          } else {
            console.log('[onMessage] Side Panel: Tab ID does NOT match associated ID.');
          }
        } else {
          console.log('[onMessage] Popup context.');
          // Popup: Use query to get the current tab for comparison
          try {
              const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
              if (tabs && tabs.length > 0 && message.tabId === tabs[0].id) {
                console.log('[onMessage] Popup: Tab ID matches. Refresh needed.');
                refreshNeeded = true;
              } else {
                console.log('[onMessage] Popup: Tab ID does NOT match current tab ID.');
              }
          } catch (error) {
              console.error("Popup: Error querying current tab for refresh check:", error);
          }
        }
  
        if (refreshNeeded) {
            console.log('[onMessage] Refresh needed. Checking buttons/animation state...');
            // Avoid refreshing if a save operation is in progress
            if (!disableButtons && !isAnimating) { 
                console.log('[onMessage] Calling showCookiesForTab()...');
                showCookiesForTab(); // Refreshes the cookie list UI
            } else {
                console.log('[onMessage] Refresh skipped due to disableButtons or isAnimating flag.');
            }
        } else {
            console.log('[onMessage] Refresh NOT needed for this message.');
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
            console.log('Message channel closed while checking for cookies - this is normal when popup closes');
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
    
    // Add export/import all profiles to main menu
    const menuContent = document.getElementById('main-menu-content');
    
    // Check if buttons already exist to avoid duplicates
    // Add Import Profiles button first
    if (!document.getElementById('import-all-profiles')) {
      const importAllProfilesBtn = document.createElement('button');
      importAllProfilesBtn.className = 'menu-item';
      importAllProfilesBtn.id = 'import-all-profiles';
      importAllProfilesBtn.innerHTML = 'Import Profiles <svg class="icon"><use href="../sprites/solid.svg#file-import"></use></svg>';
      importAllProfilesBtn.addEventListener('click', importAllProfiles);
      menuContent.appendChild(importAllProfilesBtn);
    }
    
    // Then add Export All Profiles button
    if (!document.getElementById('export-all-profiles')) {
      const exportAllProfilesBtn = document.createElement('button');
      exportAllProfilesBtn.className = 'menu-item';
      exportAllProfilesBtn.id = 'export-all-profiles';
      exportAllProfilesBtn.innerHTML = 'Export All Profiles <svg class="icon"><use href="../sprites/solid.svg#file-export"></use></svg>';
      exportAllProfilesBtn.addEventListener('click', exportAllProfiles);
      menuContent.appendChild(exportAllProfilesBtn);
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
    searchBarContainer
      .getElementById('searchField')
      .addEventListener('keyup', (e) =>
        filterCookies(e.target, e.target.value),
      );
    return searchBarContainer;
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
    notificationElement.parentElement.style.pointerEvents = 'auto';
    
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
   */
  function filterCookies(target, filterText) {
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

    for (let i = 0; i < cookies.length; i++) {
      const cookieElement = cookies[i];
      const cookieName = cookieElement.children[0]
        .getElementsByTagName('span')[0]
        .textContent.toLocaleLowerCase();
      if (!filterText || cookieName.indexOf(filterText) > -1) {
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
      const metadata = await profileManager.getProfileMetadataForDomain(domain);
      const statusContainer = document.getElementById('profile-status');
      
      // Ensure status container exists
      if (!statusContainer) return;
      
      if (metadata.lastLoaded) {
        // Get the Load button
        const loadBtn = document.getElementById('load-profile');
        
        if (metadata.modified) {
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
        // No profile loaded
        statusContainer.textContent = 'No profile loaded';
        statusContainer.className = 'profile-status none';
        
        // Reset all option texts to their original names
        if (profileSelector) {
          const profileNames = await profileManager.getProfileNamesForDomain(domain);
          for (let i = 0; i < profileSelector.options.length; i++) {
            const optionValue = profileSelector.options[i].value;
            if (optionValue && profileNames.includes(optionValue)) {
              profileSelector.options[i].textContent = optionValue;
            }
          }
        }
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
      formElement.style.backgroundColor = 'var(--background-color)';
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
    return new Promise(resolve => {
      const result = window.confirm(message);
      resolve(result);
    });
  }

  /**
   * Loads the selected profile
   */
  async function loadSelectedProfile() {
    // Exit if in side panel
    if (isSidePanel()) return;
    if (!currentDomain || !profileSelector.value) {
      sendNotification('No profile selected.', true);
      return;
    }
    
    // If another profile load is in progress, ignore this request
    if (disableButtons) {
      return;
    }
    
    const profileName = profileSelector.value;
    
    // Cache the current domain to avoid scope issues
    const targetDomain = currentDomain;
    
    // Disable buttons during loading to prevent multiple clicks
    disableButtons = true;
    
    // Start a performance timer
    const startTime = performance.now();
    
    // Record current scroll position of the container
    const scrollPos = containerCookie.scrollTop;
    
    // Store container height to prevent layout shifts
    const containerHeight = containerCookie.offsetHeight || 400;
    containerCookie.style.height = `${containerHeight}px`;
    
    // Show loading message
    sendNotification(`Loading profile "${profileName}"...`, false);
    
    // Clear the container to show loading state immediately
    clearChildren(containerCookie);
    
    try {
      // Get profile cookies
      const cookies = await profileManager.getProfile(targetDomain, profileName);
      
      if (!cookies || cookies.length === 0) {
        sendNotification('Profile has no cookies to load.', true);
        disableButtons = false;
        containerCookie.style.height = '';
        return;
      }
      
      // Create a temporary loading indicator
      const loadingIndicator = document.createElement('div');
      loadingIndicator.className = 'loading-indicator';
      loadingIndicator.textContent = 'Applying cookies...';
      loadingIndicator.style.textAlign = 'center';
      loadingIndicator.style.padding = '20px';
      loadingIndicator.style.color = 'var(--text-color)';
      containerCookie.appendChild(loadingIndicator);
      
      // Determine batch size based on number of cookies
      const BATCH_SIZE = cookies.length > 50 ? 5 : (cookies.length > 20 ? 3 : 1);
      
      // Delete all existing cookies first and wait for completion
      await deleteAllCookiesForDomain(targetDomain);
      
      // Add a small delay to ensure browser has processed all deletions
      await new Promise(r => setTimeout(r, 50));
      
      // Update the loading indicator text
      loadingIndicator.textContent = `Adding ${cookies.length} cookies...`;
      
      // Add cookies in batches for better performance
      let errorCount = 0;
      const currentUrl = getCurrentTabUrl();
      
      // Process cookies in batches
      for (let i = 0; i < cookies.length; i += BATCH_SIZE) {
        const batch = cookies.slice(i, i + BATCH_SIZE);
        
        // Process batch in parallel
        const promises = batch.map(cookie => {
          return new Promise((resolve) => {
            cookieHandler.saveCookie(cookie, currentUrl, (error) => {
              if (error) {
                errorCount++;
                console.error('Error setting cookie:', error);
              }
              resolve(); // Always resolve to continue processing
            });
          });
        });
        
        // Wait for batch to complete
        await Promise.all(promises);
        
        // Update loading indicator to show progress
        const progress = Math.min(100, Math.round((i + batch.length) / cookies.length * 100));
        loadingIndicator.textContent = `Adding cookies... ${progress}%`;
        
        // Small delay between batches to let the browser catch up
        if (i + BATCH_SIZE < cookies.length) {
          await new Promise(r => setTimeout(r, 10));
        }
      }
      
      // Mark the profile as loaded (this updates the metadata in storage)
      await profileManager.markProfileAsLoaded(targetDomain, profileName, cookies);
      
      // Update both the profile selector and status indicator to ensure UI is in sync
      await updateProfileSelector(targetDomain);
      await updateProfileStatusIndicator(targetDomain);
      
      // Remove the loading indicator
      containerCookie.removeChild(loadingIndicator);
      
      // Now determine which cookies to show based on the currently selected domain
      if (selectedDomain) {
        // If a specific domain is selected in the dropdown, use that
        await showCookiesForSelectedDomain(true);
      } else {
        // Otherwise show current tab cookies
        await showCookiesForTab(true);
      }
      
      // Restore original scroll position
      containerCookie.scrollTop = scrollPos;
      
      // Restore container height after content is fully loaded
      requestAnimationFrame(() => {
        containerCookie.style.height = '';
      });
      
      disableButtons = false;
      
      // Calculate and log operation time
      const endTime = performance.now();
      const operationTime = Math.round(endTime - startTime);
      console.log(`Profile load operation completed in ${operationTime}ms`);
      
      if (errorCount > 0) {
        sendNotification(`Profile loaded with ${errorCount} errors.`, true);
      } else {
        sendNotification(`Profile "${profileName}" loaded successfully in ${operationTime}ms.`, false);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      sendNotification('Failed to load profile.', true);
      disableButtons = false;
      // Restore container height
      requestAnimationFrame(() => {
        containerCookie.style.height = '';
      });
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
    if (!currentDomain) return;
    
    // Extract current cookies
    const currentCookies = [];
    for (const id in loadedCookies) {
      currentCookies.push(loadedCookies[id].cookie);
    }
    
    // Log cookie state for debugging
    console.log(`[checkIfCookiesModified] Checking ${currentCookies.length} cookies against loaded profile for domain ${currentDomain}`);
    
    // Check if cookies have been modified
    const modified = await profileManager.checkIfCookiesModified(currentDomain, currentCookies);
    
    // If we needed to update the UI, update both the status indicator and profile selector
    if (!isSidePanel()) {
      console.log(`[checkIfCookiesModified] Modified status: ${modified}, updating UI`);
      await updateProfileStatusIndicator(currentDomain);
      
      // Always update the profile selector to ensure button states are correct
      await updateProfileSelector(currentDomain);
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
    
    // Confirm before deleting
    if (!await confirmAction(`Are you sure you want to delete the profile "${profileName}"?`)) {
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
      if (!fileInput.files || !fileInput.files[0]) return;
      
      try {
        // Read file content
        const file = fileInput.files[0];
        const reader = new FileReader();
        
        reader.onload = async function(e) {
          try {
            const jsonString = e.target.result;
            const importedData = JSON.parse(jsonString);
            
            // Validate imported data
            if (typeof importedData !== 'object') {
              sendNotification('Invalid profile data format.', true);
              return;
            }
            
            // Check if the imported data has any profiles
            const domainCount = Object.keys(importedData).length;
            if (domainCount === 0) {
              sendNotification('No profiles found in import file.', true);
              return;
            }
            
            // If current domain exists in the import, ask if user wants to import just that or all domains
            let domainsToImport = null;
            let targetDomain = currentDomain;
            
            if (importedData[currentDomain]) {
              // Only ask about importing all domains if there's more than one domain
              if (domainCount > 1) {
                const importAllDomains = await confirmAction('Import profiles for all domains? Click OK to import all domains or Cancel to import only for the current domain.');
                
                if (importAllDomains) {
                  domainsToImport = Object.keys(importedData);
                } else {
                  domainsToImport = [currentDomain];
                }
              } else {
                // Only one domain in the import file
                domainsToImport = [currentDomain];
              }
            } else {
              // No profiles for current domain, show a list of available domains if more than one
              domainsToImport = Object.keys(importedData);
              
              if (domainsToImport.length === 1) {
                targetDomain = domainsToImport[0];
              } else if (domainsToImport.length > 1) {
                // Create a simple dialog to select domains
                const domainList = domainsToImport.join(', ');
                const importAllDomains = await confirmAction(`Found profiles for ${domainsToImport.length} domains: ${domainList}. Click OK to import all domains or Cancel to select specific domains.`);
                
                if (!importAllDomains) {
                  // User will select domains later, but for now update the UI for the current domain
                  targetDomain = domainsToImport[0];
                }
              }
            }
            
            // Ask whether to merge with existing profiles or cancel
            const allProfiles = await profileManager.getAllProfiles();
            
            // Check if there are existing profiles for the domains to be imported
            let hasExistingProfiles = false;
            for (const domain of domainsToImport) {
              if (allProfiles[domain] && Object.keys(allProfiles[domain]).length > 0) {
                hasExistingProfiles = true;
                break;
              }
            }
            
            let shouldProceed = true;
            if (hasExistingProfiles) {
              shouldProceed = await confirmAction('OK to merge and replace existing ones (same profile name), CANCEL to cancel import');
            }
            
            if (!shouldProceed) {
              sendNotification('Import cancelled.', false);
              return;
            }
            
            // Import the selected domains
            for (const domain of domainsToImport) {
              if (!allProfiles[domain]) {
                allProfiles[domain] = {};
              }
              
              // Add imported profiles for this domain
              for (const profileName in importedData[domain]) {
                allProfiles[domain][profileName] = importedData[domain][profileName];
              }
            }
            
            // Save updated profiles
            await storageHandler.setLocal(profileManager.profileStorageKey, allProfiles);
            
            // Force cache invalidation before updating UI
            profileManager._invalidateCache();
            
            // Update the UI
            await updateProfileSelector(targetDomain);
            
            sendNotification(`${domainsToImport.length} domain profiles imported successfully.`, false);
          } catch (error) {
            console.error('Domain import parsing error:', error);
            sendNotification('Failed to import domain profiles: ' + error.message, true);
          }
        };
        
        reader.readAsText(file);
      } catch (error) {
        console.error('File read error:', error);
        sendNotification('Failed to read file: ' + error.message, true);
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
      console.log('Loaded profile panel state:', isExpanded);
      
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
    console.log('[getAllDomainsWrapper] Getting all domains');
    
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
          console.log(`[getAllDomainsWrapper] Found ${domains.length} domains`);
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
        console.log(`[getAllDomainsWrapper] Found ${domains.length} domains`);
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
      domainSelector.options[0].textContent = `Current tab domain (${currentDomain})`;
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
    
    console.log('[handleDomainSelectionChange] Called. Selected value:', domainSelector.value);
    
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
      console.log('[handleDomainSelectionChange] In add/import screen, updating domain data without view change');
      
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
        console.log('[handleDomainSelectionChange] Updated form domain data to:', selectedDomain);
      }
      
      return;
    }
    
    // Check flags before proceeding with view change
    if (disableButtons || isAnimating) {
      console.log('[handleDomainSelectionChange] Skipped due to disableButtons or isAnimating flag.');
      return;
    }
    
    console.log('[handleDomainSelectionChange] Current flags - disableButtons:', disableButtons, 'isAnimating:', isAnimating);
    
    // Update profile selector only if it exists (popup only feature)
    if (!isSidePanel() && profileSelector) {
      updateProfileSelector(currentDomain).catch(error => {
        console.error('Error updating profile selector for new domain:', error);
      });
    }
    
    // Set animation flag to indicate operation in progress
    isAnimating = true;
    
    console.log('[handleDomainSelectionChange] Calling showCookiesForSelectedDomain for selected domain:', selectedDomain, 'isAnimating:', isAnimating);
    
    try {
      // Check if user selected "Current tab domain" (empty value)
      if (selectedDomain === '') {
        // If empty value selected, show cookies for current tab
        console.log('[handleDomainSelectionChange] Empty domain selected, showing cookies for current tab');
        
        // Use a promise with timeout to ensure isAnimating flag gets reset
        const loadingPromise = showCookiesForTab(true);
        
        // Set a timeout to ensure flag is reset even if promise hangs
        const timeoutId = setTimeout(() => {
          console.log('[handleDomainSelectionChange] Safety timeout triggered, resetting animation flag.');
          isAnimating = false;
        }, 5000); // 5 second safety timeout
        
        loadingPromise.then(() => {
          console.log('[handleDomainSelectionChange] showCookiesForTab Promise resolved, resetting animation flag.');
          clearTimeout(timeoutId); // Clear the safety timeout
          isAnimating = false;
        }).catch(error => {
          console.error('[handleDomainSelectionChange] Error in showCookiesForTab:', error);
          clearTimeout(timeoutId); // Clear the safety timeout
          isAnimating = false;
        });
      } else {
        // For any other domain, show cookies for selected domain
        // Pass forceExecution=true to bypass the disableButtons and isAnimating checks
        
        // Use a promise with timeout to ensure isAnimating flag gets reset
        const loadingPromise = showCookiesForSelectedDomain(true);
        
        // Set a timeout to ensure flag is reset even if promise hangs
        const timeoutId = setTimeout(() => {
          console.log('[handleDomainSelectionChange] Safety timeout triggered, resetting animation flag.');
          isAnimating = false;
        }, 5000); // 5 second safety timeout
        
        loadingPromise.then(() => {
          console.log('[handleDomainSelectionChange] showCookiesForSelectedDomain Promise resolved, resetting animation flag.');
          clearTimeout(timeoutId); // Clear the safety timeout
          isAnimating = false;
        }).catch(error => {
          console.error('[handleDomainSelectionChange] Error in showCookiesForSelectedDomain:', error);
          clearTimeout(timeoutId); // Clear the safety timeout
          isAnimating = false;
        });
      }
    } catch (error) {
      // Catch any synchronous errors
      console.error('[handleDomainSelectionChange] Unexpected error:', error);
      isAnimating = false;
    }
  }
  
  /**
   * Saves the profile panel state to user preferences
   * @param {boolean} isExpanded - Whether the panel is expanded
   */
  function saveProfilePanelState(isExpanded) {
    // Exit if in side panel
    if (isSidePanel()) return;
    console.log('Saving profile panel state:', isExpanded ? 'expanded' : 'collapsed');
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
    const button = document.getElementById('profile-actions');
    
    // Toggle visibility
    const isVisible = domainProfileMenu.classList.contains('visible');
    
    if (!isVisible) {
      // Position the menu relative to the button
      const buttonRect = button.getBoundingClientRect();
      domainProfileMenu.style.top = `${buttonRect.bottom + 5}px`;
      domainProfileMenu.style.left = `${buttonRect.left - 170}px`; // Align right edge with button
      
      // Show the menu
      domainProfileMenu.classList.add('visible');
    } else {
      // Hide the menu
      domainProfileMenu.classList.remove('visible');
    }
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
    // Create file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    
    fileInput.onchange = async function() {
      if (!fileInput.files || !fileInput.files[0]) return;
      
      try {
        // Read file content
        const file = fileInput.files[0];
        const reader = new FileReader();
        
        reader.onload = async function(e) {
          try {
            const jsonString = e.target.result;
            const importedData = JSON.parse(jsonString);
            
            // Validate imported data
            if (typeof importedData !== 'object') {
              sendNotification('Invalid profile data format.', true);
              return;
            }
            
            // Check if the imported data has any profiles
            const domainCount = Object.keys(importedData).length;
            if (domainCount === 0) {
              sendNotification('No profiles found in import file.', true);
              return;
            }
            
            // If current domain exists in the import, ask if user wants to import just that or all domains
            let domainsToImport = null;
            let targetDomain = currentDomain;
            
            if (importedData[currentDomain]) {
              // Only ask about importing all domains if there's more than one domain
              if (domainCount > 1) {
                const importAllDomains = await confirmAction('Import profiles for all domains? Click OK to import all domains or Cancel to import only for the current domain.');
                
                if (importAllDomains) {
                  domainsToImport = Object.keys(importedData);
                } else {
                  domainsToImport = [currentDomain];
                }
              } else {
                // Only one domain in the import file
                domainsToImport = [currentDomain];
              }
            } else {
              // No profiles for current domain, show a list of available domains if more than one
              domainsToImport = Object.keys(importedData);
              
              if (domainsToImport.length === 1) {
                targetDomain = domainsToImport[0];
              } else if (domainsToImport.length > 1) {
                // Create a simple dialog to select domains
                const domainList = domainsToImport.join(', ');
                const importAllDomains = await confirmAction(`Found profiles for ${domainsToImport.length} domains: ${domainList}. Click OK to import all domains or Cancel to select specific domains.`);
                
                if (!importAllDomains) {
                  // User will select domains later, but for now update the UI for the current domain
                  targetDomain = domainsToImport[0];
                }
              }
            }
            
            // Ask whether to merge with existing profiles or cancel
            const allProfiles = await profileManager.getAllProfiles();
            
            // Check if there are existing profiles for the domains to be imported
            let hasExistingProfiles = false;
            for (const domain of domainsToImport) {
              if (allProfiles[domain] && Object.keys(allProfiles[domain]).length > 0) {
                hasExistingProfiles = true;
                break;
              }
            }
            
            let shouldProceed = true;
            if (hasExistingProfiles) {
              shouldProceed = await confirmAction('OK to merge and replace existing ones (same profile name), CANCEL to cancel import');
            }
            
            if (!shouldProceed) {
              sendNotification('Import cancelled.', false);
              return;
            }
            
            // Import the selected domains
            for (const domain of domainsToImport) {
              if (!allProfiles[domain]) {
                allProfiles[domain] = {};
              }
              
              // Add imported profiles for this domain
              for (const profileName in importedData[domain]) {
                allProfiles[domain][profileName] = importedData[domain][profileName];
              }
            }
            
            // Save updated profiles
            await storageHandler.setLocal(profileManager.profileStorageKey, allProfiles);
            
            // Force cache invalidation before updating UI
            profileManager._invalidateCache();
            
            // Update the UI
            await updateProfileSelector(targetDomain);
            
            sendNotification(`${domainsToImport.length} domain profiles imported successfully.`, false);
          } catch (error) {
            console.error('Domain import parsing error:', error);
            sendNotification('Failed to import domain profiles: ' + error.message, true);
          }
        };
        
        reader.readAsText(file);
      } catch (error) {
        console.error('File read error:', error);
        sendNotification('Failed to read file: ' + error.message, true);
      }
    };
    
    fileInput.click();
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
  function showShareDialog(cookies, domain, profiles) {
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
    const expireCheckbox = template.getElementById('share-expire');
    const neverExpireCheckbox = template.getElementById('share-never-expire');
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
      // If "never expires" is checked, make sure the 24h expiration is unchecked
      if (neverExpireCheckbox.checked) {
        expireCheckbox.checked = false;
        expireCheckbox.disabled = true;
      } else {
        expireCheckbox.disabled = false;
      }
      
      // Get expiration setting - false means no expiration
      const expires = expireCheckbox.checked && !neverExpireCheckbox.checked;
      
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
    
    // Update URL when expiration options change
    expireCheckbox.addEventListener('change', updateShareUrl);
    neverExpireCheckbox.addEventListener('change', updateShareUrl);
    
    // Make the checkboxes mutually exclusive
    neverExpireCheckbox.addEventListener('change', function() {
      if (this.checked) {
        expireCheckbox.checked = false;
      }
    });
    
    expireCheckbox.addEventListener('change', function() {
      if (this.checked) {
        neverExpireCheckbox.checked = false;
      }
    });
    
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
          console.log('No permission to check for shared cookies on this domain');
          return;
        }
        
        console.log('Checking for shared cookies in URL:', cookieHandler.currentTab.url);
        
        // Check if the URL contains shared cookies
        const sharedData = extractSharedCookiesFromUrl(cookieHandler.currentTab.url);
        
        if (!sharedData) {
          console.log('No shared cookies found in URL');
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
          console.log('Badge clear message failed, popup may be closing');
        });
      }
    } catch (error) {
      // Suppress errors that happen when popup is closing
      console.log('Error clearing badge, popup may be closing');
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
          
          console.log('Decrypting with data type:', dataType);
          
          // Attempt to decrypt based on the known data type first
          let decryptedData = null;
          let success = false;
          
          if (dataType === 'profiles') {
            // Try profile decryption first
            try {
              decryptedData = await decryptProfiles(encryptedParams, password);
              if (decryptedData) {
                success = true;
                console.log('Successfully decrypted profile data');
                dialogElement.remove();
                resolve({
                  type: 'profiles',
                  ...decryptedData
                });
                return;
              }
            } catch (error) {
              console.log('Failed to decrypt as profile data, will try cookies as fallback', error);
            }
            
            // Fallback to cookie decryption
            if (!success) {
              try {
                decryptedData = await decryptCookies(encryptedParams, password);
                if (decryptedData) {
                  console.log('Successfully decrypted cookie data (fallback)');
                  dialogElement.remove();
                  resolve({
                    type: 'cookies',
                    ...decryptedData
                  });
                  return;
                }
              } catch (fallbackError) {
                console.log('Both decryption attempts failed');
                throw new Error('Failed to decrypt data');
              }
            }
          } else {
            // Default is cookie decryption first
            try {
              decryptedData = await decryptCookies(encryptedParams, password);
              if (decryptedData) {
                success = true;
                console.log('Successfully decrypted cookie data');
                dialogElement.remove();
                resolve({
                  type: 'cookies',
                  ...decryptedData
                });
                return;
              }
            } catch (error) {
              console.log('Failed to decrypt as cookie data, will try profiles as fallback', error);
            }
            
            // Fallback to profile decryption
            if (!success) {
              try {
                decryptedData = await decryptProfiles(encryptedParams, password);
                if (decryptedData) {
                  console.log('Successfully decrypted profile data (fallback)');
                  dialogElement.remove();
                  resolve({
                    type: 'profiles',
                    ...decryptedData
                  });
                  return;
                }
              } catch (fallbackError) {
                console.log('Both decryption attempts failed');
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
            console.log('Removed hash from URL:', url, '->', urlWithoutHash);
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
      console.log('Cookie handler is ready, checking for shared cookies');
      
      // Only check for pending shared data if not already processing
      if (!sharedDataProcessingInProgress) {
        // First check for any pending shared cookies in storage
        checkForPendingSharedCookies();
      }
      
      // Then check the current tab URL
      if (cookieHandler.currentTab && cookieHandler.currentTab.url) {
        console.log('Checking URL for shared cookies:', cookieHandler.currentTab.url);
        checkForSharedCookies();
      } else {
        console.warn('No current tab information available');
      }
    });
  } else {
    // Already ready, check directly
    console.log('Cookie handler already ready, checking for shared cookies');
    
    // Only check for pending shared data if not already processing
    if (!sharedDataProcessingInProgress) {
      checkForPendingSharedCookies();
    }
    
    if (cookieHandler.currentTab && cookieHandler.currentTab.url) {
      console.log('Checking URL for shared cookies:', cookieHandler.currentTab.url);
      checkForSharedCookies();
    }
  }
})();
