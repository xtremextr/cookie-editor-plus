import { ProfileManager } from '../lib/profileManager.js';
// We might need more imports later as we untangle dependencies
// For now, let's focus on moving the core profile code.

let profileManager;
let profileSelector;
let domainProfileMenu;
let profileActionsButton;
let showProfileLoadConfirmation = true;
let showDeleteProfileConfirmation = true;
let isProfileLoading = false;

// Placeholder for dependencies that might be needed by moved functions
let sharedDependencies = {};

/**
 * Saves the expanded/collapsed state of the profile panel to local storage.
 * @param {boolean} isExpanded - True if the panel is expanded, false otherwise.
 */
async function saveProfilePanelState(isExpanded) {
    if (!sharedDependencies.storageHandler) return;
    try {
        await sharedDependencies.storageHandler.setLocal('profilePanelExpanded', isExpanded);
    } catch (error) {
        console.error("Error saving profile panel state:", error);
    }
}

/**
 * Toggles the visibility of the profile management panel with animation.
 */
function toggleProfilePanel() {
    const profilePanel = document.getElementById('profile-management');
    const profileToggle = document.getElementById('profile-toggle'); // Assuming the toggle icon exists
    if (!profilePanel) return;

    const isExpanded = !profilePanel.classList.contains('collapsed');
    const content = profilePanel.querySelector('.panel-section-content');

    if (isExpanded) {
        // Collapse
        const currentHeight = content.scrollHeight + 'px';
        content.style.height = currentHeight; // Set explicit height for transition
        requestAnimationFrame(() => { // Ensure style is applied before starting transition
            content.style.height = '0';
            profilePanel.classList.add('collapsing');
        });
        profilePanel.removeEventListener('transitionend', function cleanupExpandHeight() {
            content.style.height = ''; // Remove inline height after expansion
            profilePanel.classList.remove('expanding');
        });
        profilePanel.addEventListener('transitionend', function addCollapsedClass() {
            profilePanel.classList.remove('collapsing');
            profilePanel.classList.add('collapsed');
            content.style.height = ''; // Clean up inline style
            if (profileToggle) profileToggle.setAttribute('aria-expanded', 'false');
            saveProfilePanelState(false);
            profilePanel.removeEventListener('transitionend', addCollapsedClass); // Clean up listener
        }, { once: true });

    } else {
        // Expand
        profilePanel.classList.remove('collapsed');
        profilePanel.classList.add('expanding');
        const targetHeight = content.scrollHeight + 'px';
        content.style.height = '0'; // Start from 0

        requestAnimationFrame(() => { // Allow collapsing styles to apply if needed
            requestAnimationFrame(() => { // Start transition
                content.style.height = targetHeight;
            });
        });

        profilePanel.removeEventListener('transitionend', function addCollapsedClass() {
            profilePanel.classList.remove('collapsing');
            profilePanel.classList.add('collapsed');
            content.style.height = ''; // Clean up inline style
            if (profileToggle) profileToggle.setAttribute('aria-expanded', 'false');
            saveProfilePanelState(false);
            profilePanel.removeEventListener('transitionend', addCollapsedClass);
        });
        profilePanel.addEventListener('transitionend', function cleanupExpandHeight() {
            content.style.height = ''; // Remove inline height after expansion
            profilePanel.classList.remove('expanding');
            if (profileToggle) profileToggle.setAttribute('aria-expanded', 'true');
            saveProfilePanelState(true);
             profilePanel.removeEventListener('transitionend', cleanupExpandHeight); // Clean up listener
        }, { once: true });
    }
}


/**
 * Initializes the profile panel state (expanded/collapsed) based on stored preference.
 */
async function initProfilePanelState() {
    if (!sharedDependencies.storageHandler) return;
    const profilePanel = document.getElementById('profile-management');
    const profileToggle = document.getElementById('profile-toggle'); // Get the toggle icon
    const content = profilePanel?.querySelector('.panel-section-content');
    if (!profilePanel || !content) return;

    try {
        const isExpanded = await sharedDependencies.storageHandler.getLocal('profilePanelExpanded', true); // Default to expanded
        if (isExpanded) {
            profilePanel.classList.remove('collapsed');
            content.style.height = ''; // Ensure no leftover inline style
            if (profileToggle) profileToggle.setAttribute('aria-expanded', 'true');
        } else {
            profilePanel.classList.add('collapsed');
            content.style.height = '0'; // Start collapsed
            if (profileToggle) profileToggle.setAttribute('aria-expanded', 'false');
        }
    } catch (error) {
        console.error("Error initializing profile panel state:", error);
        // Default to expanded state on error
        profilePanel.classList.remove('collapsed');
        content.style.height = '';
        if (profileToggle) profileToggle.setAttribute('aria-expanded', 'true');
    }
}

/**
 * Toggles the visibility of the domain-specific profile actions menu.
 * @param {Event} e - The click event.
 */
function toggleDomainActionsMenu(e) {
    e.stopPropagation(); // Prevent triggering document click listener immediately
    if (!domainProfileMenu) return;
    domainProfileMenu.classList.toggle('visible');

     // Add or remove the listener to close the menu when clicking outside
     if (domainProfileMenu.classList.contains('visible')) {
        document.addEventListener('click', closeDomainActionsMenuOnClickOutside, { once: true });
    } else {
        document.removeEventListener('click', closeDomainActionsMenuOnClickOutside);
    }
}

/**
 * Closes the domain actions menu if a click occurs outside of it.
 * @param {Event} e - The click event.
 */
function closeDomainActionsMenuOnClickOutside(e) {
    if (domainProfileMenu && !domainProfileMenu.contains(e.target) && e.target !== profileActionsButton) {
        domainProfileMenu.classList.remove('visible');
    } else if (domainProfileMenu && domainProfileMenu.classList.contains('visible')) {
        // If the click was inside, re-add the listener for the next click outside
        document.addEventListener('click', closeDomainActionsMenuOnClickOutside, { once: true });
    }
}


/**
 * Updates the profile selector dropdown with profiles for the given domain.
 * @param {string} domain - The domain to load profiles for.
 */
export async function updateProfileSelector(domain) {
    if (!profileSelector || !profileManager) return; // Ensure elements and manager exist

    const previouslySelectedProfile = profileSelector.value; // Remember selection
    const defaultOptionValue = '__none__'; // Value for the default "No Profile" option

    // Clear existing options except the default placeholder if it exists
    while (profileSelector.options.length > 1) {
        profileSelector.remove(1);
    }
     // Ensure the default option exists and is correct
     let defaultOption = profileSelector.options[0];
     if (!defaultOption || defaultOption.value !== defaultOptionValue) {
         if (defaultOption) profileSelector.remove(0); // Remove incorrect default if present
         defaultOption = document.createElement('option');
         defaultOption.value = defaultOptionValue;
         defaultOption.textContent = '-- No Profile --'; // Or similar text
         profileSelector.insertBefore(defaultOption, profileSelector.firstChild);
     } else {
         // Ensure the default option is unselected initially unless it was the previous selection
         if (previouslySelectedProfile !== defaultOptionValue) {
             defaultOption.selected = false;
         }
     }


    if (!domain) {
        // No domain, disable profile features and ensure default option is selected
        profileSelector.disabled = true;
        profileSelector.value = defaultOptionValue;
        // Disable profile action buttons
        const actionButtons = ['save-profile', 'load-profile', 'edit-profile', 'delete-profile'];
        actionButtons.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.disabled = true;
        });
         // Disable domain profile actions button
         if (profileActionsButton) profileActionsButton.disabled = true;
        updateProfileStatusIndicator(null); // Clear status
        return;
    }

    // Domain exists, enable selector
    profileSelector.disabled = false;
     // Enable domain profile actions button
     if (profileActionsButton) profileActionsButton.disabled = false;

    try {
        const profiles = await profileManager.getProfilesForDomain(domain);
        let foundPreviousSelection = false;

        if (profiles && Object.keys(profiles).length > 0) {
            Object.keys(profiles).sort().forEach(profileName => {
                const option = document.createElement('option');
                option.value = profileName;
                option.textContent = profileName;
                profileSelector.appendChild(option);
                if (profileName === previouslySelectedProfile) {
                    option.selected = true;
                    foundPreviousSelection = true;
                }
            });
        }

        // If previous selection not found (e.g., deleted), default to "No Profile"
        if (!foundPreviousSelection) {
            profileSelector.value = defaultOptionValue;
        }

        // Update button states based on selection
        handleProfileSelectionChange(); // Trigger update for button enable/disable state
        updateProfileStatusIndicator(domain); // Update status based on current cookies vs selected profile

    } catch (error) {
        console.error(`Error loading profiles for domain ${domain}:`, error);
        sharedDependencies.sendNotification(`Error loading profiles: ${error.message}`, true);
        profileSelector.disabled = true; // Disable on error
        profileSelector.value = defaultOptionValue;
        if (profileActionsButton) profileActionsButton.disabled = true;
        updateProfileStatusIndicator(null); // Clear status on error
    }
}


/**
 * Updates the visual indicator showing if the current cookies match the selected profile.
 * @param {string | null} domain - The current domain, or null if no domain context.
 */
export async function updateProfileStatusIndicator(domain) {
    const statusIndicator = document.getElementById('profile-status-indicator');
    const loadBtn = document.getElementById('load-profile'); // Get load button to change its text/state

    if (!statusIndicator || !profileManager) return; // Need indicator and manager

    // Hide indicator and reset load button if no domain or no profile selected
    if (!domain || !profileSelector || profileSelector.value === '__none__') {
        statusIndicator.classList.add('hidden');
        statusIndicator.classList.remove('saved', 'modified', 'loading');
        statusIndicator.title = '';
        if (loadBtn) {
            loadBtn.textContent = 'Load'; // Reset button text
            // Ensure load button is disabled if no profile is selected
             loadBtn.disabled = (!profileSelector || profileSelector.value === '__none__');
        }
        return;
    }

    const selectedProfile = profileSelector.value;

    // Add loading state if applicable (consider if needed here or handled elsewhere)
     if (isProfileLoading) {
        statusIndicator.classList.remove('hidden', 'saved', 'modified');
        statusIndicator.classList.add('loading');
        statusIndicator.title = 'Profile loading...';
        if (loadBtn) loadBtn.textContent = 'Loading...';
        return; // Don't check match while loading
    }


    try {
        const matchStatus = await profileManager.checkProfileMatch(domain, selectedProfile, sharedDependencies.loadedCookies);

        statusIndicator.classList.remove('hidden', 'loading'); // Ensure visible and not loading

        if (matchStatus.match) {
            statusIndicator.classList.add('saved');
            statusIndicator.classList.remove('modified');
            statusIndicator.title = `Cookies match profile '${selectedProfile}'.`;
             if (loadBtn) loadBtn.textContent = 'Reload'; // Change text to Reload/Refresh
        } else {
            statusIndicator.classList.remove('saved');
            statusIndicator.classList.add('modified');
            statusIndicator.title = `Cookies differ from profile '${selectedProfile}'. Reason: ${matchStatus.reason}`;
             if (loadBtn) loadBtn.textContent = 'Load'; // Change text back to Load
        }
         // Ensure load button is enabled since a profile is selected
        if (loadBtn) loadBtn.disabled = false;

    } catch (error) {
        console.error(`Error checking profile match for ${selectedProfile} on ${domain}:`, error);
        statusIndicator.classList.add('hidden'); // Hide on error
        statusIndicator.classList.remove('saved', 'modified', 'loading');
        statusIndicator.title = 'Error checking profile status.';
        if (loadBtn) {
            loadBtn.textContent = 'Load'; // Reset text on error
            loadBtn.disabled = false; // Still allow attempting to load
        }
        // Optionally send a notification
        // sharedDependencies.sendNotification(`Error checking profile status: ${error.message}`, true);
    }
}


/**
 * Handles changes in the profile selector dropdown.
 */
function handleProfileSelectionChange() {
    const selectedValue = profileSelector.value;
    const isProfileSelected = selectedValue && selectedValue !== '__none__';

    // Enable/disable buttons based on whether a profile is selected
    const loadBtn = document.getElementById('load-profile');
    const editBtn = document.getElementById('edit-profile');
    const deleteBtn = document.getElementById('delete-profile');

    if (loadBtn) loadBtn.disabled = !isProfileSelected;
    if (editBtn) editBtn.disabled = !isProfileSelected;
    if (deleteBtn) deleteBtn.disabled = !isProfileSelected;

    // Update the status indicator based on the new selection
    // Need the current domain - assuming it's accessible via a shared mechanism or global state
    const currentDomain = sharedDependencies.getCurrentDomain ? sharedDependencies.getCurrentDomain() : null;
    if (currentDomain) {
        updateProfileStatusIndicator(currentDomain);
    } else {
        // If no domain, ensure indicator is hidden/reset
        updateProfileStatusIndicator(null);
    }
}


/**
 * Prompts the user for a profile name using a custom dialog.
 * @param {string} [defaultValue=''] - Optional default value for the input.
 * @returns {Promise<string|null>} A promise resolving with the entered name, or null if canceled.
 */
async function promptProfileName(defaultValue = '') {
    return new Promise((resolve) => {
        // Check if a prompt is already active
        if (document.getElementById('profile-name-prompt')) {
            console.warn("Profile name prompt already active.");
            resolve(null); // Prevent multiple prompts
            return;
        }

        const dialog = document.createElement('div');
        dialog.id = 'profile-name-prompt';
        dialog.className = 'dialog-overlay';
        dialog.innerHTML = `
            <div class="dialog-box">
                <h3>Save Profile</h3>
                <p>Enter a name for this profile:</p>
                <input type="text" id="profile-name-input" value="${defaultValue}" placeholder="Profile Name" />
                <div class="dialog-buttons">
                    <button id="cancel-profile-name" class="secondary-button">Cancel</button>
                    <button id="save-profile-name" class="primary-button">Save</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);

        const input = dialog.querySelector('#profile-name-input');
        const saveBtn = dialog.querySelector('#save-profile-name');
        const cancelBtn = dialog.querySelector('#cancel-profile-name');

        input.focus();
        input.select(); // Select the default text if any

        // --- Event Handlers ---
        const closeDialog = (value) => {
            document.removeEventListener('keydown', escHandler);
            if (dialog.parentNode) {
                dialog.remove(); // Use remove() which is standard
            }
            resolve(value);
        };

        const handleCancel = () => {
            closeDialog(null);
        };

        const handleSave = () => {
            const name = input.value.trim();
            if (name) {
                closeDialog(name);
            } else {
                // Maybe show a small validation message near the input?
                input.style.borderColor = 'red'; // Simple validation feedback
                input.focus();
                setTimeout(() => input.style.borderColor = '', 1500); // Reset border
            }
        };

        const escHandler = (e) => {
            if (e.key === 'Escape') {
                handleCancel();
            }
        };

        // --- Attach Listeners ---
        cancelBtn.addEventListener('click', handleCancel);
        saveBtn.addEventListener('click', handleSave);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                handleSave();
            } else {
                 input.style.borderColor = ''; // Reset validation on typing
            }
        });
        document.addEventListener('keydown', escHandler);

        // Click outside to cancel
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) { // Check if the click is on the overlay itself
                handleCancel();
            }
        });
    });
}


/**
 * Saves the current set of cookies for the active domain as a new profile.
 */
async function saveCurrentAsProfile() {
     if (!profileManager || !sharedDependencies.getCurrentDomain || !sharedDependencies.loadedCookies) {
        console.error("Missing dependencies for saving profile.");
        sharedDependencies.sendNotification("Cannot save profile: internal error.", true);
        return;
    }
    const currentDomain = sharedDependencies.getCurrentDomain();

    if (!currentDomain) {
        sharedDependencies.sendNotification("Cannot save profile: No active domain.", true);
        return;
    }

    const profileName = await promptProfileName();

    if (profileName) {
        try {
            // Check if profile already exists
            const existingProfiles = await profileManager.getProfilesForDomain(currentDomain);
            if (existingProfiles && existingProfiles[profileName]) {
                // Ask for confirmation to overwrite using a generic confirmation dialog
                 const overwrite = await confirmAction(`Profile "${profileName}" already exists. Overwrite?`);
                 if (!overwrite) {
                    sharedDependencies.sendNotification("Save canceled.", false);
                    return; // User canceled overwrite
                }
            }

            // Get current cookies (ensure loadedCookies is up-to-date or fetch fresh)
            // Assuming sharedDependencies.loadedCookies is the source of truth for the current view
            const cookiesToSave = Object.values(sharedDependencies.loadedCookies).map(item => item.cookie);

            if (!cookiesToSave || cookiesToSave.length === 0) {
                 sharedDependencies.sendNotification("No cookies to save for this domain.", false);
                 return;
            }

            await profileManager.saveProfile(currentDomain, profileName, cookiesToSave);
            sharedDependencies.sendNotification(`Profile "${profileName}" saved successfully.`, false);

            // Refresh the profile selector to include the new profile and select it
            await updateProfileSelector(currentDomain); // Update list
             if (profileSelector) {
                 profileSelector.value = profileName; // Select the newly saved profile
                 handleProfileSelectionChange(); // Update button states and indicator
             }

        } catch (error) {
            console.error(`Error saving profile ${profileName} for domain ${currentDomain}:`, error);
            sharedDependencies.sendNotification(`Error saving profile: ${error.message}`, true);
        }
    } else {
         sharedDependencies.sendNotification("Save canceled.", false);
    }
}

/**
 * Shows a generic confirmation dialog.
 * @param {string} message - The message to display.
 * @param {string} [title='Confirm Action'] - Optional title for the dialog.
 * @param {string} [confirmText='Confirm'] - Optional text for the confirm button.
 * @param {string} [cancelText='Cancel'] - Optional text for the cancel button.
 * @returns {Promise<boolean>} A promise resolving with true if confirmed, false otherwise.
 */
function confirmAction(message, title = 'Confirm Action', confirmText = 'Confirm', cancelText = 'Cancel') {
    return new Promise((resolve) => {
        // Prevent multiple dialogs
        if (document.getElementById('confirmation-dialog')) {
            console.warn("Confirmation dialog already active.");
            resolve(false); // Auto-cancel if already open
            return;
        }

        const dialog = document.createElement('div');
        dialog.id = 'confirmation-dialog';
        dialog.className = 'dialog-overlay';
        dialog.innerHTML = `
            <div class="dialog-box">
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="dialog-buttons">
                    <button id="confirm-cancel" class="secondary-button">${cancelText}</button>
                    <button id="confirm-ok" class="primary-button ${confirmText.toLowerCase() === 'delete' ? 'danger-button' : ''}">${confirmText}</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);

        const confirmBtn = dialog.querySelector('#confirm-ok');
        const cancelBtn = dialog.querySelector('#confirm-cancel');
        confirmBtn.focus(); // Focus the confirmation button by default

        const closeDialog = (value) => {
            document.removeEventListener('keydown', escHandler);
            if (dialog.parentNode) {
                dialog.remove();
            }
            resolve(value);
        };

        const handleConfirm = () => closeDialog(true);
        const handleCancel = () => closeDialog(false);

        const escHandler = (e) => {
            if (e.key === 'Escape') {
                handleCancel();
            }
        };

        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
        document.addEventListener('keydown', escHandler);

         // Click outside to cancel
         dialog.addEventListener('click', (e) => {
            if (e.target === dialog) { // Click on the overlay
                handleCancel();
            }
        });
    });
}


/**
 * Loads the cookies from the selected profile for the current domain.
 */
async function loadSelectedProfile() {
    if (!profileManager || !sharedDependencies.getCurrentDomain || !sharedDependencies.showCookiesForTab) {
        console.error("Missing dependencies for loading profile.");
        sharedDependencies.sendNotification("Cannot load profile: internal error.", true);
        return;
    }
    const currentDomain = sharedDependencies.getCurrentDomain();
    const selectedProfile = profileSelector ? profileSelector.value : null;

    if (!currentDomain || !selectedProfile || selectedProfile === '__none__') {
        sharedDependencies.sendNotification("No profile selected to load.", false);
        return;
    }

     // Confirmation Dialog Logic
     if (showProfileLoadConfirmation) {
        const loadConfirmed = await confirmAction(
            `This will replace all current cookies for ${currentDomain} with those from profile "${selectedProfile}". Continue?`,
            'Load Profile Confirmation',
            'Load'
        );
        if (!loadConfirmed) {
            sharedDependencies.sendNotification("Load canceled.", false);
            return; // User canceled
        }
    }

    isProfileLoading = true; // Set flag
    updateProfileStatusIndicator(currentDomain); // Show loading state

    try {
        // 1. Get profile cookies
        const profileData = await profileManager.loadProfile(currentDomain, selectedProfile);
        if (!profileData || !profileData.cookies) {
            throw new Error(`Profile "${selectedProfile}" not found or is empty.`);
        }

        // 2. Get current cookies for the domain (to delete them)
        // We need the current tab's URL to fetch accurately
        const currentUrl = sharedDependencies.getCurrentTabUrl ? sharedDependencies.getCurrentTabUrl() : null;
        if (!currentUrl) {
             throw new Error("Cannot determine current tab URL to clear existing cookies.");
        }
        // Use cookieHandler to get cookies associated with the specific URL/domain
        // This ensures we only delete relevant cookies before adding new ones.
        const currentCookies = await sharedDependencies.cookieHandler.getCookies({ url: currentUrl });

         // Filter currentCookies to only include those matching the profile's domain
         // This is crucial if getCookies returns cookies for subdomains etc.
         const cookiesToDelete = currentCookies.filter(cookie => {
             // Basic domain matching, might need refinement based on CookieHandler logic
             return profileManager.cookieDomainMatch(cookie, currentDomain);
         });


        // 3. Delete current cookies for the domain
        if (cookiesToDelete.length > 0) {
             sharedDependencies.sendNotification(`Clearing ${cookiesToDelete.length} existing cookie(s) for ${currentDomain}...`, false);
             // Use a batch delete method if available, otherwise loop
             // We need access to the cookie deletion logic (e.g., cookieHandler.remove)
             if (!sharedDependencies.cookieHandler || !sharedDependencies.cookieHandler.remove) {
                 throw new Error("Cookie deletion function is not available.");
             }
             const deletePromises = cookiesToDelete.map(cookie =>
                 sharedDependencies.cookieHandler.remove({
                     url: sharedDependencies.cookieHandler.buildCookieUrl(cookie), // Need URL for removal
                     name: cookie.name,
                     storeId: cookie.storeId // Important for container tabs
                 }).catch(err => {
                     console.warn(`Failed to delete cookie ${cookie.name}: ${err.message}`);
                     // Decide if loading should continue despite deletion errors
                     // For now, we'll continue but log the warning.
                 })
             );
             await Promise.all(deletePromises);
             sharedDependencies.sendNotification(`Existing cookies cleared for ${currentDomain}.`, false);
        } else {
             sharedDependencies.sendNotification(`No existing cookies found matching ${currentDomain} to clear.`, false);
        }


        // 4. Add cookies from the profile
        sharedDependencies.sendNotification(`Loading ${profileData.cookies.length} cookie(s) from profile "${selectedProfile}"...`, false);
         if (!sharedDependencies.cookieHandler || !sharedDependencies.cookieHandler.set) {
            throw new Error("Cookie setting function is not available.");
        }

        const addPromises = profileData.cookies.map(cookieData => {
            // Reconstruct the cookie object suitable for the 'set' method
            const cookieToSet = { ...cookieData };
            // The 'url' is mandatory for browser.cookies.set
            cookieToSet.url = sharedDependencies.cookieHandler.buildCookieUrl(cookieData); // Build URL

            // Remove properties not accepted by 'set' API (like 'id', 'hostOnly' might be inferred)
            delete cookieToSet.id;
             // delete cookieToSet.hostOnly; // Let the browser determine this based on domain presence
             delete cookieToSet.session; // Session is determined by expirationDate absence

            // Adjust expirationDate if it's in the past (browser might reject it)
            // Or maybe the profile save logic should handle this? For now, set as-is.
             if (cookieToSet.expirationDate && cookieToSet.expirationDate * 1000 < Date.now()) {
                console.warn(`Cookie "${cookieToSet.name}" has expired expiration date. Attempting to set anyway.`);
                // Optionally: delete cookieToSet.expirationDate; // Make it a session cookie
            }


            return sharedDependencies.cookieHandler.set(cookieToSet).catch(err => {
                 console.error(`Error setting cookie ${cookieToSet.name} from profile: ${err.message}`, cookieToSet);
                 // Throw an error to indicate loading failure partially?
                 throw new Error(`Failed to load cookie "${cookieToSet.name}": ${err.message}`);
            });
        });

        await Promise.all(addPromises);
        sharedDependencies.sendNotification(`Profile "${selectedProfile}" loaded successfully.`, false);

        // 5. Refresh the cookie list display
        await sharedDependencies.showCookiesForTab(true); // Force refresh

    } catch (error) {
        console.error(`Error loading profile ${selectedProfile}:`, error);
        sharedDependencies.sendNotification(`Error loading profile: ${error.message}`, true);
        // Optionally refresh display even on error to show the current state
        await sharedDependencies.showCookiesForTab(true);
    } finally {
        isProfileLoading = false; // Reset flag
        // Update status indicator *after* potential refresh in showCookiesForTab
         // Use a small delay to ensure the cookie list update completes first
        setTimeout(() => updateProfileStatusIndicator(currentDomain), 100);
    }
}

/**
 * Deletes the selected profile for the current domain after confirmation.
 */
async function deleteSelectedProfile() {
    if (!profileManager || !sharedDependencies.getCurrentDomain) {
        console.error("Missing dependencies for deleting profile.");
        sharedDependencies.sendNotification("Cannot delete profile: internal error.", true);
        return;
    }
    const currentDomain = sharedDependencies.getCurrentDomain();
    const selectedProfile = profileSelector ? profileSelector.value : null;

    if (!currentDomain || !selectedProfile || selectedProfile === '__none__') {
        sharedDependencies.sendNotification("No profile selected to delete.", false);
        return;
    }

     // Confirmation Dialog Logic
     if (showDeleteProfileConfirmation) {
        const deleteConfirmed = await confirmAction(
            `Are you sure you want to permanently delete the profile "${selectedProfile}" for ${currentDomain}?`,
            'Delete Profile Confirmation',
            'Delete', // Use 'Delete' button text
            'Cancel'
        );
         if (!deleteConfirmed) {
            sharedDependencies.sendNotification("Delete canceled.", false);
            return; // User canceled
        }
     }

    try {
        await profileManager.deleteProfile(currentDomain, selectedProfile);
        sharedDependencies.sendNotification(`Profile "${selectedProfile}" deleted successfully.`, false);

        // Refresh the profile selector to remove the deleted profile
        await updateProfileSelector(currentDomain);
        // updateProfileSelector handles selecting default and updating buttons/indicator

    } catch (error) {
        console.error(`Error deleting profile ${selectedProfile}:`, error);
        sharedDependencies.sendNotification(`Error deleting profile: ${error.message}`, true);
    }
}

/**
 * Exports all profiles for the current domain to a JSON file.
 */
async function exportDomainProfiles() {
    if (!profileManager || !sharedDependencies.getCurrentDomain) {
        console.error("Missing dependencies for exporting domain profiles.");
        sharedDependencies.sendNotification("Cannot export profiles: internal error.", true);
        return;
    }
    const domain = sharedDependencies.getCurrentDomain();
    if (!domain) {
        sharedDependencies.sendNotification("No active domain to export profiles for.", false);
        return;
    }

    try {
        const profiles = await profileManager.getProfilesForDomain(domain);
        if (!profiles || Object.keys(profiles).length === 0) {
            sharedDependencies.sendNotification(`No profiles found for domain ${domain} to export.`, false);
            return;
        }

        const dataToExport = {
            type: 'CookieEditorDomainProfiles',
            version: 1, // Add versioning for future compatibility
            domain: domain,
            profiles: profiles
        };

        const jsonString = JSON.stringify(dataToExport, null, 2); // Pretty print JSON
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
        const filename = `cookie-editor-profiles-${domain}-${timestamp}.json`;

        // Use the downloads API to trigger the download
         if (sharedDependencies.browser?.downloads?.download) {
            try {
                await sharedDependencies.browser.downloads.download({
                    url: url,
                    filename: filename,
                    saveAs: true // Prompt user for save location
                });
                 sharedDependencies.sendNotification(`Exporting profiles for ${domain}...`, false);
                 // Note: We don't get easy confirmation of download completion here.
            } catch (downloadError) {
                 console.error("Download API error:", downloadError);
                 sharedDependencies.sendNotification(`Failed to initiate download: ${downloadError.message}`, true);
                 URL.revokeObjectURL(url); // Clean up blob URL on failure too
            }
         } else {
             // Fallback for environments without downloads API (e.g., older FF, testing)
             const a = document.createElement('a');
             a.href = url;
             a.download = filename;
             document.body.appendChild(a);
             a.click();
             document.body.removeChild(a);
             URL.revokeObjectURL(url); // Clean up blob URL after triggering download
             sharedDependencies.sendNotification(`Profiles for ${domain} prepared for download.`, false);
         }

    } catch (error) {
        console.error(`Error exporting profiles for ${domain}:`, error);
        sharedDependencies.sendNotification(`Error exporting profiles: ${error.message}`, true);
    } finally {
        // Hide the domain actions menu after action is triggered
        if (domainProfileMenu) domainProfileMenu.classList.remove('visible');
        document.removeEventListener('click', closeDomainActionsMenuOnClickOutside);
    }
}


/**
 * Prompts the user to edit the name of the selected profile.
 */
async function editSelectedProfile() {
    if (!profileManager || !sharedDependencies.getCurrentDomain) {
        console.error("Missing dependencies for editing profile.");
        sharedDependencies.sendNotification("Cannot edit profile: internal error.", true);
        return;
    }
    const currentDomain = sharedDependencies.getCurrentDomain();
    const selectedProfile = profileSelector ? profileSelector.value : null;

    if (!currentDomain || !selectedProfile || selectedProfile === '__none__') {
        sharedDependencies.sendNotification("No profile selected to edit.", false);
        return;
    }

    const newProfileName = await promptProfileEdit(selectedProfile);

    if (newProfileName && newProfileName !== selectedProfile) {
        try {
            // Check if the new name already exists
            const existingProfiles = await profileManager.getProfilesForDomain(currentDomain);
             if (existingProfiles && existingProfiles[newProfileName]) {
                 sharedDependencies.sendNotification(`Cannot rename: Profile "${newProfileName}" already exists.`, true);
                return;
            }

            await profileManager.renameProfile(currentDomain, selectedProfile, newProfileName);
            sharedDependencies.sendNotification(`Profile "${selectedProfile}" renamed to "${newProfileName}".`, false);

            // Refresh the profile selector to show the new name and select it
            await updateProfileSelector(currentDomain);
             if (profileSelector) {
                 profileSelector.value = newProfileName; // Select the renamed profile
                 handleProfileSelectionChange(); // Update buttons/indicator
             }

        } catch (error) {
            console.error(`Error renaming profile ${selectedProfile} to ${newProfileName}:`, error);
            sharedDependencies.sendNotification(`Error renaming profile: ${error.message}`, true);
        }
    } else if (newProfileName === selectedProfile) {
         // No change made
         sharedDependencies.sendNotification("Profile name not changed.", false);
    } else {
         // User canceled
         sharedDependencies.sendNotification("Rename canceled.", false);
    }
}


/**
 * Prompts the user to edit a profile name using a custom dialog.
 * @param {string} currentName - The current name of the profile being edited.
 * @returns {Promise<string|null>} A promise resolving with the new name, or null if canceled.
 */
async function promptProfileEdit(currentName) {
    return new Promise((resolve) => {
        if (document.getElementById('profile-edit-prompt')) {
            console.warn("Profile edit prompt already active.");
            resolve(null);
            return;
        }

        const dialog = document.createElement('div');
        dialog.id = 'profile-edit-prompt';
        dialog.className = 'dialog-overlay';
        dialog.innerHTML = `
            <div class="dialog-box">
                <h3>Edit Profile Name</h3>
                <p>Enter a new name for profile "${currentName}":</p>
                <input type="text" id="profile-edit-input" value="${currentName}" placeholder="New Profile Name" />
                <div class="dialog-buttons">
                    <button id="cancel-profile-edit" class="secondary-button">Cancel</button>
                    <button id="save-profile-edit" class="primary-button">Save</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);

        const input = dialog.querySelector('#profile-edit-input');
        const saveBtn = dialog.querySelector('#save-profile-edit');
        const cancelBtn = dialog.querySelector('#cancel-profile-edit');

        input.focus();
        input.select(); // Select the current name

        const closeDialog = (value) => {
            document.removeEventListener('keydown', escHandler);
            if (dialog.parentNode) {
                dialog.remove();
            }
            resolve(value);
        };

        const handleCancel = () => {
            closeDialog(null);
        };

        const handleSave = () => {
            const newName = input.value.trim();
            if (newName) {
                closeDialog(newName);
            } else {
                input.style.borderColor = 'red';
                input.focus();
                setTimeout(() => input.style.borderColor = '', 1500);
            }
        };

         const escHandler = (e) => {
            if (e.key === 'Escape') {
                handleCancel();
            }
        };

        cancelBtn.addEventListener('click', handleCancel);
        saveBtn.addEventListener('click', handleSave);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                handleSave();
            } else {
                 input.style.borderColor = ''; // Reset validation on typing
            }
        });
        document.addEventListener('keydown', escHandler);

        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                handleCancel();
            }
        });
    });
}


/**
 * Initialize the profile management UI elements and event listeners.
 * This function assumes it's called after the DOM is ready.
 */
function initProfileManagement() {
    // Ensure profile selector exists before adding listeners
    if (!profileSelector) {
        console.warn("Profile selector element not found during initialization.");
        return;
    }

    const saveBtn = document.getElementById('save-profile');
    const loadBtn = document.getElementById('load-profile');
    const editBtn = document.getElementById('edit-profile');
    const deleteBtn = document.getElementById('delete-profile');

    // Add event listeners for profile management only if buttons exist
    if (saveBtn) saveBtn.addEventListener('click', saveCurrentAsProfile);
    else console.warn("Save profile button not found.");

    if (loadBtn) loadBtn.addEventListener('click', loadSelectedProfile);
    else console.warn("Load profile button not found.");

    if (editBtn) editBtn.addEventListener('click', editSelectedProfile);
    else console.warn("Edit profile button not found.");

    if (deleteBtn) deleteBtn.addEventListener('click', deleteSelectedProfile);
    else console.warn("Delete profile button not found.");

    // Add profile selector change event
    profileSelector.addEventListener('change', handleProfileSelectionChange);

    // Initial update of button states based on default selection
    handleProfileSelectionChange();
}


/**
 * Main initialization function for the profile UI.
 * Should be called once the DOM is ready and core dependencies are available.
 * @param {object} deps - Dependencies needed by the profile UI.
 * @param {object} deps.storageHandler - Instance of GenericStorageHandler.
 * @param {object} deps.browserDetector - Instance of BrowserDetector.
 * @param {function} deps.sendNotification - Function to show notifications.
 * @param {function} deps.getCurrentDomain - Function to get the current domain context.
 * @param {function} deps.getCurrentTabUrl - Function to get the current tab's URL.
 * @param {object} deps.loadedCookies - Reference to the currently loaded cookies object.
 * @param {object} deps.cookieHandler - Instance of CookieHandler (Popup or Devtools).
 * @param {function} deps.showCookiesForTab - Function to refresh the cookie list display.
 * @param {object} deps.browser - The browser API object (e.g., chrome, browser).
 */
export async function initProfileUI(deps) {
    // Store dependencies for use in other functions within this module
    sharedDependencies = deps;

    // Instantiate ProfileManager with required handlers
    if (!deps.storageHandler || !deps.browserDetector) {
         console.error("Cannot initialize Profile UI: Missing storageHandler or browserDetector dependency.");
         if(deps.sendNotification) deps.sendNotification("Profile features unavailable: initialization error.", true);
         return; // Cannot proceed without these
    }
    profileManager = new ProfileManager(deps.storageHandler, deps.browserDetector);

    // Query essential DOM elements
    profileSelector = document.getElementById('profile-selector');
    const profilePanel = document.getElementById('profile-management');
    const profileToggle = document.getElementById('profile-toggle');
    const profileHeader = profilePanel?.querySelector('.panel-section-header'); // Use optional chaining
    profileActionsButton = document.getElementById('profile-actions');
    domainProfileMenu = document.getElementById('domain-profile-menu');
    const exportDomainBtn = document.getElementById('export-domain-profiles');

     // Load confirmation settings from storage
    try {
        showProfileLoadConfirmation = await deps.storageHandler.getLocal('showProfileLoadConfirmation', true);
        showDeleteProfileConfirmation = await deps.storageHandler.getLocal('showDeleteProfileConfirmation', true);
    } catch (error) {
        console.error("Error loading profile confirmation settings:", error);
        // Keep defaults (true)
    }


    // Check if profile elements exist (might not in side panel)
    if (!profilePanel || !profileSelector || !profileHeader || !profileActionsButton || !domainProfileMenu) {
        console.log("Profile management UI elements not found. Assuming side panel or error.");
        // Optionally disable profile features or hide related UI if needed
        return; // Stop initialization if core elements are missing
    }

    // Initialize profile panel state (expanded/collapsed)
    await initProfilePanelState(); // Initialize based on saved preference

    // Add event listeners for toggling profile panel
    profileHeader.addEventListener('click', function(e) {
        // Prevent toggling when clicking the actions button itself
        if (profileActionsButton && (e.target === profileActionsButton || profileActionsButton.contains(e.target))) {
            return;
        }
        toggleProfilePanel();
    });

    if (profileToggle) {
        profileToggle.addEventListener('click', function(e) {
            e.stopPropagation(); // Prevent header click listener firing too
            toggleProfilePanel();
        });
    }


    // Add event listeners for domain profile actions menu
    profileActionsButton.addEventListener('click', toggleDomainActionsMenu);

    if (exportDomainBtn) exportDomainBtn.addEventListener('click', exportDomainProfiles);
    else console.warn("Export domain profiles button not found.");


    // Initialize the main profile management buttons and selector listener
    initProfileManagement();

    // Initial population of the profile selector needs the domain,
    // which usually comes from initWindow -> showCookiesForTab.
    // We'll rely on the initial call to updateProfileSelector from showCookiesForTab
    // to populate the dropdown correctly.
    console.log("Profile UI Initialized.");
}

// Add any other profile-related functions here...
// Remember to update sharedDependencies usage if functions need access to them. 