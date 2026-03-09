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

// Initialize tables if they don't exist
const initSql = `
CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'idle',
  system_prompt TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  assigned_agent_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (assigned_agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS task_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER,
  agent_id INTEGER,
  action_type TEXT,
  content TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE TABLE IF NOT EXISTS chat_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER,
  user_id INTEGER,
  sender TEXT, -- 'user' or 'agent'
  message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- Insert default agents if empty
INSERT INTO agents (role, description, system_prompt) 
SELECT 'CEO', 'Final approval on strategy and structural changes.', 'You are the CEO of AuraCorp. You make high-level decisions.' 
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE role = 'CEO');

INSERT INTO agents (role, description, system_prompt) 
SELECT 'COO', 'Oversees daily operations and workflow efficiency.', 'You are the COO of AuraCorp. You ensure the company runs smoothly.' 
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE role = 'COO');

INSERT INTO agents (role, description, system_prompt) 
SELECT 'Strategy Planning', 'Breaks down massive goals into actionable plans.', 'You are the Strategy Planner. You break down complex goals into simple, actionable steps.'
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE role = 'Strategy Planning');

INSERT INTO agents (role, description, system_prompt) 
SELECT 'HR Manager', 'Evaluates agent performance.', 'You are the HR Manager. You assess the output quality of other bots.'
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE role = 'HR Manager');

INSERT INTO agents (role, description, system_prompt) 
SELECT 'Bot Creator', 'Instantiates new roles when requested.', 'You are the Bot Creator. You write system prompts for new roles.'
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE role = 'Bot Creator');

INSERT INTO agents (role, description, system_prompt) 
SELECT 'Database Manager', 'Manages external data like Google Sheets integrations.', 'You are the Database Manager. You structure data for external storage.'
WHERE NOT EXISTS (SELECT 1 FROM agents WHERE role = 'Database Manager');
`;

db.exec(initSql, (err) => {
    if (err) {
        console.error('Error creating tables:', err.message);
    } else {
        console.log('Database tables ensured.');
    }
});

module.exports = db;
