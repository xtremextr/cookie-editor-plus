import { CookieManager } from '../lib/manager/cookieManager.js';
import { BrowserDetector } from '../lib/browserDetector.js';
import { EventEmitter } from '../lib/eventEmitter.js';

/**
 * Cookie Manager UI for options page
 */
export class CookieManagerUI extends EventEmitter {
  /**
   * Initialize Cookie Manager UI
   * @param {HTMLElement} container The DOM element to render the UI in
   */
  constructor(container) {
    super();
    this.container = container;
    this.browserDetector = new BrowserDetector();
    this.cookieManager = new CookieManager(this.browserDetector);
    this.cookies = [];
    this.domainFilter = '';
    this.nameFilter = '';
    this.sortBy = 'domain';
    this.sortDirection = 'asc';
    this.currentPage = 1;
    this.pageSize = 20;
    this.totalPages = 1;
    this.initialized = false;
    this.loadingCookies = false;
    this.observerSetup = false;
    this.selectedCookies = new Set();
    this.cookieStats = {
      total: 0,
      secure: 0,
      session: 0,
      expiring: 0, // cookies expiring in the next 24 hours
      domains: new Set(),
      types: {}
    };
    this.charts = {};
    this.lastStats = {
      total: 0,
      secure: 0,
      session: 0,
      expiring: 0
    };
    this.trendingUp = true;
    this.activeFilters = new Set();
    
    // Initialize UI
    this.initialize();
  }

  /**
   * Initialize the UI components
   */
  async initialize() {
    if (this.initialized) return;
    
    // Create UI structure
    this.renderInitialUI();
    
    // --- Fetch cookies early for domain list population --- 
    try {
      this.showLoader(true); // Show loader while fetching domains
      const allCookies = await this.cookieManager.getAllCookies();
      this.cookies = allCookies; // Store for later use
      this.updateDomainFilter(this.cookies); // Populate the dropdown now
    } catch (error) {
      console.error('Error fetching initial cookies for domain list:', error);
      this.emit('show-notification', { 
        message: 'Error loading domain list: ' + error.message, 
        isError: true 
      });
    } finally {
      this.showLoader(false); // Hide loader after fetching domains
    }
    // --- End of early cookie fetch --- 
    
    // Set up intersection observer for lazy loading
    this.setupIntersectionObserver();
    
    // Load initial data - Removed initial load, will load on domain selection
    // await this.loadCookies(); 
    
    // Initialize charts - Defer chart initialization until data is loaded
    // this.initCharts(); 
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Show initial empty state
    this.showNoCookiesMessage(true, 'Please select a domain to view cookies.');
    this.showLoader(false); // Ensure loader is hidden initially
    
    this.initialized = true;
  }
  
  /**
   * Render the initial UI structure
   */
  renderInitialUI() {
    const ui = `
      <div class="cookie-manager-ui">
        <!-- Welcome Banner Removed --> 

        <!-- Dashboard Statistics -->
        <div class="cookie-dashboard">
          <div class="stat-card total-cookies">
            <div class="stat-icon">
              <svg class="icon"><use href="../sprites/solid.svg#cookie-bite"></use></svg>
              </div>
            <div class="stat-value" id="stat-total-cookies">
              <span class="counter">0</span>
            </div>
            <div class="stat-label">
              Total Cookies
              <span class="stat-change" id="stat-total-change">
                <svg class="icon"><use href="../sprites/solid.svg#arrow-up"></use></svg>
                <span>0%</span>
              </span>
            </div>
          </div>
          
          <div class="stat-card secure-cookies">
            <div class="stat-icon">
              <svg class="icon"><use href="../sprites/solid.svg#lock"></use></svg>
            </div>
            <div class="stat-value" id="stat-secure-cookies">
              <span class="counter">0</span>
            </div>
            <div class="stat-label">
              Secure Cookies
              <span class="stat-change" id="stat-secure-change">
                <svg class="icon"><use href="../sprites/solid.svg#arrow-up"></use></svg>
                <span>0%</span>
              </span>
            </div>
          </div>
          
          <div class="stat-card session-cookies">
            <div class="stat-icon">
              <svg class="icon"><use href="../sprites/solid.svg#clock"></use></svg>
            </div>
            <div class="stat-value" id="stat-session-cookies">
              <span class="counter">0</span>
            </div>
            <div class="stat-label">
              Session Cookies
              <span class="stat-change" id="stat-session-change">
                <svg class="icon"><use href="../sprites/solid.svg#arrow-up"></use></svg>
                <span>0%</span>
              </span>
            </div>
          </div>
          
          <div class="stat-card expiring-cookies">
            <div class="stat-icon">
              <svg class="icon"><use href="../sprites/solid.svg#hourglass-end"></use></svg>
            </div>
            <div class="stat-value" id="stat-expiring-cookies">
              <span class="counter">0</span>
            </div>
            <div class="stat-label">
              Expiring Soon
              <span class="stat-change" id="stat-expiring-change">
                <svg class="icon"><use href="../sprites/solid.svg#arrow-up"></use></svg>
                <span>0%</span>
              </span>
            </div>
          </div>
        </div>
        
        <!-- Visualizations Removed -->

        <!-- Main Cookie Management UI -->
        <div class="cookie-table-container">
          <div class="cookie-manager-header">
            <!-- Add centered Cookie Manager title above domain filter -->
            <div class="cookie-manager-title">
              <svg class="icon"><use href="../sprites/solid.svg#database"></use></svg>
              <h2>Cookie Manager</h2>
            </div>
            
            <!-- Domain Filter - Moved above search -->
            <div class="domain-filter-container" id="domain-filter-container">
              <!-- <label for="domain-filter">Filter by Domain:</label> --> <!-- Removed label -->
              <div class="domain-filter-controls">
                <div class="select-wrapper">
                  <select id="domain-filter">
                    <option value="__select__" selected disabled>Select Domain</option>
                    <option value="">All Domains</option>
                    <option value="__custom__">Custom Domain...</option>
                    <!-- Dynamically populated domains will go here -->
                  </select>
                  <svg class="icon select-arrow"><use href="../sprites/solid.svg#angle-down"></use></svg>
                </div>
                <!-- Input for custom domain (initially hidden) -->
                <div class="input-with-icon custom-domain-input hidden">
                  <input type="text" id="custom-domain-input" placeholder="Enter domain..." />
                  <button id="submit-custom-domain" class="btn-icon" title="Apply custom domain">
                    <svg class="icon"><use href="../sprites/solid.svg#check"></use></svg>
                </button>
                  <button id="cancel-custom-domain" class="btn-icon btn-icon-secondary" title="Cancel custom domain">
                    <svg class="icon"><use href="../sprites/solid.svg#times"></use></svg>
                </button>
              </div>
            </div>
            </div>
            
            <!-- Search Toolbar -->
            <div class="search-toolbar">
              <div class="input-with-icon search-input">
                <input type="text" id="cookie-search" placeholder="Search cookies by name, domain, or value..." />
                <svg class="icon input-icon"><use href="../sprites/solid.svg#search"></use></svg>
              </div>
              <!-- Actions moved out -->
            </div>
            
            <!-- REMOVED Advanced Filters Section from here -->

            <div class="cookie-stats">
              <div class="filters-and-count">
                <!-- MOVED Advanced Filters Section here -->
                <div class="advanced-filters">
                  <div class="advanced-filters-header">
                    <h4>Advanced Filters</h4>
                    <button id="toggle-filters-btn" class="btn-icon">
                      <svg class="icon"><use href="../sprites/solid.svg#sliders-h"></use></svg>
                    </button>
                  </div>
                  
                  <!-- Filter Tags -->
                  <div class="cookie-filter-tags">
                    <div class="filter-tag" data-filter="secure">
                      <svg class="icon"><use href="../sprites/solid.svg#lock"></use></svg>
                      Secure
                    </div>
                    <div class="filter-tag" data-filter="session">
                      <svg class="icon"><use href="../sprites/solid.svg#clock"></use></svg>
                      Session
                    </div>
                    <div class="filter-tag" data-filter="httponly">
                      <svg class="icon"><use href="../sprites/solid.svg#eye-slash"></use></svg>
                      HttpOnly
                    </div>
                    <div class="filter-tag" data-filter="expiring">
                      <svg class="icon"><use href="../sprites/solid.svg#hourglass-end"></use></svg>
                      Expiring Soon
                    </div>
                    <div class="filter-tag" data-filter="firstparty">
                      <svg class="icon"><use href="../sprites/solid.svg#user"></use></svg>
                      First Party
                    </div>
                    <div class="filter-tag" data-filter="thirdparty">
                      <svg class="icon"><use href="../sprites/solid.svg#user-friends"></use></svg>
                      Third Party
                    </div>
                  </div>
    
                  <!-- Active filters section -->
                  <div class="active-filters-container" id="active-filters">
                    <!-- Active filters will be dynamically added here -->
                  </div>
                </div>
                <!-- End of MOVED Advanced Filters -->
                
                <span id="cookie-count">0 cookies found</span>
              </div> <!-- End of filters-and-count -->
              
              <div class="sort-controls">
                <!-- Sort controls moved to toolbar -->
              </div>
            </div>
          </div>
          <!-- End of cookie-manager-header -->

          <!-- Cookie Toolbar Actions - Moved above table -->
          <div class="cookie-toolbar-actions-container">
            <div class="cookie-toolbar-left-actions">
              <button id="create-cookie" class="btn btn-primary">
                <svg class="icon"><use href="../sprites/solid.svg#plus-circle"></use></svg>
                <span>New Cookie</span>
              </button>
              <button id="refresh-cookies" class="btn btn-secondary">
                <svg class="icon"><use href="../sprites/solid.svg#sync-alt"></use></svg>
                <span>Refresh</span>
              </button>
              <button id="batch-delete-cookies" class="btn btn-danger" disabled>
                <svg class="icon"><use href="../sprites/solid.svg#trash-alt"></use></svg>
                <span>Delete</span>
              </button>
            </div>
            <div class="cookie-toolbar-right-actions">
              <label for="sort-by">Sort by:</label>
              <div class="select-wrapper">
                <select id="sort-by">
                  <option value="domain">Domain</option>
                  <option value="name">Name</option>
                  <option value="expires">Expiration</option>
                  <option value="size">Size</option>
                </select>
                <svg class="icon select-arrow"><use href="../sprites/solid.svg#angle-down"></use></svg>
              </div>
              <button id="sort-direction" class="btn-icon" title="Toggle sort direction">
                <svg class="icon"><use href="../sprites/solid.svg#sort-amount-down"></use></svg>
              </button>
            </div>
          </div>
          
          <div class="table-container">
            <div class="table-scroll-container">
            <table class="cookie-table" id="manager-cookie-table"> <!-- Added ID -->
              <thead>
                <tr>
                    <th>
                      <label class="custom-checkbox">
                        <input type="checkbox" id="select-all-cookies" />
                        <span class="checkbox-checkmark"></span>
                      </label>
                    </th>
                  <th>Name</th>
                  <th>Attributes</th> <!-- Added this header -->
                  <th>Domain</th>
                  <th>Value</th>
                  <th>Expires</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="cookie-table-body">
                <!-- Cookies will be loaded here -->
              </tbody>
            </table>
            </div>
            
            <div id="cookie-loader" class="cookie-loader cookie-state">
              <svg class="spinner" viewBox="0 0 50 50">
                <circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
              </svg>
              <p>Loading cookies...</p>
            </div>
            
            <div id="no-cookies-message" class="no-cookies-message cookie-state hidden">
              <svg class="icon"><use href="../sprites/solid.svg#cookie-bite"></use></svg>
              <p>No cookies found matching your filters</p>
              <button id="clear-filters" class="btn btn-primary">Clear Filters</button>
            </div>
          </div>
          
          <!-- Pagination -->
          <div class="cookie-pagination">
            <div class="pagination-info">
              Showing <span id="showing-cookies">0-0</span> of <span id="total-cookies">0</span> cookies
            </div>
            <div class="pagination-controls">
              <div class="pagination-buttons">
                <button id="first-page" class="page-button" disabled>
                  <svg class="icon"><use href="../sprites/solid.svg#angle-double-left"></use></svg>
              </button>
                <button id="prev-page" class="page-button" disabled>
                  <svg class="icon"><use href="../sprites/solid.svg#angle-left"></use></svg>
                </button>
                <div id="page-numbers">
                  <!-- Page numbers will be dynamically generated -->
                </div>
                <button id="next-page" class="page-button" disabled>
                  <svg class="icon"><use href="../sprites/solid.svg#angle-right"></use></svg>
                </button>
                <button id="last-page" class="page-button" disabled>
                  <svg class="icon"><use href="../sprites/solid.svg#angle-double-right"></use></svg>
              </button>
            </div>
            <div class="page-size-control">
              <label for="page-size">Show:</label>
              <div class="select-wrapper">
                <select id="page-size">
                  <option value="10">10</option>
                  <option value="20" selected>20</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
                <svg class="icon select-arrow"><use href="../sprites/solid.svg#angle-down"></use></svg>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Cookie Detail Modal -->
        <div class="cookie-modal" id="cookie-modal">
          <div class="cookie-modal-content">
            <div class="cookie-modal-header">
              <h3 id="cookie-modal-title">Edit Cookie</h3>
              <button class="btn-close" id="close-cookie-modal"></button>
            </div>
            <div class="cookie-modal-body">
              <form id="cookie-form" class="cookie-form">
                <div class="form-group">
                  <label for="cookie-name">Name</label>
                  <input type="text" id="cookie-name" required>
                </div>
                <div class="form-row">
                <div class="form-group">
                  <label for="cookie-domain">Domain</label>
                    <input type="text" id="cookie-domain" required>
                </div>
                <div class="form-group">
                  <label for="cookie-path">Path</label>
                    <input type="text" id="cookie-path" value="/" required>
                </div>
                </div>
                  <div class="form-group">
                  <label for="cookie-value">Value</label>
                  <textarea id="cookie-value"></textarea>
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label for="cookie-expiration">Expiration Date</label>
                    <input type="datetime-local" id="cookie-expiration">
                </div>
                <div class="form-group">
                    <label for="cookie-sameSite">SameSite</label>
                    <select id="cookie-sameSite">
                      <option value="no_restriction">No Restriction</option>
                      <option value="lax">Lax</option>
                      <option value="strict">Strict</option>
                    </select>
                  </div>
                </div>
                <div class="checkbox-group">
                  <label for="cookie-session">
                    <input type="checkbox" id="cookie-session">
                    <span class="checkbox-label">Session Cookie</span>
                  </label>
                </div>
                <div class="checkbox-group">
                  <label for="cookie-secure">
                    <input type="checkbox" id="cookie-secure">
                    <span class="checkbox-label">Secure (HTTPS only)</span>
                  </label>
                </div>
                <div class="checkbox-group">
                  <label for="cookie-httpOnly">
                    <input type="checkbox" id="cookie-httpOnly">
                    <span class="checkbox-label">HttpOnly (Not accessible to JavaScript)</span>
                  </label>
                </div>
                <div class="checkbox-group">
                  <label for="cookie-hostOnly">
                    <input type="checkbox" id="cookie-hostOnly">
                    <span class="checkbox-label">Host Only</span>
                  </label>
                </div>
              </form>
            </div>
            <div class="cookie-modal-footer">
              <button id="cancel-cookie-edit" class="btn btn-secondary">Cancel</button>
              <button id="save-cookie-edit" class="btn btn-primary">Save Changes</button>
            </div>
          </div>
        </div>
        
        <!-- Tutorial Modal Removed -->
      </div>
    `;
    
    this.container.innerHTML = ui;
    
    // REVERTED: Remove the generic class after rendering
    // const managerTable = this.container.querySelector('#manager-cookie-table');
    // if (managerTable) {
    //   managerTable.classList.remove('cookie-table');
    //   console.log('[ManagerUI] Removed .cookie-table class to isolate styles.');
    // }
  }
  
  /**
   * Set up the intersection observer for lazy loading
   */
  setupIntersectionObserver() {
    if (this.observerSetup) return;
    
    const options = {
      root: document.querySelector('.table-scroll-container'),
      rootMargin: '100px',
      threshold: 0.1
    };
    
    // Create an observer instance
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          // Load more cookies if we're near the bottom and there are more pages
          if (this.currentPage < this.totalPages) {
            this.currentPage++;
            this.loadCookies(false);
          }
        }
      });
    }, options);
    
    // Create a sentinel element to observe
    const sentinel = document.createElement('div');
    sentinel.id = 'scroll-sentinel';
    sentinel.style.height = '1px';
    const tableBody = document.getElementById('cookie-table-body');
    if (tableBody) {
      tableBody.appendChild(sentinel);
      this.observer.observe(sentinel);
    }
    
    this.observerSetup = true;
  }
  
  /**
   * Set up event listeners for UI interactions
   */
  setupEventListeners() {
    // Search input
    const searchInput = document.getElementById('cookie-search');
    if (searchInput) {
    searchInput.addEventListener('input', () => {
        this.nameFilter = searchInput.value.trim().toLowerCase();
      this.currentPage = 1;
      this.loadCookies();
    });
    }
    
    // Domain filter
    const domainFilterSelect = document.getElementById('domain-filter');
    const customDomainInputContainer = document.querySelector('.custom-domain-input');
    const customDomainInput = document.getElementById('custom-domain-input');
    const selectWrapper = domainFilterSelect ? domainFilterSelect.closest('.select-wrapper') : null;

    if (domainFilterSelect && customDomainInputContainer && customDomainInput && selectWrapper) {
      domainFilterSelect.addEventListener('change', () => {
        const selectedValue = domainFilterSelect.value;
        
        if (selectedValue === '__custom__') {
          // Show custom input, hide select
          selectWrapper.classList.add('hidden');
          customDomainInputContainer.classList.remove('hidden');
          customDomainInput.value = ''; // Clear previous custom input
          customDomainInput.focus();
          // Don't load cookies yet, wait for custom input submission
          this.clearCookieDisplay(); // Clear the table while waiting
        } else if (selectedValue === '__select__') {
          // Hide custom input, show select
          selectWrapper.classList.remove('hidden');
          customDomainInputContainer.classList.add('hidden');
          this.domainFilter = '__select__'; // Indicate no valid selection
          this.clearCookieDisplay();
        } else {
          // Hide custom input, show select
          selectWrapper.classList.remove('hidden');
          customDomainInputContainer.classList.add('hidden');
          
          // Regular domain or "All Domains" selected
          this.domainFilter = selectedValue; // selectedValue is '' for All Domains
      this.currentPage = 1;
      this.loadCookies();
        }
      });

      // Event listener for submitting custom domain input
      const submitCustomDomainBtn = document.getElementById('submit-custom-domain');
      if (submitCustomDomainBtn) {
        const submitAction = () => {
          const customDomain = customDomainInput.value.trim();
          if (customDomain) {
            this.domainFilter = customDomain; // Set the filter to the custom domain
            this.currentPage = 1;
            this.loadCookies();
            // Optionally, add the custom domain to the dropdown for future use?
            // this.addCustomDomainOption(customDomain);
            // Switch back to select view? Maybe keep input visible?
          }
        };
        submitCustomDomainBtn.addEventListener('click', submitAction);
        customDomainInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submitAction();
          }
        });
      }

      // Event listener for canceling custom domain input
      const cancelCustomDomainBtn = document.getElementById('cancel-custom-domain');
      if (cancelCustomDomainBtn) {
        cancelCustomDomainBtn.addEventListener('click', () => {
          selectWrapper.classList.remove('hidden');
          customDomainInputContainer.classList.add('hidden');
          domainFilterSelect.value = '__select__'; // Reset dropdown to default
          this.domainFilter = '__select__';
          this.clearCookieDisplay();
        });
      }
    }
    
    // Filter tags
    const filterTags = document.querySelectorAll('.filter-tag');
    filterTags.forEach(tag => {
      tag.addEventListener('click', () => {
        tag.classList.toggle('active');
        // Reset pagination and reload cookies
        this.currentPage = 1;
        this.loadCookies();
      });
    });
    
    // Sort controls
    const sortBy = document.getElementById('sort-by');
    if (sortBy) {
    sortBy.addEventListener('change', () => {
      this.sortBy = sortBy.value;
      this.loadCookies();
    });
    }
    
    // Sort direction
    const sortDirection = document.getElementById('sort-direction');
    if (sortDirection) {
    sortDirection.addEventListener('click', () => {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        
        // Update button icon
      const icon = sortDirection.querySelector('.icon use');
        if (icon) {
          icon.setAttribute('href', this.sortDirection === 'asc' 
            ? '../sprites/solid.svg#sort-amount-up' 
            : '../sprites/solid.svg#sort-amount-down');
        }
        
      this.loadCookies();
    });
    }
    
    // Pagination controls
    const firstPage = document.getElementById('first-page');
    const prevPage = document.getElementById('prev-page');
    const nextPage = document.getElementById('next-page');
    const lastPage = document.getElementById('last-page');
    
    if (firstPage) {
      firstPage.addEventListener('click', () => {
        if (this.currentPage > 1) {
          this.currentPage = 1;
          this.loadCookies();
        }
      });
    }
    
    if (prevPage) {
    prevPage.addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.loadCookies();
      }
    });
    }
    
    if (nextPage) {
    nextPage.addEventListener('click', () => {
      if (this.currentPage < this.totalPages) {
        this.currentPage++;
        this.loadCookies();
      }
    });
    }
    
    if (lastPage) {
      lastPage.addEventListener('click', () => {
        if (this.currentPage < this.totalPages) {
          this.currentPage = this.totalPages;
          this.loadCookies();
        }
      });
    }
    
    // Page size
    const pageSize = document.getElementById('page-size');
    if (pageSize) {
    pageSize.addEventListener('change', () => {
        this.pageSize = parseInt(pageSize.value, 10);
      this.currentPage = 1;
      this.loadCookies();
    });
    }
    
    // Refresh button
    const refreshButton = document.getElementById('refresh-cookies');
    if (refreshButton) {
      refreshButton.addEventListener('click', () => {
        this.refreshCookies();
      });
    }
    
    // Select all cookies
    const selectAll = document.getElementById('select-all-cookies');
    if (selectAll) {
    selectAll.addEventListener('change', () => {
      const checkboxes = document.querySelectorAll('.cookie-select'); // Corrected selector
      checkboxes.forEach(checkbox => {
        checkbox.checked = selectAll.checked;
          const cookieId = checkbox.dataset.cookieId;
          if (selectAll.checked) {
            this.selectedCookies.add(cookieId);
            checkbox.closest('tr').classList.add('selected'); // Add selected class to row
          } else {
            this.selectedCookies.delete(cookieId);
            checkbox.closest('tr').classList.remove('selected'); // Remove selected class from row
          }
        });
        
        this.updateBatchActions();
      });
    }
    
    // Batch delete
    const batchDelete = document.getElementById('batch-delete-cookies');
    if (batchDelete) {
      batchDelete.addEventListener('click', () => {
        if (this.selectedCookies.size > 0) {
          const cookiesToDelete = Array.from(this.selectedCookies).map(id => {
            const [domain, path, name] = id.split('|');
            // Find the full cookie object (important: this assumes this.cookies contains all cookies)
            // A better approach might be to store the cookie object directly in the Set or use a Map
            return this.cookies.find(c => c.domain === domain && c.path === path && c.name === name);
          }).filter(Boolean); // Filter out any undefined results
          
          if (cookiesToDelete.length > 0) {
            this.batchDeleteCookies(cookiesToDelete);
          } else {
            console.warn('Could not find cookie objects for selected IDs.');
          }
        }
      });
    }
    
    // Create new cookie
    const createCookie = document.getElementById('create-cookie');
    const createEmptyCookie = document.getElementById('clear-filters'); // Changed to clear-filters button id
    if (createCookie) {
      createCookie.addEventListener('click', () => {
        this.createNewCookie();
      });
    }
    if (createEmptyCookie) {
      // Assuming the button in the 'no cookies' message should clear filters now
      createEmptyCookie.addEventListener('click', () => {
        // Clear filters logic - example:
        this.nameFilter = '';
        this.domainFilter = '';
        document.getElementById('cookie-search').value = '';
        document.getElementById('domain-filter').value = '';
        document.querySelectorAll('.filter-tag.active').forEach(tag => tag.classList.remove('active'));
        this.activeFilters.clear();
        this.updateActiveFiltersUI(); // Add this method if you implement active filter display
        this.currentPage = 1;
        this.loadCookies();
      });
    }
    
    // Cookie modal
    const closeModal = document.getElementById('close-cookie-modal');
    const cancelEdit = document.getElementById('cancel-cookie-edit');
    const saveEdit = document.getElementById('save-cookie-edit');
    const cookieModal = document.getElementById('cookie-modal');
    
    if (closeModal) {
    closeModal.addEventListener('click', () => {
      this.closeCookieModal();
    });
    }
    
    if (cancelEdit) {
    cancelEdit.addEventListener('click', () => {
      this.closeCookieModal();
    });
    }
    
    if (saveEdit) {
      saveEdit.addEventListener('click', () => {
      this.saveCookieEdit();
    });
    }
    
    // Close modal when clicking outside
    if (cookieModal) {
      cookieModal.addEventListener('click', (event) => {
        if (event.target === cookieModal) {
          this.closeCookieModal();
        }
      });
    }
    
    // Cookie session checkbox
    const sessionCheckbox = document.getElementById('cookie-session');
    const expiresInput = document.getElementById('cookie-expiration');
    
    if (sessionCheckbox && expiresInput) {
      sessionCheckbox.addEventListener('change', () => {
        expiresInput.disabled = sessionCheckbox.checked;
      });
    }
    
    // Advanced filters toggle
    const toggleFiltersBtn = document.getElementById('toggle-filters-btn');
    const advancedFiltersSection = document.querySelector('.advanced-filters');
    
    if (toggleFiltersBtn && advancedFiltersSection) {
      toggleFiltersBtn.addEventListener('click', () => {
        const isExpanded = advancedFiltersSection.classList.toggle('expanded');
        toggleFiltersBtn.classList.toggle('active', isExpanded);
        // Optional: Change aria-expanded attribute for accessibility
        toggleFiltersBtn.setAttribute('aria-expanded', isExpanded);
      });
      
      // Add click listener to the header to toggle as well
      const filtersHeader = advancedFiltersSection.querySelector('.advanced-filters-header');
      if (filtersHeader) {
        filtersHeader.addEventListener('click', (e) => {
          // Prevent toggle if click is on the button itself
          if (e.target !== toggleFiltersBtn && !toggleFiltersBtn.contains(e.target)) {
            toggleFiltersBtn.click(); // Simulate click on the button
          }
        });
      }
    }
  }
  
  /**
   * Update batch action buttons based on selection
   */
  updateBatchActions() {
    const batchDelete = document.getElementById('batch-delete-cookies');
    if (batchDelete) {
      const count = this.selectedCookies.size;
      batchDelete.disabled = count === 0;
      batchDelete.innerHTML = `
        <svg class="icon"><use href="../sprites/solid.svg#trash-alt"></use></svg>
        <span>Delete${count > 0 ? ` (${count})` : ''}</span>
      `;
    }
  }

  /**
   * Handle creating a new cookie
   */
  createNewCookie() {
    const modal = document.getElementById('cookie-modal');
    const modalTitle = document.getElementById('cookie-modal-title');
    const form = document.getElementById('cookie-form');
    
    if (modal && modalTitle && form) {
      modalTitle.textContent = 'Create New Cookie';
      form.reset(); // Reset all form fields first
      
      // Set default values for text inputs
      document.getElementById('cookie-path').value = '/';
      document.getElementById('cookie-domain').value = window.location.hostname;
      
      // Get current datetime for expiration (default to 30 days)
      const now = new Date();
      now.setDate(now.getDate() + 30);
      const formattedDate = now.toISOString().slice(0, 16);
      document.getElementById('cookie-expiration').value = formattedDate;
      document.getElementById('cookie-expiration').disabled = false; // Ensure expiration is enabled by default
      
      // Set default values for checkboxes
      document.getElementById('cookie-session').checked = false; // Default to non-session
      document.getElementById('cookie-secure').checked = window.location.protocol === 'https:'; // Default based on current page protocol
      document.getElementById('cookie-httpOnly').checked = false;
      document.getElementById('cookie-hostOnly').checked = false; // Default hostOnly to false
      
      // Set default for SameSite dropdown
      document.getElementById('cookie-sameSite').value = 'lax';
      
      // Clear editing state
      this.editingCookie = null;
      
      // Show modal with animation
      modal.classList.add('active');
      setTimeout(() => {
        document.getElementById('cookie-name').focus();
      }, 300);
    }
  }
  
  /**
   * Load cookies from browser
   */
  async loadCookies(reset = true) {
    if (this.loadingCookies) return;
    
      this.loadingCookies = true;
      
      if (reset) {
      this.currentPage = 1;
      this.showLoader(true);
      }
      
    try {
      const allCookies = await this.cookieManager.getAllCookies();
      
      // Keep a reference to all cookies
      this.cookies = allCookies;
      
      // Update domain dropdown based on *all* cookies
        this.updateDomainFilter(allCookies);
      
      // Apply filters
      let filteredCookies = this.filterCookies(allCookies);
      
      // Sort cookies
      filteredCookies = this.sortCookies(filteredCookies);
      
      // Update statistics based on *filtered* cookies
      this.updateStatistics(filteredCookies);
      
      // Update pagination based on *filtered* count
      this.updatePagination(filteredCookies.length);
      
      // Show/hide empty state
      this.showNoCookiesMessage(filteredCookies.length === 0);
      
      // Update the UI
      this.renderCookies(filteredCookies);
      
    } catch (error) {
      console.error('Error loading cookies:', error);
      this.emit('show-notification', { 
        message: 'Error loading cookies: ' + error.message, 
        isError: true 
      });
    } finally {
      this.loadingCookies = false;
      this.showLoader(false);
    }
  }
  
  /**
   * Filter cookies based on current filters
   * @param {Array} cookies Array of cookies to filter
   * @returns {Array} Filtered cookies
   */
  filterCookies(cookies) {
    return cookies.filter(cookie => {
      // Domain filter
      if (this.domainFilter && cookie.domain) {
        if (!cookie.domain.includes(this.domainFilter)) {
          return false;
        }
      }
      
      // Name/value filter
      if (this.nameFilter) {
        const searchLower = this.nameFilter.toLowerCase();
        return cookie.name.toLowerCase().includes(searchLower) || 
               (cookie.value && cookie.value.toLowerCase().includes(searchLower));
      }
      
      return true;
    });
  }
  
  /**
   * Sort cookies based on current sort settings
   * @param {Array} cookies Array of cookies to sort
   * @returns {Array} Sorted cookies
   */
  sortCookies(cookies) {
    return [...cookies].sort((a, b) => {
      let valueA, valueB;
      
      switch(this.sortBy) {
        case 'domain':
          valueA = a.domain.toLowerCase();
          valueB = b.domain.toLowerCase();
          break;
        case 'name':
          valueA = a.name.toLowerCase();
          valueB = b.name.toLowerCase();
          break;
        case 'expires':
          valueA = a.expirationDate || Number.MAX_SAFE_INTEGER;
          valueB = b.expirationDate || Number.MAX_SAFE_INTEGER;
          break;
        case 'size':
          valueA = (a.value || '').length;
          valueB = (b.value || '').length;
          break;
        default:
          valueA = a.domain.toLowerCase();
          valueB = b.domain.toLowerCase();
      }
      
      const direction = this.sortDirection === 'asc' ? 1 : -1;
      
      if (valueA < valueB) return -1 * direction;
      if (valueA > valueB) return 1 * direction;
      return 0;
    });
  }
  
  /**
   * Update the domain filter dropdown with available domains
   * @param {Array} cookies Array of cookies to extract domains from
   */
  updateDomainFilter(cookies) {
    const domainSet = new Set();
    cookies.forEach(cookie => {
      let domain = cookie.domain;
      // Remove leading dot for better display
      if (domain.startsWith('.')) {
        domain = domain.substring(1);
      }
      domainSet.add(domain);
    });
    
    const domains = Array.from(domainSet).sort();
    const domainFilterSelect = document.getElementById('domain-filter');
    if (!domainFilterSelect) return;
    
    // Save current selection or default to "Select Domain"
    let currentValue = domainFilterSelect.value;
    if (currentValue !== '' && currentValue !== '__custom__' && !domains.includes(currentValue)) {
      currentValue = '__select__'; // Reset if current value is no longer valid (and not special)
    }
    
    // Clear existing domain options (keep the first 3 special ones)
    while (domainFilterSelect.options.length > 3) {
      domainFilterSelect.remove(3);
    }
    
    // Add domain options
    domains.forEach(domain => {
      const option = document.createElement('option');
      option.value = domain;
      option.textContent = domain;
      domainFilterSelect.appendChild(option);
    });
    
    // Restore selection
    domainFilterSelect.value = currentValue;
  }
  
  /**
   * Update pagination controls based on filtered results
   * @param {number} totalItems Total number of cookies after filtering
   */
  updatePagination(totalItems) {
    this.totalPages = Math.max(1, Math.ceil(totalItems / this.pageSize));
    
    const paginationInfo = document.getElementById('pagination-info');
    if (paginationInfo) {
    paginationInfo.textContent = `Page ${this.currentPage} of ${this.totalPages}`;
    }
    
    const prevButton = document.getElementById('prev-page');
    if (prevButton) {
    prevButton.disabled = this.currentPage <= 1;
    }
    
    const nextButton = document.getElementById('next-page');
    if (nextButton) {
    nextButton.disabled = this.currentPage >= this.totalPages;
    }
  }
  
  /**
   * Render cookies in the table
   * @param {Array} cookies The cookies to render
   */
  renderCookies(cookies) {
    const tableBody = document.getElementById('cookie-table-body');
    if (!tableBody) return;
    
    // Clear the table
    tableBody.innerHTML = '';
    
    // Get the start and end indices for the current page
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = Math.min(startIndex + this.pageSize, cookies.length);
    
    // Update the pagination info
    const showingElement = document.getElementById('showing-cookies');
    const totalElement = document.getElementById('total-cookies');
    
    if (showingElement) {
      showingElement.textContent = cookies.length > 0 
        ? `${startIndex + 1}-${endIndex}` 
        : '0-0';
    }
    
    if (totalElement) {
      totalElement.textContent = cookies.length.toString();
    }
    
    // If no cookies, show message
    if (cookies.length === 0) {
      this.showNoCookiesMessage(true);
      return;
    }
    
    this.showNoCookiesMessage(false);
    
    // Get cookies for the current page
    const pageCookies = cookies.slice(startIndex, endIndex);
    
    // Create elements with staggered animation
    pageCookies.forEach((cookie, index) => {
      const row = document.createElement('tr');
      
      // Add staggered animation
      row.style.animationDelay = `${index * 30}ms`;
      row.classList.add('fade-in');
      
      // Add selected class if the cookie is selected
      if (this.selectedCookies.has(this.getCookieId(cookie))) {
        row.classList.add('selected');
      }
      
      // Check if cookie is expiring soon (24 hours)
      const isExpiringSoon = cookie.expirationDate && 
        (cookie.expirationDate - (Date.now() / 1000)) < 86400 && 
        (cookie.expirationDate - (Date.now() / 1000)) > 0;
      
      if (isExpiringSoon) {
        row.classList.add('expiring-soon');
      }
      
      // Format the cookie value for display
      const valuePreview = this.formatValuePreview(cookie.value);
      
      // Format the expiration date
      const expirationInfo = this.formatExpirationDate(cookie);
      
      // Format domain for display
      const domainDisplay = this.formatDomainForDisplay(cookie.domain);
      
      // Determine if cookie has secure features for highlighting
      const hasSecureFeatures = cookie.secure || cookie.httpOnly || cookie.sameSite === 'strict';
      
      row.innerHTML = `
        <td>
          <label class="custom-checkbox">
            <input type="checkbox" class="cookie-select" data-cookie-id="${this.getCookieId(cookie)}" ${this.selectedCookies.has(this.getCookieId(cookie)) ? 'checked' : ''}>
            <span class="checkbox-checkmark"></span>
          </label>
        </td>
        <td class="cookie-name">
          ${cookie.name} 
        </td>
        <td class="cookie-attributes-cell">
          <div class="cookie-tags">
            ${cookie.secure ? '<span class="cookie-tag secure" title="This cookie is secure and will only be sent over HTTPS">Secure</span>' : ''}
            ${cookie.httpOnly ? '<span class="cookie-tag httponly" title="This cookie is not accessible via JavaScript">HttpOnly</span>' : ''}
            ${cookie.hostOnly || cookie.domain === null ? '<span class="cookie-tag hostonly" title="This cookie only applies to the exact domain without subdomains">HostOnly</span>' : ''}
            ${!cookie.expirationDate ? '<span class="cookie-tag session" title="This cookie expires when the session ends">Session</span>' : ''}
            ${cookie.sameSite && cookie.sameSite !== 'no_restriction' ? `<span class="cookie-tag samesite" title="SameSite: ${cookie.sameSite}">${cookie.sameSite}</span>` : ''}
          </div>
        </td>
        <td class="cookie-domain" title="${cookie.domain || '[Current Domain]'}">
          <div class="domain-icon">
            <svg class="icon"><use href="../sprites/solid.svg#globe"></use></svg>
          </div>
          <span>${cookie.domain ? domainDisplay : '[Current Domain]'}</span>
        </td>
        <td class="cookie-value">
          <div class="cookie-value-container">
            <div class="cookie-value-preview" title="Click to view full value">${valuePreview}</div>
            <button class="cookie-value-copy" data-cookie-id="${this.getCookieId(cookie)}" title="Copy value">
              <svg class="icon"><use href="../sprites/solid.svg#copy"></use></svg>
            </button>
          </div>
        </td>
        <td class="cookie-expires">
          <div class="cookie-expiry ${isExpiringSoon ? 'expiring-soon' : ''}">
            <div class="cookie-expiry-date">${expirationInfo.date}</div>
            <div class="cookie-expiry-relative">${expirationInfo.relative}</div>
          </div>
        </td>
        <td class="cookie-actions">
          <div class="actions-container">
            <button class="btn-action edit" data-cookie-id="${this.getCookieId(cookie)}" title="Edit cookie">
              <svg class="icon"><use href="../sprites/solid.svg#edit"></use></svg>
            </button>
            <button class="btn-action more" data-cookie-id="${this.getCookieId(cookie)}" title="More options">
              <svg class="icon"><use href="../sprites/solid.svg#ellipsis-v"></use></svg>
            </button>
            <button class="btn-action delete" data-cookie-id="${this.getCookieId(cookie)}" title="Delete cookie">
              <svg class="icon"><use href="../sprites/solid.svg#trash"></use></svg>
            </button>
          </div>
        </td>
      `;
      
      tableBody.appendChild(row);
      
      // Add event listeners to the row elements
      this.addRowEventListeners(row, cookie);
    });
    
    // Update batch actions based on selected cookies
    this.updateBatchActions();
  }
  
  /**
   * Add event listeners to row elements
   * @param {HTMLElement} row The row element
   * @param {Object} cookie The cookie object
   */
  addRowEventListeners(row, cookie) {
    // Checkbox for selecting cookies
    const checkbox = row.querySelector('.cookie-select');
    if (checkbox) {
      checkbox.addEventListener('change', (e) => {
        const cookieId = e.target.dataset.cookieId;
        if (e.target.checked) {
          this.selectedCookies.add(cookieId);
          row.classList.add('selected');
      } else {
          this.selectedCookies.delete(cookieId);
          row.classList.remove('selected');
        }
        this.updateBatchActions();
      });
    }
    
    // Value preview click to show full value
    const valuePreview = row.querySelector('.cookie-value-preview');
    if (valuePreview) {
      valuePreview.addEventListener('click', () => {
        this.showValueModal(cookie);
      });
    }
    
    // Copy value button
    const copyButton = row.querySelector('.cookie-value-copy');
    if (copyButton) {
      copyButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this.copyCookieValue(cookie);
      });
    }
      
      // Edit button
    const editButton = row.querySelector('.btn-action.edit');
    if (editButton) {
      editButton.addEventListener('click', () => {
        this.editCookie(cookie);
      });
    }
    
    // More options button
    const moreButton = row.querySelector('.btn-action.more');
    if (moreButton) {
      moreButton.addEventListener('click', (event) => {
        event.stopPropagation(); // Prevent click from bubbling up
        this.showCopyMenu(cookie, moreButton); // Pass the button for positioning
      });
    }
      
      // Delete button
    const deleteButton = row.querySelector('.btn-action.delete');
    if (deleteButton) {
      deleteButton.addEventListener('click', () => {
        this.deleteCookie(cookie);
      });
    }
  }
  
  /**
   * Format value preview
   * @param {string} value The cookie value
   * @returns {string} Formatted value preview
   */
  formatValuePreview(value) {
    if (!value) return '<em>Empty value</em>';
    
    // Limit the length for display
    const maxLength = 30;
    let displayValue = value;
    
    if (value.length > maxLength) {
      displayValue = value.substring(0, maxLength) + '...';
    }
    
    // Escape HTML
    displayValue = this.escapeHTML(displayValue);
    
    // Highlight JSON
    if (this.isJsonString(value)) {
      return `<span class="json-preview">${displayValue}</span>`;
    }
    
    return displayValue;
  }
  
  /**
   * Format the expiration date
   * @param {Object} cookie The cookie object
   * @returns {Object} Formatted date and relative time
   */
  formatExpirationDate(cookie) {
    if (cookie.session || !cookie.expirationDate) {
      return {
        date: 'Session',
        relative: 'Expires with session'
      };
    }
    
    const expirationDate = new Date(cookie.expirationDate * 1000);
    const now = new Date();
    const diffSeconds = Math.floor((expirationDate - now) / 1000);
    
    let relativeTime = '';
    
    if (diffSeconds < 0) {
      relativeTime = 'Expired';
    } else if (diffSeconds < 60) {
      relativeTime = `${diffSeconds} seconds`;
    } else if (diffSeconds < 3600) {
      relativeTime = `${Math.floor(diffSeconds / 60)} minutes`;
    } else if (diffSeconds < 86400) {
      relativeTime = `${Math.floor(diffSeconds / 3600)} hours`;
    } else {
      relativeTime = `${Math.floor(diffSeconds / 86400)} days`;
    }
    
    return {
      date: expirationDate.toLocaleString(),
      relative: relativeTime
    };
  }
  
  /**
   * Check if a string is valid JSON
   * @param {string} str The string to check
   * @returns {boolean} Whether the string is valid JSON
   */
  isJsonString(str) {
    try {
      const result = JSON.parse(str);
      return typeof result === 'object' && result !== null;
    } catch (e) {
      return false;
    }
  }
  
  /**
   * Escape HTML special characters
   * @param {string} unsafe The unsafe string
   * @returns {string} HTML-safe string
   */
  escapeHTML(unsafe) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  
  /**
   * Show modal with full cookie value
   * @param {Object} cookie The cookie object
   */
  showValueModal(cookie) {
    // Create and show a modal with the full cookie value
    const modal = document.createElement('div');
    modal.className = 'cookie-modal active';
    
    let formattedValue = cookie.value;
    let valueDisplay = '';
    
    // Check if it's JSON and format it
    if (this.isJsonString(cookie.value)) {
      try {
        const jsonObj = JSON.parse(cookie.value);
        formattedValue = JSON.stringify(jsonObj, null, 2);
        valueDisplay = this.formatJsonForHtml(formattedValue);
      } catch (e) {
        valueDisplay = this.escapeHTML(formattedValue);
      }
    } else {
      valueDisplay = this.escapeHTML(formattedValue);
    }
    
    modal.innerHTML = `
      <div class="cookie-modal-content scale-in-animation">
        <div class="cookie-modal-header">
          <h3>Cookie Value: ${this.escapeHTML(cookie.name)}</h3>
          <button class="btn-close"></button>
        </div>
        <div class="cookie-modal-body">
          <div class="json-viewer">${valueDisplay}</div>
        </div>
        <div class="cookie-modal-footer">
          <button class="btn btn-secondary modal-close">Close</button>
          <button class="btn btn-primary copy-full-value">
            <svg class="icon"><use href="../sprites/solid.svg#copy"></use></svg>
            Copy Value
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Close button event
    const closeBtn = modal.querySelector('.btn-close, .modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        setTimeout(() => {
          document.body.removeChild(modal);
        }, 300);
      });
    }
    
    // Copy button event
    const copyBtn = modal.querySelector('.copy-full-value');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        this.copyCookieValue(cookie);
        copyBtn.innerHTML = `
          <svg class="icon"><use href="../sprites/solid.svg#check"></use></svg>
          Copied!
        `;
        setTimeout(() => {
          copyBtn.innerHTML = `
            <svg class="icon"><use href="../sprites/solid.svg#copy"></use></svg>
            Copy Value
          `;
        }, 2000);
      });
    }
  }
  
  /**
   * Format JSON for HTML display with syntax highlighting
   * @param {string} json The JSON string
   * @returns {string} HTML-formatted JSON
   */
  formatJsonForHtml(json) {
    if (!json) return '';
    
    // Replace with spans for syntax highlighting
    return json
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
        let cls = 'json-value-number';
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            cls = 'json-key';
            // Remove the colon
            match = match.replace(/:$/, '');
          } else {
            cls = 'json-value-string';
          }
        } else if (/true|false/.test(match)) {
          cls = 'json-value-boolean';
        } else if (/null/.test(match)) {
          cls = 'json-value-null';
        }
        return `<span class="${cls}">${match}</span>`;
      });
  }
  
  /**
   * Show/hide the loading indicator
   */
  showLoader(show) {
    const loader = document.getElementById('cookie-loader');
    if (loader) {
      loader.classList.toggle('hidden', !show);
    }
  }
  
  /**
   * Show/hide the no cookies message
   */
  showNoCookiesMessage(show, message = 'No cookies found matching your filters') {
    const messageContainer = document.getElementById('no-cookies-message');
    if (messageContainer) {
      messageContainer.classList.toggle('hidden', !show);
    if (show) {
        const p = messageContainer.querySelector('p');
        if (p) p.textContent = message;
        // Hide the clear filters button initially or when showing the select domain message
        const clearBtn = messageContainer.querySelector('#clear-filters');
        if (clearBtn) {
          clearBtn.style.display = (message === 'Please select a domain to view cookies.') ? 'none' : '';
        }
      }
    }
  }
  
  /**
   * Refresh cookies from browser
   * @param {boolean} [showNotification=true] - Whether to show a success notification
   */
  refreshCookies(showNotification = true) {
    this.selectedCookies.clear();
    this.updateBatchActions();
    this.loadCookies();
    
    // Show notification only if requested
    if (showNotification) {
      const event = new CustomEvent('show-notification', {
        detail: {
          message: 'Cookies refreshed',
          isError: false
        }
      });
      document.dispatchEvent(event);
    }
  }
  
  /**
   * Delete a cookie
   */
  async deleteCookie(cookie) {
    // Add confirmation dialog before deleting
    const confirmDelete = await this.showConfirmationDialog(
      'Confirm Delete',
      `Are you sure you want to delete cookie "${cookie.name}"?`,
      'Delete',
      'Cancel'
    );
    
    if (!confirmDelete) return; // User cancelled the operation
    
    try {
      await this.cookieManager.deleteCookie(cookie);
      
      // Remove from selected cookies if it was selected
      const cookieId = `${cookie.domain}|${cookie.path}|${cookie.name}`;
      this.selectedCookies.delete(cookieId);
      this.updateBatchActions();
      
      // Remove from UI
      const row = document.querySelector(`tr[data-cookie-id="${cookieId}"]`);
      if (row) {
        // Add fade out animation
        row.style.animation = 'fadeOut 0.3s forwards';
        setTimeout(() => {
        row.remove();
        }, 300);
      }
      
      // Show success notification
      const event = new CustomEvent('show-notification', {
        detail: {
          message: `Cookie '${cookie.name}' deleted`,
          isError: false
        }
      });
      document.dispatchEvent(event);
      
      // Refresh filtered list after delay
      setTimeout(() => this.loadCookies(), 500);
      
    } catch (error) {
      console.error('Error deleting cookie:', error);
      const event = new CustomEvent('show-notification', {
        detail: {
          message: `Error deleting cookie: ${error.message}`,
          isError: true
        }
      });
      document.dispatchEvent(event);
    }
  }

  /**
   * Show confirmation dialog
   * @param {string} title Dialog title
   * @param {string} message Dialog message
   * @param {string} confirmText Text for confirm button
   * @param {string} cancelText Text for cancel button
   * @returns {Promise<boolean>} Promise resolving to true if confirmed, false otherwise
   */
  showConfirmationDialog(title, message, confirmText = 'Confirm', cancelText = 'Cancel') {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'cookie-modal active';
      modal.innerHTML = `
        <div class="cookie-modal-content scale-in-animation">
          <div class="cookie-modal-header">
            <h3>${title}</h3>
            <button class="btn-close" data-action="cancel"></button>
          </div>
          <div class="cookie-modal-body">
            <p>${message}</p>
          </div>
          <div class="cookie-modal-footer">
            <button class="btn btn-secondary" data-action="cancel">${cancelText}</button>
            <button class="btn btn-danger" data-action="confirm">${confirmText}</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      // Setup event listeners
      const confirmBtn = modal.querySelector('[data-action="confirm"]');
      const cancelBtns = modal.querySelectorAll('[data-action="cancel"]');
      
      const cleanup = (result) => {
        modal.classList.remove('active');
        setTimeout(() => {
          modal.remove();
          resolve(result);
        }, 300);
      };
      
      confirmBtn.addEventListener('click', () => cleanup(true));
      
      cancelBtns.forEach(btn => {
        btn.addEventListener('click', () => cleanup(false));
      });
      
      // Close on background click
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          cleanup(false);
        }
      });
    });
  }
  
  /**
   * Delete multiple cookies in batch
   */
  async batchDeleteCookies(cookies) {
    // Add confirmation dialog before deleting
    const cookieCount = cookies.length;
    const confirmDelete = await this.showConfirmationDialog(
      'Confirm Batch Delete',
      `Are you sure you want to delete ${cookieCount} cookie${cookieCount !== 1 ? 's' : ''}?`,
      'Delete',
      'Cancel'
    );
    
    if (!confirmDelete) return; // User cancelled the operation
    
    let deleteCount = 0;
    let errorCount = 0;
    
    // Show loading notification
    const loadingEvent = new CustomEvent('show-notification', {
      detail: {
        message: `Deleting ${cookies.length} cookies...`,
        isError: false,
        duration: 0
      }
    });
    document.dispatchEvent(loadingEvent);
    
    for (const cookie of cookies) {
      try {
        await this.cookieManager.deleteCookie(cookie);
        deleteCount++;
        
        // Remove from UI
        const cookieId = `${cookie.domain}|${cookie.path}|${cookie.name}`;
        const row = document.querySelector(`tr[data-cookie-id="${cookieId}"]`);
        if (row) {
          row.remove();
        }
      } catch (error) {
        console.error('Error deleting cookie:', error);
        errorCount++;
      }
    }
    
    // Clear selection
    this.selectedCookies.clear();
    this.updateBatchActions();
    
    // Show completion notification
    const completionEvent = new CustomEvent('show-notification', {
      detail: {
        message: `Deleted ${deleteCount} cookies ${errorCount > 0 ? `(${errorCount} failed)` : ''}`,
        isError: errorCount > 0
      }
    });
    document.dispatchEvent(completionEvent);
    
    // Refresh the cookies list
    setTimeout(() => this.loadCookies(), 500);
  }
  
  /**
   * Edit a cookie
   */
  editCookie(cookie) {
    const modal = document.getElementById('cookie-modal');
    const modalTitle = document.getElementById('cookie-modal-title');
    
    if (modal && modalTitle) {
      modalTitle.textContent = `Edit Cookie: ${cookie.name}`;
      
      // Fill form fields
      document.getElementById('cookie-name').value = cookie.name;
      document.getElementById('cookie-value').value = cookie.value || '';
      document.getElementById('cookie-domain').value = cookie.domain;
      document.getElementById('cookie-path').value = cookie.path;
    
      const sessionCheckbox = document.getElementById('cookie-session');
      const expiresInput = document.getElementById('cookie-expiration');
    
      sessionCheckbox.checked = cookie.session || false;
      expiresInput.disabled = sessionCheckbox.checked;
      
      if (!cookie.session && cookie.expirationDate) {
        const date = new Date(cookie.expirationDate * 1000);
        const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        expiresInput.value = localDate.toISOString().slice(0, 16);
      } else {
        expiresInput.value = '';
      }
      
      document.getElementById('cookie-secure').checked = cookie.secure || false;
      document.getElementById('cookie-httpOnly').checked = cookie.httpOnly || false;
      document.getElementById('cookie-hostOnly').checked = cookie.hostOnly || false; // Add this line
      
      const samesiteSelect = document.getElementById('cookie-sameSite');
      samesiteSelect.value = cookie.sameSite || 'no_restriction';
      
      // Store the original cookie for later reference
      this.editingCookie = cookie;
      
      // Show modal with animation
      modal.classList.add('active');
    }
  }
  
  /**
   * Show more options modal
   */
  showMoreOptionsModal(cookie) {
    // Implement the logic to show the more options modal
    console.log('Show more options modal for cookie:', cookie);
  }
  
  /**
   * Close the cookie edit modal
   */
  closeCookieModal() {
    const modal = document.getElementById('cookie-modal');
    if (modal) {
      modal.classList.remove('active');
    }
  }
  
  /**
   * Save cookie edit
   */
  async saveCookieEdit() {
    const form = document.getElementById('cookie-form');
    if (!form) return;
    
    // Basic validation
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    
    const name = document.getElementById('cookie-name').value;
    const value = document.getElementById('cookie-value').value;
    const domain = document.getElementById('cookie-domain').value;
    const path = document.getElementById('cookie-path').value;
    const secure = document.getElementById('cookie-secure').checked;
    const httpOnly = document.getElementById('cookie-httpOnly').checked;
    const hostOnly = document.getElementById('cookie-hostOnly').checked; // Add this line
    const session = document.getElementById('cookie-session').checked;
    const sameSite = document.getElementById('cookie-sameSite').value;
    
    // Create cookie object
    const cookie = {
        name,
        value,
        domain,
        path,
        secure,
        httpOnly,
        hostOnly, // Add this property
        sameSite
    };
    
    // Add expiration if not a session cookie
    if (!session) {
      const expiresInput = document.getElementById('cookie-expiration').value;
      if (expiresInput) {
        const expiryDate = new Date(expiresInput);
        cookie.expirationDate = Math.floor(expiryDate.getTime() / 1000);
      }
    }
    
    try {
      // If we're editing an existing cookie, delete it first
      if (this.editingCookie) {
        await this.cookieManager.deleteCookie(this.editingCookie);
      }
      
      // Set the new cookie
      await this.cookieManager.updateCookie(cookie); // Renamed from setCookie
      
      // Close modal
      this.closeCookieModal();
      
      // Show success notification
      const event = new CustomEvent('show-notification', {
        detail: {
          message: `Cookie '${name}' ${this.editingCookie ? 'updated' : 'created'}`,
          isError: false
        }
      });
      document.dispatchEvent(event);
      
      // Refresh cookie list
      this.loadCookies();
      
    } catch (error) {
      console.error('Error saving cookie:', error);
      const event = new CustomEvent('show-notification', {
        detail: {
          message: `Error saving cookie: ${error.message}`,
          isError: true
        }
      });
      document.dispatchEvent(event);
    }
  }
  
  /**
   * Show the copy options menu for a cookie
   * @param {Object} cookie The cookie object
   * @param {HTMLElement} buttonElement The button that triggered the menu
   */
  showCopyMenu(cookie, buttonElement) {
    // Close any existing menus first
    this.closeCopyMenu(); 

    const menu = document.createElement('div');
    menu.id = 'cookie-options-menu'; // Assign an ID for potential closing
    menu.className = 'cookie-options-menu';
    
    menu.innerHTML = `
      <ul>
        <li>
          <button data-action="copy-name">
            <svg class="icon"><use href="../sprites/solid.svg#font"></use></svg>
            Copy Name
          </button>
        </li>
        <li>
          <button data-action="copy-value">
            <svg class="icon"><use href="../sprites/solid.svg#clipboard"></use></svg>
            Copy Value
          </button>
        </li>
        <li>
          <button data-action="copy-json">
            <svg class="icon"><use href="../sprites/solid.svg#code"></use></svg>
            Copy as JSON
          </button>
        </li>
        <li>
          <button data-action="duplicate">
            <svg class="icon"><use href="../sprites/solid.svg#clone"></use></svg>
            Duplicate Cookie
          </button>
        </li>
      </ul>
    `;

    // Position the menu near the button
    document.body.appendChild(menu); // Append to body for positioning context
    const buttonRect = buttonElement.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();

    let top = buttonRect.bottom + window.scrollY + 5;
    let left = buttonRect.left + window.scrollX - (menuRect.width / 2) + (buttonRect.width / 2);

    // Adjust if menu goes off-screen
    if (left < 0) left = 5;
    if (left + menuRect.width > window.innerWidth) left = window.innerWidth - menuRect.width - 5;
    if (top + menuRect.height > window.innerHeight) top = buttonRect.top + window.scrollY - menuRect.height - 5;

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;

    // Add event listeners for menu items
    menu.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', (event) => {
        const action = event.currentTarget.dataset.action;
        this.handleMenuAction(action, cookie);
        this.closeCopyMenu(); // Close menu after action
      });
    });

    // Show the menu with animation
    requestAnimationFrame(() => { // Use rAF to ensure styles are applied before transition
      menu.classList.add('active');
    });

    // Add listener to close menu when clicking outside
    // Use setTimeout to avoid immediate closing due to the initial button click
    setTimeout(() => {
      document.addEventListener('click', this.handleOutsideClick, { capture: true, once: true });
    }, 0);
  }

  /**
   * Close the copy options menu
   */
  closeCopyMenu() {
    const existingMenu = document.getElementById('cookie-options-menu');
    if (existingMenu) {
      existingMenu.classList.remove('active');
      // Remove the outside click listener if it hasn't been triggered yet
      document.removeEventListener('click', this.handleOutsideClick, { capture: true });
      // Remove the element after transition
      setTimeout(() => {
         if (existingMenu.parentNode) {
           existingMenu.parentNode.removeChild(existingMenu);
         }
      }, 200); // Match transition duration
    }
  }
  
  /**
   * Handle clicks outside the copy menu to close it.
   * Bound during showCopyMenu, needs to be a class property or bound function.
   */
  handleOutsideClick = (event) => {
    const menu = document.getElementById('cookie-options-menu');
    // Check if the click was outside the menu
    if (menu && !menu.contains(event.target)) {
      this.closeCopyMenu();
    } else if (menu) {
      // If the click was inside, re-add the listener for the next click outside
      // Use setTimeout to avoid immediate closing if the click was on a menu button
      setTimeout(() => {
        document.addEventListener('click', this.handleOutsideClick, { capture: true, once: true });
      }, 0);
    }
  };

  /**
   * Handle actions from the copy menu
   * @param {string} action The action identifier ('copy-name', 'copy-value', etc.)
   * @param {Object} cookie The relevant cookie object
   */
  handleMenuAction(action, cookie) {
    switch (action) {
      case 'copy-name':
        this.copyToClipboard(cookie.name, 'Cookie name');
        break;
      case 'copy-value':
        this.copyToClipboard(cookie.value || '', 'Cookie value');
        break;
      case 'copy-json':
        this.copyCookieAsJson(cookie);
        break;
      case 'duplicate':
        this.duplicateCookie(cookie); // Call the existing duplicate function
        break;
    }
  }

  /**
   * Generic copy to clipboard function with notification
   * @param {string} text The text to copy
   * @param {string} itemDescription Description of the item being copied (e.g., 'Cookie name')
   */
  async copyToClipboard(text, itemDescription) {
    try {
      await navigator.clipboard.writeText(text);
      this.emit('show-notification', {
        message: `${itemDescription} copied to clipboard`,
        isError: false,
        duration: 2000
      });
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      this.emit('show-notification', {
        message: `Error copying ${itemDescription.toLowerCase()}: ${error.message}`,
          isError: true
      });
    }
  }

  /**
   * Copy cookie data as JSON string
   */
  copyCookieAsJson(cookie) {
    // Create a clean object (optional, depends if you want all internal props)
    const cookieJson = {
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expirationDate ? new Date(cookie.expirationDate * 1000).toISOString() : 'Session',
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite
    };
    try {
      const jsonString = JSON.stringify(cookieJson, null, 2);
      this.copyToClipboard(jsonString, 'Cookie JSON');
    } catch (error) {
       console.error('Error stringifying cookie JSON:', error);
       this.emit('show-notification', {
         message: `Error creating cookie JSON: ${error.message}`,
         isError: true
       });
    }
  }

  /**
   * Duplicate a cookie (Opens the edit modal with prefilled data)
   */
  duplicateCookie(cookie) {
    const modal = document.getElementById('cookie-modal');
    const modalTitle = document.getElementById('cookie-modal-title');
    
    if (modal && modalTitle) {
      modalTitle.textContent = 'Duplicate Cookie';
      
      // Fill form fields
      document.getElementById('cookie-name').value = cookie.name;
      document.getElementById('cookie-value').value = cookie.value || '';
      document.getElementById('cookie-domain').value = cookie.domain;
      document.getElementById('cookie-path').value = cookie.path;
      
      const sessionCheckbox = document.getElementById('cookie-session');
      const expiresInput = document.getElementById('cookie-expiration');
      
      sessionCheckbox.checked = cookie.session || false;
      expiresInput.disabled = sessionCheckbox.checked;
      
      if (!cookie.session && cookie.expirationDate) {
        const date = new Date(cookie.expirationDate * 1000);
        const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        expiresInput.value = localDate.toISOString().slice(0, 16);
      } else {
        expiresInput.value = '';
      }
      
      document.getElementById('cookie-secure').checked = cookie.secure || false;
      document.getElementById('cookie-httpOnly').checked = cookie.httpOnly || false;
      
      const samesiteSelect = document.getElementById('cookie-sameSite');
      samesiteSelect.value = cookie.sameSite || 'no_restriction';
      
      // Show modal with animation
      modal.classList.add('active');
    }
  }
  
  /**
   * Copy cookie value to clipboard (Specific function, now potentially redundant but kept for direct calls)
   */
  async copyCookieValue(cookie) {
    await this.copyToClipboard(cookie.value || '', 'Cookie value');
  }
  
  /**
   * Update statistics based on provided cookies
   * @param {Array} cookies Array of cookies to analyze (usually filtered)
   */
  updateStatistics(cookies) {
    const now = Date.now() / 1000; // Use seconds
    const twentyFourHoursInSeconds = 86400;
    
    // Reset stats
    // Note: We still might want total domain count from *all* cookies, 
    // but dashboard cards should reflect the current filter.
    const stats = {
      total: cookies.length, // Use the length of the passed (filtered) array
      secure: 0,
      session: 0,
      expiring: 0,
      // domains: new Set(), // Domain count might be better based on all cookies
      types: {}
    };
    
    // Process the provided cookies for card stats
    cookies.forEach(cookie => {
      // Count secure cookies
      if (cookie.secure) {
        stats.secure++;
      }
      
      // Count session cookies
      if (cookie.session || !cookie.expirationDate) {
        stats.session++;
      }
      
      // Count cookies expiring within 24 hours
      if (cookie.expirationDate && (cookie.expirationDate - now) < twentyFourHoursInSeconds && (cookie.expirationDate - now) > 0) {
        stats.expiring++;
      }
      
      // Add domain to set (for overall analysis if needed, but not used in cards now)
      // stats.domains.add(cookie.domain);
    });
    
    // Update UI with statistics - Target the inner span elements
    this.animateCounter('#stat-total-cookies .counter', stats.total);
    this.animateCounter('#stat-secure-cookies .counter', stats.secure);
    this.animateCounter('#stat-session-cookies .counter', stats.session);
    this.animateCounter('#stat-expiring-cookies .counter', stats.expiring);
    
    // Update the percentage change indicators (Example for total cookies)
    this.updateStatChange('#stat-total-change', this.lastStats.total, stats.total);
    this.updateStatChange('#stat-secure-change', this.lastStats.secure, stats.secure);
    this.updateStatChange('#stat-session-change', this.lastStats.session, stats.session);
    this.updateStatChange('#stat-expiring-change', this.lastStats.expiring, stats.expiring);

    // Store current stats for next comparison
    this.lastStats = { ...stats };

    // Update cookie count below filters (always reflects filtered count)
    const cookieCountElement = document.getElementById('cookie-count');
    if (cookieCountElement) {
      cookieCountElement.textContent = `${stats.total} cookie${stats.total !== 1 ? 's' : ''} found`;
    }
  }
  
  /**
   * Animate a counter element
   * @param {string} selector CSS selector for the counter element
   * @param {number} endValue The final value for the counter
   */
  animateCounter(selector, endValue) {
    const element = document.querySelector(selector);
    if (!element) return;

    const startValue = parseInt(element.textContent, 10) || 0;
    if (startValue === endValue) return; // No change needed

    const duration = 500; // Animation duration in ms
    const startTime = performance.now();

    const step = (currentTime) => {
      const elapsedTime = currentTime - startTime;
      const progress = Math.min(elapsedTime / duration, 1);
      const currentValue = Math.floor(startValue + (endValue - startValue) * progress);
      element.textContent = currentValue;

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };

    requestAnimationFrame(step);
  }

  /**
   * Update the percentage change indicator for a stat card
   * @param {string} selector CSS selector for the change indicator span
   * @param {number} previousValue The previous value
   * @param {number} currentValue The current value
   */
  updateStatChange(selector, previousValue, currentValue) {
    const element = document.querySelector(selector);
    if (!element) return;

    const changeSpan = element.querySelector('span');
    const icon = element.querySelector('svg use');
    if (!changeSpan || !icon) return;

    let percentageChange = 0;
    if (previousValue > 0) {
      percentageChange = ((currentValue - previousValue) / previousValue) * 100;
    } else if (currentValue > 0) {
      percentageChange = 100; // Indicate increase if starting from 0
    }

    changeSpan.textContent = `${Math.abs(percentageChange).toFixed(0)}%`;

    if (percentageChange > 0) {
      element.classList.remove('negative');
      icon.setAttribute('href', '../sprites/solid.svg#arrow-up');
    } else if (percentageChange < 0) {
      element.classList.add('negative');
      icon.setAttribute('href', '../sprites/solid.svg#arrow-down');
    } else {
      // No change or started at 0
      element.classList.remove('negative');
      // Keep the arrow direction consistent or hide?
      // icon.setAttribute('href', '../sprites/solid.svg#minus'); // Optional: show minus for no change
    }
  }

  /**
   * Get a unique ID for a cookie
   * @param {Object} cookie The cookie object
   * @returns {string} A unique identifier string
   */
  getCookieId(cookie) {
    if (!cookie || !cookie.domain || !cookie.path || !cookie.name) {
      console.warn('Attempted to get ID for invalid cookie object:', cookie);
      return `invalid-${Date.now()}-${Math.random()}`;
    }
    return `${cookie.domain}|${cookie.path}|${cookie.name}`;
  }
  
  /**
   * Format domain for display
   * @param {string} domain The cookie domain
   * @returns {string} Formatted domain
   */
  formatDomainForDisplay(domain) {
    if (!domain) return '[Current Domain]';
    
    // Remove leading dot if present
    return domain.startsWith('.') ? domain.substring(1) : domain;
  }

  /**
   * Clear the cookie display area and reset related UI elements
   */
  clearCookieDisplay() {
    const tableBody = document.getElementById('cookie-table-body');
    if (tableBody) {
      tableBody.innerHTML = '';
    }
    this.updatePagination(0); // Reset pagination
    this.showNoCookiesMessage(true, 'Please select a domain or enter a custom one.'); // Show appropriate message
    this.selectedCookies.clear();
    this.updateBatchActions();
    // Maybe clear stats too? Depends on desired behavior
    // this.updateStatistics([]); 
  }

  /**
   * Update UI to show which filters are active
   * This method should be added if you're using active filter indicators
   */
  updateActiveFiltersUI() {
    // Implementation of showing active filters in UI
    // If the UI doesn't have this feature, this can be an empty method
    const activeFiltersContainer = document.querySelector('.active-filters-container');
    if (!activeFiltersContainer) return;
    
    // Clear current active filters display
    activeFiltersContainer.innerHTML = '';
    
    // Check if there are any active filters
    if (this.activeFilters && this.activeFilters.size > 0) {
      activeFiltersContainer.style.display = 'flex';
      
      // Add a chip for each active filter
      this.activeFilters.forEach((value, key) => {
        const filterChip = document.createElement('div');
        filterChip.className = 'active-filter-chip';
        filterChip.innerHTML = `
          <span>${key}: ${value}</span>
          <button class="remove-filter" data-filter-key="${key}">
            <svg class="icon"><use href="../sprites/solid.svg#times"></use></svg>
          </button>
        `;
        
        // Add event listener to remove filter when clicked
        const removeBtn = filterChip.querySelector('.remove-filter');
        if (removeBtn) {
          removeBtn.addEventListener('click', () => {
            this.activeFilters.delete(key);
            this.updateActiveFiltersUI();
            this.loadCookies();
          });
        }
        
        activeFiltersContainer.appendChild(filterChip);
      });
    } else {
      // Hide container if no active filters
      activeFiltersContainer.style.display = 'none';
    }
  }
} 