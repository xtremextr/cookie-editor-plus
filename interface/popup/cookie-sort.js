/**
 * Cookie sorting functionality for Cookie Editor
 * Adds the ability to sort cookies by name in ascending or descending order
 */
(function() {
  'use strict';
  
  // Constants
  const STORAGE_KEY = 'cookie_editor_sort_direction';
  
  // Variable to track current sort direction
  let sortDirection = 'asc';
  
  /**
   * Evaluates two cookies to determine which comes first when sorting them in reverse alphabetical order.
   * @param {object} a First cookie.
   * @param {object} b Second cookie.
   * @return {int} -1 if b should show first, 0 if they are equal, otherwise 1.
   */
  function sortCookiesByNameDesc(a, b) {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    return bName < aName ? -1 : bName > aName ? 1 : 0;
  }
  
  /**
   * Saves the current sort direction to local storage
   */
  function saveSortDirection() {
    try {
      localStorage.setItem(STORAGE_KEY, sortDirection);
    } catch (e) {
      console.error('Failed to save sort direction:', e);
    }
  }
  
  /**
   * Loads the sort direction from local storage
   */
  function loadSortDirection() {
    try {
      const savedDirection = localStorage.getItem(STORAGE_KEY);
      if (savedDirection === 'asc' || savedDirection === 'desc') {
        sortDirection = savedDirection;
        // Apply the class immediately without animation for initial state
        const sortIcon = document.getElementById('sort-icon');
        if (sortIcon) {
          // Force a reflow to ensure the initial state is set properly
          if (sortDirection === 'desc') {
            sortIcon.classList.add('desc');
          } else {
            sortIcon.classList.remove('desc');
          }
          // Ensure transitions will work on next click by forcing a reflow
          void sortIcon.offsetWidth;
        }
      }
    } catch (e) {
      console.error('Failed to load sort direction:', e);
    }
  }
  
  /**
   * Updates the sort icon based on current sort direction
   */
  function updateSortIcon() {
    const sortIcon = document.getElementById('sort-icon');
    if (sortIcon) {
      if (sortDirection === 'desc') {
        sortIcon.classList.add('desc');
      } else {
        sortIcon.classList.remove('desc');
      }
    }
  }
  
  /**
   * Toggle the sort direction and re-render cookies
   */
  function toggleSortDirection() {
    // Toggle sorting direction
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    
    // Save the preference
    saveSortDirection();
    
    // Update sort icon
    updateSortIcon();
    
    // Get the cookie container and loaded cookies
    const cookieContainer = document.getElementById('cookie-container');
    const cookiesListHtml = cookieContainer.querySelector('ul');
    if (!cookiesListHtml) return;
    
    // Find all cookie elements
    const cookieElements = cookiesListHtml.querySelectorAll('li.cookie');
    if (cookieElements.length === 0) return;
    
    // Convert to array for sorting
    const cookieElementsArray = Array.from(cookieElements);
    
    // Sort the elements based on their dataset name attribute
    cookieElementsArray.sort((a, b) => {
      const aName = (a.dataset.name || '').toLowerCase();
      const bName = (b.dataset.name || '').toLowerCase();
      return sortDirection === 'asc' 
        ? (aName < bName ? -1 : aName > bName ? 1 : 0)
        : (bName < aName ? -1 : bName > aName ? 1 : 0);
    });
    
    // Find where to insert the sorted cookies (after search bar and header)
    let headerLi = null;
    // Find the li element containing the cookie-list-header
    const allLis = cookiesListHtml.querySelectorAll('li');
    for (let i = 0; i < allLis.length; i++) {
      if (allLis[i].querySelector('.cookie-list-header')) {
        headerLi = allLis[i];
        break;
      }
    }
    
    if (!headerLi) {
      // If header not found, just append to the list
      // Remove all cookie elements first
      cookieElements.forEach(element => {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
      });
      
      // Create fragment with sorted elements
      const fragment = document.createDocumentFragment();
      cookieElementsArray.forEach(element => {
        fragment.appendChild(element);
      });
      
      // Append fragment to the list
      cookiesListHtml.appendChild(fragment);
      return;
    }
    
    // We found the header, now let's store the reference to where we'll insert after
    const insertPoint = headerLi;
    
    // Remove all cookie elements first
    cookieElements.forEach(element => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
    });
    
    // Create fragment with sorted elements
    const fragment = document.createDocumentFragment();
    cookieElementsArray.forEach(element => {
      fragment.appendChild(element);
    });
    
    // Insert the fragment after the header
    if (insertPoint.nextSibling) {
      cookiesListHtml.insertBefore(fragment, insertPoint.nextSibling);
    } else {
      cookiesListHtml.appendChild(fragment);
    }
  }
  
  /**
   * Sort the existing cookies without toggling the sort direction
   * Used during initial load to apply saved sort direction
   */
  function applySortToExistingCookies() {
    // Get the cookie container and loaded cookies
    const cookieContainer = document.getElementById('cookie-container');
    if (!cookieContainer) return;
    
    const cookiesListHtml = cookieContainer.querySelector('ul');
    if (!cookiesListHtml) return;
    
    // Find all cookie elements
    const cookieElements = cookiesListHtml.querySelectorAll('li.cookie');
    if (cookieElements.length === 0) return;
    
    // Convert to array for sorting
    const cookieElementsArray = Array.from(cookieElements);
    
    // Sort the elements based on their dataset name attribute
    cookieElementsArray.sort((a, b) => {
      const aName = (a.dataset.name || '').toLowerCase();
      const bName = (b.dataset.name || '').toLowerCase();
      return sortDirection === 'asc' 
        ? (aName < bName ? -1 : aName > bName ? 1 : 0)
        : (bName < aName ? -1 : bName > aName ? 1 : 0);
    });
    
    // Find where to insert the sorted cookies (after search bar and header)
    let headerLi = null;
    // Find the li element containing the cookie-list-header
    const allLis = cookiesListHtml.querySelectorAll('li');
    for (let i = 0; i < allLis.length; i++) {
      if (allLis[i].querySelector('.cookie-list-header')) {
        headerLi = allLis[i];
        break;
      }
    }
    
    if (!headerLi) return;
    
    // We found the header, now let's store the reference to where we'll insert after
    const insertPoint = headerLi;
    
    // Remove all cookie elements first
    cookieElements.forEach(element => {
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
    });
    
    // Create fragment with sorted elements
    const fragment = document.createDocumentFragment();
    cookieElementsArray.forEach(element => {
      fragment.appendChild(element);
    });
    
    // Insert the fragment after the header
    if (insertPoint.nextSibling) {
      cookiesListHtml.insertBefore(fragment, insertPoint.nextSibling);
    } else {
      cookiesListHtml.appendChild(fragment);
    }
  }
  
  // Initialize when the DOM is fully loaded
  document.addEventListener('DOMContentLoaded', function() {
    // Wait a brief moment to ensure DOM is fully rendered
    setTimeout(() => {
      // Load saved sort direction
      loadSortDirection();
      
      // Set up event listener for the column header (using event delegation)
      document.getElementById('cookie-container').addEventListener('click', function(e) {
        const sortButton = e.target.closest('#sort-by-name');
        if (sortButton) {
          toggleSortDirection();
        }
      });
      
      // Hook into the cookie rendering process
      // Use mutation observer to detect when cookies are added to the DOM
      const cookieContainer = document.getElementById('cookie-container');
      const observer = new MutationObserver(function(mutations) {
        for (const mutation of mutations) {
          if (mutation.type === 'childList' && mutation.addedNodes.length) {
            // Check if cookies have been added
            const cookiesList = cookieContainer.querySelector('ul');
            if (cookiesList && cookiesList.querySelectorAll('li.cookie').length > 0) {
              // Apply the sort direction immediately when cookies are loaded
              applySortToExistingCookies();
              
              // Ensure the icon state is correct after cookies are loaded
              updateSortIcon();
              
              // We only need to do this once when cookies are first loaded
              observer.disconnect();
              break;
            }
          }
        }
      });
      
      // Start observing the container for changes
      observer.observe(cookieContainer, { childList: true, subtree: true });
    }, 50); // Small delay to ensure DOM is ready
  });
  
  // Expose the getSortDirection function to the global scope
  window.getSortDirection = function() {
    return sortDirection;
  };
})(); 