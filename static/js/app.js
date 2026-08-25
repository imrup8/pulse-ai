/**
 * Gemini AI Chatbot Client Application
 */

document.addEventListener('DOMContentLoaded', () => {
    // App State
    let currentSessionId = null;
    let sessions = JSON.parse(localStorage.getItem('gemini_sessions') || '[]');
    let activeModel = localStorage.getItem('gemini_model') || 'gemini-3.6-flash';
    let systemPrompt = localStorage.getItem('gemini_system_prompt') || '';
    let temperature = parseFloat(localStorage.getItem('gemini_temp') || '0.7');
    let currentImageBase64 = null;
    let isStreaming = false;

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

        // Check health & API Key
        checkHealth();

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

        // Image Attachment
        attachBtn.addEventListener('click', () => imageFileInput.click());
        imageFileInput.addEventListener('change', handleImageSelect);
        removeImgBtn.addEventListener('click', removeImagePreview);

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
            tempRange.value = temperature;
            tempVal.textContent = temperature;
            settingsModal.classList.add('active');
        });
        closeSettingsModal.addEventListener('click', () => settingsModal.classList.remove('active'));
        cancelSettingsBtn.addEventListener('click', () => settingsModal.classList.remove('active'));
        tempRange.addEventListener('input', (e) => tempVal.textContent = e.target.value);
        saveSettingsBtn.addEventListener('click', saveSettings);
    }

    function updateActiveModelBadge(modelId) {
        const option = modelSelect.querySelector(`option[value="${modelId}"]`);
        activeModelName.textContent = option ? option.textContent : modelId;
    }

    // Handle Image File Upload
    function handleImageSelect(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('Please select an image file.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (evt) => {
            currentImageBase64 = evt.target.result;
            imagePreviewImg.src = currentImageBase64;
            imagePreviewContainer.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }

    function removeImagePreview() {
        currentImageBase64 = null;
        imagePreviewImg.src = '';
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
        if ((!text && !currentImageBase64) || isStreaming) return;

        isStreaming = true;
        sendBtn.disabled = true;

        // Hide welcome screen
        if (welcomeScreen) welcomeScreen.style.display = 'none';

        // Prepare message payload
        const userMsg = {
            role: 'user',
            content: text,
            image: currentImageBase64,
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
        const imagePayload = currentImageBase64;
        removeImagePreview();

        // Create AI message placeholder in UI
        const aiMsgRow = createAIMessageUIPlaceholder();
        const contentDiv = aiMsgRow.querySelector('.message-content');

        // History for API (exclude image strings to keep lightweight)
        const historyForApi = session.messages.slice(0, -1).map(m => ({
            role: m.role,
            content: m.content
        }));

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    history: historyForApi,
                    model: activeModel,
                    system_instruction: systemPrompt,
                    temperature: temperature,
                    image_data: imagePayload
                })
            });

            if (!response.ok) {
                const errData = await response.json();
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

        let imgHtml = msg.image ? `<img src="${msg.image}" class="message-image" alt="User Image">` : '';
        let contentHtml = '';

        if (msg.role === 'user') {
            contentHtml = `<p>${escapeHtml(msg.content)}</p>`;
        }

        row.innerHTML = `
            <div class="avatar">${msg.role === 'user' ? '👤' : '✨'}</div>
            <div class="message-content">
                ${imgHtml}
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
