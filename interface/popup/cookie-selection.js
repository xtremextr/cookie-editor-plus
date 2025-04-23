/**
 * Cookie Selection functionality for Cookie Editor
 * Adds the ability to select multiple cookies using checkboxes
 */
(function() {
  'use strict';
  
  // Variables to track selection state
  let selectionEnabled = false;
  let selectedCookies = new Set();
  let selectionMenu = null;
  let showBatchDeleteConfirmation = true; // Flag to control batch delete confirmation display
  
  // DOM references
  let toggleSelectionButton = null;
  let selectAllButton = null;
  let deselectAllButton = null;
  let disableSelectionButton = null;
  let deleteSelectedButton = null;
  let shareSelectedButton = null;
  
  // Track initialization state
  let isInitialized = false;
  
  // Track if we were in selection mode before navigating to add/edit cookie
  let wasSelectionEnabledBeforeNavigation = false;
  
  /**
   * Initialize the cookie selection functionality when the DOM is loaded
   */
  document.addEventListener('DOMContentLoaded', async function() {
    console.log("DOM loaded, setting up cookie selection");
    
    // Get storageHandler if available
    const storageHandler = window.storageHandler || (window.optionHandler && window.optionHandler.storageHandler);
    
    // Load confirmation setting if storage handler is available
    try {
      if (storageHandler) {
        // Make sure we use the same pattern as other confirmation dialogs
        showBatchDeleteConfirmation = await storageHandler.getLocal('showBatchDeleteConfirmation', true);
        console.log('Batch delete confirmation loaded:', showBatchDeleteConfirmation);
      } else if (localStorage.getItem('dontShowBatchDeleteConfirmation') === 'true') {
        showBatchDeleteConfirmation = false;
        console.log('Using localStorage fallback for batch delete confirmation');
      }
    } catch (err) {
      console.error('Error loading batch delete confirmation setting:', err);
      // Default to true (show confirmation) if there's an error
      showBatchDeleteConfirmation = true;
    }
    
    // Wait for DOM to be fully loaded and then initialize
    waitForCookieHeader();

    // *** Add event listener for domain selector change to reinitialize selection mode ***
    const domainSelector = document.getElementById('domain-selector');
    if (domainSelector) {
      domainSelector.addEventListener('change', function() {
        // Save previous selection state
        const wasEnabled = selectionEnabled;
        // If selection was active before domain change, disable to clear old state
        if (wasEnabled) {
          disableSelection();
        }
        // Delay to wait for the cookie list and header to be re-rendered
        setTimeout(function() {
          console.log("Domain changed, reinitializing selection feature");
          // Re-find and re-setup the toggle button
          toggleSelectionButton = document.getElementById('toggle-selection');
          if (toggleSelectionButton) {
            setupToggleButtonEvents();
          } else {
            console.error("Toggle-selection button not found after domain change");
          }
        }, 500);
      });
    }
    
    // Monitor button bar buttons to track navigation to/from add cookie screen
    const addCookieButton = document.getElementById('create-cookie');
    if (addCookieButton) {
      addCookieButton.addEventListener('click', function() {
        // Store selection state when navigating to add cookie screen
        wasSelectionEnabledBeforeNavigation = selectionEnabled;
      });
    }
    
    // Monitor return from add cookie screen
    const returnListAddButton = document.getElementById('return-list-add');
    if (returnListAddButton) {
      returnListAddButton.addEventListener('click', function() {
        if (wasSelectionEnabledBeforeNavigation) {
          // Set a timeout to re-enable selection after the cookie list is refreshed
          setTimeout(function() {
            console.log("Returning from add cookie screen, restoring selection mode");
            toggleSelectionButton = document.getElementById('toggle-selection');
            if (toggleSelectionButton) {
              setupToggleButtonEvents();
              enableSelection(false);
            }
          }, 1000); // Wait for cookie list to be fully restored
        }
      });
    }
    
    // Also monitor the save button which also returns to list
    const saveCreateCookieButton = document.getElementById('save-create-cookie');
    if (saveCreateCookieButton) {
      saveCreateCookieButton.addEventListener('click', function() {
        if (wasSelectionEnabledBeforeNavigation) {
          // Set a timeout to re-enable selection after the cookie list is refreshed
          setTimeout(function() {
            console.log("Saved new cookie, restoring selection mode");
            toggleSelectionButton = document.getElementById('toggle-selection');
            if (toggleSelectionButton) {
              setupToggleButtonEvents();
              enableSelection(false);
            }
          }, 1000); // Wait for cookie list to be fully restored
        }
      });
    }
    // Add event listener for manual refresh to reset selection mode
    const refreshButton = document.getElementById('refresh-button');
    if (refreshButton) {
      refreshButton.addEventListener('click', function() {
        const wasEnabled = selectionEnabled;
        if (wasEnabled) {
          disableSelection();
        }
        // Delay to wait for the cookie list and header to be re-rendered
        setTimeout(function() {
          console.log("Manual refresh, reinitializing selection feature");
          toggleSelectionButton = document.getElementById('toggle-selection');
          if (toggleSelectionButton) {
            setupToggleButtonEvents();
          } else {
            console.error("Toggle-selection button not found after manual refresh");
          }
        }, 500);
      });
    }
    // Add event listener for return from import screen to reset selection mode
    const returnListImportButton = document.getElementById('return-list-import');
    if (returnListImportButton) {
      returnListImportButton.addEventListener('click', function() {
        const wasEnabled = selectionEnabled;
        if (wasEnabled) {
          disableSelection();
        }
        // Delay to wait for the cookie list and header to be re-rendered
        setTimeout(function() {
          console.log("Returning from import screen, reinitializing selection feature");
          toggleSelectionButton = document.getElementById('toggle-selection');
          if (toggleSelectionButton) {
            setupToggleButtonEvents();
          } else {
            console.error("Toggle-selection button not found after import return");
          }
        }, 500);
      });
    }
    // Add event listener for return from add cookie screen to reset selection mode
    const returnListAddBtn2 = document.getElementById('return-list-add');
    if (returnListAddBtn2) {
      returnListAddBtn2.addEventListener('click', function() {
        const wasEnabled = selectionEnabled;
        if (wasEnabled) {
          disableSelection();
        }
        // Delay to wait for the cookie list and header to be re-rendered
        setTimeout(function() {
          console.log("Returning from add cookie screen, reinitializing selection feature");
          toggleSelectionButton = document.getElementById('toggle-selection');
          if (toggleSelectionButton) {
            setupToggleButtonEvents();
          } else {
            console.error("Toggle-selection button not found after add cookie return");
          }
        }, 500);
      });
    }
    // Add event listener for save button on add cookie screen
    const saveCreateCookieBtn = document.getElementById('save-create-cookie');
    if (saveCreateCookieBtn) {
      saveCreateCookieBtn.addEventListener('click', function() {
        const wasEnabled = selectionEnabled;
        if (wasEnabled) {
          disableSelection();
        }
        // Delay to wait for the cookie list and header to be re-rendered
        setTimeout(function() {
          console.log("Saving new cookie, reinitializing selection feature");
          toggleSelectionButton = document.getElementById('toggle-selection');
          if (toggleSelectionButton) {
            setupToggleButtonEvents();
          } else {
            console.error("Toggle-selection button not found after saving cookie");
          }
        }, 500); // Might need adjustment based on actual refresh time
      });
    }

    // Add event listener for import button on import screen
    const performImportBtn = document.getElementById('perform-import');
    if (performImportBtn) {
      performImportBtn.addEventListener('click', function() {
        const wasEnabled = selectionEnabled;
        if (wasEnabled) {
          disableSelection();
        }
        // Delay to wait for the cookie list and header to be re-rendered
        setTimeout(function() {
          console.log("Importing cookies, reinitializing selection feature");
          toggleSelectionButton = document.getElementById('toggle-selection');
          if (toggleSelectionButton) {
            setupToggleButtonEvents();
          } else {
            console.error("Toggle-selection button not found after importing cookies");
          }
        }, 500); // Might need adjustment based on actual refresh time
      });
    }
  });
  
  /**
   * Wait for the cookie header element to be present in the DOM before initializing
   */
  function waitForCookieHeader() {
    // Check if the cookie container exists
    const cookieContainer = document.getElementById('cookie-container');
    if (!cookieContainer) {
      console.log("Cookie container not found, retrying in 100ms");
      setTimeout(waitForCookieHeader, 100);
      return;
    }

    // Look for the toggle button or wait for cookie list to be loaded
    toggleSelectionButton = document.getElementById('toggle-selection');
    if (toggleSelectionButton) {
      console.log("Toggle selection button found, initializing");
      initializeSelectionFeature();
    } else {
      // Wait for the cookie list to be loaded by observing DOM changes
      let observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            toggleSelectionButton = document.getElementById('toggle-selection');
            if (toggleSelectionButton && !isInitialized) {
              console.log("Toggle selection button found via observer");
              observer.disconnect();
              initializeSelectionFeature();
            }
          }
        });
      });
      
      observer.observe(cookieContainer, { childList: true, subtree: true });
      console.log("Observing cookie container for changes");
      
      // Fallback timeout to check again
      setTimeout(function() {
        toggleSelectionButton = document.getElementById('toggle-selection');
        if (toggleSelectionButton && !isInitialized) {
          console.log("Toggle selection button found via timeout check");
          observer.disconnect();
          initializeSelectionFeature();
        }
      }, 500);
    }
  }
  
  /**
   * Set up a mutation observer to watch for new cookies being added
   */
  function setupCookieObserver() {
    const cookieContainer = document.getElementById('cookie-container');
    if (!cookieContainer) {
      console.warn("Cookie container not found");
      return;
    }
    
    // Create a mutation observer to watch for changes to the cookie container
    const observer = new MutationObserver(function(mutations) {
      if (!selectionEnabled) return;
      
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Check if any of the added nodes are cookie list items
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const cookieElements = node.querySelectorAll ? 
                node.querySelectorAll('li.cookie') : [];
              
              // Add checkboxes to any new cookies
              if (cookieElements.length > 0) {
                for (const cookie of cookieElements) {
                  setupCookieCheckbox(cookie);
              }
            }
          }
        }
      }
      }
    });
    
    observer.observe(cookieContainer, { childList: true, subtree: true });
  }
  
  /**
   * Initialize the selection feature
   * This is the main initialization function that sets up the toggle button and menu
   */
  function initializeSelectionFeature() {
    // Don't initialize more than once
    if (isInitialized) {
      console.log("Selection feature already initialized");
      return;
    }
    
    // Get the toggle button
    toggleSelectionButton = document.getElementById('toggle-selection');
    if (!toggleSelectionButton) {
      console.error("Toggle selection button not found, cannot initialize");
      return;
    }
    
    console.log("Initializing selection feature");
    
    // Create the selection menu
    createSelectionMenu();
    
    // Set up event handlers for the toggle button
    setupToggleButtonEvents();
    
    // Set up event handlers for the menu buttons
    setupMenuButtonEvents();
    
    // *** Activate the observer to handle dynamically added cookies ***
    setupCookieObserver();
    
    // Mark as initialized
    isInitialized = true;
    console.log("Selection feature initialized successfully");
  }
  
  /**
   * Create the selection menu if it doesn't exist already
   */
  function createSelectionMenu() {
    // Check if menu already exists
    if (document.getElementById('selection-menu')) {
      console.log("Selection menu already exists");
      selectionMenu = document.getElementById('selection-menu');
      return;
    }
    
    // Try to create from template first
      const menuTemplate = document.getElementById('tmp-selection-menu');
      if (menuTemplate) {
        console.log("Creating selection menu from template");
        const menuContent = menuTemplate.content.cloneNode(true);
        document.body.appendChild(menuContent);
        
        selectionMenu = document.getElementById('selection-menu');
        if (!selectionMenu) {
          console.error("Failed to create selection menu from template");
          createSelectionMenuManually();
        }
      } else {
        console.warn("Selection menu template not found, creating manually");
        createSelectionMenuManually();
      }
    }
    
  /**
   * Set up event handlers for the toggle button
   */
  function setupToggleButtonEvents() {
    if (!toggleSelectionButton) return;
    
    // Remove any existing event listeners
    const newToggleButton = toggleSelectionButton.cloneNode(true);
    if (toggleSelectionButton.parentNode) {
      toggleSelectionButton.parentNode.replaceChild(newToggleButton, toggleSelectionButton);
      toggleSelectionButton = newToggleButton;
    }
    
    // Apply active state if needed
    if (selectionEnabled) {
      toggleSelectionButton.classList.add('active');
    } else {
      toggleSelectionButton.classList.remove('active');
    }
    
    // Clear any existing clickInProgress flag
    if (toggleSelectionButton.clickInProgress) {
      delete toggleSelectionButton.clickInProgress;
    }
    
    // Create a single handler for both mousedown and click events
    const toggleClickHandler = function(event) {
      event.stopPropagation();
      event.preventDefault();
      
      // Prevent event bubbling completely
      if (event.stopImmediatePropagation) {
        event.stopImmediatePropagation();
      }
      
      // Debounce clicks
      if (toggleSelectionButton.clickInProgress) return;
      toggleSelectionButton.clickInProgress = true;
      
      // Handle the toggle action
        if (selectionEnabled) {
        // Toggle menu visibility if already in selection mode
        if (selectionMenu && selectionMenu.classList.contains('visible')) {
          hideSelectionMenu();
        } else {
          showSelectionMenu();
          updateMenuButtonStates();
        }
      } else {
        // Enable selection mode
        enableSelection(false);
      }
      
      // Reset click debounce after a short delay
      setTimeout(() => {
        toggleSelectionButton.clickInProgress = false;
      }, 200);
    };
    
    // Add event listeners with capture to ensure they get triggered first
    toggleSelectionButton.addEventListener('mousedown', toggleClickHandler, { capture: true });
    toggleSelectionButton.addEventListener('click', toggleClickHandler, { capture: true });
    
    // Make the cookie list header aware of the toggle button
    const cookieListHeader = toggleSelectionButton.closest('.cookie-list-header');
    if (cookieListHeader) {
      // Remove any existing click handler by cloning and replacing
      const newHeader = cookieListHeader.cloneNode(true);
      if (cookieListHeader.parentNode) {
        cookieListHeader.parentNode.replaceChild(newHeader, cookieListHeader);
        // Need to re-find the toggle button since we replaced its parent
        toggleSelectionButton = document.getElementById('toggle-selection');
        // Re-attach event listeners to the new button
        if (toggleSelectionButton) {
          toggleSelectionButton.addEventListener('mousedown', toggleClickHandler, { capture: true });
          toggleSelectionButton.addEventListener('click', toggleClickHandler, { capture: true });
        }
      }
      
      // Set up event listener on the new header
      const newCookieListHeader = toggleSelectionButton ? toggleSelectionButton.closest('.cookie-list-header') : null;
      if (newCookieListHeader) {
        newCookieListHeader.addEventListener('click', function(event) {
          // Check if the click is on or within the toggle button
          if (toggleSelectionButton && (event.target === toggleSelectionButton || toggleSelectionButton.contains(event.target))) {
          event.stopPropagation();
          event.preventDefault();
            if (event.stopImmediatePropagation) {
              event.stopImmediatePropagation();
            }
          }
        }, true);
      }
    }
    
    // Close menu when clicking outside
    // First remove any existing document click listener to avoid duplicates
    const existingClickHandler = document.onClickOutsideForSelection;
    if (existingClickHandler) {
      document.removeEventListener('click', existingClickHandler);
    }
    
    // Add new document click listener
    const documentClickHandler = function(event) {
      if (selectionEnabled && selectionMenu && selectionMenu.classList.contains('visible')) {
        if (!selectionMenu.contains(event.target) && event.target !== toggleSelectionButton) {
          hideSelectionMenu();
        }
      }
    };
    
    document.addEventListener('click', documentClickHandler);
    document.onClickOutsideForSelection = documentClickHandler;
  }
  
  /**
   * Set up event handlers for the menu buttons
   */
  function setupMenuButtonEvents() {
    // Get references to all menu buttons
    selectAllButton = document.getElementById('select-all');
    deselectAllButton = document.getElementById('deselect-all');
    disableSelectionButton = document.getElementById('disable-selection');
    deleteSelectedButton = document.getElementById('delete-selected');
    shareSelectedButton = document.getElementById('share-selected');
    
    // Add event listeners to menu buttons
    if (selectAllButton) {
      selectAllButton.addEventListener('click', selectAllCookies);
    }
    if (deselectAllButton) {
      deselectAllButton.addEventListener('click', deselectAllCookies);
    }
    if (disableSelectionButton) {
      disableSelectionButton.addEventListener('click', disableSelection);
    }
    if (deleteSelectedButton) {
      deleteSelectedButton.addEventListener('click', deleteSelectedCookies);
    }
    if (shareSelectedButton) {
      shareSelectedButton.addEventListener('click', shareSelectedCookies);
    }
  }
  
  /**
   * Create the selection menu manually if the template approach fails
   */
  function createSelectionMenuManually() {
    console.log("Creating selection menu manually");
    
    // Remove any existing menu to avoid duplicates
    const existingMenu = document.getElementById('selection-menu');
    if (existingMenu) {
      existingMenu.remove();
    }
    
    // Create menu container
    const menu = document.createElement('div');
    menu.id = 'selection-menu';
    menu.className = 'selection-dropdown';
    
    // Create Disable Selection button at the top
    const disableBtn = document.createElement('button');
    disableBtn.id = 'disable-selection';
    disableBtn.className = 'selection-menu-item';
    disableBtn.innerHTML = '<svg class="icon"><use href="../sprites/solid.svg#times"></use></svg> Disable Selection';
    menu.appendChild(disableBtn);
    
    // Create first divider
    const divider1 = document.createElement('div');
    divider1.className = 'selection-menu-divider';
    menu.appendChild(divider1);
    
    // Create Delete Selected button
    const deleteSelectedBtn = document.createElement('button');
    deleteSelectedBtn.id = 'delete-selected';
    deleteSelectedBtn.className = 'selection-menu-item';
    deleteSelectedBtn.disabled = true;
    deleteSelectedBtn.innerHTML = '<svg class="icon"><use href="../sprites/solid.svg#trash"></use></svg> Delete Selected';
    menu.appendChild(deleteSelectedBtn);
    
    // Create Share Selected button
    const shareSelectedBtn = document.createElement('button');
    shareSelectedBtn.id = 'share-selected';
    shareSelectedBtn.className = 'selection-menu-item';
    shareSelectedBtn.disabled = true;
    shareSelectedBtn.innerHTML = '<svg class="icon"><use href="../sprites/solid.svg#share"></use></svg> Share Selected';
    menu.appendChild(shareSelectedBtn);
    
    // Create second divider
    const divider2 = document.createElement('div');
    divider2.className = 'selection-menu-divider';
    menu.appendChild(divider2);
    
    // Create Select All button
    const selectAllBtn = document.createElement('button');
    selectAllBtn.id = 'select-all';
    selectAllBtn.className = 'selection-menu-item';
    selectAllBtn.innerHTML = '<svg class="icon"><use href="../sprites/solid.svg#check-square"></use></svg> Select All';
    menu.appendChild(selectAllBtn);
    
    // Create Deselect All button
    const deselectAllBtn = document.createElement('button');
    deselectAllBtn.id = 'deselect-all';
    deselectAllBtn.className = 'selection-menu-item';
    deselectAllBtn.disabled = true;
    deselectAllBtn.innerHTML = '<svg class="icon"><use href="../sprites/solid.svg#square"></use></svg> Deselect All';
    menu.appendChild(deselectAllBtn);
    
    // Add menu to document
    document.body.appendChild(menu);
    
    // Update reference
    selectionMenu = menu;
  }
  
  /**
   * Enable selection mode for cookies
   * @param {boolean} showMenu Whether to show the selection menu
   */
  function enableSelection(showMenu = true) {
    if (selectionEnabled) return;
    
    console.log("Enabling selection mode");
    selectionEnabled = true;
    
    // Reset selected cookies to avoid state from previous domain
    selectedCookies.clear();
    
    // Mark toggle button as active
    if (toggleSelectionButton) {
      toggleSelectionButton.classList.add('active');
    } else {
      // If the toggle button is missing, try to find it
      toggleSelectionButton = document.getElementById('toggle-selection');
      if (toggleSelectionButton) {
        toggleSelectionButton.classList.add('active');
        // Reattach event listeners to ensure it works
        setupToggleButtonEvents();
      } else {
        console.error("Toggle selection button not found when enabling selection mode");
      }
    }
    
    // Add checkboxes to all cookies
    const cookieElements = document.querySelectorAll('li.cookie');
    for (const cookie of cookieElements) {
      setupCookieCheckbox(cookie);
    }
    
    // Show the menu if requested
    if (showMenu) {
      // Ensure the menu is created
      if (!selectionMenu || !document.body.contains(selectionMenu)) {
        createSelectionMenu();
      }
      showSelectionMenu();
    }
    
    // Make sure menu buttons are in the correct state
    updateMenuButtonStates();
  }
  
  /**
   * Disable selection mode
   */
  function disableSelection() {
    console.log("Disabling selection mode");
    selectionEnabled = false;
    selectedCookies.clear();
    
    // Remove active class from toggle button if it exists
    if (toggleSelectionButton) {
      toggleSelectionButton.classList.remove('active');
    } else {
      // Try to find the button if it wasn't previously found
      toggleSelectionButton = document.getElementById('toggle-selection');
    if (toggleSelectionButton) {
      toggleSelectionButton.classList.remove('active');
      }
    }
    
    // Hide the selection menu
    hideSelectionMenu();
    
    // Hide all checkboxes
    const checkboxContainers = document.querySelectorAll('.cookie-checkbox-container');
    for (const container of checkboxContainers) {
      container.style.display = 'none';
    }
    
    // Reset all checkbox states
    const checkboxes = document.querySelectorAll('.cookie-checkbox');
    for (const checkbox of checkboxes) {
      checkbox.checked = false;
    }
    
    // Clear flag that tracks whether selection was active before navigation
    wasSelectionEnabledBeforeNavigation = false;
  }
  
  /**
   * Setup checkbox for a cookie element
   * @param {HTMLElement} cookieElement - The cookie list item element
   */
  function setupCookieCheckbox(cookieElement) {
    const checkboxContainer = cookieElement.querySelector('.cookie-checkbox-container');
    if (!checkboxContainer) return;
    
    // Show the checkbox container
    checkboxContainer.style.display = 'flex';
    
    // Get the checkbox
    const checkbox = checkboxContainer.querySelector('.cookie-checkbox');
    if (!checkbox) return;
    
    // Set initial state based on whether it's in our selected set
    const cookieName = cookieElement.dataset.name;
    checkbox.checked = selectedCookies.has(cookieName);
    
    // Remove existing handlers to prevent duplicates
    if (checkbox.hasAttribute('data-selection-initialized')) {
      return; // Already initialized
    }
    
    // Mark as initialized
    checkbox.setAttribute('data-selection-initialized', 'true');
    
    // Add click handler to the container to improve clickability
    checkboxContainer.addEventListener('click', function(event) {
      event.stopPropagation();
      event.preventDefault();
      
      // Toggle checkbox state
      checkbox.checked = !checkbox.checked;
      
      // Update selected state
      if (checkbox.checked) {
        selectedCookies.add(cookieName);
      } else {
        selectedCookies.delete(cookieName);
      }
      
      updateMenuButtonStates();
    });
    
    // Also add handler directly to checkbox for normal operation
    checkbox.addEventListener('change', function(event) {
      event.stopPropagation();
      
      if (checkbox.checked) {
        selectedCookies.add(cookieName);
      } else {
        selectedCookies.delete(cookieName);
      }
      
      updateMenuButtonStates();
    });
    
    // Add click handler to stop propagation
    checkbox.addEventListener('click', function(event) {
      event.stopPropagation();
    });
    
    // Make the cookie header aware of the checkboxes to prevent expansion
    const cookieHeader = cookieElement.querySelector('.header');
    if (cookieHeader) {
      const originalClickHandler = cookieHeader.onclick;
      
      cookieHeader.onclick = function(event) {
        // Improve detection of clicks on the checkbox area
        if (event.target.closest('.cookie-checkbox-container') || 
            event.target.classList.contains('cookie-checkbox')) {
          event.stopPropagation();
          return false;
        }
        
        // Check for clicks in the left area but only block very close to the checkbox
        if (event.offsetX < 40 && selectionEnabled) {
          // Only block clicks in the first 40px when we're actually in the checkbox region
          const checkboxContainer = event.target.closest('.header').querySelector('.cookie-checkbox-container');
          if (checkboxContainer && checkboxContainer.getBoundingClientRect().right >= event.clientX) {
            event.stopPropagation();
            return false;
          }
        }
        
        // Continue with normal behavior for other clicks
        if (originalClickHandler) {
          return originalClickHandler.call(this, event);
        }
      };
    }
  }
  
  /**
   * Show the selection menu
   */
  function showSelectionMenu() {
    if (!selectionMenu) {
      console.error("Can't show selection menu - menu element not found");
      // Try to create the menu
      createSelectionMenu();
      
      // Check if creation was successful
      if (!selectionMenu) {
        console.error("Failed to create selection menu, cannot continue");
      return;
      }
    }
    
    // Check if the menu is already in the DOM
    if (!document.body.contains(selectionMenu)) {
      console.log("Selection menu not in DOM, re-adding it");
      document.body.appendChild(selectionMenu);
    }
    
    console.log("Showing selection menu");
    
    // Ensure we have the latest toggle button reference
    toggleSelectionButton = document.getElementById('toggle-selection');
    if (!toggleSelectionButton) {
      console.error("Toggle button not found when showing menu");
      return;
    }
    
    // Position the menu relative to the toggle button
    const toggleRect = toggleSelectionButton.getBoundingClientRect();
    selectionMenu.style.top = (toggleRect.bottom + window.scrollY) + 'px';
    selectionMenu.style.left = (toggleRect.left + window.scrollX) + 'px';
    
    // Ensure menu doesn't go off-screen
    setTimeout(() => {
      const menuRect = selectionMenu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      
      if (menuRect.right > viewportWidth) {
        selectionMenu.style.left = (viewportWidth - menuRect.width - 10) + 'px';
      }
    }, 0);
    
    // Show the menu
    selectionMenu.classList.add('visible');
    
    // Update button states
    updateMenuButtonStates();
  }
  
  /**
   * Hide the selection menu
   */
  function hideSelectionMenu() {
    if (selectionMenu) {
      console.log("Hiding selection menu");
      selectionMenu.classList.remove('visible');
    }
  }
  
  /**
   * Update the enabled/disabled states of the menu buttons
   */
  function updateMenuButtonStates() {
    // Ensure we have latest references
    selectAllButton = document.getElementById('select-all');
    deselectAllButton = document.getElementById('deselect-all');
    deleteSelectedButton = document.getElementById('delete-selected');
    shareSelectedButton = document.getElementById('share-selected');
    
    if (!selectAllButton || !deselectAllButton) return;
    
    const cookieElements = document.querySelectorAll('li.cookie');
    const allSelected = selectedCookies.size === cookieElements.length && cookieElements.length > 0;
    const noneSelected = selectedCookies.size === 0;
    
    // Update toggle button to indicate selection state
    if (toggleSelectionButton) {
      // Always has active class when selection mode is enabled
      if (selectionEnabled) {
        toggleSelectionButton.classList.add('active');
      } else {
        toggleSelectionButton.classList.remove('active');
      }
      
      // Only add has-selected when cookies are actually selected
      if (noneSelected) {
        toggleSelectionButton.classList.remove('has-selected');
      } else {
        toggleSelectionButton.classList.add('has-selected');
      }
    }
    
    // Update "Select All" button state
    selectAllButton.disabled = allSelected;
    selectAllButton.style.display = allSelected ? 'none' : 'flex';
    
    // Update "Deselect All" button state
    deselectAllButton.disabled = noneSelected;
    deselectAllButton.style.display = noneSelected ? 'none' : 'flex';
    
    // Update "Delete Selected" button state
    if (deleteSelectedButton) {
      deleteSelectedButton.disabled = noneSelected;
      deleteSelectedButton.style.display = noneSelected ? 'none' : 'flex';
    }
    
    // Update "Share Selected" button state
    if (shareSelectedButton) {
      shareSelectedButton.disabled = noneSelected;
      shareSelectedButton.style.display = noneSelected ? 'none' : 'flex';
    }
  }
  
  /**
   * Select all cookies
   */
  function selectAllCookies() {
    const cookieElements = document.querySelectorAll('li.cookie');
    for (const cookie of cookieElements) {
      const cookieName = cookie.dataset.name;
      selectedCookies.add(cookieName);
      
      const checkbox = cookie.querySelector('.cookie-checkbox');
      if (checkbox) {
        checkbox.checked = true;
      }
    }
    
    updateMenuButtonStates();
    hideSelectionMenu();
  }
  
  /**
   * Deselect all cookies
   */
  function deselectAllCookies() {
    selectedCookies.clear();
    
    const checkboxes = document.querySelectorAll('.cookie-checkbox');
    for (const checkbox of checkboxes) {
      checkbox.checked = false;
    }
    
    updateMenuButtonStates();
    hideSelectionMenu();
  }
  
  /**
   * Show a confirmation dialog for deleting multiple cookies
   * @param {number} count Number of cookies to delete
   * @return {Promise<boolean>} Whether to proceed with deletion
   */
  async function showDeleteSelectedConfirmationDialog(count) {
    // Check if user has opted to skip this dialog
    if (!showBatchDeleteConfirmation) {
      return true;
    }
    
    return new Promise((resolve) => {
      // Create dialog if it doesn't exist
      let dialogElement = document.getElementById('confirm-delete-selected-dialog');
      
      if (!dialogElement) {
        dialogElement = document.createElement('div');
        dialogElement.id = 'confirm-delete-selected-dialog';
        dialogElement.className = 'confirmation-dialog';
        
        dialogElement.innerHTML = `
          <div class="dialog-content">
            <div class="dialog-header">
              <h3 id="delete-selected-dialog-title">Delete Multiple Cookies</h3>
              <button id="cancel-delete-selected-x" class="close-button">
                <svg class="icon"><use href="../sprites/solid.svg#times"></use></svg>
              </button>
            </div>
            <div class="dialog-body">
              <p id="delete-selected-dialog-message"></p>
              <label class="checkbox-container">
                <input type="checkbox" id="dont-show-again-delete-selected">
                <span class="checkbox-text">Don't ask again for batch deletions</span>
              </label>
            </div>
            <div class="dialog-footer">
              <button id="cancel-delete-selected" class="btn-secondary">Cancel</button>
              <button id="confirm-delete-selected" class="btn-delete">Delete</button>
            </div>
          </div>
        `;
        
        document.body.appendChild(dialogElement);
      }
      
      const message = document.getElementById('delete-selected-dialog-message');
      message.textContent = `Are you sure you want to delete ${count} selected cookie${count > 1 ? 's' : ''}?`;
      
      const dontShowAgainCheckbox = document.getElementById('dont-show-again-delete-selected');
      const cancelButton = document.getElementById('cancel-delete-selected');
      const confirmButton = document.getElementById('confirm-delete-selected');
      const closeXButton = document.getElementById('cancel-delete-selected-x');
      
      const escapeKeyHandler = function(e) {
        if (e.key === 'Escape') {
          closeDialog();
          resolve(false);
        }
      };
      
      document.addEventListener('keydown', escapeKeyHandler);
      
      cancelButton.addEventListener('click', () => {
        closeDialog();
        resolve(false);
      });
      
      closeXButton.addEventListener('click', () => {
        closeDialog();
        resolve(false);
      });
      
      confirmButton.addEventListener('click', () => {
        const dontAskAgain = dontShowAgainCheckbox.checked;
        if (dontAskAgain) {
          showBatchDeleteConfirmation = false;
          const storageHandler = window.storageHandler || (window.optionHandler && window.optionHandler.storageHandler);
          if (storageHandler) {
            storageHandler.setLocal('showBatchDeleteConfirmation', false).catch(err => {
              console.error('Error saving batch delete confirmation setting:', err);
            });
          } else {
            localStorage.setItem('dontShowBatchDeleteConfirmation', 'true');
          }
        }
        closeDialog();
        resolve(true);
      });
      
      function closeDialog() {
        document.removeEventListener('keydown', escapeKeyHandler);
        dialogElement.classList.remove('visible');
        setTimeout(() => {
          if (dialogElement.parentNode) {
            dialogElement.parentNode.removeChild(dialogElement);
          }
        }, 300);
      }
      
      // Show dialog with animation
      setTimeout(() => {
        dialogElement.classList.add('visible');
      }, 10);
    });
  }

  /**
   * Delete selected cookies
   */
  async function deleteSelectedCookies() {
    if (selectedCookies.size === 0) return;
    
    console.log("Deleting selected cookies", selectedCookies);
    
    // Get all selected cookie elements and their IDs
    const selectedCookieElements = [];
    const cookieElements = document.querySelectorAll('li.cookie');
    const cookiesToDeleteDetails = []; // Store details for deletion
  
    for (const cookieElement of cookieElements) {
      const cookieName = cookieElement.dataset.name;
      const cookieId = cookieElement.dataset.id; 

      if (selectedCookies.has(cookieName)) {
        // selectedCookieElements.push(cookieElement); // Store element reference later if needed

        let cookieData = null;

        // --- Revised Data Retrieval Logic ---
        // Priority 1: Try window.findCookieObject first
        if (window.findCookieObject) {
            try {
                cookieData = window.findCookieObject(cookieElement);
                if (cookieData) {
                  console.log(`Found cookie data via findCookieObject for: ${cookieName}`);
                } else {
                  console.warn(`window.findCookieObject returned null/undefined for: ${cookieName}`);
                }
            } catch (e) {
                console.warn(`Error calling window.findCookieObject for ${cookieName}:`, e);
            }
        }

        // Priority 2: Fallback to window.loadedCookies if findCookieObject failed or doesn't exist
        if (!cookieData && cookieId && window.loadedCookies) {
            console.log(`findCookieObject failed for ${cookieName}, trying window.loadedCookies with ID: ${cookieId}`);
            // Check if loadedCookies has the ID and the nested cookie property
            if (window.loadedCookies[cookieId] && window.loadedCookies[cookieId].cookie) {
                cookieData = window.loadedCookies[cookieId].cookie;
                 console.log(`Found cookie data via loadedCookies[${cookieId}].cookie for: ${cookieName}`);
            } else {
                // Add diagnostic logging if lookup fails
                console.warn(`Direct lookup failed for window.loadedCookies[${cookieId}].cookie`);
                console.log(`Type of window.loadedCookies: ${typeof window.loadedCookies}`);
                if (typeof window.loadedCookies === 'object' && window.loadedCookies !== null) {
                    console.log(`Keys in window.loadedCookies: ${Object.keys(window.loadedCookies).slice(0, 10).join(', ')}...`); // Log first 10 keys
                }
                // Maybe loadedCookies is an array? Try finding by ID
                if (Array.isArray(window.loadedCookies)) {
                  console.log(`window.loadedCookies is an array, attempting find by id: ${cookieId}`);
                  const found = window.loadedCookies.find(item => item && item.id === cookieId && item.cookie);
                  if (found) {
                    cookieData = found.cookie;
                    console.log(`Found cookie data via array find for ID: ${cookieId}`);
                  }
                }
            }
        }
        // --- End Revised Data Retrieval Logic ---

        if (cookieData) {
            // --- Fix for URL construction ---
            // The chrome.cookies.remove API requires a valid URL.
            // Cookie domains starting with '.' are valid for cookies but not for URLs.
            // We need to remove the leading dot from the domain if present.
            let domainForURL = cookieData.domain;
            if (domainForURL.startsWith('.')) {
                domainForURL = domainForURL.substring(1);
            }
            // Construct the URL required for chrome.cookies.remove
            const url = `${cookieData.secure ? 'https' : 'http'}://${domainForURL}${cookieData.path}`;
            // --- End Fix ---

            // Ensure storeId is present
             if (typeof cookieData.storeId === 'undefined') {
                 console.warn(`Cookie data for ${cookieName} is missing storeId. Cannot delete.`);
             } else {
                 cookiesToDeleteDetails.push({
                   url: url,
                   name: cookieData.name,
                   storeId: cookieData.storeId,
                   // Store element reference for potential direct UI removal later
                   element: cookieElement 
                 });
             }
        } else {
             // This warning now means both methods failed
             console.warn(`Could not find cookie details using any method for ID: ${cookieId}, name: ${cookieName}. Cannot delete this cookie directly.`);
        }
      }
    }
  
    if (cookiesToDeleteDetails.length === 0) {
        console.log("No cookies found with sufficient details for direct deletion.");
        // Notify the user
         if (window.sendNotification) {
             window.sendNotification('Could not find details for selected cookies. Deletion aborted.', true);
         }
        // Clear selection visually even if we can't delete
    selectedCookies.clear();
    updateMenuButtonStates();
    hideSelectionMenu();
        return;
    }
  
  
    console.log(`Found ${cookiesToDeleteDetails.length} cookies with details for direct deletion.`);
  
    // Show confirmation dialog before proceeding
    const shouldDelete = await showDeleteSelectedConfirmationDialog(cookiesToDeleteDetails.length);
    if (!shouldDelete) {
      console.log("Cookie deletion cancelled by user");
      // We should still clear the visual selection state if cancelled
      // deselectAllCookies(); // Call this helper if it exists and is appropriate
      selectedCookies.clear();
      updateMenuButtonStates(); // Update button states (e.g., disable 'Delete Selected')
      // Manually remove 'selected' class from elements if deselectAllCookies isn't used
      cookieElements.forEach(el => el.classList.remove('selected'));
      // Also potentially hide checkboxes if they were shown
      document.querySelectorAll('.cookie-checkbox-container').forEach(c => c.style.display = 'none');

      hideSelectionMenu(); // Ensure menu is hidden
        return;
      }
      
    // Clear the selection UI state *before* starting async operations
    const elementsToPotentiallyRemove = cookiesToDeleteDetails.map(d => d.element); // Keep track before clearing selectedCookies Set
    selectedCookies.clear();
    updateMenuButtonStates();
    hideSelectionMenu();
     // Also visually deselect items immediately
    elementsToPotentiallyRemove.forEach(el => {
        if (el) {
            el.classList.remove('selected');
            const checkbox = el.querySelector('input[type="checkbox"]');
            if (checkbox) checkbox.checked = false;
        }
    });
     // Hide checkboxes if selection mode is being implicitly exited
    document.querySelectorAll('.cookie-checkbox-container').forEach(c => c.style.display = 'none');

  
    // --- Start of new direct deletion logic ---
    let deletedCount = 0;
    let failedCount = 0;
  
    // Function to remove a single cookie using the API wrapper
    const removeCookieAPI = async (details) => {
        return new Promise((resolve) => {
            // Defensive check for required details
            if (!details || !details.url || !details.name || typeof details.storeId === 'undefined') { // Check storeId presence
                console.error('Missing details for cookie removal via handler:', details);
                resolve(false);
                return;
            }
            // Use the cookieHandler wrapper if available
            if (window.cookieHandler && window.cookieHandler.removeCookie) {
                window.cookieHandler.removeCookie(details.name, details.url, details.storeId, (result) => {
                    if (result) {
                        console.log(`Successfully deleted cookie via handler: ${details.name}`);
                        resolve(true);
                    } else {
                        // cookieHandler.removeCookie likely logs errors internally, but we can add one too
                        console.warn(`cookieHandler.removeCookie failed for: ${details.name} at ${details.url}`);
                        resolve(false);
                    }
                });
            } else {
                // Fallback to direct API call if handler is not found (shouldn't happen ideally)
                console.warn('window.cookieHandler.removeCookie not found, falling back to direct chrome.cookies.remove');
                chrome.cookies.remove({url: details.url, name: details.name, storeId: details.storeId }, (removedDetails) => {
                    if (chrome.runtime.lastError) {
                        console.error(`Fallback delete failed: ${details.name}. Error: ${chrome.runtime.lastError.message}`);
                        resolve(false);
                    } else {
                        // Treat non-existent cookie as success in fallback too
                        console.log(`Fallback delete successful or cookie already gone: ${details.name}`);
                        resolve(true); 
                    }
                });
            }
        });
    };
  
    // Process deletions sequentially
    for (const details of cookiesToDeleteDetails) {
        const success = await removeCookieAPI(details);
        if (success) {
          deletedCount++;
            // Remove the corresponding list item from the UI immediately
            if (details.element && details.element.parentNode) {
                details.element.remove(); 
            }
      } else {
            failedCount++;
            // Optionally add a visual indicator to the element if it wasn't removed
            if (details.element) {
                 details.element.classList.add('deletion-failed'); // Add a class for styling
            }
        }
    }
  
    // Update UI and notify user
    if (window.sendNotification) {
        let message = '';
        if (deletedCount > 0) {
            message += `Deleted ${deletedCount} cookie${deletedCount > 1 ? 's' : ''}.`;
        }
        if (failedCount > 0) {
             message += ` Failed to delete ${failedCount} cookie${failedCount > 1 ? 's' : ''}. Check console for details.`;
        }
        // If nothing was processed (edge case, shouldn't happen if initial check passes)
        if (deletedCount === 0 && failedCount === 0 && cookiesToDeleteDetails.length > 0) {
            message = 'Attempted to delete cookies, but encountered issues. Check console.';
        } else if (deletedCount === 0 && failedCount === 0) {
             message = 'No cookies were selected or found for deletion.'; // Already handled earlier, but as fallback
        }

        window.sendNotification(message.trim(), failedCount > 0); // Send error notification if any failed
    }
  
    // No need to call refreshCookieList if we removed elements directly.
    // However, we might need to update counts or other UI elements.
    if (window.updateCookieCount) {
        window.updateCookieCount(); // Assuming such a function exists to update displayed counts
    }
    // --- End of new direct deletion logic ---
  
    // Disable selection mode completely after deletion
    disableSelection();
  }
  
  /**
   * Share selected cookies
   */
  function shareSelectedCookies() {
    if (selectedCookies.size === 0) return;
    
    console.log("Sharing selected cookies", selectedCookies);
    
    // Get all selected cookie data
    const selectedCookieData = [];
    const cookieElements = document.querySelectorAll('li.cookie');
    
    // First close the menu to avoid UI issues
    hideSelectionMenu();
    
    // Process all selected cookies
    for (const cookie of cookieElements) {
      const cookieName = cookie.dataset.name;
      const cookieId = cookie.dataset.id;
      
      if (selectedCookies.has(cookieName)) {
        try {
          // Extract the cookie data using window.findCookieObject
          if (window.findCookieObject) {
            const cookieObject = window.findCookieObject(cookie);
            
            if (cookieObject) {
              console.log(`Adding cookie to share: ${cookieName}`);
              selectedCookieData.push(cookieObject);
            } else {
              console.warn(`Failed to get cookie object with findCookieObject for: ${cookieName}, trying direct access`);
              
              // Try to get the cookie directly from loadedCookies via window access
              if (window.loadedCookies && window.loadedCookies[cookieId] && window.loadedCookies[cookieId].cookie) {
                console.log(`Found cookie via direct loadedCookies access: ${cookieName}`);
                selectedCookieData.push(window.loadedCookies[cookieId].cookie);
              } else {
                console.error(`Could not find cookie object for: ${cookieName}`);
              }
            }
          } else {
            console.warn("window.findCookieObject function not available");
          }
        } catch (error) {
          console.error(`Error processing cookie for sharing: ${cookieName}`, error);
        }
      }
    }
    
    if (selectedCookieData.length === 0) {
      console.error("No valid cookie data found for selected cookies");
      if (window.sendNotification) {
        window.sendNotification('Failed to share cookies: No valid data found', true);
      }
      return;
    }
    
    console.log(`Prepared ${selectedCookieData.length} cookies for sharing`);
    
    // Get current domain with fallbacks
    let domain = null;
    
    try {
      if (window.cookieHandler && window.cookieHandler.currentTab) {
        domain = window.getDomainFromUrl(window.cookieHandler.currentTab.url);
      } else if (window.selectedDomain) {
        domain = window.selectedDomain;
      }
      
      // If still no domain, try to get it from the first cookie
      if (!domain && selectedCookieData.length > 0 && selectedCookieData[0].domain) {
        domain = selectedCookieData[0].domain;
      }
    } catch (error) {
      console.error("Error getting domain for sharing", error);
    }
    
    if (!domain) {
      console.error("Cannot share cookies: Invalid domain");
      if (window.sendNotification) {
        window.sendNotification('Cannot share cookies: Invalid domain', true);
      }
      return;
    }
    
    // Use setTimeout to avoid blocking the UI
    setTimeout(() => {
      // Use the existing share dialog function
      try {
        if (window.showShareDialog) {
          console.log(`Showing share dialog for domain: ${domain} with ${selectedCookieData.length} cookies`);
          window.showShareDialog(selectedCookieData, domain, {});
        } else {
          console.error("Share dialog function not found");
          if (window.sendNotification) {
            window.sendNotification('Cannot share cookies: Share dialog not available', true);
          }
        }
      } catch (error) {
        console.error("Error showing share dialog", error);
        if (window.sendNotification) {
          window.sendNotification('Error showing share dialog: ' + error.message, true);
        }
      }
    }, 100);
  }
})(); 