import { Animate } from './animate.js';
import { GUID } from './guid.js';
import { ExtraInfos } from './options/extraInfos.js';

/**
 * Helper class to display a cookie.
 */
export class Cookie {
  /**
   * Creates a cookie object.
   * @param {string} id HTML id name for this cookie.
   * @param {object} cookie Cookie data.
   * @param {OptionsHandler} optionHandler
   */
  constructor(id, cookie, optionHandler) {
    this.id = id;
    this.cookie = cookie;
    this.guid = GUID.get();
    this.baseHtml = false;
    this.optionHandler = optionHandler;
  }

  /**
   * Whether the HTML for this cookie is already generated or not.
   */
  get isGenerated() {
    return this.baseHtml !== false;
  }

  /**
   * Gets the HTML to represent this cookie. This will generate it if it was
   * not already generated.
   */
  get html() {
    if (!this.isGenerated) {
      this.generateHtml();
    }

    return this.baseHtml;
  }

  /**
   * Updates the generated HTML code for a cookie in place, preserving the 
   * expanded state. Directly updates DOM elements based on newCookie data.
   * @param {object} newCookie Cookie data (the newly saved state).
   * @param {Element} [liElement] Optional reference to the LI element to update directly.
   */
  updateHtml(newCookie, liElement = null) { 
    const targetElement = liElement || this.baseHtml; // Use provided element or fallback to stored one

    // If targetElement is null/undefined (meaning liElement wasn't passed AND baseHtml isn't generated), warn and exit.
    if (!targetElement) {
      console.warn('updateHtml called but no target element available (liElement missing and HTML not generated).');
      return;
    }
    
    const oldCookie = this.cookie; // Keep for potential future use or debugging
    this.cookie = newCookie; // Update internal state

    // --- Directly Update DOM Elements (No Comparison or Animation) --- 

    // Name
    const headerName = targetElement.querySelector('.header-name');
    const inputName = targetElement.querySelector('.input-name');
    if (headerName) headerName.textContent = newCookie.name;
    if (inputName) inputName.value = newCookie.name;
    targetElement.setAttribute('data-name', newCookie.name);
    targetElement.setAttribute('data-cookieId', Cookie.hashCode(newCookie));

    // Value
    const inputValue = targetElement.querySelector('.input-value');
    if (inputValue) inputValue.value = newCookie.value;

    // Domain & HostOnly (HostOnly affects Domain's disabled state)
    const inputDomain = targetElement.querySelector('.input-domain');
    const inputHostOnly = targetElement.querySelector('.input-hostOnly');
    if (inputDomain) inputDomain.value = newCookie.domain;
    if (inputHostOnly) inputHostOnly.checked = newCookie.hostOnly;
    if (inputDomain) inputDomain.disabled = newCookie.hostOnly; // Update disabled state

    // Path
    const inputPath = targetElement.querySelector('.input-path');
    const inputPathDefault = targetElement.querySelector('.input-path-default');
    const inputPathCurrent = targetElement.querySelector('.input-path-current');
    const inputPathCustom = targetElement.querySelector('.input-path-custom');
    
    if (inputPath) inputPath.value = newCookie.path;
    
    // Keep path input disabled unless custom path is selected
    if (inputPath && inputPathDefault && inputPathCurrent && inputPathCustom) {
      if (inputPathCustom.checked) {
        inputPath.disabled = false;
      } else {
        inputPath.disabled = true;
      }
    }

    // Expiration & Session (Session affects Expiration's disabled state)
    const inputExpiration = targetElement.querySelector('.input-expiration');
    const inputSession = targetElement.querySelector('.input-session');
    if (inputExpiration) {
      inputExpiration.value = this.formatExpirationForDisplay(); // Use updated internal state
      inputExpiration.disabled = !newCookie.expirationDate;
    }
    if (inputSession) {
        inputSession.checked = !newCookie.expirationDate;
    }

    // SameSite
    const inputSameSite = targetElement.querySelector('.input-sameSite');
    if (inputSameSite) inputSameSite.value = newCookie.sameSite || 'no_restriction';

    // Secure
    const inputSecure = targetElement.querySelector('.input-secure');
    if (inputSecure) inputSecure.checked = newCookie.secure;

    // HttpOnly
    const inputHttpOnly = targetElement.querySelector('.input-httpOnly');
    if (inputHttpOnly) inputHttpOnly.checked = newCookie.httpOnly;
    
    // Always update header extra info display
    this.updateExtraInfo(targetElement);
  }

  /**
   * Updates the extra info related fields in the UI.
   */
  updateExtraInfo(targetElement) {
    // If targetElement wasn't passed (e.g., called directly), try to use this.baseHtml
    const elementToQuery = targetElement || this.baseHtml;
    if (!elementToQuery) { 
      // If still no element, we can't update extra info
      console.warn("updateExtraInfo called but no target element available.");
      return;
    }
    const headerExtraInfo = elementToQuery.querySelector('.header-extra-info');
    if (headerExtraInfo) {
      // Check the option setting before updating
      if (this.optionHandler && this.optionHandler.getExtraInfo()) {
        headerExtraInfo.textContent = this.getExtraInfoValue();
        headerExtraInfo.title = this.getExtraInfoTitle();
        headerExtraInfo.style.display = ''; // Ensure it's visible
        this.animateChangeOnNode(headerExtraInfo);
      } else {
        // Option is disabled, clear the content and hide the element
        headerExtraInfo.textContent = '';
        headerExtraInfo.title = '';
        headerExtraInfo.style.display = 'none'; // Hide the element
      }
    }
  }

  /**
   * Generates the HTML representation of a cookie.
   */
  generateHtml() {
    const self = this;
    const template = document.importNode(
      document.getElementById('tmp-cookie').content,
      true,
    );
    this.baseHtml = template.querySelector('li');
    this.baseHtml.setAttribute('data-name', this.cookie.name);
    this.baseHtml.id = this.id;
    this.baseHtml.dataset.cookieId = this.id;
    const form = this.baseHtml.querySelector('form');
    form.setAttribute('data-id', this.id);
    form.id = this.guid;
    if (!this.id) {
      form.classList.add('create');
    }

    const expandoId = 'exp_' + this.guid;
    const expando = this.baseHtml.querySelector('.expando');
    expando.id = expandoId;

    const header = this.baseHtml.querySelector('.header');
    header.setAttribute('aria-controls', expandoId);

    const headerName = this.baseHtml.querySelector('.header-name');
    headerName.textContent = this.cookie.name;

    const headerExtraInfo = this.baseHtml.querySelector('.header-extra-info');
    headerExtraInfo.textContent = this.getExtraInfoValue();
    headerExtraInfo.title = this.getExtraInfoTitle();

    const labelName = form.querySelector('.label-name');
    labelName.setAttribute('for', 'name-' + this.guid);
    const inputName = form.querySelector('.input-name');
    inputName.id = 'name-' + this.guid;
    inputName.value = this.cookie.name;

    const labelValue = form.querySelector('.label-value');
    labelValue.setAttribute('for', 'value-' + this.guid);
    const inputValue = form.querySelector('.input-value');
    inputValue.id = 'value-' + this.guid;
    inputValue.value = this.cookie.value;

    const labelDomain = form.querySelector('.label-domain');
    labelDomain.setAttribute('for', 'domain-' + this.guid);
    const inputDomain = form.querySelector('.input-domain');
    inputDomain.id = 'domain-' + this.guid;
    inputDomain.value = this.cookie.domain;

    const labelPath = form.querySelector('.label-path');
    labelPath.setAttribute('for', 'path-' + this.guid);
    const inputPath = form.querySelector('.input-path');
    inputPath.id = 'path-' + this.guid;
    inputPath.value = this.cookie.path;
    
    // Set up path option radio buttons
    const inputPathDefault = form.querySelector('.input-path-default');
    const inputPathCurrent = form.querySelector('.input-path-current');
    const inputPathCustom = form.querySelector('.input-path-custom');
    
    if (inputPathDefault && inputPathCurrent && inputPathCustom) {
      // Add IDs to radio buttons
      inputPathDefault.id = 'path-default-' + this.guid;
      inputPathCurrent.id = 'path-current-' + this.guid;
      inputPathCustom.id = 'path-custom-' + this.guid;
      
      // Default to "Root (/)" option
      inputPathDefault.checked = true;
      inputPath.disabled = true;
      
      // Add event listeners to toggle path input field
      inputPathDefault.addEventListener('change', () => {
        if (inputPathDefault.checked) {
          inputPath.disabled = true;
        }
      });
      
      inputPathCurrent.addEventListener('change', () => {
        if (inputPathCurrent.checked) {
          inputPath.disabled = true;
        }
      });
      
      inputPathCustom.addEventListener('change', () => {
        if (inputPathCustom.checked) {
          inputPath.disabled = false;
          inputPath.focus();
        }
      });
    }

    const labelExpiration = form.querySelector('.label-expiration');
    labelExpiration.setAttribute('for', 'expiration-' + this.guid);
    const inputExpiration = form.querySelector('.input-expiration');
    inputExpiration.id = 'expiration-' + this.guid;
    inputExpiration.value = this.formatExpirationForDisplay();

    const labelSameSite = form.querySelector('.label-sameSite');
    labelSameSite.setAttribute('for', 'sameSite-' + this.guid);
    const inputSameSite = form.querySelector('.input-sameSite');
    inputSameSite.id = 'sameSite-' + this.guid;
    inputSameSite.value = this.cookie.sameSite || 'no_restriction'; // Handle null/undefined sameSite

    const labelHostOnly = form.querySelector('.label-hostOnly');
    labelHostOnly.setAttribute('for', 'hostOnly-' + this.guid);
    const inputHostOnly = form.querySelector('.input-hostOnly');
    inputHostOnly.id = 'hostOnly-' + this.guid;
    inputHostOnly.checked = this.cookie.hostOnly;

    inputDomain.disabled = this.cookie.hostOnly;

    const labelSession = form.querySelector('.label-session');
    labelSession.setAttribute('for', 'session-' + this.guid);
    const inputSession = form.querySelector('.input-session');
    inputSession.id = 'session-' + this.guid;
    inputSession.checked = !this.cookie.expirationDate;

    inputExpiration.disabled = !this.cookie.expirationDate;

    const labelSecure = form.querySelector('.label-secure');
    labelSecure.setAttribute('for', 'secure-' + this.guid);
    const inputSecure = form.querySelector('.input-secure');
    inputSecure.id = 'secure-' + this.guid;
    inputSecure.checked = this.cookie.secure;

    const labelHttpOnly = form.querySelector('.label-httpOnly');
    labelHttpOnly.setAttribute('for', 'httpOnly-' + this.guid);
    const inputHttpOnly = form.querySelector('.input-httpOnly');
    inputHttpOnly.id = 'httpOnly-' + this.guid;
    inputHttpOnly.checked = this.cookie.httpOnly;

    inputHostOnly.addEventListener('change', function (e) {
      self.afterHostOnlyChanged(e.target.checked);
    });
    inputSession.addEventListener('change', function (e) {
      self.afterSessionChanged(e.target.checked);
    });

    const copyOptionsButton = this.baseHtml.querySelector(
      '.copy-options-button',
    );
    const copyOptionsMenu = this.baseHtml.querySelector(
      '.copy-options-menu',
    );
    
    // Add null checks for sidepanel - prevent TypeError if these elements don't exist
    if (copyOptionsButton && copyOptionsMenu) {
      const copyNameButton = copyOptionsMenu.querySelector('.copy-name');
      const copyValueButton = copyOptionsMenu.querySelector('.copy-value');
      const copyCookieButton = copyOptionsMenu.querySelector('.copy-cookie');

      copyOptionsButton.addEventListener('click', function (e) {
        e.stopPropagation(); // Prevent click from propagating to header/expando
        self.toggleCopyOptionsMenu(copyOptionsMenu);
      });

      copyNameButton.addEventListener('click', function (e) {
        e.stopPropagation();
        // Dispatch a custom event that cookie-list.js can listen for
        const cookieId = self.id;
        const cookieName = self.cookie.name;
        const customEvent = new CustomEvent('cookie-copy-name', {
          detail: { cookieId, cookieName },
          bubbles: true
        });
        this.dispatchEvent(customEvent);
        self.toggleCopyOptionsMenu(copyOptionsMenu); // Close menu after copy
      });

      copyValueButton.addEventListener('click', function (e) {
        e.stopPropagation();
        // Dispatch a custom event that cookie-list.js can listen for
        const cookieId = self.id;
        const cookieValue = self.cookie.value;
        const customEvent = new CustomEvent('cookie-copy-value', {
          detail: { cookieId, cookieValue },
          bubbles: true
        });
        this.dispatchEvent(customEvent);
        self.toggleCopyOptionsMenu(copyOptionsMenu); // Close menu after copy
      });

      copyCookieButton.addEventListener('click', function (e) {
        e.stopPropagation();
        // Dispatch a custom event that cookie-list.js can listen for
        const cookieId = self.id;
        const cookie = self.cookie;
        const customEvent = new CustomEvent('cookie-copy-json', {
          detail: { cookieId, cookie },
          bubbles: true
        });
        this.dispatchEvent(customEvent);
        self.toggleCopyOptionsMenu(copyOptionsMenu); // Close menu after copy
      });
    }

    const advancedToggleButton = form.querySelector('.advanced-toggle');
    const advancedForm = form.querySelector('.advanced-form');
    advancedToggleButton.addEventListener('click', function (e) {
      // Prevent event propagation to avoid accidental closing of parent expandos
      e.stopPropagation();
      
      // First toggle the button text for immediate user feedback
      if (advancedForm.classList.contains('show')) {
        advancedToggleButton.textContent = 'Show Advanced';
        // For hiding, transition is much simpler and faster
        advancedForm.style.opacity = '0';
        advancedForm.classList.remove('show');
        
        // Immediate resize with very short display delay
        requestAnimationFrame(() => {
          Animate.resizeSlide(form.parentElement.parentElement);
          setTimeout(() => {
            advancedForm.style.display = 'none';
            advancedForm.style.height = '0';
          }, 150); // Just enough time for opacity transition
        });
      } else {
        advancedToggleButton.textContent = 'Hide Advanced';
        advancedForm.classList.add('show');
        advancedForm.style.display = 'block';
        advancedForm.style.height = 'auto';
        
        // For showing, ensure smooth animation with requestAnimationFrame
        requestAnimationFrame(() => {
          advancedForm.style.opacity = '1';
          Animate.resizeSlide(form.parentElement.parentElement);
        });
      }
    });

    if (this.optionHandler.getCookieAdvanced()) {
      advancedForm.classList.add('show');
      advancedForm.style.display = 'block';
      advancedForm.style.opacity = '1';
      advancedForm.style.height = 'auto';
      advancedToggleButton.textContent = 'Hide Advanced';
    }
  }

  /**
   * Updates the name related fields in the UI.
   */
  updateName() {
    // Redirect to updateHtml method for consistency
    if (this.cookie) {
      this.updateHtml(this.cookie);
    }
  }

  /**
   * Updates the value related fields in the UI.
   */
  updateValue() {
    // Redirect to updateHtml method for consistency
    if (this.cookie) {
      this.updateHtml(this.cookie);
    }
  }

  /**
   * Updates the domain related fields in the UI.
   */
  updateDomain() {
    // Redirect to updateHtml method for consistency
    if (this.cookie) {
      this.updateHtml(this.cookie);
    }
  }

  /**
   * Updates the path related fields in the UI.
   */
  updatePath() {
    // Redirect to updateHtml method for consistency
    if (this.cookie) {
      this.updateHtml(this.cookie);
    }
  }

  /**
   * Updates the expiration related fields in the UI.
   */
  updateExpiration() {
    // Redirect to updateHtml method for consistency
    if (this.cookie) {
      this.updateHtml(this.cookie);
    }
  }

  /**
   * Updates the same site related fields in the UI.
   */
  updateSameSite() {
    // Redirect to updateHtml method for consistency
    if (this.cookie) {
      this.updateHtml(this.cookie);
    }
  }

  /**
   * Updates the host only related fields in the UI.
   */
  updateHostOnly() {
    // Redirect to updateHtml method for consistency
    if (this.cookie) {
      this.updateHtml(this.cookie);
    }
  }

  /**
   * Updates the session related fields in the UI.
   */
  updateSession() {
    // Redirect to updateHtml method for consistency
    if (this.cookie) {
      this.updateHtml(this.cookie);
    }
  }

  /**
   * Updates the secure related fields in the UI.
   */
  updateSecure() {
    // Redirect to updateHtml method for consistency
    if (this.cookie) {
      this.updateHtml(this.cookie);
    }
  }

  /**
   * Updates the http only related fields in the UI.
   */
  updateHttpOnly() {
    // Redirect to updateHtml method for consistency
    if (this.cookie) {
      this.updateHtml(this.cookie);
    }
  }

  /**
   * Executes after the value of the host only input is changed by the user.
   * @param {boolean} inputValue Current value of the input.
   */
  afterHostOnlyChanged(inputValue) {
    const inputDomain = this.baseHtml.querySelector('.input-domain');
    inputDomain.disabled = inputValue;
  }

  /**
   * Executes after the value of the session input is changed by the user.
   * @param {boolean} inputValue Current value of the input.
   */
  afterSessionChanged(inputValue) {
    const inputExpiration = this.baseHtml.querySelector('.input-expiration');
    if (inputExpiration) {
      inputExpiration.disabled = inputValue;
      if (inputValue) {
        // Clear expiration value visually if Session is checked
        inputExpiration.value = ''; 
      } else {
        // If unchecking session, repopulate expiration if available
        // Need to read internal state, not the potentially empty input value
        inputExpiration.value = this.formatExpirationForDisplay();
      }
    }
  }

  /**
   * Removes the cookie HTML from the page.
   * @param {function} callback Called after the animation is completed.
   */
  removeHtml(callback = null) {
    if (!this.baseHtml) {
      return;
    }

    // Use a collapse animation
    this.baseHtml.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
    this.baseHtml.style.transform = 'scaleY(0)';
    this.baseHtml.style.opacity = '0';

    this.baseHtml.addEventListener('transitionend', () => {
      if (this.baseHtml && this.baseHtml.parentNode) {
        this.baseHtml.parentNode.removeChild(this.baseHtml);
        this.baseHtml = null; // Clear reference
      }
      if (callback) {
        callback();
      }
    }, { once: true });
  }

  /**
   * Animates a subtle flash on a node to indicate change.
   * @param {Element} node Element to apply the animation to.
   */
  animateChangeOnNode(node) {
    if (!node) return;
    node.classList.add('flash-change');
    setTimeout(() => {
      node.classList.remove('flash-change');
    }, 500); // Animation duration
  }

  /**
   * Runs the success animation on the cookie HTML.
   * @param {Element} [targetElement] Optional reference to the LI element for targeting.
   */
  showSuccessAnimation(targetElement = null) {
    const elementToQuery = targetElement || this.baseHtml;
    if (elementToQuery) {
      // Target the header name specifically for the flash
      const headerNameNode = elementToQuery.querySelector('.header-name');
      // this.animateSuccessOnNode(elementToQuery); // Old way - flashed whole item
      this.animateSuccessOnNode(headerNameNode); // New way - flash only name
    }
  }

  /**
   * Animates a green flash on the given node.
   * @param {Element} node Element to apply the animation to.
   */
  animateSuccessOnNode(node) {
    // Animate.onSuccess(node); // REMOVE THIS - Function doesn't exist
    // ADD simple flash animation directly:
    if (node) {
      node.classList.add('flash-success');
      setTimeout(() => {
        node.classList.remove('flash-success');
      }, 750); // Keep flash for 750ms
    }
  }

  /**
   * Formats the expiration date for display.
   * @return {string} The formatted expiration date.
   */
  formatExpirationForDisplay() {
    if (!this.cookie.expirationDate) {
      return '';
    }
    const date = new Date(this.cookie.expirationDate * 1000);
    return date.toLocaleString(); // Use locale-specific format
  }

  /**
   * Formats the expiration date for display in the list header.
   * @return {string} The formatted expiration date.
   */
  formatExpirationForDisplayShort() {
    if (!this.cookie.expirationDate) {
      return 'Session';
    }
    const date = new Date(this.cookie.expirationDate * 1000);
    return date.toLocaleDateString(); // Use short date format
  }

  /**
   * Creates a short display representation for boolean flags.
   * @param {string} name Name of the flag.
   * @param {boolean} boolValue Value of the flag.
   * @return {string} A short text representation.
   */
  formatBoolForDisplayShort(name, boolValue) {
    return boolValue ? name : '';
  }

  /**
   * Creates a string representation for the extra info display.
   * @return {string} The string representation.
   */
  getExtraInfoValue() {
    let text = '';
    switch (this.optionHandler.getExtraInfo()) {
      case ExtraInfos.Nothing:
        text = '';
        break;
      case ExtraInfos.Expiration:
        text = this.formatExpirationForDisplayShort();
        break;
      case ExtraInfos.Domain:
        text = this.cookie.domain;
        break;
      case ExtraInfos.Size:
        text = this.cookie.value.length + ' B';
        break;
      case ExtraInfos.Flags:
        text += this.formatBoolForDisplayShort(
          'HostOnly',
          this.cookie.hostOnly,
        );
        text += this.formatBoolForDisplayShort('Secure', this.cookie.secure);
        text += this.formatBoolForDisplayShort(
          'HttpOnly',
          this.cookie.httpOnly,
        );
        break;
      default:
        // Default to nothing if setting is unknown
        text = '';
        break;
    }
    return text;
  }

  /**
   * Creates a title string for the extra info display.
   * @return {string} The title string.
   */
  getExtraInfoTitle() {
    let title = '';
    switch (this.optionHandler.getExtraInfo()) {
      case ExtraInfos.Nothing:
        title = '';
        break;
      case ExtraInfos.Expiration:
        title = `Expiration: ${this.formatExpirationForDisplay()}`;
        break;
      case ExtraInfos.Domain:
        title = `Domain: ${this.cookie.domain}`;
        break;
      case ExtraInfos.Size:
        title = `Value Size: ${this.cookie.value.length} Bytes`;
        break;
      case ExtraInfos.Flags:
        title = `Flags: ${this.cookie.hostOnly ? 'HostOnly ' : ''}${this.cookie.secure ? 'Secure ' : ''}${this.cookie.httpOnly ? 'HttpOnly ' : ''}`;
        break;
      default:
        // Default to nothing if setting is unknown
        title = '';
        break;
    }
    return title;
  }

  /**
   * Create a hash code for a cookie.
   * @param {object} cookie Cookie to hash.
   * @return {string} The hash code for the cookie.
   */
  static hashCode(cookie) {
    let hash = 0,
      i,
      chr;
    const str = cookie.name + cookie.domain + cookie.path;
    if (str.length === 0) return hash;
    for (i = 0; i < str.length; i++) {
      chr = str.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0; // Convert to 32bit integer
    }
    return 'c' + hash;
  }

  /**
   * Destroys the cookie object and associated HTML element.
   */
  destroy() {
    // Remove event listeners if any were added directly
    // (Currently only on hostOnly/session inputs, handled by removeHtml)
    this.removeHtml(() => {
      // Clear internal references after removal
      this.cookie = null;
      this.optionHandler = null; 
    });
  }
  
  /**
   * Toggles the visibility of the copy options menu
   * @param {HTMLElement} copyOptionsMenu - The menu element to toggle
   */
  toggleCopyOptionsMenu(copyOptionsMenu) {
    if (!copyOptionsMenu) return;
    
    // Check current state
    const isVisible = copyOptionsMenu.style.display === 'block';
    
    // Toggle visibility
    copyOptionsMenu.style.display = isVisible ? 'none' : 'block';
    
    // If we're showing the menu, add a click handler to close it when clicking outside
    if (!isVisible) {
      const self = this;
      const handleClickOutside = function(e) {
        // Close the menu if the click is outside the menu and its button
        if (!copyOptionsMenu.contains(e.target) && 
            !e.target.closest('.copy-options-button')) {
          copyOptionsMenu.style.display = 'none';
          document.removeEventListener('click', handleClickOutside);
        }
      };
      
      // Add the handler with a small delay to avoid immediate triggering
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
      }, 10);
    }
  }
  
  /**
   * Gets the cookie's value.
   * Copying will be handled by the main popup script.
   * @returns {string|null} The cookie value or null.
   */
  getCookieValue() {
    return this.cookie ? this.cookie.value : null;
  }
  
  /**
   * Gets the cookie's name.
   * Copying will be handled by the main popup script.
   * @returns {string|null} The cookie name or null.
   */
  getCookieName() {
    return this.cookie ? this.cookie.name : null;
  }
  
  /**
   * Gets the entire cookie data as a JSON string.
   * Copying will be handled by the main popup script.
   * @returns {string|null} The cookie JSON or null.
   */
  getCookieJson() {
    return this.cookie ? JSON.stringify(this.cookie, null, 2) : null;
  }

  /**
   * Helper to trigger a success animation on a specific button
   * @param {string} buttonSelector CSS selector for the button
   */
  showSuccessAnimationOnButton(buttonSelector) {
    if (this.baseHtml) {
      const button = this.baseHtml.querySelector(buttonSelector);
      if (button) {
        const icon = button.querySelector('svg use');
        const originalHref = icon ? icon.getAttribute('href') : null;
        if (icon) {
          icon.setAttribute('href', '../sprites/solid.svg#check');
          setTimeout(() => {
            if (originalHref) {
              icon.setAttribute('href', originalHref);
            }
          }, 1500);
        }
      }
    }
  }
}
