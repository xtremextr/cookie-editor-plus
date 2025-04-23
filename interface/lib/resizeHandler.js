import { EventEmitter } from './eventEmitter.js';

/**
 * Handler for popup resize functionality
 */
export class ResizeHandler extends EventEmitter {
  /**
   * Constructs a ResizeHandler
   * @param {GenericStorageHandler} storageHandler - Storage handler for persisting resize state
   */
  constructor(storageHandler) {
    super();
    this.storageHandler = storageHandler;
    this.isResizable = false;
    this.originalSize = { width: 500, height: 600 };
    // Chrome has a hard limit of 800x600 for popups
    this.maxSize = { width: 800, height: 580 }; // Using 580 to account for popup borders/padding
    this.currentSize = { ...this.originalSize };
    this.resizeHandle = null;
    this.resizeToggleButton = null;
    this.STORAGE_KEY = 'popupResizeState';
  }

  /**
   * Initialize the resize handler
   * @param {HTMLElement} container - The container element to make resizable
   * @param {HTMLElement} titleElement - The title element where to insert the resize toggle button
   */
  async initialize(container, titleElement) {
    try {
      // Create the resize toggle button
      this.resizeToggleButton = document.createElement('button');
      this.resizeToggleButton.id = 'resize-toggle-button';
      this.resizeToggleButton.setAttribute('aria-label', 'Toggle resize mode');
      this.resizeToggleButton.setAttribute('title', 'Toggle resize mode');
      this.resizeToggleButton.innerHTML = '<svg class="icon"><use href="../sprites/solid.svg#expand"></use></svg>';
      
      // Create the resize handle element
      this.resizeHandle = document.createElement('div');
      this.resizeHandle.id = 'resize-handle';
      this.resizeHandle.style.display = 'none';
      
      // Add resize toggle button to title element (before version element)
      const versionElement = document.getElementById('version');
      titleElement.insertBefore(this.resizeToggleButton, versionElement);
      
      // Add resize handle to container
      document.body.appendChild(this.resizeHandle);
      
      // Load saved state
      await this.loadState();
      
      // Add event listeners
      this.addEventListeners(container);
      
      // Add tooltip to explain Chrome's height limitation
      this.createLimitationTooltip();
    } catch (error) {
      console.error('Error initializing resize handler:', error);
    }
  }

  /**
   * Create a tooltip to explain Chrome's height limitation
   */
  createLimitationTooltip() {
    // Create tooltip element to explain Chrome's limitation
    const tooltip = document.createElement('div');
    tooltip.id = 'resize-limitation-tooltip';
    tooltip.className = 'resize-limitation-tooltip';
    tooltip.textContent = 'Chrome limits extension popups to 800×580px';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);
    
    // Show tooltip when getting close to limit
    this.on('resize', (size) => {
      if (size.height > this.maxSize.height - 30 || size.width > this.maxSize.width - 30) {
        tooltip.style.display = 'block';
        setTimeout(() => {
          tooltip.style.display = 'none';
        }, 3000);
      }
    });
  }

  /**
   * Add event listeners for resize functionality
   * @param {HTMLElement} container - The container element to make resizable
   */
  addEventListeners(container) {
    // Toggle button click handler
    this.resizeToggleButton.addEventListener('click', () => {
      this.toggleResizeMode();
    });

    // Resize handle events
    let isResizing = false;
    let startX, startY, startWidth, startHeight;

    const startResize = (e) => {
      if (!this.isResizable) return;
      
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = document.body.offsetWidth;
      startHeight = document.body.offsetHeight;
      
      document.addEventListener('mousemove', resize);
      document.addEventListener('mouseup', stopResize);
      
      e.preventDefault();
    };

    const resize = (e) => {
      if (!isResizing) return;
      
      const newWidth = startWidth + (e.clientX - startX);
      const newHeight = startHeight + (e.clientY - startY);
      
      // Apply size constraints
      const width = Math.min(Math.max(newWidth, 300), this.maxSize.width);
      const height = Math.min(Math.max(newHeight, 400), this.maxSize.height);
      
      // Update body size
      document.body.style.width = `${width}px`;
      document.body.style.height = `${height}px`;
      
      // Save current size
      this.currentSize = { width, height };
      
      this.emit('resize', { width, height });
    };

    const stopResize = () => {
      if (isResizing) {
        isResizing = false;
        document.removeEventListener('mousemove', resize);
        document.removeEventListener('mouseup', stopResize);
        
        // Save current state
        this.saveState();
      }
    };

    this.resizeHandle.addEventListener('mousedown', startResize);
  }

  /**
   * Toggle resize mode
   */
  async toggleResizeMode() {
    this.isResizable = !this.isResizable;
    
    if (this.isResizable) {
      // Enable resize mode
      this.resizeHandle.style.display = 'block';
      this.resizeToggleButton.classList.add('active');
      
      // Remove max-height constraints from cookie-container and main-content-wrapper
      const cookieContainer = document.getElementById('cookie-container');
      const mainContentWrapper = document.querySelector('.main-content-wrapper');
      
      if (cookieContainer) {
        cookieContainer.style.maxHeight = 'none';
        // Ensure scrolling works properly
        cookieContainer.style.overflow = 'auto';
      }
      
      if (mainContentWrapper) {
        mainContentWrapper.style.overflow = 'auto';
      }
      
      // Make sure body doesn't have overflow: hidden
      document.body.style.overflow = 'hidden';
    } else {
      // Disable resize mode
      this.resizeHandle.style.display = 'none';
      this.resizeToggleButton.classList.remove('active');
      
      // Reset to original size
      document.body.style.width = `${this.originalSize.width}px`;
      document.body.style.height = `${this.originalSize.height}px`;
      
      // Restore constraints on cookie-container and main-content-wrapper
      const cookieContainer = document.getElementById('cookie-container');
      const mainContentWrapper = document.querySelector('.main-content-wrapper');
      
      if (cookieContainer) {
        cookieContainer.style.maxHeight = '';
        cookieContainer.style.overflow = '';
      }
      
      if (mainContentWrapper) {
        mainContentWrapper.style.overflow = '';
      }
      
      // Reset body overflow
      document.body.style.overflow = 'hidden';
      
      // Reset current size
      this.currentSize = { ...this.originalSize };
      
      this.emit('resize', this.originalSize);
    }
    
    // Save current state
    await this.saveState();
  }

  /**
   * Save current resize state to storage
   */
  async saveState() {
    try {
      const state = {
        isResizable: this.isResizable,
        size: this.currentSize
      };
      
      await this.storageHandler.setLocal(this.STORAGE_KEY, state);
    } catch (error) {
      console.error('Error saving resize state:', error);
    }
  }

  /**
   * Load resize state from storage
   */
  async loadState() {
    try {
      const state = await this.storageHandler.getLocal(this.STORAGE_KEY);
      
      if (state) {
        this.isResizable = state.isResizable;
        
        // Ensure size is within valid bounds
        const savedSize = state.size || { ...this.originalSize };
        this.currentSize = {
          width: Math.min(savedSize.width, this.maxSize.width),
          height: Math.min(savedSize.height, this.maxSize.height)
        };
        
        if (this.isResizable) {
          // Apply saved size
          document.body.style.width = `${this.currentSize.width}px`;
          document.body.style.height = `${this.currentSize.height}px`;
          
          // Show resize handle
          this.resizeHandle.style.display = 'block';
          this.resizeToggleButton.classList.add('active');
          
          // Remove max-height constraints from cookie-container
          const cookieContainer = document.getElementById('cookie-container');
          const mainContentWrapper = document.querySelector('.main-content-wrapper');
          
          if (cookieContainer) {
            cookieContainer.style.maxHeight = 'none';
            cookieContainer.style.overflow = 'auto';
          }
          
          if (mainContentWrapper) {
            mainContentWrapper.style.overflow = 'auto';
          }
          
          // Make sure body has proper overflow handling
          document.body.style.overflow = 'hidden';
        }
      }
    } catch (error) {
      console.error('Error loading resize state:', error);
    }
  }
} 

