/**
 * Pulse AI Chatbot Client Application
 * With Google Sign-In Authentication
 */

document.addEventListener('DOMContentLoaded', () => {
    // App State
    let currentSessionId = null;
    let sessions = JSON.parse(localStorage.getItem('gemini_sessions') || '[]');
    let activeModel = localStorage.getItem('gemini_model') || 'gemini-3.6-flash';
    let systemPrompt = localStorage.getItem('gemini_system_prompt') || '';
    let temperature = parseFloat(localStorage.getItem('gemini_temp') || '0.7');
    let currentFileBase64 = null;
    let currentFileName = null;
    let currentFileType = null;
    let isStreaming = false;

    // Auth State
    let authToken = sessionStorage.getItem('pulse_auth_token') || null;
    let authUser = JSON.parse(sessionStorage.getItem('pulse_auth_user') || 'null');
    let authEnabled = false; // Will be set based on server config
    let googleClientId = null;

    // DOM Elements
    const chatMessages = document.getElementById('chat-messages');
    const welcomeScreen = document.getElementById('welcome-screen');
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const newChatBtn = document.getElementById('new-chat-btn');
    const clearChatBtn = document.getElementById('clear-chat-btn');
    const modelSelect = document.getElementById('model-select');
    const activeModelName = document.getElementById('active-model-name');
    const chatHistoryList = document.getElementById('chat-history-list');
    
    // Sidebar Controls
    const sidebar = document.getElementById('sidebar');
    const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
    const closeSidebarBtn = document.getElementById('close-sidebar-btn');

    // Attach & Mic
    const attachBtn = document.getElementById('attach-btn');
    const imageFileInput = document.getElementById('image-file-input');
    const imagePreviewContainer = document.getElementById('image-preview-container');
    const imagePreviewImg = document.getElementById('image-preview-img');
    const filePreviewBadge = document.getElementById('file-preview-badge');
    const removeImgBtn = document.getElementById('remove-img-btn');
    const micBtn = document.getElementById('mic-btn');

    // Modals
    const settingsModal = document.getElementById('settings-modal');
    const openSettingsBtn = document.getElementById('open-settings-btn');
    const closeSettingsModal = document.getElementById('close-settings-modal');
    const cancelSettingsBtn = document.getElementById('cancel-settings-btn');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const systemPromptInput = document.getElementById('system-prompt-input');
    const tempRange = document.getElementById('temp-range');
    const tempVal = document.getElementById('temp-val');

    // Auth DOM Elements
    const sidebarSigninBtn = document.getElementById('sidebar-signin-btn');
    const sidebarUserProfile = document.getElementById('sidebar-user-profile');
    const sidebarUserAvatar = document.getElementById('sidebar-user-avatar');
    const sidebarUserName = document.getElementById('sidebar-user-name');
    const sidebarUserEmail = document.getElementById('sidebar-user-email');
    const headerUserContainer = document.getElementById('header-user-container');
    const headerUserBtn = document.getElementById('header-user-btn');
    const headerUserAvatar = document.getElementById('header-user-avatar');
    const headerUserName = document.getElementById('header-user-name');
    const headerUserDropdown = document.getElementById('header-user-dropdown');
    const dropdownAvatar = document.getElementById('dropdown-avatar');
    const dropdownName = document.getElementById('dropdown-name');
    const dropdownEmail = document.getElementById('dropdown-email');
    const signoutBtn = document.getElementById('signout-btn');
    const authInputOverlay = document.getElementById('auth-input-overlay');
    const authOverlaySigninBtn = document.getElementById('auth-overlay-signin-btn');
    const inputAreaWrapper = document.getElementById('input-area-wrapper');

    // Configure Marked.js
    if (window.marked) {
        marked.setOptions({
            highlight: function (code, lang) {
                if (window.hljs && hljs.getLanguage(lang)) {
                    return hljs.highlight(code, { language: lang }).value;
                }
                return code;
            },
            breaks: true
        });
    }

    // Initialize Application
    init();

    async function init() {
        // Set dropdown value
        modelSelect.value = activeModel;
        updateActiveModelBadge(activeModel);

        // Check health
        checkHealth();

        // Fetch auth config from server
        await fetchAuthConfig();

        // Render Chat History sidebar list
        renderHistoryList();

        // Check if there is an active session
        if (sessions.length > 0) {
            loadSession(sessions[0].id);
        } else {
            createNewSession();
        }

        setupEventListeners();
    }

    // ======== AUTH SYSTEM ========

    async function fetchAuthConfig() {
        try {
            const res = await fetch('/api/auth/config');
            const data = await res.json();
            authEnabled = data.auth_enabled;
            googleClientId = data.google_client_id;

            if (authEnabled && googleClientId) {
                // If we have a stored token and user, restore the signed-in state
                if (authToken && authUser) {
                    updateAuthUI(true);
                } else {
                    updateAuthUI(false);
                }
                // Initialize Google Identity Services once the script has loaded
                initGoogleSignIn();
            } else {
                // Auth not enabled — hide all auth UI, allow free chat
                updateAuthUI(true); // treat as "signed in" so input is unlocked
                hideAllAuthUI();
            }
        } catch (e) {
            console.error('Failed to fetch auth config:', e);
            // If we can't reach the server, default to open (no auth gating)
            updateAuthUI(true);
            hideAllAuthUI();
        }
    }

    function hideAllAuthUI() {
        if (sidebarSigninBtn) sidebarSigninBtn.style.display = 'none';
        if (sidebarUserProfile) sidebarUserProfile.style.display = 'none';
        if (headerUserContainer) headerUserContainer.style.display = 'none';
        if (authInputOverlay) authInputOverlay.classList.remove('visible');
        if (inputAreaWrapper) {
            inputAreaWrapper.classList.remove('auth-disabled');
            inputAreaWrapper.classList.add('auth-enabled');
        }
    }

    function initGoogleSignIn() {
        // Wait for the Google Identity Services library to load
        if (typeof google === 'undefined' || !google.accounts) {
            // Retry after a short delay
            setTimeout(initGoogleSignIn, 300);
            return;
        }

        google.accounts.id.initialize({
            client_id: googleClientId,
            callback: handleGoogleSignIn,
            auto_select: false,
            cancel_on_tap_outside: true
        });
    }

    function triggerGoogleSignIn() {
        if (typeof google === 'undefined' || !google.accounts) {
            showAuthToast('Google Sign-In is loading. Please try again in a moment.');
            return;
        }
        google.accounts.id.prompt((notification) => {
            if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                // FedCM / One Tap was blocked or skipped — fall back to rendering a button
                // We'll use a popup-based approach instead
                fallbackGoogleSignIn();
            }
        });
    }

    function fallbackGoogleSignIn() {
        // Create a temporary hidden container for the Google rendered button
        const tempDiv = document.createElement('div');
        tempDiv.id = 'g_id_signin_temp';
        tempDiv.style.position = 'fixed';
        tempDiv.style.top = '50%';
        tempDiv.style.left = '50%';
        tempDiv.style.transform = 'translate(-50%, -50%)';
        tempDiv.style.zIndex = '9999';
        tempDiv.style.background = 'rgba(3, 7, 18, 0.9)';
        tempDiv.style.padding = '40px';
        tempDiv.style.borderRadius = '20px';
        tempDiv.style.border = '1px solid rgba(124, 58, 237, 0.4)';
        tempDiv.style.backdropFilter = 'blur(20px)';
        tempDiv.style.boxShadow = '0 20px 60px rgba(0,0,0,0.7)';

        const title = document.createElement('p');
        title.textContent = 'Sign in to continue';
        title.style.color = '#f8fafc';
        title.style.fontSize = '1.1rem';
        title.style.fontWeight = '600';
        title.style.marginBottom = '20px';
        title.style.textAlign = 'center';
        title.style.fontFamily = "'Outfit', sans-serif";

        const btnContainer = document.createElement('div');
        btnContainer.id = 'g_id_signin_btn';

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = 'position:absolute;top:12px;right:16px;background:none;border:none;color:#94a3b8;font-size:1.2rem;cursor:pointer;';
        closeBtn.onclick = () => tempDiv.remove();

        tempDiv.appendChild(closeBtn);
        tempDiv.appendChild(title);
        tempDiv.appendChild(btnContainer);
        document.body.appendChild(tempDiv);

        google.accounts.id.renderButton(btnContainer, {
            type: 'standard',
            theme: 'filled_blue',
            size: 'large',
            text: 'signin_with',
            shape: 'pill',
            width: 260
        });
    }

    function handleGoogleSignIn(response) {
        // Remove fallback popup if present
        const tempDiv = document.getElementById('g_id_signin_temp');
        if (tempDiv) tempDiv.remove();

        const idToken = response.credential;
        if (!idToken) {
            showAuthToast('Sign-in failed. Please try again.');
            return;
        }

        // Decode the JWT payload (base64url) to get user info client-side
        try {
            const payload = JSON.parse(atob(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
            authToken = idToken;
            authUser = {
                name: payload.name || '',
                email: payload.email || '',
                picture: payload.picture || '',
                sub: payload.sub || ''
            };

            // Store in sessionStorage
            sessionStorage.setItem('pulse_auth_token', authToken);
            sessionStorage.setItem('pulse_auth_user', JSON.stringify(authUser));

            updateAuthUI(true);
            showAuthToast(`Welcome, ${authUser.name}! 🎉`);
        } catch (e) {
            console.error('Failed to decode token:', e);
            showAuthToast('Sign-in failed. Invalid token.');
        }
    }

    function signOut() {
        authToken = null;
        authUser = null;
        sessionStorage.removeItem('pulse_auth_token');
        sessionStorage.removeItem('pulse_auth_user');

        // Revoke Google session
        if (typeof google !== 'undefined' && google.accounts) {
            google.accounts.id.disableAutoSelect();
        }

        updateAuthUI(false);
        closeUserDropdown();
        showAuthToast('You have been signed out.');
    }

    function updateAuthUI(isSignedIn) {
        if (!authEnabled) return; // Don't touch UI if auth is not enabled

        if (isSignedIn && authUser) {
            // Sidebar: show user profile, hide sign-in button
            if (sidebarSigninBtn) sidebarSigninBtn.style.display = 'none';
            if (sidebarUserProfile) {
                sidebarUserProfile.style.display = 'flex';
                sidebarUserAvatar.src = authUser.picture || '';
                sidebarUserName.textContent = authUser.name || '';
                sidebarUserEmail.textContent = authUser.email || '';
            }

            // Header: show user button
            if (headerUserContainer) {
                headerUserContainer.style.display = 'block';
                headerUserAvatar.src = authUser.picture || '';
                headerUserName.textContent = authUser.name?.split(' ')[0] || '';
                dropdownAvatar.src = authUser.picture || '';
                dropdownName.textContent = authUser.name || '';
                dropdownEmail.textContent = authUser.email || '';
            }

            // Input: unlock
            if (authInputOverlay) authInputOverlay.classList.remove('visible');
            if (inputAreaWrapper) {
                inputAreaWrapper.classList.remove('auth-disabled');
                inputAreaWrapper.classList.add('auth-enabled');
            }
        } else {
            // Sidebar: show sign-in button, hide profile
            if (sidebarSigninBtn) sidebarSigninBtn.style.display = 'flex';
            if (sidebarUserProfile) sidebarUserProfile.style.display = 'none';

            // Header: hide user button
            if (headerUserContainer) headerUserContainer.style.display = 'none';

            // Input: lock with overlay
            if (authInputOverlay) authInputOverlay.classList.add('visible');
            if (inputAreaWrapper) {
                inputAreaWrapper.classList.add('auth-disabled');
                inputAreaWrapper.classList.remove('auth-enabled');
            }
        }
    }

    function showAuthToast(message) {
        // Remove existing toast
        const existing = document.querySelector('.auth-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'auth-toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function closeUserDropdown() {
        if (headerUserDropdown) headerUserDropdown.classList.remove('open');
    }

    function isAuthenticated() {
        return !authEnabled || (authToken && authUser);
    }

    // ======== END AUTH SYSTEM ========

    async function checkHealth() {
        try {
            await fetch('/api/health');
        } catch (e) {
            console.error('Health check failed', e);
        }
    }

    function setupEventListeners() {
        // Auto-expand textarea
        userInput.addEventListener('input', () => {
            userInput.style.height = 'auto';
            userInput.style.height = (userInput.scrollHeight) + 'px';
        });

        // Submit on Enter (without shift)
        userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                chatForm.dispatchEvent(new Event('submit'));
            }
        });

        // Chat Form Submit
        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            sendMessage();
        });

        // Starter Cards click
        document.querySelectorAll('.starter-card').forEach(card => {
            card.addEventListener('click', () => {
                const prompt = card.getAttribute('data-prompt');
                userInput.value = prompt;
                sendMessage();
            });
        });

        // New Chat Button
        newChatBtn.addEventListener('click', () => createNewSession());
        clearChatBtn.addEventListener('click', () => clearCurrentChat());

        // Model Select change
        modelSelect.addEventListener('change', (e) => {
            activeModel = e.target.value;
            localStorage.setItem('gemini_model', activeModel);
            updateActiveModelBadge(activeModel);
        });

        // Sidebar Toggle
        toggleSidebarBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
        closeSidebarBtn.addEventListener('click', () => sidebar.classList.remove('open'));

        // File/Image Attachment
        attachBtn.addEventListener('click', () => imageFileInput.click());
        imageFileInput.addEventListener('change', handleFileSelect);
        removeImgBtn.addEventListener('click', removeFilePreview);

        // Voice Recognition
        setupVoiceRecognition();

        // Settings Modal Events
        if (openSettingsBtn) {
            openSettingsBtn.addEventListener('click', () => {
                systemPromptInput.value = systemPrompt;
                tempRange.value = temperature;
                tempVal.textContent = temperature;
                settingsModal.classList.add('active');
            });
        }
        closeSettingsModal.addEventListener('click', () => settingsModal.classList.remove('active'));
        cancelSettingsBtn.addEventListener('click', () => settingsModal.classList.remove('active'));
        tempRange.addEventListener('input', (e) => tempVal.textContent = e.target.value);
        saveSettingsBtn.addEventListener('click', saveSettings);

        // ---- Auth Event Listeners ----
        if (sidebarSigninBtn) {
            sidebarSigninBtn.addEventListener('click', triggerGoogleSignIn);
        }
        if (authOverlaySigninBtn) {
            authOverlaySigninBtn.addEventListener('click', triggerGoogleSignIn);
        }
        if (headerUserBtn) {
            headerUserBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                headerUserDropdown.classList.toggle('open');
            });
        }
        if (signoutBtn) {
            signoutBtn.addEventListener('click', signOut);
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (headerUserDropdown && !headerUserDropdown.contains(e.target) && 
                headerUserBtn && !headerUserBtn.contains(e.target)) {
                closeUserDropdown();
            }
        });
    }

    function updateActiveModelBadge(modelId) {
        const option = modelSelect.querySelector(`option[value="${modelId}"]`);
        activeModelName.textContent = option ? option.textContent : modelId;
    }

    // Handle File / Document / Image Upload
    function handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        currentFileName = file.name;
        currentFileType = file.type || 'application/octet-stream';

        const reader = new FileReader();
        reader.onload = (evt) => {
            currentFileBase64 = evt.target.result;

            if (file.type.startsWith('image/')) {
                imagePreviewImg.src = currentFileBase64;
                imagePreviewImg.style.display = 'block';
                if (filePreviewBadge) filePreviewBadge.style.display = 'none';
            } else {
                imagePreviewImg.style.display = 'none';
                if (filePreviewBadge) {
                    let fileIcon = '📄';
                    if (file.name.endsWith('.pdf')) fileIcon = '📕';
                    else if (file.name.match(/\.(py|js|ts|html|css|json|sql|cpp|c|java)$/i)) fileIcon = '💻';

                    const fileSizeKB = (file.size / 1024).toFixed(1);
                    filePreviewBadge.innerHTML = `<span style="font-size: 1.2rem; margin-right: 6px;">${fileIcon}</span> <span>${escapeHtml(file.name)}</span> <small style="color: var(--text-muted); margin-left: 6px;">(${fileSizeKB} KB)</small>`;
                    filePreviewBadge.style.display = 'flex';
                }
            }
            imagePreviewContainer.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }

    function removeFilePreview() {
        currentFileBase64 = null;
        currentFileName = null;
        currentFileType = null;
        imagePreviewImg.src = '';
        imagePreviewImg.style.display = 'none';
        if (filePreviewBadge) {
            filePreviewBadge.style.display = 'none';
            filePreviewBadge.innerHTML = '';
        }
        imagePreviewContainer.style.display = 'none';
        imageFileInput.value = '';
    }

    // Voice Recognition (Speech-to-Text)
    function setupVoiceRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            micBtn.style.display = 'none';
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;

        micBtn.addEventListener('click', () => {
            if (micBtn.classList.contains('recording')) {
                recognition.stop();
            } else {
                recognition.start();
                micBtn.classList.add('recording');
            }
        });

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            userInput.value += (userInput.value ? ' ' : '') + transcript;
            userInput.style.height = (userInput.scrollHeight) + 'px';
        };

        recognition.onend = () => micBtn.classList.remove('recording');
        recognition.onerror = () => micBtn.classList.remove('recording');
    }

    // Send Message
    async function sendMessage() {
        const text = userInput.value.trim();
        if ((!text && !currentFileBase64) || isStreaming) return;

        // Auth gate: check if the user is signed in
        if (!isAuthenticated()) {
            showAuthToast('🔒 Please sign in with Google to send messages.');
            triggerGoogleSignIn();
            return;
        }

        isStreaming = true;
        sendBtn.disabled = true;

        // Hide welcome screen
        if (welcomeScreen) welcomeScreen.style.display = 'none';

        // Prepare message payload
        const userMsg = {
            role: 'user',
            content: text,
            fileData: currentFileBase64,
            fileName: currentFileName,
            fileType: currentFileType,
            timestamp: new Date().toISOString()
        };

        // Render user message bubble
        appendMessageUI(userMsg);

        // Store in session
        let session = getSession(currentSessionId);
        if (!session) {
            session = createNewSession();
        }

        session.messages.push(userMsg);

        // Reset input area
        userInput.value = '';
        userInput.style.height = 'auto';
        const filePayload = currentFileBase64;
        const fileNamePayload = currentFileName;
        removeFilePreview();

        // Create AI message placeholder in UI
        const aiMsgRow = createAIMessageUIPlaceholder();
        const contentDiv = aiMsgRow.querySelector('.message-content');

        // History for API (exclude large file data strings to keep lightweight)
        const historyForApi = session.messages.slice(0, -1).map(m => ({
            role: m.role,
            content: m.content
        }));

        try {
            // Build request headers — include auth token if available
            const headers = { 'Content-Type': 'application/json' };
            if (authToken) {
                headers['Authorization'] = `Bearer ${authToken}`;
            }

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    message: text,
                    history: historyForApi,
                    model: activeModel,
                    system_instruction: systemPrompt,
                    temperature: temperature,
                    file_data: filePayload,
                    file_name: fileNamePayload,
                    image_data: filePayload
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                if (response.status === 401) {
                    // Token expired or invalid — force sign out
                    signOut();
                    showAuthToast('🔒 Session expired. Please sign in again.');
                    throw new Error('Authentication required. Please sign in.');
                }
                throw new Error(errData.detail || 'Failed to stream response');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let fullAiResponse = '';
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n\n');
                buffer = lines.pop(); // save incomplete line

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.replace('data: ', '').trim();
                        if (dataStr === '[DONE]') break;

                        try {
                            const parsed = JSON.parse(dataStr);
                            if (parsed.error) {
                                fullAiResponse += `\n\n**Error:** ${parsed.error}`;
                            } else if (parsed.text) {
                                fullAiResponse += parsed.text;
                            }
                            renderMarkdown(contentDiv, fullAiResponse, true);
                            scrollToBottom();
                        } catch (e) {
                            console.error('Error parsing SSE chunk', e);
                        }
                    }
                }
            }

            // Finalize render
            renderMarkdown(contentDiv, fullAiResponse, false);

            // Save AI response to session
            const aiMsg = {
                role: 'model',
                content: fullAiResponse,
                timestamp: new Date().toISOString()
            };
            session.messages.push(aiMsg);

            // Set session title if it's the first message
            if (session.messages.length <= 2) {
                session.title = text.slice(0, 30) || 'New Conversation';
            }
            saveSessions();
            renderHistoryList();

        } catch (err) {
            console.error('Chat error:', err);
            contentDiv.innerHTML = `<p style="color: #ef4444;">⚠️ ${err.message || 'An error occurred while connecting to Pulse AI.'}</p>`;
        } finally {
            isStreaming = false;
            sendBtn.disabled = false;
        }
    }

    function createAIMessageUIPlaceholder() {
        const row = document.createElement('div');
        row.className = 'message-row ai';
        row.innerHTML = `
            <div class="avatar">✨</div>
            <div class="message-content">
                <span class="typing-cursor"></span>
            </div>
        `;
        chatMessages.appendChild(row);
        scrollToBottom();
        return row;
    }

    function appendMessageUI(msg) {
        const row = document.createElement('div');
        row.className = `message-row ${msg.role === 'user' ? 'user' : 'ai'}`;

        let fileData = msg.fileData || msg.image;
        let attachmentHtml = '';
        if (fileData) {
            if (fileData.startsWith('data:image/')) {
                attachmentHtml = `<img src="${fileData}" class="message-image" alt="User Upload">`;
            } else {
                const fname = msg.fileName || 'Attached Document';
                let icon = '📄';
                if (fname.endsWith('.pdf')) icon = '📕';
                else if (fname.match(/\.(py|js|ts|html|css|json|sql|cpp|c|java)$/i)) icon = '💻';
                attachmentHtml = `<div class="attached-file-chip"><span style="font-size: 1.1rem; margin-right: 6px;">${icon}</span> <span>${escapeHtml(fname)}</span></div>`;
            }
        }

        let contentHtml = '';
        if (msg.role === 'user') {
            contentHtml = `<p>${escapeHtml(msg.content)}</p>`;
        }

        row.innerHTML = `
            <div class="avatar">${msg.role === 'user' ? '👤' : '✨'}</div>
            <div class="message-content">
                ${attachmentHtml}
                ${contentHtml}
            </div>
        `;

        chatMessages.appendChild(row);

        if (msg.role !== 'user') {
            renderMarkdown(row.querySelector('.message-content'), msg.content, false);
        }

        scrollToBottom();
    }

    function renderMarkdown(element, rawText, isTyping) {
        if (window.marked) {
            element.innerHTML = marked.parse(rawText) + (isTyping ? '<span class="typing-cursor"></span>' : '');
            
            // Add copy button to code blocks
            element.querySelectorAll('pre').forEach(pre => {
                if (!pre.parentNode.classList.contains('code-block-wrapper')) {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'code-block-wrapper';
                    
                    const header = document.createElement('div');
                    header.className = 'code-header';
                    const code = pre.querySelector('code');
                    const lang = code ? (code.className.replace('language-', '') || 'code') : 'code';
                    
                    header.innerHTML = `
                        <span>${lang}</span>
                        <button class="copy-code-btn">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            Copy
                        </button>
                    `;

                    header.querySelector('.copy-code-btn').addEventListener('click', () => {
                        navigator.clipboard.writeText(code ? code.innerText : pre.innerText);
                        const btn = header.querySelector('.copy-code-btn');
                        btn.innerHTML = `✓ Copied!`;
                        setTimeout(() => {
                            btn.innerHTML = `
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                Copy
                            `;
                        }, 2000);
                    });

                    pre.parentNode.insertBefore(wrapper, pre);
                    wrapper.appendChild(header);
                    wrapper.appendChild(pre);
                }
            });

            if (window.hljs) {
                element.querySelectorAll('pre code').forEach((block) => hljs.highlightElement(block));
            }
        } else {
            element.textContent = rawText;
        }
    }

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Session Management
    function createNewSession() {
        const newSession = {
            id: 'session_' + Date.now(),
            title: 'New Conversation',
            messages: [],
            createdAt: new Date().toISOString()
        };
        sessions.unshift(newSession);
        currentSessionId = newSession.id;
        saveSessions();
        renderHistoryList();
        loadSession(newSession.id);
        return newSession;
    }

    function getSession(id) {
        return sessions.find(s => s.id === id);
    }

    function loadSession(id) {
        currentSessionId = id;
        const session = getSession(id);
        if (!session) return;

        // Highlight active session in sidebar
        renderHistoryList();

        // Clear UI messages
        chatMessages.innerHTML = '';

        if (session.messages.length === 0) {
            chatMessages.appendChild(welcomeScreen);
            welcomeScreen.style.display = 'flex';
        } else {
            if (welcomeScreen) welcomeScreen.style.display = 'none';
            session.messages.forEach(msg => appendMessageUI(msg));
        }
    }

    function clearCurrentChat() {
        const session = getSession(currentSessionId);
        if (session) {
            session.messages = [];
            saveSessions();
            loadSession(currentSessionId);
        }
    }

    function deleteSession(id, e) {
        e.stopPropagation();
        sessions = sessions.filter(s => s.id !== id);
        saveSessions();
        if (currentSessionId === id) {
            if (sessions.length > 0) {
                loadSession(sessions[0].id);
            } else {
                createNewSession();
            }
        } else {
            renderHistoryList();
        }
    }

    function saveSessions() {
        localStorage.setItem('gemini_sessions', JSON.stringify(sessions));
    }

    function renderHistoryList() {
        chatHistoryList.innerHTML = '';
        sessions.forEach(s => {
            const li = document.createElement('li');
            li.className = `history-item ${s.id === currentSessionId ? 'active' : ''}`;
            li.innerHTML = `
                <span class="history-item-title">${escapeHtml(s.title)}</span>
                <button class="delete-chat-btn" title="Delete Chat">&times;</button>
            `;
            li.addEventListener('click', () => loadSession(s.id));
            li.querySelector('.delete-chat-btn').addEventListener('click', (e) => deleteSession(s.id, e));
            chatHistoryList.appendChild(li);
        });
    }

    // Modal Actions
    async function saveApiKey() {
        const key = apiKeyInput.value.trim();
        if (!key) return;

        try {
            const res = await fetch('/api/save-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: key })
            });

            if (res.ok) {
                keyModal.classList.remove('active');
                checkHealth();
            } else {
                alert('Failed to save API key.');
            }
        } catch (err) {
            console.error('Save key error:', err);
        }
    }

    function saveSettings() {
        systemPrompt = systemPromptInput.value.trim();
        temperature = parseFloat(tempRange.value);

        localStorage.setItem('gemini_system_prompt', systemPrompt);
        localStorage.setItem('gemini_temp', temperature.toString());

        settingsModal.classList.remove('active');
    }

    function escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});
