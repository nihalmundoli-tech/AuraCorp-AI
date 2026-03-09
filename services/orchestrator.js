// services/orchestrator.js
const db = require('../db');
const { generateAgentResponse } = require('./llm');

/**
 * Handle a new task assigned to an agent. 
 * This simulates the agent "thinking" and working on the task.
 */
async function processTaskQueue(io) {
    const sql = `
        SELECT t.*, a.role, a.system_prompt, GROUP_CONCAT(s.name) as skills
        FROM tasks t 
        JOIN agents a ON t.assigned_agent_id = a.id 
        LEFT JOIN agent_skills ask ON a.id = ask.agent_id
        LEFT JOIN skills s ON ask.skill_id = s.id
        WHERE t.status = 'pending'
        GROUP BY t.id
    `;
    db.all(sql, [], async (err, tasks) => {
        if (err) return console.error('Error fetching pending tasks:', err);

        for (const task of tasks) {
            // 1. Mark as in-progress
            db.run(`UPDATE tasks SET status = 'in-progress' WHERE id = ?`, [task.id]);

            // Notify frontend
            io.emit('live_feed', {
                agent: task.role,
                message: `Started execution on: "${task.title}".`,
                time: new Date().toISOString()
            });

            try {
                // 2. Agent does the work via LLM
                let enhancedPrompt = task.system_prompt;
                if (task.skills) {
                    enhancedPrompt += `\n\nYour Additional Skills: [${task.skills}]`;
                }

                // Intelligent Routing: CEO/COO get 'high' complexity models (Gemini Pro)
                // Tactical bots get 'standard/speed' models (Groq/Flash)
                const complexity = (task.role === 'CEO' || task.role === 'Strategy Planning') ? 'high' : 'standard';

                const prompt = `Task Title: ${task.title}\nDescription: ${task.description}\n\nPlease execute this task according to your role and skills.`;
                const result = await generateAgentResponse(enhancedPrompt, prompt, { complexity });

                // 3. Save the result as a task step
                db.run(`INSERT INTO task_steps (task_id, agent_id, action_type, content) VALUES (?, ?, ?, ?)`,
                    [task.id, task.assigned_agent_id, 'execution', result]);

                // --- SPECIAL: Database Manager Agent logic ---
                if (task.role.includes('Database Manager')) {
                    try {
                        const { appendToSheet } = require('./googleSheets');
                        // These would come from .env in a real setup
                        const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
                        const CREDENTIALS = process.env.GOOGLE_SERVICE_ACCOUNT ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT) : null;

                        if (SPREADSHEET_ID && CREDENTIALS) {
                            await appendToSheet(SPREADSHEET_ID, 'Sheet1!A1', [
                                new Date().toISOString(),
                                task.title,
                                result.substring(0, 1000) // Truncate if too long for a cell
                            ], CREDENTIALS);

                            io.emit('live_feed', {
                                agent: task.role,
                                message: `Successfully pushed data from "${task.title}" to Google Sheets.`,
                                time: new Date().toISOString()
                            });
                        }
                    } catch (sheetErr) {
                        console.error('Failed to update Google Sheet:', sheetErr);
                    }
                }
                // ----------------------------------------------

                // 4. Decide Review Loop vs Completion
                // If it's the CEO acting, it's done. If it's a subordinate, it goes to review.
                if (task.role === 'CEO' || task.role === 'COO') {
                    db.run(`UPDATE tasks SET status = 'completed' WHERE id = ?`, [task.id]);
                    io.emit('live_feed', {
                        agent: task.role,
                        message: `Finalized and approved: "${task.title}".`,
                        time: new Date().toISOString()
                    });
                } else {
                    db.run(`UPDATE tasks SET status = 'review' WHERE id = ?`, [task.id]);
                    io.emit('live_feed', {
                        agent: task.role,
                        message: `Completed draft for "${task.title}". Sending to CEO/COO for review.`,
                        time: new Date().toISOString()
                    });
                }

            } catch (error) {
                console.error(`Agent ${task.role} failed to process task ${task.id}:`, error);
                db.run(`UPDATE tasks SET status = 'failed' WHERE id = ?`, [task.id]);
            }
        }
    });

    // Handle items in 'review' state
    db.all(`SELECT t.*, a.role AS original_role 
            FROM tasks t 
            JOIN agents a ON t.assigned_agent_id = a.id 
            WHERE t.status = 'review'`, [], async (err, reviewTasks) => {
        if (err) return;

        for (const task of reviewTasks) {
            // Get CEO/COO system prompt to enact review
            db.get(`SELECT id, role, system_prompt FROM agents WHERE role IN ('CEO', 'COO') LIMIT 1`, [], async (err, reviewer) => {
                if (err || !reviewer) return;

                db.run(`UPDATE tasks SET status = 'in-review' WHERE id = ?`, [task.id]);

                io.emit('live_feed', {
                    agent: reviewer.role,
                    message: `Reviewing work from ${task.original_role} on task: "${task.title}".`,
                    time: new Date().toISOString()
                });

                try {
                    // Fetch what they actually did
                    db.get(`SELECT content FROM task_steps WHERE task_id = ? AND action_type = 'execution' ORDER BY id DESC LIMIT 1`, [task.id], async (err, step) => {
                        if (err || !step) return;

                        const reviewPrompt = `Review this work submitted by the ${task.original_role}:\n\nTask: ${task.title}\nWork Submitted:\n${step.content}\n\nIs this approved? Provide feedback or reply with APPROVE.`;
                        const reviewResult = await generateAgentResponse(reviewer.system_prompt, reviewPrompt, { complexity: 'high' });

                        db.run(`INSERT INTO task_steps (task_id, agent_id, action_type, content) VALUES (?, ?, ?, ?)`,
                            [task.id, reviewer.id, 'review', reviewResult]);

                        // Simple rudimentary check mimicking AI decision
                        if (reviewResult.includes('APPROVE') || reviewResult.toLowerCase().includes('approved') || reviewResult.includes('[MOCK RESPONSE]')) {

                            // --- AUTO-BOT CREATION LOGIC ---
                            // If the task was "CREATE BOT", we instantiate it
                            if (task.title.toLowerCase().includes('create bot') || task.title.toLowerCase().includes('new agent')) {
                                try {
                                    // Parse potential role/desc from the step content
                                    const botMatch = step.content.match(/ROLE:\s*(.*)/);
                                    const descMatch = step.content.match(/DESC:\s*(.*)/);
                                    if (botMatch && descMatch) {
                                        const newRole = botMatch[1].trim();
                                        const newDesc = descMatch[1].trim();
                                        db.run(`INSERT INTO agents (role, description, system_prompt) VALUES (?, ?, ?)`,
                                            [newRole, newDesc, `You are the ${newRole}. ${newDesc}`]);

                                        io.emit('live_feed', {
                                            agent: 'System',
                                            message: `CEO APPROVED: New bot "${newRole}" has been synthesized and deployed.`,
                                            time: new Date().toISOString()
                                        });
                                    }
                                } catch (e) { console.error('Auto-bot creation failed', e); }
                            }
                            // -------------------------------

                            db.run(`UPDATE tasks SET status = 'completed' WHERE id = ?`, [task.id]);
                            io.emit('live_feed', {
                                agent: reviewer.role,
                                message: `APPROVED work from ${task.original_role} on "${task.title}".`,
                                time: new Date().toISOString()
                            });
                        } else {
                            // Send back to pending for re-work
                            db.run(`UPDATE tasks SET status = 'pending' WHERE id = ?`, [task.id]);
                            io.emit('live_feed', {
                                agent: reviewer.role,
                                message: `REJECTED work from ${task.original_role}. Needs revisions. Sent back to queue.`,
                                time: new Date().toISOString()
                            });
                        }
                    });
                } catch (e) {
                    console.error('Review failed', e);
                }
            });
        }
    });
}

/**
 * Periodically reviews completed tasks to identify skill gaps
 */
async function runSkillEvaluation(io) {
    // 1. Find a completed task that hasn't been evaluated for skills yet
    const sql = `
        SELECT t.*, a.role, a.id as agent_id
        FROM tasks t
        JOIN agents a ON t.assigned_agent_id = a.id
        WHERE t.status = 'completed'
        ORDER BY t.updated_at DESC
        LIMIT 1
    `;

    db.get(sql, [], async (err, task) => {
        if (err || !task) return;

        // 2. Get the Skill Evaluator agent
        db.get(`SELECT * FROM agents WHERE role = 'Skill Evaluator' LIMIT 1`, [], async (err, evaluator) => {
            if (err || !evaluator) return;

            // 3. Get the work done
            db.get(`SELECT content FROM task_steps WHERE task_id = ? AND action_type = 'execution' ORDER BY id DESC LIMIT 1`, [task.id], async (err, step) => {
                if (err || !step) return;

                const prompt = `
                    Review this task completed by the ${task.role}:
                    Task: ${task.title}
                    Result: ${step.content}

                    Based on this work, identify ONE specific skill (e.g., "JSON Optimization", "Copywriting", "Lead Scoring") that would help this bot perform better next time.
                    Reply ONLY in this format:
                    SKILL: [Skill Name]
                    DESCRIPTION: [Why this skill helps]
                `;

                try {
                    const evaluation = await generateAgentResponse(evaluator.system_prompt, prompt);

                    if (evaluation.includes('SKILL:')) {
                        const skillMatch = evaluation.match(/SKILL:\s*(.*)/);
                        const descMatch = evaluation.match(/DESCRIPTION:\s*(.*)/);

                        if (skillMatch) {
                            const skillName = skillMatch[1].trim();
                            const skillDesc = descMatch ? descMatch[1].trim() : '';

                            // 4. Assign the skill via internal "API" call (mocked here as direct DB update)
                            db.run(`INSERT OR IGNORE INTO skills (name, description) VALUES (?, ?)`, [skillName, skillDesc], function () {
                                db.get(`SELECT id FROM skills WHERE name = ?`, [skillName], (err, skill) => {
                                    if (skill) {
                                        db.run(`INSERT OR IGNORE INTO agent_skills (agent_id, skill_id) VALUES (?, ?)`, [task.agent_id, skill.id], () => {
                                            io.emit('live_feed', {
                                                agent: 'Skill Evaluator',
                                                message: `Identified top performance gap for ${task.role}. Assigned new skill: [${skillName}].`,
                                                time: new Date().toISOString()
                                            });
                                        });
                                    }
                                });
                            });
                        }
                    }
                } catch (e) {
                    console.error('Skill evaluation failed', e);
                }
            });
        });
    });
}

/**
 * Starts the Orchestrator loop 
 */
function startOrchestrator(io) {
    console.log('Starting AI Agent Orchestrator loop...');
    setInterval(() => {
        processTaskQueue(io);
    }, 10000); // Check tasks every 10s

    setInterval(() => {
        runSkillEvaluation(io);
    }, 30000); // Eval skills every 30s
}

module.exports = {
    startOrchestrator
};
