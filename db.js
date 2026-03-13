// db.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database file in project root
const dbPath = path.resolve(__dirname, 'data.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to connect to SQLite DB:', err.message);
  } else {
    console.log('Connected to SQLite DB at', dbPath);
  }
});

// Initialize tables sequentially
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'idle',
    system_prompt TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS app_settings (
    user_id INTEGER PRIMARY KEY,
    gemini_key TEXT,
    groq_key TEXT,
    openrouter_key TEXT,
    research_api_key TEXT,
    naukri_key TEXT,
    linkedin_key TEXT,
    whatsapp_key TEXT,
    google_sheets_creds TEXT,
    google_sheets_id TEXT,
    theme TEXT DEFAULT 'dark',
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',
    assigned_agent_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (assigned_agent_id) REFERENCES agents(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS task_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER,
    agent_id INTEGER,
    action_type TEXT,
    content TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (task_id) REFERENCES tasks(id),
    FOREIGN KEY (agent_id) REFERENCES agents(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER,
    user_id INTEGER,
    sender TEXT,
    message TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (agent_id) REFERENCES agents(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS agent_skills (
    agent_id INTEGER,
    skill_id INTEGER,
    PRIMARY KEY (agent_id, skill_id),
    FOREIGN KEY (agent_id) REFERENCES agents(id),
    FOREIGN KEY (skill_id) REFERENCES skills(id)
  )`);

  // --- AAO EXTENSIONS ---
  // Bot Health & Performance Metrics
  db.run(`CREATE TABLE IF NOT EXISTS bot_metrics (
    agent_id INTEGER PRIMARY KEY,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    avg_runtime_ms INTEGER DEFAULT 0,
    total_candidates_yielded INTEGER DEFAULT 0,
    last_health_score REAL DEFAULT 100.0,
    FOREIGN KEY (agent_id) REFERENCES agents (id)
  )`);

  // Detailed Bot Action Logs
  db.run(`CREATE TABLE IF NOT EXISTS bot_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER,
    job_id TEXT,
    action TEXT,
    result_summary TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (agent_id) REFERENCES agents (id)
  )`);

  // === MEMORY SYSTEM ===

  // Long-term memory bank per agent (insights, decisions, patterns)
  db.run(`CREATE TABLE IF NOT EXISTS agent_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id INTEGER NOT NULL,
    memory_type TEXT DEFAULT 'insight',
    content TEXT NOT NULL,
    importance INTEGER DEFAULT 5,
    context TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    last_accessed TEXT DEFAULT (datetime('now')),
    access_count INTEGER DEFAULT 0,
    FOREIGN KEY (agent_id) REFERENCES agents(id)
  )`);

  // Behavioral profile (evolves over time, updated post-interaction)
  db.run(`CREATE TABLE IF NOT EXISTS agent_profile (
    agent_id INTEGER PRIMARY KEY,
    total_interactions INTEGER DEFAULT 0,
    total_tasks_done INTEGER DEFAULT 0,
    specialty_tags TEXT DEFAULT '[]',
    known_director_preferences TEXT DEFAULT '[]',
    behavioral_notes TEXT DEFAULT '',
    last_active TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (agent_id) REFERENCES agents(id)
  )`);

  // Seed default profiles for all core agents (1-11)
  const coreAgentIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  coreAgentIds.forEach(id => {
    db.run(`INSERT OR IGNORE INTO agent_profile (agent_id) VALUES (?)`, [id]);
    db.run(`INSERT OR IGNORE INTO bot_metrics (agent_id) VALUES (?)`, [id]);
  });

  const agents = [
    [0, 'Company Room', 'Whole team interaction space.', 'You are the CEO presiding over the Company Room. Oversee the Workwalaa system.'],
    [1, 'CEO', 'AAO Strategic Oversight.', 'You are the CEO of Workwalaa. Analyze strategy and reports.'],
    [2, 'COO', 'AAO Operations & Alerting.', 'You are the COO. Monitor health and API uptimes.'],
    [3, 'Strategy Planning', 'Long-term goals.', 'You are the Strategy Planner.'],
    [4, 'HR Manager', 'Quality Assurance.', 'You are the HR Manager.'],
    [5, 'Bot Creator', 'Workforce Scaling.', 'You are the Bot Creator.'],
    [6, 'Database Manager', 'Infrastructure stability.', 'You are the Database Manager.'],
    [7, 'Skill Evaluator', 'Agent performance.', 'You are the Skill Evaluator.'],
    [8, 'Analytics Lead', 'System metrics.', 'You are the Analytics Lead.'],
    [10, 'Bot 1 - Intake & Internal Scanner', 'Lead Specialist.', 'You are the Lead Recruitment Intake Specialist (Workwalaa Bot 1).'],
    [11, 'Bot 2 - External Candidate Search', 'Sourcing Expert.', 'You are the Senior Sourcing Expert (Workwalaa Bot 2).'],
    [12, 'Bot 3 - Social Media Distribution', 'Talent Attraction.', 'You are the Talent Attraction & Social Media Lead (Workwalaa Bot 3).']
  ];

  agents.forEach(a => {
    db.run(`INSERT OR IGNORE INTO agents (id, role, description, system_prompt) VALUES (?, ?, ?, ?)`, a);
  });

  db.run(`INSERT OR IGNORE INTO users (id, username, password) VALUES (1, 'workwalaa', 'workwalaa@123')`);
  db.run(`INSERT OR IGNORE INTO app_settings (user_id) VALUES (1)`);

  console.log('Database initialized successfully.');
});

module.exports = db;
