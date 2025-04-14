/**
 * Handles the different animations used in the interface.
 */
export class Animate {
  /**
   * Toggles between the two different states of a expanding element through a
   * sliding animation.
   * @param {Element} el Element to animate.
   * @param {function} callback Called after the animation is done.
   */
  static toggleSlide(el, callback = null) {
    let elMaxHeight = 0;
    const self = this;
    
    // Store original overflow settings of the container to restore later
    const cookieContainer = document.getElementById('cookie-container');
    
    // Don't block scrolling on the main container anymore
    // Instead, only manage overflow on the specific element being animated
    
    // Start with display flex but opacity 0 to allow height calculation without visual jump
    el.style.display = 'flex';

    // Set up transitionend listener
    const onTransitionEnd = function() {
      if (callback) {
        callback();
      }

      if (self.isHidden(el)) {
        el.style.display = 'none';
      }
      
      // Remove event listener to prevent memory leaks
      el.removeEventListener('transitionend', onTransitionEnd);
    };
    
    el.addEventListener('transitionend', onTransitionEnd);

    if (el.getAttribute('data-max-height')) {
      // For previously calculated elements, we use the cached value
      if (this.isHidden(el)) {
        // Use RAF to ensure browser has time to handle changes
        requestAnimationFrame(function () {
          el.style.maxHeight = el.getAttribute('data-max-height');
        });
      } else {
        elMaxHeight = this.getHeight(el) + 'px';
        el.setAttribute('data-max-height', elMaxHeight);
        el.style.maxHeight = '0';
      }
    } else {
      // First time setup
      elMaxHeight = this.getHeight(el, true) + 'px';
      el.style.transition = 'max-height 0.25s ease-in-out';
      el.style.overflowY = 'hidden';
      el.setAttribute('data-max-height', elMaxHeight);

      let nextMaxHeight;
      if (el.offsetHeight > 0) {
        nextMaxHeight = 0;
        el.style.maxHeight = elMaxHeight;
      } else {
        nextMaxHeight = elMaxHeight;
        el.style.maxHeight = 0;
      }
      
      // Use requestAnimationFrame for smoother animation timing
      requestAnimationFrame(function () {
        el.style.maxHeight = nextMaxHeight;
      });
    }
  }

  /**
   * Animates the change of size of an element through a sliding animation.
   * @param {Element} el Slide element to recalculate the size.
   * @param {function} callback Called after the animation is done.
   */
  static resizeSlide(el, callback = null) {
    if (callback) {
      el.addEventListener(
        'transitionend',
        function () {
          callback();
        },
        {
          once: true,
        },
      );
    }
    
    // Don't block scrolling on the main container anymore
    // Instead, only manage overflow on the specific element being animated
    
    // Check if advanced forms are being shown or hidden
    const advancedForms = el.querySelectorAll('.advanced-form');
    const hasVisibleAdvancedForms = Array.from(advancedForms).some(form => 
      form.classList.contains('show') && form.style.display !== 'none'
    );
    
    // For collapsing, transition should be quicker
    const transitionDuration = hasVisibleAdvancedForms ? '0.25s' : '0.15s';
    
    // Calculate new height
    const elMaxHeight = this.getHeight(el, true) + 'px';
    el.style.transition = `max-height ${transitionDuration} ease-out`;
    el.style.overflowY = 'hidden';
    el.setAttribute('data-max-height', elMaxHeight);

    const nextMaxHeight = elMaxHeight;
    const currentHeight = el.offsetHeight + 'px';
    el.style.maxHeight = currentHeight;

    // After resizing is complete, handle overflow on the element
    const onTransitionEnd = function() {
      // Only for expanded forms, remove max-height constraint 
      if (hasVisibleAdvancedForms) {
        // Remove max-height constraint to prevent content cutoff
        el.style.maxHeight = 'none';
      }
      
      el.removeEventListener('transitionend', onTransitionEnd);
    };
    
    el.addEventListener('transitionend', onTransitionEnd);
    
    // Use requestAnimationFrame for smoother animation
    requestAnimationFrame(function () {
      el.style.maxHeight = nextMaxHeight;
      
      // Safety timeout in case the transition event doesn't fire
      setTimeout(function() {
        // Also remove maxHeight constraint after a safe period
        // This ensures content is fully visible even if transition events fail
        if (hasVisibleAdvancedForms) {
          el.style.maxHeight = 'none';
        }
      }, hasVisibleAdvancedForms ? 300 : 200);
    });
  }

  /**
   * Animates a change of page content.
   * @param {Element} container Parent container of the page
   * @param {Element} oldPage Page that needs to get removed from the container.
   * @param {Element} newPage Page that will be inserted in the container.
   * @param {string} direction Which direction to slide the old page towards.
   * @param {function} callback Called after the animation is done.
   * @param {boolean} animationsEnabled If the animations are enabled or not.
   */
  static transitionPage(
    container,
    oldPage,
    newPage,
    direction = 'left',
    callback = null,
    animationsEnabled = true,
  ) {
    // PERFORMANCE OPTIMIZATION: Skip animation for initial popup load
    // Check if this is the first content load by looking for a special attribute
    if (!container.hasAttribute('data-first-load-complete')) {
      // This is the first load, so skip animation
      container.setAttribute('data-first-load-complete', 'true');
      
      if (oldPage) {
        container.removeChild(oldPage);
      }
      container.appendChild(newPage);
      if (callback) callback();
      return;
    }

    // If animations are disabled, simply swap the pages
    if (!animationsEnabled) {
      if (oldPage) {
        container.removeChild(oldPage);
      }
      container.appendChild(newPage);
      if (callback) callback();
      return;
    }
    
    // If an animation is already in progress (detected by a wrapper element),
    // clean it up first before starting a new animation
    const existingWrappers = container.querySelectorAll('.animation-wrapper');
    if (existingWrappers.length > 0) {
      existingWrappers.forEach(wrapper => {
        if (wrapper.parentNode === container) {
          container.removeChild(wrapper);
        }
      });
    }
    
    // PERFORMANCE OPTIMIZATION: Use a simpler, faster animation with opacity instead of translation
    // for better rendering performance
    
    // Create simple containers for the old and new pages
    const oldContainer = document.createElement('div');
    oldContainer.className = 'animation-old-page';
    oldContainer.style.position = 'absolute';
    oldContainer.style.top = '0';
    oldContainer.style.left = '0';
    oldContainer.style.width = '100%';
    oldContainer.style.height = '100%';
    oldContainer.style.opacity = '1';
    oldContainer.style.transition = 'opacity 0.15s ease-out';
    
    const newContainer = document.createElement('div');
    newContainer.className = 'animation-new-page';
    newContainer.style.position = 'absolute';
    newContainer.style.top = '0';
    newContainer.style.left = '0';
    newContainer.style.width = '100%';
    newContainer.style.height = '100%';
    newContainer.style.opacity = '0';
    newContainer.style.transition = 'opacity 0.15s ease-in';
    
    // Add old and new pages to their containers
    if (oldPage) {
      oldContainer.appendChild(oldPage);
    }
    newContainer.appendChild(newPage);
    
    // Create a wrapper for the animation
    const wrapper = document.createElement('div');
    wrapper.className = 'animation-wrapper';
    wrapper.style.position = 'relative';
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';
    wrapper.style.overflow = 'hidden';
    
    // Add containers to the wrapper
    wrapper.appendChild(oldContainer);
    wrapper.appendChild(newContainer);
    
    // Replace current content with the wrapper
    container.innerHTML = '';
    container.appendChild(wrapper);
    
    // Set a timeout to ensure callback is called even if transition events fail
    let transitionCompleted = false;
    const safetyTimeoutId = setTimeout(() => {
      if (!transitionCompleted) {
        console.log('[Animate.transitionPage] Safety timeout triggered, completing animation manually.');
        // Clean up animation elements and move new page directly into container
        container.innerHTML = '';
        container.appendChild(newPage);
        
        // Call callback if provided
        if (callback) callback();
        transitionCompleted = true;
      }
    }, 500); // 500ms safety timeout (longer than the transition duration)
    
    // Start the animation in the next frame to ensure proper rendering
    requestAnimationFrame(() => {
      oldContainer.style.opacity = '0';
      newContainer.style.opacity = '1';
      
      // Listen for the transition to finish
      newContainer.addEventListener('transitionend', function onTransitionEnd() {
        if (!transitionCompleted) {
          // Clean up animation elements and move new page directly into container
          container.innerHTML = '';
          container.appendChild(newPage);
          
          // Call callback if provided
          if (callback) callback();
          
          // Mark as completed and clear the safety timeout
          transitionCompleted = true;
          clearTimeout(safetyTimeoutId);
          
          // Remove the event listener to prevent memory leaks
          newContainer.removeEventListener('transitionend', onTransitionEnd);
        }
      });
    });
  }

  /**
   * Calculate the real height of an element.
   * @param {element} el Element to calculate the height.
   * @param {boolean} ignoreMaxHeight If we should ignore the current maxHeight.
   * @return {number} Height of the element.
   */
  static getHeight(el, ignoreMaxHeight) {
    const clone = el.cloneNode(true);
    clone.style.visibility = 'hidden';
    clone.style.position = 'absolute';
    clone.style.height = 'auto';
    
    // Remove caching to ensure fresh height calculation every time
    // This is important for elements with dynamic content like the advanced form
    
    if (ignoreMaxHeight) {
      clone.style.maxHeight = 'none';
    }
    
    // Force new stacking context to prevent affecting other elements
    clone.style.zIndex = '-1';
    
    // Ensure any nested advanced-form elements that are shown in the original 
    // are also shown in the clone for proper height calculation
    const originalAdvancedForms = el.querySelectorAll('.advanced-form.show');
    const cloneAdvancedForms = clone.querySelectorAll('.advanced-form');
    
    // Apply the same show state to clone elements
    if (originalAdvancedForms.length > 0 && cloneAdvancedForms.length > 0) {
      originalAdvancedForms.forEach((form, index) => {
        if (index < cloneAdvancedForms.length) {
          cloneAdvancedForms[index].classList.add('show');
          cloneAdvancedForms[index].style.display = 'block';
          cloneAdvancedForms[index].style.height = 'auto';
          cloneAdvancedForms[index].style.opacity = '1';
        }
      });
    }
    
    document.body.appendChild(clone);
    const height = clone.offsetHeight;
    document.body.removeChild(clone);
    
    return height;
  }

  /**
   * Checks if the element is currently hidden.
   * @param {element} el Element to check if it is hidden.
   * @return {boolean} True if the element is hidden.
   */
  static isHidden(el) {
    return el.offsetHeight <= 0;
  }
}
