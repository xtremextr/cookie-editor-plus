// Cookie Manager JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const searchInput = document.getElementById('cookie-search');
    const domainFilter = document.getElementById('domain-filter');
    const cookieTable = document.getElementById('cookie-table');
    const cookieTableBody = document.getElementById('cookie-tbody');
    const selectAllCheckbox = document.getElementById('select-all');
    const batchDeleteBtn = document.getElementById('batch-delete');
    const batchExportBtn = document.getElementById('batch-export');
    const paginationContainer = document.getElementById('pagination');
    const loadingOverlay = document.getElementById('loading-overlay');
    const noResultsMessage = document.getElementById('no-results');
    const domainTabs = document.querySelector('.domain-tabs');
    
    // State variables
    let allCookies = [];
    let filteredCookies = [];
    let selectedCookies = new Set();
    let currentPage = 1;
    let itemsPerPage = 10;
    let domains = new Set();
    let currentDomain = 'all';
    
    // Initialize
    init();
    
    // Event Listeners
    searchInput.addEventListener('input', filterCookies);
    domainFilter.addEventListener('change', filterCookies);
    selectAllCheckbox.addEventListener('change', toggleSelectAll);
    batchDeleteBtn.addEventListener('click', batchDelete);
    batchExportBtn.addEventListener('click', batchExport);
    
    // Functions
    function init() {
        showLoading(true);
        fetchAllCookies()
            .then(cookies => {
                allCookies = cookies;
                extractDomains();
                populateDomainFilter();
                createDomainTabs();
                filterCookies();
                showLoading(false);
            })
            .catch(error => {
                console.error('Error initializing cookie manager:', error);
                showLoading(false);
                showNotification('Error loading cookies', 'error');
            });
    }
    
    function fetchAllCookies() {
        return new Promise((resolve) => {
            chrome.cookies.getAll({}, function(cookies) {
                resolve(cookies || []);
            });
        });
    }
    
    function extractDomains() {
        domains = new Set();
        domains.add('all');
        
        allCookies.forEach(cookie => {
            const domain = cookie.domain.startsWith('.') ? 
                cookie.domain.substring(1) : cookie.domain;
            domains.add(domain);
        });
    }
    
    function populateDomainFilter() {
        domainFilter.innerHTML = '';
        domains.forEach(domain => {
            const option = document.createElement('option');
            option.value = domain;
            option.textContent = domain === 'all' ? 'All Domains' : domain;
            domainFilter.appendChild(option);
        });
    }
    
    function createDomainTabs() {
        domainTabs.innerHTML = '';
        domains.forEach(domain => {
            const tab = document.createElement('button');
            tab.classList.add('domain-tab');
            if (domain === 'all') tab.classList.add('active');
            tab.textContent = domain === 'all' ? 'All Domains' : domain;
            tab.dataset.domain = domain;
            tab.addEventListener('click', () => {
                document.querySelectorAll('.domain-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                currentDomain = domain;
                domainFilter.value = domain;
                filterCookies();
            });
            domainTabs.appendChild(tab);
        });
    }
    
    function filterCookies() {
        const searchTerm = searchInput.value.toLowerCase();
        const domainValue = domainFilter.value;
        currentDomain = domainValue;
        
        // Update active tab
        document.querySelectorAll('.domain-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.domain === currentDomain);
        });
        
        filteredCookies = allCookies.filter(cookie => {
            const matchesDomain = domainValue === 'all' || cookie.domain.includes(domainValue);
            const matchesSearch = searchTerm === '' || 
                cookie.name.toLowerCase().includes(searchTerm) || 
                cookie.domain.toLowerCase().includes(searchTerm) || 
                (cookie.value && cookie.value.toLowerCase().includes(searchTerm));
            
            return matchesDomain && matchesSearch;
        });
        
        currentPage = 1;
        renderCookieTable();
        updatePagination();
        updateBatchButtons();
    }
    
    function renderCookieTable() {
        cookieTableBody.innerHTML = '';
        
        if (filteredCookies.length === 0) {
            noResultsMessage.style.display = 'block';
            cookieTable.style.display = 'none';
            paginationContainer.style.display = 'none';
            return;
        }
        
        noResultsMessage.style.display = 'none';
        cookieTable.style.display = 'table';
        
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, filteredCookies.length);
        
        for (let i = startIndex; i < endIndex; i++) {
            const cookie = filteredCookies[i];
            const row = document.createElement('tr');
            
            // Checkbox column
            const checkboxCell = document.createElement('td');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = selectedCookies.has(getCookieId(cookie));
            checkbox.addEventListener('change', () => toggleCookieSelection(cookie, checkbox.checked));
            checkboxCell.appendChild(checkbox);
            
            // Name column
            const nameCell = document.createElement('td');
            nameCell.textContent = cookie.name;
            
            // Domain column
            const domainCell = document.createElement('td');
            domainCell.textContent = cookie.domain || '[Current Domain]';
            
            // Path column
            const pathCell = document.createElement('td');
            pathCell.textContent = cookie.path;
            
            // Expiration column
            const expirationCell = document.createElement('td');
            expirationCell.textContent = cookie.expirationDate ? 
                new Date(cookie.expirationDate * 1000).toLocaleString() : 'Session';
            
            // Attributes column (combining all flags into one cell with badges)
            const attributesCell = document.createElement('td');
            attributesCell.className = 'cookie-attributes-cell';
            
            if (cookie.secure) {
                const secureTag = document.createElement('span');
                secureTag.className = 'cookie-tag secure';
                secureTag.textContent = 'Secure';
                attributesCell.appendChild(secureTag);
            }
            
            if (cookie.httpOnly) {
                const httpOnlyTag = document.createElement('span');
                httpOnlyTag.className = 'cookie-tag httponly';
                httpOnlyTag.textContent = 'HttpOnly';
                attributesCell.appendChild(httpOnlyTag);
            }
            
            // Always check hostOnly flag, even with null domain
            if (cookie.hostOnly || cookie.domain === null) {
                const hostOnlyTag = document.createElement('span');
                hostOnlyTag.className = 'cookie-tag hostonly';
                hostOnlyTag.textContent = 'HostOnly';
                attributesCell.appendChild(hostOnlyTag);
            }
            
            if (!cookie.expirationDate) {
                const sessionTag = document.createElement('span');
                sessionTag.className = 'cookie-tag session';
                sessionTag.textContent = 'Session';
                attributesCell.appendChild(sessionTag);
            }
            
            if (cookie.sameSite && cookie.sameSite !== 'no_restriction') {
                const sameSiteTag = document.createElement('span');
                sameSiteTag.className = `cookie-tag samesite ${cookie.sameSite.toLowerCase()}`;
                sameSiteTag.textContent = `SameSite: ${cookie.sameSite}`;
                attributesCell.appendChild(sameSiteTag);
            }
            
            // Actions column
            const actionsCell = document.createElement('td');
            actionsCell.className = 'cookie-actions';
            
            const viewBtn = document.createElement('button');
            viewBtn.className = 'action-btn view-btn';
            viewBtn.innerHTML = '<i class="fas fa-eye"></i>';
            viewBtn.setAttribute('title', 'View Cookie');
            viewBtn.addEventListener('click', () => viewCookie(cookie));
            
            const editBtn = document.createElement('button');
            editBtn.className = 'action-btn edit-btn';
            editBtn.innerHTML = '<i class="fas fa-edit"></i>';
            editBtn.setAttribute('title', 'Edit Cookie');
            editBtn.addEventListener('click', () => editCookie(cookie));
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'action-btn delete-btn';
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.setAttribute('title', 'Delete Cookie');
            deleteBtn.addEventListener('click', () => deleteCookie(cookie));
            
            actionsCell.appendChild(viewBtn);
            actionsCell.appendChild(editBtn);
            actionsCell.appendChild(deleteBtn);
            
            // Add all cells to the row
            row.appendChild(checkboxCell);
            row.appendChild(nameCell);
            row.appendChild(domainCell);
            row.appendChild(pathCell);
            row.appendChild(expirationCell);
            row.appendChild(attributesCell);
            row.appendChild(actionsCell);
            
            cookieTableBody.appendChild(row);
        }
        
        paginationContainer.style.display = filteredCookies.length > itemsPerPage ? 'flex' : 'none';
    }
    
    function updatePagination() {
        paginationContainer.innerHTML = '';
        
        if (filteredCookies.length <= itemsPerPage) return;
        
        const totalPages = Math.ceil(filteredCookies.length / itemsPerPage);
        
        // Previous button
        const prevBtn = document.createElement('button');
        prevBtn.textContent = '←';
        prevBtn.disabled = currentPage === 1;
        prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderCookieTable();
                updatePagination();
            }
        });
        paginationContainer.appendChild(prevBtn);
        
        // Page numbers
        const startPage = Math.max(1, currentPage - 2);
        const endPage = Math.min(totalPages, startPage + 4);
        
        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.textContent = i;
            pageBtn.classList.toggle('active', i === currentPage);
            pageBtn.addEventListener('click', () => {
                currentPage = i;
                renderCookieTable();
                updatePagination();
            });
            paginationContainer.appendChild(pageBtn);
        }
        
        // Next button
        const nextBtn = document.createElement('button');
        nextBtn.textContent = '→';
        nextBtn.disabled = currentPage === totalPages;
        nextBtn.addEventListener('click', () => {
            if (currentPage < totalPages) {
                currentPage++;
                renderCookieTable();
                updatePagination();
            }
        });
        paginationContainer.appendChild(nextBtn);
    }
    
    function getCookieId(cookie) {
        return `${cookie.domain}|${cookie.path}|${cookie.name}`;
    }
    
    function toggleCookieSelection(cookie, isSelected) {
        const cookieId = getCookieId(cookie);
        
        if (isSelected) {
            selectedCookies.add(cookieId);
        } else {
            selectedCookies.delete(cookieId);
        }
        
        updateBatchButtons();
    }
    
    function toggleSelectAll() {
        const isChecked = selectAllCheckbox.checked;
        
        if (isChecked) {
            filteredCookies.forEach(cookie => {
                selectedCookies.add(getCookieId(cookie));
            });
        } else {
            filteredCookies.forEach(cookie => {
                selectedCookies.delete(getCookieId(cookie));
            });
        }
        
        renderCookieTable();
        updateBatchButtons();
    }
    
    function updateBatchButtons() {
        const hasSelection = selectedCookies.size > 0;
        batchDeleteBtn.disabled = !hasSelection;
        batchExportBtn.disabled = !hasSelection;
    }
    
    function viewCookie(cookie) {
        // Create modal for viewing cookie details
        const modal = createModal('View Cookie');
        
        const content = document.createElement('div');
        content.classList.add('cookie-details');
        
        // Format cookie value for display
        let formattedValue = cookie.value;
        try {
            // Try to parse as JSON for better formatting
            const parsedValue = JSON.parse(cookie.value);
            formattedValue = JSON.stringify(parsedValue, null, 2);
        } catch (e) {
            // Not valid JSON, use as is
        }
        
        content.innerHTML = `
            <div class="detail-row">
                <span class="detail-label">Name:</span>
                <span class="detail-value">${escapeHtml(cookie.name)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Domain:</span>
                <span class="detail-value">${escapeHtml(cookie.domain)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Path:</span>
                <span class="detail-value">${escapeHtml(cookie.path)}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Expiration:</span>
                <span class="detail-value">${cookie.expirationDate ? 
                    new Date(cookie.expirationDate * 1000).toLocaleString() : 'Session'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">HttpOnly:</span>
                <span class="detail-value">${cookie.httpOnly ? 'Yes' : 'No'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Secure:</span>
                <span class="detail-value">${cookie.secure ? 'Yes' : 'No'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">SameSite:</span>
                <span class="detail-value">${cookie.sameSite || 'Not specified'}</span>
            </div>
            <div class="detail-row value-row">
                <span class="detail-label">Value:</span>
                <pre class="detail-value cookie-value">${escapeHtml(formattedValue)}</pre>
            </div>
        `;
        
        modal.appendChild(content);
        
        // Add close button
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.classList.add('btn', 'primary-btn');
        closeBtn.addEventListener('click', () => {
            closeModal(modal);
        });
        
        const buttonContainer = document.createElement('div');
        buttonContainer.classList.add('modal-buttons');
        buttonContainer.appendChild(closeBtn);
        modal.appendChild(buttonContainer);
        
        openModal(modal);
    }
    
    function editCookie(cookie) {
        const modal = createModal('Edit Cookie');
        
        const form = document.createElement('form');
        form.classList.add('cookie-form');
        
        form.innerHTML = `
            <div class="form-group">
                <label for="edit-name">Name</label>
                <input type="text" id="edit-name" value="${escapeHtml(cookie.name)}" readonly>
                <small>Cookie name cannot be modified</small>
            </div>
            <div class="form-group">
                <label for="edit-domain">Domain</label>
                <input type="text" id="edit-domain" value="${escapeHtml(cookie.domain)}" ${cookie.hostOnly ? 'disabled' : 'readonly'}>
                <small>${cookie.hostOnly ? 'Domain locked (Host Only cookie)' : 'Domain cannot be modified'}</small>
            </div>
            <div class="form-group">
                <label for="edit-path">Path</label>
                <input type="text" id="edit-path" value="${escapeHtml(cookie.path)}" readonly>
                <small>Path cannot be modified</small>
            </div>
            <div class="form-group">
                <label for="edit-value">Value</label>
                <textarea id="edit-value" rows="5">${escapeHtml(cookie.value)}</textarea>
            </div>
            <div class="form-group">
                <label for="edit-expiration">Expiration</label>
                <input type="datetime-local" id="edit-expiration" ${cookie.expirationDate ? 
                    `value="${formatDateForInput(new Date(cookie.expirationDate * 1000))}"` : ''}>
                <small>Leave empty for session cookie</small>
            </div>
            <div class="cookie-attributes">
                <div class="cookie-attribute">
                    <input type="checkbox" id="edit-httpOnly" ${cookie.httpOnly ? 'checked' : ''}>
                    <label for="edit-httpOnly">HTTP Only</label>
                </div>
                <div class="cookie-attribute">
                    <input type="checkbox" id="edit-secure" ${cookie.secure ? 'checked' : ''}>
                    <label for="edit-secure">Secure</label>
                </div>
                <div class="cookie-attribute">
                    <input type="checkbox" id="edit-session" ${!cookie.expirationDate ? 'checked' : ''}>
                    <label for="edit-session">Session</label>
                </div>
                <div class="cookie-attribute">
                    <input type="checkbox" id="edit-hostOnly" ${cookie.hostOnly ? 'checked' : ''}>
                    <label for="edit-hostOnly">Host Only</label>
                </div>
            </div>
            <div class="form-group">
                <label for="edit-sameSite">SameSite</label>
                <select id="edit-sameSite">
                    <option value="no_restriction" ${!cookie.sameSite || cookie.sameSite === 'no_restriction' ? 'selected' : ''}>No Restriction</option>
                    <option value="lax" ${cookie.sameSite === 'lax' ? 'selected' : ''}>Lax</option>
                    <option value="strict" ${cookie.sameSite === 'strict' ? 'selected' : ''}>Strict</option>
                </select>
            </div>
        `;
        
        modal.appendChild(form);
        
        // Add event listeners for the checkboxes
        const hostOnlyCheckbox = form.querySelector('#edit-hostOnly');
        const domainInput = form.querySelector('#edit-domain');
        const sessionCheckbox = form.querySelector('#edit-session');
        const expirationInput = form.querySelector('#edit-expiration');
        
        // Add event listener for hostOnly checkbox to toggle domain input
        if (hostOnlyCheckbox && domainInput) {
            hostOnlyCheckbox.addEventListener('change', function() {
                domainInput.disabled = this.checked;
                domainInput.placeholder = this.checked ? 'Domain locked (Host Only cookie)' : '';
            });
        }
        
        // Add event listener for session checkbox to toggle expiration input
        if (sessionCheckbox && expirationInput) {
            sessionCheckbox.addEventListener('change', function() {
                expirationInput.disabled = this.checked;
            });
        }
        
        // Add buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.classList.add('modal-buttons');
        
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.classList.add('btn', 'secondary-btn');
        cancelBtn.addEventListener('click', () => {
            closeModal(modal);
        });
        
        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save';
        saveBtn.classList.add('btn', 'primary-btn');
        saveBtn.addEventListener('click', () => {
            const updatedCookie = {
                url: getCookieUrl(cookie),
                name: cookie.name,
                value: document.getElementById('edit-value').value,
                domain: document.getElementById('edit-domain').value,
                path: cookie.path,
                secure: document.getElementById('edit-secure').checked,
                httpOnly: document.getElementById('edit-httpOnly').checked,
                sameSite: document.getElementById('edit-sameSite').value,
                hostOnly: document.getElementById('edit-hostOnly').checked
            };
            
            const isSession = document.getElementById('edit-session').checked;
            if (!isSession) {
                const expirationInput = document.getElementById('edit-expiration').value;
                if (expirationInput) {
                    updatedCookie.expirationDate = new Date(expirationInput).getTime() / 1000;
                }
            }
            
            showLoading(true);
            
            // First remove the existing cookie
            chrome.cookies.remove({
                url: getCookieUrl(cookie),
                name: cookie.name
            }, () => {
                // Then set the updated cookie
                chrome.cookies.set(updatedCookie, (result) => {
                    showLoading(false);
                    if (result) {
                        closeModal(modal);
                        showNotification('Cookie updated successfully', 'success');
                        init(); // Refresh the cookie list
                    } else {
                        const error = chrome.runtime.lastError;
                        showNotification(`Failed to update cookie: ${error ? error.message : 'Unknown error'}`, 'error');
                    }
                });
            });
        });
        
        buttonContainer.appendChild(cancelBtn);
        buttonContainer.appendChild(saveBtn);
        modal.appendChild(buttonContainer);
        
        openModal(modal);
    }
    
    function deleteCookie(cookie) {
        if (confirm(`Are you sure you want to delete the cookie "${cookie.name}"?`)) {
            showLoading(true);
            
            chrome.cookies.remove({
                url: getCookieUrl(cookie),
                name: cookie.name
            }, (details) => {
                showLoading(false);
                
                if (details) {
                    showNotification('Cookie deleted successfully', 'success');
                    
                    // Remove from selected cookies if it was selected
                    selectedCookies.delete(getCookieId(cookie));
                    
                    // Remove from filtered and all cookies arrays
                    allCookies = allCookies.filter(c => getCookieId(c) !== getCookieId(cookie));
                    filterCookies(); // This will update filteredCookies and re-render
                } else {
                    const error = chrome.runtime.lastError;
                    showNotification(`Failed to delete cookie: ${error ? error.message : 'Unknown error'}`, 'error');
                }
            });
        }
    }
    
    function batchDelete() {
        if (selectedCookies.size === 0) return;
        
        if (confirm(`Are you sure you want to delete ${selectedCookies.size} cookies?`)) {
            showLoading(true);
            
            const deletePromises = [];
            const selectedCookieIds = Array.from(selectedCookies);
            
            selectedCookieIds.forEach(cookieId => {
                const cookie = allCookies.find(c => getCookieId(c) === cookieId);
                if (cookie) {
                    deletePromises.push(new Promise((resolve) => {
                        chrome.cookies.remove({
                            url: getCookieUrl(cookie),
                            name: cookie.name
                        }, (details) => {
                            resolve(details ? cookieId : null);
                        });
                    }));
                }
            });
            
            Promise.all(deletePromises).then(results => {
                const successfulDeletes = results.filter(id => id !== null);
                
                // Update cookies arrays
                successfulDeletes.forEach(cookieId => {
                    allCookies = allCookies.filter(c => getCookieId(c) !== cookieId);
                    selectedCookies.delete(cookieId);
                });
                
                showLoading(false);
                showNotification(`${successfulDeletes.length} cookies deleted successfully`, 'success');
                
                filterCookies(); // Re-render the table
            });
        }
    }
    
    function batchExport() {
        if (selectedCookies.size === 0) return;
        
        const selectedCookiesArray = [];
        
        selectedCookies.forEach(cookieId => {
            const cookie = allCookies.find(c => getCookieId(c) === cookieId);
            if (cookie) {
                selectedCookiesArray.push(cookie);
            }
        });
        
        if (selectedCookiesArray.length === 0) return;
        
        const exportData = JSON.stringify(selectedCookiesArray, null, 2);
        const blob = new Blob([exportData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `cookies_export_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
        
        showNotification(`${selectedCookiesArray.length} cookies exported successfully`, 'success');
    }
    
    // Utility functions
    function getCookieUrl(cookie) {
        const prefix = cookie.secure ? 'https://' : 'http://';
        const domain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
        return prefix + domain + cookie.path;
    }
    
    function formatDateForInput(date) {
        const pad = (num) => num.toString().padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
    
    function escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    
    function createModal(title) {
        const modalOverlay = document.createElement('div');
        modalOverlay.classList.add('modal-overlay');
        
        const modal = document.createElement('div');
        modal.classList.add('modal');
        
        const modalHeader = document.createElement('div');
        modalHeader.classList.add('modal-header');
        
        const modalTitle = document.createElement('h3');
        modalTitle.textContent = title;
        
        const closeButton = document.createElement('button');
        closeButton.classList.add('modal-close');
        closeButton.innerHTML = '&times;';
        closeButton.addEventListener('click', () => {
            closeModal(modalOverlay);
        });
        
        modalHeader.appendChild(modalTitle);
        modalHeader.appendChild(closeButton);
        
        modal.appendChild(modalHeader);
        modalOverlay.appendChild(modal);
        
        document.body.appendChild(modalOverlay);
        
        return modal;
    }
    
    function openModal(modal) {
        const overlay = modal.parentElement;
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
    
    function closeModal(element) {
        const overlay = element.classList.contains('modal') ? element.parentElement : element;
        overlay.classList.remove('active');
        setTimeout(() => {
            document.body.removeChild(overlay);
            document.body.style.overflow = '';
        }, 300);
    }
    
    function showLoading(show) {
        loadingOverlay.style.display = show ? 'flex' : 'none';
    }
    
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.classList.add('notification', `notification-${type}`);
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.classList.add('active');
        }, 10);
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            notification.classList.remove('active');
            setTimeout(() => {
                if (notification.parentNode) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}); 