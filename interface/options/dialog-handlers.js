// Dialog handlers for options page
document.addEventListener('DOMContentLoaded', () => {
  // Get all dialogs
  const importDialog = document.getElementById('import-strategy-dialog');
  const deleteDialog1 = document.getElementById('delete-all-confirm-dialog-1');
  const deleteDialog2 = document.getElementById('delete-all-confirm-dialog-2');
  const deleteConfirmError = document.getElementById('delete-confirm-error');

  // Hook up import dialog buttons
  if (importDialog) {
    const mergeBtn = document.getElementById('merge-import-strategy');
    const replaceBtn = document.getElementById('replace-import-strategy');
    const clearBtn = document.getElementById('clear-import-strategy');
    const cancelBtn = document.getElementById('cancel-import-strategy');

    if (mergeBtn) mergeBtn.addEventListener('click', () => handleImportStrategy('merge'));
    if (replaceBtn) replaceBtn.addEventListener('click', () => handleImportStrategy('replace'));
    if (clearBtn) clearBtn.addEventListener('click', () => handleImportStrategy('clear'));
    if (cancelBtn) cancelBtn.addEventListener('click', () => hideImportDialog());
  }

  // Hook up delete confirmation dialog 1 buttons
  if (deleteDialog1) {
    const confirmBtn = document.getElementById('confirm-delete');
    const cancelBtn = document.getElementById('cancel-delete');

    if (confirmBtn) confirmBtn.addEventListener('click', () => showDeleteConfirmDialog2());
    if (cancelBtn) cancelBtn.addEventListener('click', () => hideDeleteDialog1());
  }

  // Hook up delete confirmation dialog 2 buttons
  if (deleteDialog2) {
    const proceedBtn = document.getElementById('proceed-delete');
    const cancelBtn = document.getElementById('cancel-delete-2');
    const textInput = document.getElementById('confirm-text-input');

    if (proceedBtn) proceedBtn.addEventListener('click', () => validateDeleteConfirmation());
    if (cancelBtn) cancelBtn.addEventListener('click', () => hideDeleteDialog2());
    if (textInput) textInput.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') validateDeleteConfirmation();
    });
  }

  // File input handler
  const fileInput = document.getElementById('cookie-file-input');
  const importBtn = document.getElementById('import-cookies');
  
  if (fileInput && importBtn) {
    importBtn.addEventListener('click', () => {
      fileInput.click();
    });
    
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleFileImport(e);
      }
    });
  }

  // Listen for the show-import-dialog custom event
  document.addEventListener('show-import-dialog', (e) => {
    const cookieCount = e.detail.cookieCount;
    showImportDialog(cookieCount);
  });

  // Functions for dialog management
  function showImportDialog(cookieCount) {
    if (!importDialog) return;
    
    const countElement = document.getElementById('import-cookie-count');
    if (countElement) {
      countElement.textContent = cookieCount || '0';
    }
    
    importDialog.style.display = 'flex';
  }

  function hideImportDialog() {
    if (importDialog) {
      importDialog.style.display = 'none';
    }
  }

  function showDeleteDialog1() {
    if (deleteDialog1) {
      deleteDialog1.style.display = 'flex';
    }
  }

  function hideDeleteDialog1() {
    if (deleteDialog1) {
      deleteDialog1.style.display = 'none';
    }
  }

  function showDeleteConfirmDialog2() {
    hideDeleteDialog1();
    
    if (deleteDialog2) {
      deleteDialog2.style.display = 'flex';
      
      // Reset any previous error
      if (deleteConfirmError) {
        deleteConfirmError.style.display = 'none';
      }
      
      // Focus the input
      const textInput = document.getElementById('confirm-text-input');
      if (textInput) {
        textInput.value = '';
        setTimeout(() => textInput.focus(), 100);
      }
    }
  }

  function hideDeleteDialog2() {
    if (deleteDialog2) {
      deleteDialog2.style.display = 'none';
    }
  }

  function validateDeleteConfirmation() {
    const textInput = document.getElementById('confirm-text-input');
    
    if (!textInput) return;
    
    if (textInput.value === 'CONFIRM') {
      // This is handled by options-v2.js
      document.dispatchEvent(new CustomEvent('delete-all-cookies-confirmed'));
      hideDeleteDialog2();
    } else {
      // Show error
      if (deleteConfirmError) {
        deleteConfirmError.textContent = 'Please type CONFIRM in all caps to proceed.';
        deleteConfirmError.style.display = 'block';
      }
    }
  }

  function handleImportStrategy(strategy) {
    // This is handled by options-v2.js
    document.dispatchEvent(new CustomEvent('import-strategy-selected', { 
      detail: { strategy } 
    }));
    
    hideImportDialog();
  }

  function handleFileImport(event) {
    // This is handled by options-v2.js
    document.dispatchEvent(new CustomEvent('import-file-selected', { 
      detail: { event } 
    }));
  }
  
  // Delete All button event listener
  const deleteAllBtn = document.getElementById('delete-all');
  if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', () => {
      showDeleteDialog1();
    });
  }
  
  // Export buttons
  const exportJsonBtn = document.getElementById('export-all-json');
  const exportNetscapeBtn = document.getElementById('export-all-netscape');
  
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('export-all-json'));
    });
  }
  
  if (exportNetscapeBtn) {
    exportNetscapeBtn.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('export-all-netscape'));
    });
  }
  
  // Reset confirmations button
  const resetConfirmationsBtn = document.getElementById('reset-confirmations');
  
  if (resetConfirmationsBtn) {
    resetConfirmationsBtn.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('reset-confirmations'));
    });
  }
}); 