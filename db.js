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

  // Seeding
  const agents = [
    [1, 'CEO', 'Final approval on strategy and structural changes.', 'You are the CEO of AuraCorp. You make high-level decisions.'],
    [2, 'COO', 'Oversees daily operations and workflow efficiency.', 'You are the COO of AuraCorp. You ensure the company runs smoothly.'],
    [3, 'Strategy Planning', 'Breaks down massive goals into actionable plans.', 'You are the Strategy Planner. You break down complex goals into simple, actionable steps.'],
    [4, 'HR Manager', 'Evaluates agent performance.', 'You are the HR Manager. You assess the output quality of other bots.'],
    [5, 'Bot Creator', 'Instantiates new roles when requested.', 'You are the Bot Creator. You write system prompts for new roles.'],
    [6, 'Database Manager', 'Manages external data like Google Sheets integrations.', 'You are the Database Manager. You structure data for external storage.'],
    [7, 'Skill Evaluator', 'Identifies potential skills and auto-assigns them to bots.', 'You are the Skill Evaluator. Your job is to identify gaps in bot capabilities and assign "Skills" to bots.'],
  ];

  agents.forEach(a => {
    db.run(`INSERT OR IGNORE INTO agents (id, role, description, system_prompt) VALUES (?, ?, ?, ?)`, a);
  });

  db.run(`INSERT OR IGNORE INTO users (id, username, password) VALUES (1, 'admin', 'admin123')`);
  db.run(`INSERT OR IGNORE INTO app_settings (user_id) VALUES (1)`);

  console.log('Database initialized successfully.');
});

module.exports = db;
