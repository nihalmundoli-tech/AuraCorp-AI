document.addEventListener('DOMContentLoaded', () => {
    // --- Navigation & View Switching ---
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');

    function switchView(targetId) {
        // Update nav active state
        navItems.forEach(item => {
            if (item.dataset.target === targetId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Update view visibility
        views.forEach(view => {
            if (view.id === targetId) {
                view.classList.add('active');
            } else {
                view.classList.remove('active');
            }
        });
    }

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const target = item.dataset.target;
            switchView(target);
        });
    });

    // --- Modal Logic (Bot Roster) ---
    const requestBotBtn = document.getElementById('requestBotBtn');
    const newBotModal = document.getElementById('newBotModal');
    const closeBtns = document.querySelectorAll('.close-btn');
    const submitBotRequest = document.getElementById('submitBotRequest');

    function openModal() {
        newBotModal.style.display = 'flex';
        // small delay to allow display flex to apply before opacity transition
        setTimeout(() => newBotModal.classList.add('show'), 10);
    }

    function closeModal() {
        newBotModal.classList.remove('show');
        setTimeout(() => newBotModal.style.display = 'none', 300);
    }

    if (requestBotBtn) requestBotBtn.addEventListener('click', openModal);

    closeBtns.forEach(btn => {
        btn.addEventListener('click', closeModal);
    });

    // Close on backdrop click
    window.addEventListener('click', (e) => {
        if (e.target === newBotModal) {
            closeModal();
        }
    });

    // Handle bot request submission
    if (submitBotRequest) {
        submitBotRequest.addEventListener('click', () => {
            const role = document.getElementById('botRoleInput').value;
            const desc = document.getElementById('botDescInput').value;

            if (!role || !desc) {
                alert('Please fill out both fields');
                return;
            }

            // In a real app, this sends a POST to the backend
            submitBotRequest.innerText = 'Sending to CEO...';
            submitBotRequest.disabled = true;

            setTimeout(() => {
                alert(`Request for "${role}" sent to CEO for approval.`);
                submitBotRequest.innerText = 'Submit to CEO';
                submitBotRequest.disabled = false;
                document.getElementById('botRoleInput').value = '';
                document.getElementById('botDescInput').value = '';
                closeModal();
                loadAgents(); // Reload to hypothetically show new bot
            }, 1000);
        });
    }

    // --- Fetch Data ---
    async function loadAgents() {
        try {
            const res = await fetch('/api/agents');
            const agents = await res.json();
            const container = document.getElementById('agent-cards-container');
            if (!container) return;

            // Clear current (keep the request card if we had one, or clear all and rebuild)
            container.innerHTML = '';

            agents.forEach(agent => {
                const card = document.createElement('div');
                card.className = 'agent-card glass-panel';

                // Determine color class based on role roughly
                let colorClass = '';
                if (agent.role.includes('CEO')) colorClass = 'ceo';
                if (agent.role.includes('COO')) colorClass = 'coo';

                card.innerHTML = `
                    <div class="agent-avatar ${colorClass}">${agent.role.substring(0, 2).toUpperCase()}</div>
                    <h3>${agent.role}</h3>
                    <p class="role-desc">${agent.description}</p>
                    <div class="agent-meta">
                        <span class="status online"></span> Online
                    </div>
                    <div class="card-actions">
                        <button class="secondary-btn dm-btn" data-agent="${agent.id}">Message</button>
                    </div>
                `;
                container.appendChild(card);
            });

            // Re-attach message listeners
            attachMessageListeners();

        } catch (err) {
            console.error('Failed to load agents', err);
        }
    }

    let currentAgentId = null;

    function attachMessageListeners() {
        const dmBtns = document.querySelectorAll('.dm-btn');
        dmBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const agentId = btn.dataset.agent;
                const agentName = btn.closest('.agent-card').querySelector('h3').innerText;
                const colorClass = Array.from(btn.closest('.agent-card').querySelector('.agent-avatar').classList)
                    .find(c => c !== 'agent-avatar');

                // Switch to messages view
                switchView('messages');

                // Set Header
                document.getElementById('current-chat-name').innerText = agentName;
                const avatar = document.getElementById('current-chat-avatar');
                avatar.innerText = agentName.substring(0, 2).toUpperCase();
                avatar.className = `chat-avatar ${colorClass || ''}`;

                // Enable Input
                document.getElementById('chat-input').disabled = false;
                document.getElementById('send-btn').disabled = false;

                currentAgentId = agentId;
                loadChatHistory(agentId);
            });
        });
    }

    async function loadChatHistory(agentId) {
        const historyContainer = document.getElementById('chat-history');
        historyContainer.innerHTML = '<div class="empty-state">Loading history...</div>';

        try {
            const res = await fetch(`/api/chat/${agentId}`);
            const messages = await res.json();

            historyContainer.innerHTML = '';
            if (messages.length === 0) {
                historyContainer.innerHTML = '<div class="empty-state">No previous messages. Start the conversation!</div>';
                return;
            }

            messages.forEach(msg => {
                appendChatMessage(msg.sender, msg.message);
            });
            historyContainer.scrollTop = historyContainer.scrollHeight;
        } catch (err) {
            console.error('Failed to load chat', err);
            historyContainer.innerHTML = '<div class="empty-state">Error loading history.</div>';
        }
    }

    function appendChatMessage(sender, text) {
        const historyContainer = document.getElementById('chat-history');
        // Remove empty state if present
        if (historyContainer.querySelector('.empty-state')) {
            historyContainer.innerHTML = '';
        }

        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-bubble ${sender}`;
        msgDiv.innerText = text;
        historyContainer.appendChild(msgDiv);
        historyContainer.scrollTop = historyContainer.scrollHeight;
    }

    // Handle Sending Messages
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');

    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text || !currentAgentId) return;

        chatInput.value = '';
        appendChatMessage('user', text);

        try {
            const res = await fetch(`/api/chat/${currentAgentId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text })
            });
            const data = await res.json();
            if (data.reply) {
                appendChatMessage('agent', data.reply);
            }
        } catch (err) {
            console.error('Send error', err);
            appendChatMessage('agent', 'Error connecting to agent brain.');
        }
    }

    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    // --- WebSockets (Live Feed) ---
    const socket = io();
    const liveFeedContainer = document.getElementById('live-feed');

    socket.on('live_feed', (data) => {
        if (!liveFeedContainer) return;

        const rolePrefix = data.agent === 'System' ? 'system' : data.agent.substring(0, 3).toLowerCase();
        const avatarColorClass = rolePrefix.includes('ceo') ? 'ceo' : (rolePrefix.includes('coo') ? 'coo' : '');
        const timeStr = new Date(data.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const feedItem = document.createElement('div');
        feedItem.className = 'feed-item';
        feedItem.innerHTML = `
            <div class="feed-avatar ${avatarColorClass}">${data.agent.substring(0, 1).toUpperCase()}</div>
            <div class="feed-content">
                <h4>${data.agent} <span>${timeStr}</span></h4>
                <p>${data.message}</p>
            </div>
        `;

        // Prepend to show newest at top
        liveFeedContainer.prepend(feedItem);
    });

    // Initialize
    loadAgents();
});
