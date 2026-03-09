document.addEventListener('DOMContentLoaded', () => {
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

            // Connect to real backend
            submitBotRequest.innerText = 'Creating Agent...';
            submitBotRequest.disabled = true;

            fetch('/api/agents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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

    // --- Fetch Data ---
    async function loadAgents() {
        try {
            console.log('Fetching workforce data...');
            const agentRes = await fetch('/api/agents');
            const agents = await agentRes.json();

            let activeAgentIds = [];
            try {
                const taskRes = await fetch('/api/tasks');
                const tasks = await taskRes.json();
                activeAgentIds = tasks
                    .filter(t => t.status === 'in-progress')
                    .map(t => t.assigned_agent_id);
            } catch (taskErr) {
                console.warn('Failed to load tasks for status check', taskErr);
            }

            const container = document.getElementById('agent-cards-container');
            if (!container) return;

            console.log(`Inducting ${agents.length} agents into the UI...`);
            container.innerHTML = '';

            agents.forEach(agent => {
                const isWorking = activeAgentIds.includes(agent.id);
                const card = document.createElement('div');
                card.className = `agent-card glass-panel ${isWorking ? 'working' : ''}`;

                const skillsHtml = (agent.skills && agent.skills.length > 0)
                    ? `<div class="agent-skills">
                        ${agent.skills.map(s => `<span class="skill-tag">${s}</span>`).join('')}
                       </div>`
                    : '';

                // Determine color class and avatar image
                let colorClass = '';
                let avatarImg = '';
                if (agent.role.includes('CEO')) {
                    colorClass = 'ceo';
                    avatarImg = '/assets/ceo.png';
                } else if (agent.role.includes('Skill Evaluator')) {
                    colorClass = 'evaluator';
                    avatarImg = '/assets/evaluator.png';
                } else {
                    colorClass = 'tech';
                    avatarImg = '/assets/tech.png';
                }

                card.innerHTML = `
                    <div class="agent-avatar ${colorClass}">
                        <div class="speech-bubble">Thinking...</div>
                        <div class="feeling-emoji">😊</div>
                        <img src="${avatarImg}" onerror="this.style.display='none'; this.parentElement.insertAdjacentHTML('beforeend', '<div class=\"fallback-initials\">${agent.role.substring(0, 2).toUpperCase()}</div>')" alt="${agent.role}">
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

                // Switch to messages view
                switchView('messages');

                // Set Header
                document.getElementById('current-chat-name').innerText = agentName;
                const avatar = document.getElementById('current-chat-avatar');
                avatar.innerText = agentName.substring(0, 2).toUpperCase();
                avatar.className = `chat-avatar ${colorClass || ''}`;

                // Enable Input
                const chatInput = document.getElementById('chat-input');
                const sendBtn = document.getElementById('send-btn');
                chatInput.disabled = false;
                sendBtn.disabled = false;
                chatInput.focus();

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
                headers: { 'Content-Type': 'application/json' },
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
    const newTaskBtn = document.getElementById('newTaskBtn');
    const newTaskModal = document.getElementById('newTaskModal');
    const submitTaskBtn = document.getElementById('submitTaskBtn');
    const taskAgentSelect = document.getElementById('taskAgentSelect');

    if (newTaskBtn) {
        newTaskBtn.addEventListener('click', () => {
            // Populate agents dropdown
            fetch('/api/agents')
                .then(res => res.json())
                .then(agents => {
                    taskAgentSelect.innerHTML = agents.map(a => `<option value="${a.id}">${a.role}</option>`).join('');
                    newTaskModal.style.display = 'flex';
                    setTimeout(() => newTaskModal.classList.add('show'), 10);
                });
        });
    }

    if (submitTaskBtn) {
        submitTaskBtn.addEventListener('click', () => {
            const title = document.getElementById('taskTitleInput').value;
            const desc = document.getElementById('taskDescInput').value;
            const agentId = taskAgentSelect.value;

            if (!title) return alert('Title is required');

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

    // Close on backdrop click for newTaskModal
    window.addEventListener('click', (e) => {
        if (e.target === newTaskModal) {
            newTaskModal.classList.remove('show');
            setTimeout(() => newTaskModal.style.display = 'none', 300);
        }
    });

    // --- Kanban Board Logic ---
    async function loadTasks() {
        try {
            const res = await fetch('/api/tasks');
            const tasks = await res.json();

            // Clear columns
            document.getElementById('col-backlog').innerHTML = '';
            document.getElementById('col-progress').innerHTML = '';
            document.getElementById('col-review').innerHTML = '';
            document.getElementById('col-done').innerHTML = '';

            tasks.forEach(task => {
                const card = document.createElement('div');
                card.className = 'task-row glass-panel';
                card.style.flexDirection = 'column';
                card.style.alignItems = 'flex-start';
                card.style.marginBottom = '12px';
                card.innerHTML = `
                    <div style="font-weight: 600; font-size: 0.9rem;">${task.title}</div>
                    <div style="font-size: 0.75rem; color: var(--accent-primary); margin-top: 4px;">ID: #${task.id}</div>
                `;

                let colId = 'col-backlog';
                if (task.status === 'pending') colId = 'col-backlog';
                if (task.status === 'in-progress') colId = 'col-progress';
                if (task.status === 'review' || task.status === 'in-review') colId = 'col-review';
                if (task.status === 'completed') colId = 'col-done';

                const col = document.getElementById(colId);
                if (col) col.appendChild(card);
            });

            // Update counts
            document.querySelector('#tasks h3 span').innerText = `(${tasks.filter(t => t.status === 'pending').length})`;
        } catch (err) {
            console.error('Failed to load tasks', err);
        }
    }

    // --- Phase 1: Marketplace Initial Data ---
    const marketplaceData = {
        bots: [
            { id: 'marketing', name: 'Marketing Pro', role: 'Social Media & Ads', icon: '📢', desc: 'Specialized in LinkedIn/Twitter outreach and campaign analytics.' },
            { id: 'dev', name: 'DevOps Bot', role: 'Automation & CI/CD', icon: '⚙️', desc: 'Manages deployment pipelines and cloud infrastructure tasks.' },
            { id: 'finance', name: 'Audit Bot', role: 'Accounts & Finance', icon: '💰', desc: 'Analyzes invoices, tracks expenses, and generates reports.' }
        ],
        skills: [
            { id: 'python', name: 'Advanced Python', type: 'Programming', icon: '🐍', desc: 'Adds capability to write and execute complex data processing scripts.' },
            { id: 'research', name: 'Deep Research', type: 'Intelligence', icon: '🔍', desc: 'Enhanced web crawling and multi-source data synthesis.' },
            { id: 'logic', name: 'Strategic Reasoning', type: 'Brain', icon: '🧠', desc: 'Improves task breakdown and decision making accuracy.' }
        ]
    };

    function loadMarketplace(tab = 'bots') {
        const container = document.getElementById('marketplace-content');
        if (!container) return;
        container.innerHTML = '';

        const items = marketplaceData[tab];
        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'agent-card glass-panel';
            card.innerHTML = `
                <div class="agent-avatar" style="background: rgba(255,255,255,0.05); font-size: 2rem;">${item.icon}</div>
                <h3>${item.name}</h3>
                <p class="role-desc">${item.desc}</p>
                <div class="card-actions">
                    <button class="primary-btn" onclick="alert('Deploying ${item.name}...')">Deploy to Department</button>
                </div>
            `;
            container.appendChild(card);
        });
    }

    // Tab switching for marketplace
    const marketplaceTabs = document.querySelectorAll('.tab-btn');
    marketplaceTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            marketplaceTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            if (tab.dataset.tab) {
                loadMarketplace(tab.dataset.tab);
            }
        });
    });

    // Initial load
    loadMarketplace('bots');

    // --- Phase 2: Internal Event Bus (Pub/Sub) ---
    class AuraEventBus {
        constructor() {
            this.listeners = {};
        }
        publish(event, data) {
            if (!this.listeners[event]) return;
            this.listeners[event].forEach(cb => cb(data));
        }
        subscribe(event, cb) {
            if (!this.listeners[event]) this.listeners[event] = [];
            this.listeners[event].push(cb);
        }
    }
    const EventBus = new AuraEventBus();

    // Dept Room Logic
    const deptItems = document.querySelectorAll('.dept-item');
    deptItems.forEach(item => {
        item.addEventListener('click', () => {
            deptItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            const dept = item.dataset.dept;
            EventBus.publish('dept_change', dept);
            console.log(`Switched to channel: #${dept}`);
        });
    });

    // Handle incoming bot events to show in specific rooms
    socket.on('live_feed', (data) => {
        // ... (existing live feed logic) ...
        EventBus.publish('bot_message', data);
    });

    // Refresh every 5 seconds to show progress
    setInterval(loadTasks, 5000);


    // --- Settings / API Configuration ---
    const saveKeysBtn = document.getElementById('saveKeysBtn');
    if (saveKeysBtn) {
        saveKeysBtn.addEventListener('click', () => {
            const keys = {
                gemini_key: document.getElementById('geminiKey').value,
                groq_key: document.getElementById('groqKey').value,
                openrouter_key: document.getElementById('openrouterKey').value,
                research_api_key: document.getElementById('researchKey').value
            };

            saveKeysBtn.innerText = 'Saving to Account...';
            saveKeysBtn.disabled = true;

            fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(keys)
            })
                .then(res => res.json())
                .then(() => {
                    saveKeysBtn.innerText = 'Account Updated ✓';
                    saveKeysBtn.disabled = false;
                    setTimeout(() => {
                        saveKeysBtn.innerText = 'Save Configuration';
                    }, 2000);
                })
                .catch(err => {
                    console.error('Save error', err);
                    saveKeysBtn.innerText = 'Error Saving';
                    saveKeysBtn.disabled = false;
                });
        });

        // Load existing from Server
        fetch('/api/settings')
            .then(res => res.json())
            .then(saved => {
                if (saved.gemini_key) document.getElementById('geminiKey').value = saved.gemini_key;
                if (saved.groq_key) document.getElementById('groqKey').value = saved.groq_key;
                if (saved.openrouter_key) document.getElementById('openrouterKey').value = saved.openrouter_key;
                if (saved.research_api_key) document.getElementById('researchKey').value = saved.research_api_key;
            });
    }

    // Initialize
    loadAgents();
    loadTasks();
    loadMarketplace('bots');
});
