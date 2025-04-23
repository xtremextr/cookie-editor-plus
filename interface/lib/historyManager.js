/**
 * HistoryManager class to handle undo/redo operations for cookie edits.
 * Maintains a history stack of operations that can be undone and redone.
 */
export class HistoryManager {
  /**
   * Constructs a new HistoryManager.
   * @param {number} maxStackSize - Maximum number of operations to store in history
   */
  constructor(maxStackSize = 30) {
    this.undoStack = [];
    this.redoStack = [];
    this.maxStackSize = maxStackSize;
    // Cap the number of cookies stored per history entry
    this.MAX_COOKIES_PER_ENTRY = 30;
    this.listeners = {
      change: [],
    };
  }

  /**
   * Add an event listener for history changes
   * @param {string} event - Event name ('change')
   * @param {Function} callback - Function to call when event fires
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  /**
   * Remove an event listener
   * @param {string} event - Event name
   * @param {Function} callback - Function to remove
   */
  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  /**
   * Emit an event to all listeners
   * @param {string} event - Event name
   */
  emit(event) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback({
        canUndo: this.canUndo(),
        canRedo: this.canRedo()
      }));
    }
  }

  /**
   * Records a cookie edit operation in history
   * @param {string} type - Operation type ('edit', 'delete', 'deleteAll', 'create', 'importCookies', 'loadProfile')
   * @param {Object|Array|null} cookieData - Cookie data before the operation
   * @param {Object|Array|null} [newCookieData] - New cookie data (for various operations)
   * @param {string} url - URL associated with the cookie
   */
  recordEdit(type, cookieData, newCookieData, url) {
    // Create history entry
    const entry = {
      type: type,
      timestamp: Date.now(),
      url: url,
      cookieData: cookieData
    };

    // Store and truncate the new cookie data for operations that need it
    if (['edit', 'create', 'importCookies', 'loadProfile'].includes(type) && newCookieData !== undefined) {
      entry.newCookieData = newCookieData;
      if (Array.isArray(entry.newCookieData) && entry.newCookieData.length > this.MAX_COOKIES_PER_ENTRY) {
        entry.newCookieData = entry.newCookieData.slice(-this.MAX_COOKIES_PER_ENTRY);
      }
    }

    // Add to undo stack
    this.undoStack.push(entry);

    // Clear redo stack when a new edit is made
    this.redoStack = [];

    // Trim history if it exceeds the maximum size
    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift();
    }

    // Notify listeners
    this.emit('change');
  }

  /**
   * Check if undo operation is available
   * @returns {boolean} True if undo is available
   */
  canUndo() {
    return this.undoStack.length > 0;
  }

  /**
   * Check if redo operation is available
   * @returns {boolean} True if redo is available
   */
  canRedo() {
    return this.redoStack.length > 0;
  }

  /**
   * Get the last operation from the undo stack without removing it
   * @returns {Object|null} The last operation or null if stack is empty
   */
  peekUndo() {
    return this.undoStack.length > 0 ? this.undoStack[this.undoStack.length - 1] : null;
  }

  /**
   * Get the last operation from the redo stack without removing it
   * @returns {Object|null} The last operation or null if stack is empty
   */
  peekRedo() {
    return this.redoStack.length > 0 ? this.redoStack[this.redoStack.length - 1] : null;
  }

  /**
   * Perform undo operation
   * @returns {Object|null} The operation that was undone or null if no operation available
   */
  undo() {
    if (!this.canUndo()) {
      return null;
    }

    // Get the last operation from undo stack
    const operation = this.undoStack.pop();

    // Add to redo stack
    this.redoStack.push(operation);

    // Notify listeners
    this.emit('change');

    return operation;
  }

  /**
   * Perform redo operation
   * @returns {Object|null} The operation that was redone or null if no operation available
   */
  redo() {
    if (!this.canRedo()) {
      return null;
    }

    // Get the last operation from redo stack
    const operation = this.redoStack.pop();

    // Add back to undo stack
    this.undoStack.push(operation);

    // Notify listeners
    this.emit('change');

    return operation;
  }

  /**
   * Clear all history
   */
  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.emit('change');
  }
} 

