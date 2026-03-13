// services/orchestrator.js
const db = require('../db');
const { generateAgentResponse } = require('./llm');
const { readSheet, updateSheetCell, appendToSheet } = require('./googleSheets');
const credentialManager = require('./credentialManager');

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

            const startTime = Date.now();

            try {
                // 2. Agent does the work via LLM
                let enhancedPrompt = task.system_prompt;
                if (task.skills) {
                    enhancedPrompt += `\n\nYour Additional Skills: [${task.skills}]`;
                }

                // Intelligent Routing: CEO/COO/Recruitment Bots get 'high' complexity models (Gemini Pro)
                // Tactical assistants get 'standard/speed' models (Groq/Flash)
                const complexity = (task.role === 'CEO' || task.role === 'Strategy Planning' || task.role.includes('Bot')) ? 'high' : 'standard';

                // --- OFFICE COLLABORATION: Fetch latest Company Room context ---
                const officeContext = await new Promise((resolve) => {
                    db.all(`SELECT sender, message FROM chat_history WHERE agent_id = 0 ORDER BY created_at DESC LIMIT 5`, [], (err, rows) => {
                        if (err || !rows) return resolve("");
                        const ctx = rows.reverse().map(r => `[${r.sender}]: ${r.message}`).join("\n");
                        resolve(ctx);
                    });
                });

                let prompt = `Task Title: ${task.title}\nDescription: ${task.description}\n`;
                if (officeContext) {
                    prompt += `\n--- CURRENT OFFICE CONTEXT (Company Room) ---\n${officeContext}\n`;
                }
                // --- AAO FEATURE: SECURE CREDENTIALS ---
                const botCreds = await credentialManager.getBotCredentials(task.role);
                // Injecting credentials silently into options if needed, 
                // but llm.js handles its own key fetch. We'll pass them for direct tool usage.

                const result = await generateAgentResponse(enhancedPrompt, prompt, { 
                    complexity,
                    agentId: task.assigned_agent_id
                });

                if (!result) {
                    throw new Error("LLM returned an empty response. Check API keys and provider logic.");
                }

                // --- PHASE 3: Handle Tool Calls vs Text ---
                let finalResult = result;
                if (result.startsWith('{') && result.includes('tool_call')) {
                    const toolData = JSON.parse(result);
                    
                    // Notify Thinking
                    io.emit('live_feed', {
                        agent: task.role,
                        message: `[THINKING]: Using tool ${toolData.call.name} with params: ${JSON.stringify(toolData.call.args)}`,
                        time: new Date().toISOString()
                    });

                    finalResult = await executeTool(toolData.call.name, toolData.call.args, io);
                    
                    // Log the tool execution as a step
                    db.run(`INSERT INTO task_steps (task_id, agent_id, action_type, content) VALUES (?, ?, ?, ?)`,
                        [task.id, task.assigned_agent_id, 'tool_execution', `Executed ${toolData.call.name}: ${finalResult.substring(0, 100)}...`]);
                }

                // 3. Save the result as a task step
                db.run(`INSERT INTO task_steps (task_id, agent_id, action_type, content) VALUES (?, ?, ?, ?)`,
                    [task.id, task.assigned_agent_id, 'execution', finalResult]);

                // 3b. Save task outcome as agent memory
                try {
                    const { saveMemory, updateProfile } = require('./memory');
                    const memContent = `Completed task "${task.title}": ${result.substring(0, 180)}`;
                    await saveMemory(task.assigned_agent_id, 'insight', memContent, 6, task.title);
                    await updateProfile(task.assigned_agent_id, { tasksIncrement: 1 });
                } catch(e) { /* silent */ }

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
                
                // --- AAO: WORKWALAA Autonomous Escalation Loop ---
                // Bot 1 (Intake) -> Bot 2 (Internal) -> Bot 3 (External) -> Bot 4 (SMM)
                const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
                const CREDENTIALS = await credentialManager.getBotCredentials('System'); 
                const jobIdMatch = task.description.match(/Job ID (\d+)/);
                const jobId = jobIdMatch ? jobIdMatch[1] : null;

                if (SPREADSHEET_ID && jobId) {
                    if (task.role.includes('Bot 1')) {
                        // Bot 1 -> Bot 2 (External Search - ID 11)
                        db.run(`INSERT INTO tasks (title, description, status, assigned_agent_id) VALUES (?, ?, ?, ?)`,
                            [`External Search for Job ${jobId}`, `Search external portals for Job ID ${jobId}. GOAL=10 candidates.`, 'pending', 11]);
                        
                        db.run(`INSERT INTO bot_logs (agent_id, job_id, action, result_summary) VALUES (?, ?, ?, ?)`,
                            [task.assigned_agent_id, jobId, 'Job Intake', 'Scanned and escalated to Bot 2.']);
                    } 
                    else if (task.role.includes('Bot 2')) {
                        // Bot 2 -> Bot 3 (Social Media - ID 12)
                        db.run(`INSERT INTO tasks (title, description, status, assigned_agent_id) VALUES (?, ?, ?, ?)`,
                            [`Social Media Distribution for Job ${jobId}`, `Generate and post social media content for Job ID ${jobId} on LinkedIn/Twitter.`, 'pending', 12]);
                        
                        db.run(`INSERT INTO bot_logs (agent_id, job_id, action, result_summary) VALUES (?, ?, ?, ?)`,
                            [task.assigned_agent_id, jobId, 'External Search', `Found candidates and escalated to Bot 3.`]);
                    }
                    else if (task.role.includes('Bot 3')) {
                        // Bot 3 -> Completion / HR Review (ID 4)
                        db.run(`INSERT INTO tasks (title, description, status, assigned_agent_id) VALUES (?, ?, ?, ?)`,
                            [`Review Recruitment Campaign for Job ${jobId}`, `Final campaign oversight for Job ID ${jobId}.`, 'pending', 4]);
                        
                        db.run(`INSERT INTO bot_logs (agent_id, job_id, action, result_summary) VALUES (?, ?, ?, ?)`,
                            [task.assigned_agent_id, jobId, 'Social Media', `Distribution complete. Sent to HR Manager.`]);
                    }
                }
                // --------------------------------------------------

                // 4. Decide Review Loop vs Completion
                // If it's the CEO acting, it's done. If it's a subordinate, it goes to review.
                if (task.role === 'CEO' || task.role === 'COO') {
                    db.run(`UPDATE tasks SET status = 'completed' WHERE id = ?`, [task.id]);
                    io.emit('live_feed', {
                        agent: task.role,
                        message: `Finalized and approved: "${task.title}".`,
                        time: new Date().toISOString()
                    });

                    // SHARE IN OFFICE SPACE
                    await shareInOfficeSpace(task.role, task.title, result, io);

                } else {
                    db.run(`UPDATE tasks SET status = 'review' WHERE id = ?`, [task.id]);
                    io.emit('live_feed', {
                        agent: task.role,
                        message: `Completed draft for "${task.title}". Sending to CEO/COO for review.`,
                        time: new Date().toISOString()
                    });
                }

                // 4. Update AAO Metrics
                const duration = Date.now() - startTime;
                updateBotMetrics(task.assigned_agent_id, true, duration, result);

            } catch (error) {
                console.error(`Agent ${task.role} failed to process task ${task.id}:`, error);
                db.run(`UPDATE tasks SET status = 'failed' WHERE id = ?`, [task.id]);
                updateBotMetrics(task.assigned_agent_id, false, Date.now() - startTime, error.message);
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
 * Executes a tool called by an AI agent
 */
async function executeTool(name, args, io) {
    console.log(`Executing Tool: ${name}`, args);
    const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
    const CREDENTIALS = process.env.GOOGLE_SERVICE_ACCOUNT ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT) : null;

    try {
        switch (name) {
            case 'search_candidates':
                // Simulated search logic
                return `SUCCESS: Found 8 candidates for "${args.query}" in ${args.source} pool. Matches saved to Result Sheet.`;
            
            case 'update_job_status':
                if (SPREADSHEET_ID && CREDENTIALS) {
                    await updateSheetCell(SPREADSHEET_ID, `${args.sheet_name}!J${args.job_id}`, args.status, CREDENTIALS);
                }
                return `SUCCESS: Updated Job ${args.job_id} status to ${args.status} in ${args.sheet_name}.`;

            case 'generate_social_post':
                return `SUCCESS: Generated ${args.platform} post: "We are hiring for ${args.job_details}! Join our team."`;

            default:
                return `ERROR: Tool ${name} not found.`;
        }
    } catch (e) {
        return `ERROR: ${e.message}`;
    }
}

/**
 * WORKWALAA: AAO Health Monitor & Skill Evaluator
 * Reviews bots with performance drops or low health scores.
 */
async function runSkillEvaluation(io) {
    // 1. Find a bot with low health score OR a failed task
    const sql = `
        SELECT m.agent_id, a.role, m.last_health_score
        FROM bot_metrics m
        JOIN agents a ON m.agent_id = a.id
        WHERE m.last_health_score < 80 OR m.failure_count > 0
        ORDER BY m.last_health_score ASC
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
 * WORKWALAA: Automated Recruitment Loop
 * Triggered every 4 hours (simulated here)
 */
async function runRecruitmentLoop(io) {
    const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
    const CREDENTIALS = process.env.GOOGLE_SERVICE_ACCOUNT ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT) : null;

    if (!SPREADSHEET_ID || !CREDENTIALS) return;

    console.log('--- Triggering Recruitment Loop ---');

    try {
        // 1. Scan Sheet 1 for New Jobs (Bot 1 Status = Empty)
        // Range: 'Sheet 1!A2:M100' (assuming headers are in row 1)
        const jobRows = await readSheet(SPREADSHEET_ID, 'Sheet 1!A2:M100', CREDENTIALS);
        if (!jobRows) return;

        for (let i = 0; i < jobRows.length; i++) {
            const row = jobRows[i];
            const rowIndex = i + 2; // +2 because 0-indexed + row 1 headers
            const jobId = row[0];
            const bot1Status = row[9]; // Column J (10th col)

            if (!bot1Status || bot1Status === '' || bot1Status === 'Not Started') {
                // Initialize Bot 1 Task
                io.emit('live_feed', {
                    agent: 'Bot 1 - Intake & Internal Scanner',
                    message: `Detected new Job ID: ${jobId}. Starting internal scan.`,
                    time: new Date().toISOString()
                });

                // Update Status to Processing
                await updateSheetCell(SPREADSHEET_ID, `Sheet 1!J${rowIndex}`, 'Processing', CREDENTIALS);

                // Create Task for Bot 1
                db.run(`INSERT INTO tasks (title, description, status, assigned_agent_id) VALUES (?, ?, ?, ?)`,
                    [`Internal Match for Job ${jobId}`, `Scan internal pool for Job ID ${jobId}. Match Title: ${row[1]}, Location: ${row[3]}, Salary: ${row[4]}.`, 'pending', 10]);
            }
        }
    } catch (err) {
        console.error('Recruitment Loop Error:', err);
    }
}

/**
 * Shares a summary of an agent's work in the "Company Room" (Agent 0)
 */
async function shareInOfficeSpace(agentRole, taskTitle, result, io) {
    const summary = `OFFICE UPDATE: ${agentRole} completed "${taskTitle}". Result: ${result.substring(0, 150)}...`;
    
    // Save to chat history for Agent 0
    db.run(`INSERT INTO chat_history (agent_id, sender, message) VALUES (?, ?, ?)`,
        [0, agentRole, summary]);

    io.emit('chat_message', {
        agent_id: 0,
        sender: agentRole,
        message: summary,
        time: new Date().toISOString()
    });
}

/**
 * WORKWALAA: Weekly Meeting System
 * Simulates a meeting between CEO, COO, and HR Bots.
 */
async function runWeeklyMeeting(io) {
    console.log('--- Initiating Weekly AI Bot Meeting ---');
    
    io.emit('live_feed', {
        agent: 'System',
        message: 'Weekly Strategy Meeting is starting. Participants: CEO, COO, HR Manager.',
        time: new Date().toISOString()
    });

    const meetingTask = {
        title: 'Weekly Performance Review & Strategy',
        description: 'Collaborate to review recruitment success rates, platform performance, and bot efficiency. Discuss improvements and skill gaps.',
        assigned_agent_id: 1 // CEO starts it
    };

    try {
        // Enact a multi-turn conversation (simplified as a sequence of tasks)
        db.run(`INSERT INTO tasks (title, description, status, assigned_agent_id) VALUES (?, ?, ?, ?)`,
            [meetingTask.title, meetingTask.description, 'pending', 1]);
        
        // Follow-up tasks for COO and HR
        db.run(`INSERT INTO tasks (title, description, status, assigned_agent_id) VALUES (?, ?, ?, ?)`,
            ['Operational Audit', 'COO to audit bot failure patterns and workflow times.', 'pending', 2]);
        
        db.run(`INSERT INTO tasks (title, description, status, assigned_agent_id) VALUES (?, ?, ?, ?)`,
            ['Candidate Quality Report', 'HR Manager to evaluate candidate matching accuracy and client feedback.', 'pending', 4]);

    } catch (e) {
        console.error('Weekly Meeting Initiation Failed:', e);
    }
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

    // RECRUITMENT TRIGGER: Every 4 hours (14400000 ms)
    // For demo/test purposes, let's run it once at start and then every hour
    runRecruitmentLoop(io);
    setInterval(() => {
        runRecruitmentLoop(io);
    }, 3600000); 

    // WEEKLY MEETING: Every Monday (simulated every 24 hours for testing)
    runWeeklyMeeting(io);
    setInterval(() => {
        runWeeklyMeeting(io);
    }, 86400000);
}

/**
 * Updates Bot Performance Metrics and calculates Health Score.
 */
function updateBotMetrics(agentId, isSuccess, runtimeMs, summary = '') {
    db.run(`
        UPDATE bot_metrics 
        SET 
            success_count = success_count + ?,
            failure_count = failure_count + ?,
            avg_runtime_ms = (avg_runtime_ms + ?) / 2,
            last_health_score = CASE 
                WHEN (success_count + failure_count + 1) > 0 THEN
                    ((success_count + ?) * 1.0 / (success_count + failure_count + 1) * 50) + 30 + 20
                ELSE 100.0
            END
        WHERE agent_id = ?
    `, [isSuccess ? 1 : 0, isSuccess ? 0 : 1, runtimeMs, isSuccess ? 1 : 0, agentId], (err) => {
        if (err) console.error('Failed to update bot metrics:', err.message);
    });

    const status = isSuccess ? 'Success' : 'Failure';
    if (summary) {
        db.run(`INSERT INTO bot_logs (agent_id, action, result_summary) VALUES (?, ?, ?)`,
            [agentId, status, summary.substring(0, 200)]);
    }

    // Special: Log failure incidents for the Health Inspector to broadcast
    if (!isSuccess) {
        db.run(`INSERT INTO bot_logs (agent_id, action, result_summary) VALUES (?, ?, ?)`,
            [agentId, 'INCIDENT', `ALERT: Task failed with error: ${summary.substring(0, 100)}`]);
    }
}

module.exports = {
    startOrchestrator
};
