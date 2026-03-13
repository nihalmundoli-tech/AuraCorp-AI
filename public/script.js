document.addEventListener('DOMContentLoaded', () => {
    // Initialize WebSockets
    const socket = io();

    // --- Navigation & View Switching ---
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view');
    const liveFeedContainer = document.getElementById('live-feed');

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
            const agentId = item.dataset.agent;

            switchView(target);

            // Special case: Direct to Company Room if clicking from nav
            if (agentId === "0") {
                openCompanyRoom();
            }
        });
    });

    function openCompanyRoom() {
        switchView('messages');
        const companyRoomItem = document.querySelector('.chat-sidebar-item[data-agent="0"]');
        if (companyRoomItem) {
            companyRoomItem.click();
        } else {
            // Manual fallback if not yet loaded in sidebar
            setupChatView("0", "Director's Command Center", "/assets/avatar_ceo.png", "ceo");
        }
    }

    function setupChatView(agentId, agentName, avatarImg, colorClass) {
        // Set Header
        const nameEl = document.getElementById('current-chat-name');
        const avatar = document.getElementById('current-chat-avatar');

        if (agentId === "0") {
            nameEl.innerHTML = `Director's Command Center <span style="font-size: 0.7rem; color: var(--accent-primary); opacity: 0.8; margin-left: 8px;">Unified Channel</span>`;
            avatar.innerHTML = `
                <div class="company-logo-header">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                        <path d="M2 17l10 5 10-5"></path>
                        <path d="M2 12l10 5 10-5"></path>
                    </svg>
                </div>
            `;
            avatar.className = `chat-avatar company`;
            avatar.style.background = 'var(--accent-primary)';
            avatar.style.color = 'white';
            avatar.style.padding = '0';
        } else {
            nameEl.innerText = agentName;
            if (avatarImg) {
                avatar.innerHTML = `<img src="${avatarImg}" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit;" alt="${agentName}">`;
                avatar.style.overflow = 'hidden';
                avatar.style.padding = '0';
            } else {
                avatar.innerText = agentName.substring(0, 2).toUpperCase();
            }
            avatar.className = `chat-avatar ${colorClass || ''}`;
        }

        // Enable Input
        const chatInput = document.getElementById('chat-input');
        const sendBtn = document.getElementById('send-btn');
        chatInput.disabled = false;
        sendBtn.disabled = false;
        chatInput.placeholder = agentId === "0" ? "Command the whole team..." : `Message ${agentName}...`;
        chatInput.focus();

        currentAgentId = agentId;
        loadChatHistory(agentId);
    }

    // --- Top Navigation Interactions ---
    const searchInput = document.querySelector('.header-search input');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && searchInput.value.trim() !== '') {
                const query = searchInput.value;
                searchInput.value = 'Searching database...';
                searchInput.disabled = true;
                setTimeout(() => {
                    searchInput.value = '';
                    searchInput.disabled = false;
                    searchInput.placeholder = `No results found for "${query}"`;
                    setTimeout(() => searchInput.placeholder = "Search tasks, agents, or messages...", 3000);
                }, 1500);
            }
        });
    }

    const notifToggle = document.getElementById('notification-toggle');
    const notifPanel = document.getElementById('notification-panel');
    const notifClose = document.getElementById('notif-close');
    const toastContainer = document.getElementById('toast-container');

    if (notifToggle) {
        notifToggle.addEventListener('click', () => {
            notifPanel.classList.add('open');
            const badge = notifToggle.querySelector('.badge');
            if (badge) badge.style.display = 'none';
        });
    }

    if (notifClose) {
        notifClose.addEventListener('click', () => {
            notifPanel.classList.remove('open');
        });
    }

    // --- Toast Notification System ---
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icon = type === 'error' ? '❌' : (type === 'success' ? '✅' : 'ℹ️');
        
        toast.innerHTML = `
            <span>${icon}</span>
            <div style="font-size: 13px; font-weight: 500;">${message}</div>
        `;
        
        toastContainer.appendChild(toast);
        
        // Add to notification panel list too
        addNotificationToList(message, type);

        setTimeout(() => {
            toast.style.transform = 'translateX(100%)';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }

    function addNotificationToList(message, type) {
        const notifList = document.getElementById('notif-list');
        const item = document.createElement('div');
        item.className = `notification-item ${type}`;
        item.innerHTML = `
            <div style="font-weight:600; font-size:13px;">${type.toUpperCase()}</div>
            <p style="font-size:12px; margin:5px 0 0 0; color:var(--text-dim);">${message}</p>
            <span style="font-size:10px; color:var(--text-dim); opacity:0.6;">Just now</span>
        `;
        notifList.prepend(item);
        
        // Show badge if panel is closed
        if(!notifPanel.classList.contains('open')) {
            const badge = document.getElementById('notif-badge');
            if(badge) {
                badge.style.display = 'block';
                badge.innerText = parseInt(badge.innerText || 0) + 1;
            }
        }
    }

    // Expose showToast globally
    window.showToast = showToast;

    // --- Modal Logic (Generic) ---
    const requestBotBtn = document.getElementById('requestBotBtn');
    const newBotModal = document.getElementById('newBotModal');
    const newTaskBtn = document.getElementById('newTaskBtn');
    const newTaskModal = document.getElementById('newTaskModal');
    const closeBtns = document.querySelectorAll('.close-btn');

    function openModal(modal) {
        if (!modal) return;
        modal.style.display = 'flex';
        // small delay to allow display flex to apply before opacity transition
        setTimeout(() => modal.classList.add('show'), 10);
    }

    function closeModal(modal) {
        if (!modal) return;
        modal.classList.remove('show');
        setTimeout(() => modal.style.display = 'none', 300);
    }

    if (requestBotBtn) requestBotBtn.addEventListener('click', () => openModal(newBotModal));

    closeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal-backdrop');
            closeModal(modal);
        });
    });

    // Close on backdrop click
    window.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-backdrop')) {
            closeModal(e.target);
        }
    });

    // Handle bot request submission
    if (submitBotRequest) {
        submitBotRequest.addEventListener('click', () => {
            const role = document.getElementById('botRoleInput').value;
            const desc = document.getElementById('botDescInput').value;

            // Remove any old errors
            const existingErr = newBotModal.querySelector('.error-msg');
            if (existingErr) existingErr.remove();

            if (!role || !desc) {
                const errMsg = document.createElement('div');
                errMsg.className = 'error-msg';
                errMsg.style.color = '#ef4444';
                errMsg.style.fontSize = '0.85rem';
                errMsg.style.marginTop = '10px';
                errMsg.innerText = 'Error: Please fill out both the Proposed Role Title and Job Description fields.';
                newBotModal.querySelector('.modal-body').appendChild(errMsg);
                return;
            }

            // Connect to real backend
            submitBotRequest.innerText = 'Creating Agent...';
            submitBotRequest.disabled = true;

            fetch('/api/agents', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('waaToken')}`
                },
                body: JSON.stringify({
                    role: role,
                    description: desc,
                    system_prompt: `You are the ${role}. Your duties include: ${desc}. Act according to your corporate rank and role.`
                })
            })
                .then(res => res.json())
                .then(data => {
                    alert(`Agent "${role}" has been created and inducted into the AuraCorp system.`);
                    submitBotRequest.innerText = 'Submit to CEO';
                    submitBotRequest.disabled = false;
                    document.getElementById('botRoleInput').value = '';
                    document.getElementById('botDescInput').value = '';
                    closeModal();
                    loadAgents(); // Reload list
                })
                .catch(err => {
                    console.error('Bot creation error', err);
                    alert('Management rejected the request (System Error).');
                    submitBotRequest.innerText = 'Submit to CEO';
                    submitBotRequest.disabled = false;
                });
        });
    }

    async function loadAgents() {
        try {
            console.log('Fetching workforce data...');
            const agentRes = await fetch('/api/agents', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('waaToken')}` }
            });
            const agents = await agentRes.json();

            let activeAgentIds = [];
            try {
                const taskRes = await fetch('/api/tasks', {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('waaToken')}` }
                });
                const tasks = await taskRes.json();
                activeAgentIds = tasks
                    .filter(t => t.status === 'in-progress')
                    .map(t => t.assigned_agent_id);
            } catch (taskErr) {
                console.warn('Failed to load tasks for status check', taskErr);
            }

            const container = document.getElementById('agent-cards-container');
            const chatSidebar = document.getElementById('chat-sidebar-list');
            if (!container) return;

            console.log(`Inducting ${agents.length} agents into the UI...`);
            container.innerHTML = '';
            if (chatSidebar) {
                chatSidebar.innerHTML = `
                    <li class="chat-sidebar-item" data-agent="0">
                        <div class="chat-avatar ceo" style="width: 32px; height: 32px; font-size: 0.9rem; overflow: hidden; padding: 0;">
                             <img src="/assets/avatar_ceo.png" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit;" alt="Company Room">
                        </div>
                        <div style="display: flex; flex-direction: column;">
                            <span style="font-weight: 600; font-size: 0.95rem; color: var(--text-primary);">Director's Command Center</span>
                            <span style="font-size: 0.75rem; color: var(--accent-primary);">Workforce Collective</span>
                        </div>
                    </li>
                `;
            }

            agents.forEach(agent => {
                // Skip the Company Room agent if it comes from the DB list (to avoid duplicates)
                if (agent.id === 0) return;

                const isWorking = activeAgentIds.includes(agent.id);
                const card = document.createElement('div');
                card.className = `agent-card glass-panel ${isWorking ? 'working' : ''}`;

                const skillsHtml = (agent.skills && agent.skills.length > 0)
                    ? `<div class="agent-skills">
                        ${agent.skills.map(s => `<span class="skill-tag">${s}</span>`).join('')}
                       </div>`
                    : '';

                // Determine color class and avatar image based on specific role
                let colorClass = 'tech';
                let avatarImg = '/assets/tech.png'; // Default
                const roleLower = agent.role.toLowerCase();

                if (roleLower.includes('ceo')) {
                    colorClass = 'ceo';
                    avatarImg = '/assets/avatar_ceo.png';
                } else if (roleLower.includes('coo')) {
                    colorClass = 'coo';
                    avatarImg = '/assets/avatar_coo.png';
                } else if (roleLower.includes('hr')) {
                    colorClass = 'coo'; // Reusing blue hue for HR
                    avatarImg = '/assets/avatar_hr.png';
                } else if (roleLower.includes('database')) {
                    colorClass = 'ceo'; // Reusing yellow/orange hue for DB
                    avatarImg = '/assets/avatar_db.png';
                } else if (roleLower.includes('strategy')) {
                    colorClass = 'evaluator'; // Reusing purple hue for Strategy
                    avatarImg = '/assets/avatar_strategy.png';
                } else if (roleLower.includes('creator') || roleLower.includes('tech')) {
                    colorClass = 'tech';
                    avatarImg = '/assets/avatar_dev.png';
                } else if (roleLower.includes('evaluator')) {
                    colorClass = 'evaluator';
                    avatarImg = '/assets/avatar_evaluator.png';
                } else {
                     avatarImg = '/assets/avatar_dev.png'; // Fallback
                }

                card.innerHTML = `
                    <div class="agent-avatar ${colorClass}">
                        <div class="speech-bubble">Thinking...</div>
                        <div class="feeling-emoji">😊</div>
                        <img src="${avatarImg}" onerror="this.style.display='none'; this.parentElement.insertAdjacentHTML('beforeend', '<div class=\\'fallback-initials\\'>${agent.role.substring(0, 2).toUpperCase()}</div>')" alt="${agent.role}">
                    </div>
                    <h3>${agent.role}</h3>
                    <p class="role-desc">${agent.description}</p>
                    ${skillsHtml}
                    <div class="agent-meta">
                        <span class="status ${isWorking ? 'pending' : 'online'}"></span> 
                        ${isWorking ? 'Busy Working...' : 'Available / Idle'}
                    </div>
                    <div class="card-actions">
                        <button class="secondary-btn dm-btn" data-agent="${agent.id}">Message</button>
                    </div>
                `;
                container.appendChild(card);

                // Populate chat sidebar
                if (chatSidebar) {
                    const li = document.createElement('li');
                    li.className = 'chat-sidebar-item';
                    li.dataset.agent = agent.id;
                    li.innerHTML = `
                        <div class="chat-avatar ${colorClass}" style="width: 32px; height: 32px; font-size: 0.9rem; overflow: hidden; padding: 0;">
                            <img src="${avatarImg}" style="width: 100%; height: 100%; object-fit: cover; border-radius: inherit;" alt="${agent.role}">
                        </div>
                        <div style="display: flex; flex-direction: column;">
                            <span style="font-weight: 600; font-size: 0.95rem; color: var(--text-primary);">${agent.role}</span>
                            <span style="font-size: 0.75rem; color: var(--text-secondary);">${isWorking ? 'Busy Working' : 'Available'}</span>
                        </div>
                    `;
                    chatSidebar.appendChild(li);
                }

                // Add mouse interaction logic
                setupAvatarInteractions(card.querySelector('.agent-avatar'));
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
            // Remove old listeners to prevent duplicates
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);

            newBtn.addEventListener('click', (e) => {
                const agentId = newBtn.dataset.agent;
                const card = newBtn.closest('.agent-card');
                const agentName = card.querySelector('h3').innerText;
                const avatarEl = card.querySelector('.agent-avatar');
                const colorClass = Array.from(avatarEl.classList).find(c => c !== 'agent-avatar');
                const imgElement = avatarEl.querySelector('img');

                // Switch to the Messages view first, then open this agent's chat
                switchView('messages');
                setupChatView(agentId, agentName, imgElement ? imgElement.src : null, colorClass);

                // Also highlight the correct sidebar item if it exists
                const sidebarItem = document.querySelector(`.chat-sidebar-item[data-agent="${agentId}"]`);
                if (sidebarItem) {
                    document.querySelectorAll('.chat-sidebar-item').forEach(i => i.classList.remove('active'));
                    sidebarItem.classList.add('active');
                }
            });
        });

        // Sidebar List Items
        const sidebarItems = document.querySelectorAll('.chat-sidebar-item');
        sidebarItems.forEach(item => {
            const newItem = item.cloneNode(true);
            item.parentNode.replaceChild(newItem, item);

            newItem.addEventListener('click', () => {
                // Highlight active
                document.querySelectorAll('.chat-sidebar-item').forEach(i => i.classList.remove('active'));
                newItem.classList.add('active');

                const agentId = newItem.dataset.agent;
                const agentName = newItem.querySelector('span').innerText;
                const avatarEl = newItem.querySelector('.chat-avatar');
                const colorClass = Array.from(avatarEl.classList).find(c => c !== 'chat-avatar');
                const imgElement = avatarEl.querySelector('img');

                setupChatView(agentId, agentName, imgElement ? imgElement.src : null, colorClass);
            });
        });
    }

    async function loadChatHistory(agentId) {
        const historyContainer = document.getElementById('chat-history');
        historyContainer.innerHTML = '<div class="empty-state">Loading history...</div>';

        try {
            const res = await fetch(`/api/chat/${agentId}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('waaToken')}` }
            });
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

        // Basic Markdown Parser for Gemini Responses
        let formattedText = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.1); padding:2px 4px; border-radius:4px;">$1</code>')
            .replace(/\n/g, '<br>');

        const msgDiv = document.createElement('div');
        const isUser = sender === 'user';
        msgDiv.className = `chat-bubble ${isUser ? 'user' : 'agent'}`;

        // Sender label — always shown, above the message
        const senderLabel = document.createElement('div');
        senderLabel.className = 'bubble-label';
        if (isUser) {
            senderLabel.innerText = 'You';
        } else if (currentAgentId === "0") {
            senderLabel.innerText = (sender === 'agent') ? 'CEO' : sender;
        } else {
            // Individual chat: show the agent's name from chat header
            const agentNameEl = document.getElementById('current-chat-name');
            senderLabel.innerText = agentNameEl ? agentNameEl.innerText : 'Agent';
        }

        const msgContent = document.createElement('div');
        msgContent.className = 'bubble-text';
        msgContent.innerHTML = formattedText;

        // Build in correct order: label on top, then content
        msgDiv.appendChild(senderLabel);
        msgDiv.appendChild(msgContent);

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

        // Add thinking indicator
        const historyContainer = document.getElementById('chat-history');
        const thinkingDiv = document.createElement('div');
        thinkingDiv.className = `chat-bubble agent thinking-indicator`;
        thinkingDiv.innerText = 'Thinking...';
        historyContainer.appendChild(thinkingDiv);
        historyContainer.scrollTop = historyContainer.scrollHeight;

        try {
            const res = await fetch(`/api/chat/${currentAgentId}`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('waaToken')}`
                },
                body: JSON.stringify({ message: text })
            });
            const data = await res.json();

            // Remove thinking indicator
            thinkingDiv.remove();

            if (data.reply) {
                appendChatMessage('agent', data.reply);
            } else if (data.error) {
                appendChatMessage('agent', `[System Error]: ${data.error}`);
            }
        } catch (err) {
            console.error('Send error', err);
            thinkingDiv.remove();
            appendChatMessage('agent', '[Connection Error]: Could not reach agent brain.');
        }
    }

    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !chatInput.disabled) {
            e.preventDefault(); // Prevent accidental form submissions if any
            sendMessage();
        }
    });

    // --- Character System & Interactions ---
    function setupAvatarInteractions(avatar) {
        if (!avatar) return;

        const bubble = avatar.querySelector('.speech-bubble');
        const feelingsEl = avatar.querySelector('.feeling-emoji');
        const greetings = ["Thinking...", "Hello!", "Working hard!", "AuraCorp FTW!", "Hi Boss!", "Zoom zoom!", "Ready!"];
        const feelings = ["😊", "🤖", "⚡", "🔥", "✨", "🚀", "❤️", "🥰"];

        // Fleeing Logic - More playful and responsive
        avatar.addEventListener('mousemove', (e) => {
            const rect = avatar.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            const dx = e.clientX - centerX;
            const dy = e.clientY - centerY;
            const dist = Math.sqrt(dx * dx + dy * dy);

            // Trigger flee if mouse is within 100px radius
            if (dist < 100) {
                const intensity = (1 - dist / 100) * 40; // Moves further as mouse gets closer
                const moveX = (dx > 0 ? -1 : 1) * intensity;
                const moveY = (dy > 0 ? -1 : 1) * intensity;

                avatar.style.transform = `translate(${moveX}px, ${moveY}px) scale(1.15) rotate(${moveX * 0.5}deg)`;

                // Show feeling intermittently
                if (feelingsEl && !feelingsEl.classList.contains('show') && Math.random() > 0.8) {
                    feelingsEl.innerText = feelings[Math.floor(Math.random() * feelings.length)];
                    feelingsEl.classList.add('show');
                    setTimeout(() => feelingsEl.classList.remove('show'), 1000);
                }
            }
        });

        avatar.addEventListener('mouseleave', () => {
            avatar.style.transform = 'translate(0, 0) scale(1) rotate(0deg)';
        });

        // Click interaction
        avatar.addEventListener('click', () => {
            if (bubble) {
                bubble.innerText = greetings[Math.floor(Math.random() * greetings.length)];
                bubble.classList.add('show');
                setTimeout(() => bubble.classList.remove('show'), 2000);
            }
            if (feelingsEl) {
                feelingsEl.innerText = "🥰";
                feelingsEl.classList.add('show');
                setTimeout(() => feelingsEl.classList.remove('show'), 2000);
            }
            // Add a little "jump" on click
            avatar.animate([
                { transform: 'scale(1)' },
                { transform: 'scale(1.3) translateY(-10px)' },
                { transform: 'scale(1)' }
            ], { duration: 300, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
        });
    }

    // --- WebSockets (Live Feed Update) ---
    socket.on('live_feed', (data) => {
        if (!liveFeedContainer) return;

        // Trigger speech bubbles on the roster for active bots
        const agents = document.querySelectorAll('.agent-card');
        agents.forEach(card => {
            if (card.querySelector('h3').innerText === data.agent) {
                const bubble = card.querySelector('.speech-bubble');
                if (bubble) {
                    bubble.innerText = "I'm on it!";
                    bubble.classList.add('show');
                    setTimeout(() => bubble.classList.remove('show'), 3000);
                }
            }
        });

        const timeStr = new Date(data.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        // --- ROUTING LOGIC: Determine if this belongs in "Bot Decisions" or "Live Feed" ---
        const decisionAgents = ['Skill Evaluator', 'System', 'CEO Agent'];
        const decisionKeywords = ['APPROVED', 'REJECTED', 'Assigned new skill', 'synthesized and deployed', 'Strategic check', 'Decision:'];
        
        const isDecision = decisionAgents.includes(data.agent) || 
                           decisionKeywords.some(k => data.message.includes(k));

        // FILTER: No Director messages in Office Space
        if (data.agent === 'Master User' && !isDecision) {
            return; // Don't show Director messages in internal office space feed
        }

        const targetContainer = isDecision ? document.getElementById('bot-decisions-feed') : liveFeedContainer;
        
        if (!targetContainer) return;

        // Remove empty state if present
        const emptyState = targetContainer.querySelector('.empty-state');
        if (emptyState) emptyState.remove();

        const rolePrefix = data.agent === 'System' ? 'system' : data.agent.substring(0, 3).toLowerCase();
        let avatarColorClass = '';
        
        if (rolePrefix.includes('ceo')) avatarColorClass = 'ceo';
        else if (rolePrefix.includes('coo')) avatarColorClass = 'coo';
        else if (data.agent === 'Master User') avatarColorClass = 'user';
        else if (data.agent === 'System') avatarColorClass = 'system';
        
        if (isDecision) {
            avatarColorClass = 'decision';
        }

        // --- NEW: Trigger Toast Alerts ---
        if (data.type === 'alert' || data.message.includes('FAILURE') || data.message.includes('FAILED')) {
            showToast(data.message, 'error');
            // Flash the node in the visual pipeline if it exists
            const nodeId = data.agent.toLowerCase().includes('bot 1') ? 'node-intake' : 
                         (data.agent.toLowerCase().includes('bot 2') ? 'node-external' : 
                         (data.agent.toLowerCase().includes('bot 3') ? 'node-social' : 'node-hr'));
            const node = document.getElementById(nodeId);
            if(node) {
                node.style.borderColor = 'var(--error)';
                node.style.boxShadow = '0 0 15px var(--error)';
                setTimeout(() => {
                    node.style.borderColor = '';
                    node.style.boxShadow = '';
                }, 3000);
            }
        } else if (data.message.includes('completed') || data.message.includes('Success')) {
            showToast(data.message, 'success');
        }

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
        targetContainer.prepend(feedItem);
    });

    // --- Background Particles ---
    function initParticles() {
        const container = document.getElementById('particles');
        if (!container) return;
        for (let i = 0; i < 20; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            const size = Math.random() * 4 + 2 + 'px';
            p.style.width = size;
            p.style.height = size;
            p.style.left = Math.random() * 100 + 'vw';
            p.style.setProperty('--d', Math.random() * 10 + 10 + 's');
            p.style.animationDelay = Math.random() * 5 + 's';
            container.appendChild(p);
        }
    }
    initParticles();

    // --- Task Modal & Creation ---
    const submitTaskBtn = document.getElementById('submitTaskBtn');
    const taskAgentSelect = document.getElementById('taskAgentSelect');

    if (newTaskBtn) {
        newTaskBtn.addEventListener('click', () => {
            // Populate agents dropdown
            fetch('/api/agents')
                .then(res => res.json())
                .then(agents => {
                    taskAgentSelect.innerHTML = agents.map(a => `<option value="${a.id}">${a.role}</option>`).join('');
                    openModal(newTaskModal);
                });
        });
    }

    if (submitTaskBtn) {
        submitTaskBtn.addEventListener('click', () => {
            const title = document.getElementById('taskTitleInput').value;
            const desc = document.getElementById('taskDescInput').value;
            const agentId = taskAgentSelect.value;

            // Remove any old errors
            const existingErr = newTaskModal.querySelector('.error-msg');
            if (existingErr) existingErr.remove();

            if (!title) {
                const errMsg = document.createElement('div');
                errMsg.className = 'error-msg';
                errMsg.style.color = '#ef4444';
                errMsg.style.fontSize = '0.85rem';
                errMsg.style.marginTop = '10px';
                errMsg.innerText = 'Error: Task Title is required to initialize a loop.';
                newTaskModal.querySelector('.modal-body').appendChild(errMsg);
                return;
            }

            submitTaskBtn.disabled = true;
            submitTaskBtn.innerText = 'Initializing...';

            fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, description: desc, assigned_agent_id: agentId })
            })
                .then(res => res.json())
                .then(() => {
                    alert('Task loop initialized. The agent will begin working shortly.');
                    newTaskModal.classList.remove('show');
                    setTimeout(() => newTaskModal.style.display = 'none', 300);
                    document.getElementById('taskTitleInput').value = '';
                    document.getElementById('taskDescInput').value = '';
                    submitTaskBtn.disabled = false;
                    submitTaskBtn.innerText = 'Initialize Work';
                    loadTasks();
                })
                .catch(err => {
                    console.error(err);
                    alert('Failed to initialize task.');
                    submitTaskBtn.disabled = false;
                });
        });
    }

    // --- Kanban Board Logic ---
    async function loadTasks() {
        try {
            const res = await fetch('/api/tasks');
            const tasks = await res.json();

            // Clear columns
            ['col-pending', 'col-running', 'col-completed', 'col-failed'].forEach(id => {
                const col = document.getElementById(id);
                if (col) col.innerHTML = '';
            });

            tasks.forEach(task => {
                const card = document.createElement('div');
                card.className = 'task-card glass-panel';
                card.draggable = true;
                card.innerHTML = `
                    <div class="task-header">
                        <span class="task-id">#${task.id}</span>
                        <div class="task-status-light ${task.status}"></div>
                    </div>
                    <h4>${task.title}</h4>
                    <p>${task.description.substring(0, 100)}${task.description.length > 100 ? '...' : ''}</p>
                    <div class="task-footer">
                        <div class="assigned-bot">
                            <div class="bot-icon">🤖</div>
                            <span>Agent #${task.assigned_agent_id}</span>
                        </div>
                    </div>
                `;

                let colId = 'col-pending';
                if (task.status === 'pending') colId = 'col-pending';
                else if (task.status === 'running' || task.status === 'in-progress') colId = 'col-running';
                else if (task.status === 'completed' || task.status === 'done') colId = 'col-completed';
                else if (task.status === 'failed') colId = 'col-failed';

                const col = document.getElementById(colId);
                if (col) col.appendChild(card);
            });

            // Update counts
            document.getElementById('count-pending').innerText = tasks.filter(t => t.status === 'pending').length;
            document.getElementById('count-running').innerText = tasks.filter(t => t.status === 'running' || t.status === 'in-progress').length;
            document.getElementById('count-completed').innerText = tasks.filter(t => t.status === 'completed' || t.status === 'done').length;
            document.getElementById('count-failed').innerText = tasks.filter(t => t.status === 'failed').length;
        } catch (err) {
            console.error('Failed to load tasks', err);
        }
    }

    // --- Marketplace Logic ---
    const marketplaceData = {
        bots: [
            { name: 'External Search Pro', role: 'External Candidate Search', icon: '🔍', desc: 'Specialized in LinkedIn and Naukri scraping.' },
            { name: 'Social Distribution v2', role: 'Marketing distribution', icon: '📢', desc: 'Auto-posts to Instagram/LinkedIn.' },
            { name: 'Resume Intelligence', role: 'Advanced Parsing', icon: '📄', desc: 'High-accuracy resume extraction.' }
        ],
        skills: [
            { name: 'Web Browsing', type: 'Skill', icon: '🌐', desc: 'Allows bots to search the internet.' },
            { name: 'Database Query', type: 'Skill', icon: '💾', desc: 'Direct SQL execution capabilities.' },
            { name: 'Cold Emailing', type: 'Skill', icon: '📧', desc: 'Automated outreach with personalized templates.' }
        ]
    };

    function loadMarketplace(type = 'bots') {
        const container = document.getElementById('marketplace-content');
        if (!container) return;
        container.innerHTML = '';

        const items = marketplaceData[type] || [];
        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'agent-card glass-panel';
            card.innerHTML = `
                <div class="agent-avatar" style="background:rgba(59,130,246,0.1); font-size: 24px;">${item.icon}</div>
                <h3>${item.name}</h3>
                <p class="role-desc" style="font-size: 0.8rem; height: 40px;">${item.desc}</p>
                <div class="card-actions">
                    <button class="primary-btn deploy-module-btn" style="width:100%; font-size:12px;">DEPLOY MODULE</button>
                </div>
            `;
            container.appendChild(card);

            card.querySelector('.deploy-module-btn').addEventListener('click', () => {
                showToast(`Deploying ${item.name} to workforce...`, 'info');
                setTimeout(() => {
                    showToast(`${item.name} successfully deployed and active!`, 'success');
                }, 2000);
            });
        });
    }

    // Tab switching for marketplace
    const marketplaceTabs = document.querySelectorAll('.tab-btn');
    marketplaceTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            marketplaceTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            loadMarketplace(tab.dataset.tab);
        });
    });

    // --- Settings / API Configuration ---
    const saveKeysBtn = document.getElementById('saveKeysBtn');
    if (saveKeysBtn) {
        saveKeysBtn.addEventListener('click', () => {
            const keys = {
                gemini_key: document.getElementById('geminiKey').value.trim(),
                groq_key: document.getElementById('groqKey').value.trim(),
                openrouter_key: document.getElementById('openrouterKey').value.trim()
            };

            saveKeysBtn.innerText = '🔐 SYNCHRONIZING...';
            saveKeysBtn.disabled = true;

            fetch('/api/settings', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('waaToken')}`
                },
                body: JSON.stringify(keys)
            })
            .then(res => res.json())
            .then(() => {
                showToast('API Vault synchronized successfully', 'success');
                saveKeysBtn.innerText = '✅ VAULT SYNCHRONIZED';
                saveKeysBtn.disabled = false;
                setTimeout(() => {
                    saveKeysBtn.innerText = '🔐 SYNCHRONIZE VAULT';
                }, 3000);
            })
            .catch(err => {
                console.error('Save error', err);
                showToast('Failed to synchronize vault', 'error');
                saveKeysBtn.innerText = '❌ SYNC FAILED';
                saveKeysBtn.disabled = false;
            });
        });

        const saveRecruitmentBtn = document.getElementById('saveRecruitmentBtn');
        if (saveRecruitmentBtn) {
            saveRecruitmentBtn.addEventListener('click', () => {
                const keys = {
                    naukri_key: document.getElementById('naukriKey').value.trim(),
                    linkedin_key: document.getElementById('linkedinKey').value.trim(),
                    whatsapp_key: document.getElementById('whatsappKey').value.trim(),
                    spreadsheet_id: document.getElementById('spreadsheetIdInput').value.trim()
                };

                saveRecruitmentBtn.innerText = '💾 SAVING...';
                saveRecruitmentBtn.disabled = true;

                fetch('/api/settings/recruitment', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('waaToken')}`
                    },
                    body: JSON.stringify(keys)
                })
                .then(res => res.json())
                .then(() => {
                    showToast('Recruitment Nodes secured', 'success');
                    saveRecruitmentBtn.innerText = '✅ NODES SECURED';
                    saveRecruitmentBtn.disabled = false;
                    setTimeout(() => {
                        saveRecruitmentBtn.innerText = '💾 SAVE RECRUITMENT NODES';
                    }, 3000);
                })
                .catch(err => {
                    console.error('Save error', err);
                    showToast('Failed to save recruitment nodes', 'error');
                    saveRecruitmentBtn.innerText = '❌ SAVE FAILED';
                    saveRecruitmentBtn.disabled = false;
                });
            });
        }

        // Load existing
        fetch('/api/settings', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('waaToken')}` }
        })
            .then(res => res.json())
            .then(saved => {
                if (saved.gemini_key) document.getElementById('geminiKey').value = saved.gemini_key;
                if (saved.groq_key) document.getElementById('groqKey').value = saved.groq_key;
                if (saved.openrouter_key) document.getElementById('openrouterKey').value = saved.openrouter_key;
                
                // Recruitment keys
                if (saved.naukri_key) document.getElementById('naukriKey').value = saved.naukri_key;
                if (saved.linkedin_key) document.getElementById('linkedinKey').value = saved.linkedin_key;
                if (saved.whatsapp_key) document.getElementById('whatsappKey').value = saved.whatsapp_key;
                if (saved.google_sheets_id) document.getElementById('spreadsheetIdInput').value = saved.google_sheets_id;
            })
            .catch(err => console.error('Load settings error', err));
    }

    function syncDashboardStats() {
        fetch('/api/monitoring/dashboard', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('waaToken')}` }
        })
        .then(res => res.json())
        .then(stats => {
            const agentsEl = document.getElementById('stat-agents');
            const approvalsEl = document.getElementById('stat-approvals');
            const targetEl = document.getElementById('stat-target');
            const leadsEl = document.getElementById('stat-leads');

            if (agentsEl) agentsEl.innerText = stats.active_agents;
            if (approvalsEl) approvalsEl.innerText = stats.ceo_approvals;
            if (targetEl) targetEl.innerText = `${stats.monthly_target}%`;
            if (leadsEl) leadsEl.innerText = stats.leads_processed.toLocaleString();
        })
        .catch(err => console.error('Stats sync error', err));
    }

    // Initial load
    loadAgents();
    loadTasks();
    loadMarketplace('bots');
    syncDashboardStats();
    setInterval(syncDashboardStats, 30000); // Sync every 30s
});
