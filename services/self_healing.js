const db = require('../db');
const { generateAgentResponse } = require('./llm');

/**
 * Real-Time Self-Healing Service
 * Monitors for failed tasks and attempts to 'heal' the agent by assigning corrective skills or prompts.
 */
function startSelfHealing(io) {
    console.log('--- AuraCorp Self-Healing Service Started ---');
    
    setInterval(async () => {
        const sql = `
            SELECT t.*, a.role, a.system_prompt
            FROM tasks t
            JOIN agents a ON t.assigned_agent_id = a.id
            WHERE t.status = 'failed'
            AND t.updated_at > datetime('now', '-5 minutes')
            LIMIT 1
        `;

        db.get(sql, [], async (err, task) => {
            if (err || !task) return;

            console.log(`[SELF-HEALING] Detected failure in task: ${task.title} by ${task.role}`);
            
            io.emit('live_feed', {
                agent: 'System',
                message: `[SELF-HEALING]: Analyzing failure for ${task.role} on task "${task.title}"...`,
                time: new Date().toISOString()
            });

            // 1. Get the failure context (last task step)
            db.get(`SELECT content FROM task_steps WHERE task_id = ? ORDER BY id DESC LIMIT 1`, [task.id], async (err, step) => {
                const failureContext = step ? step.content : 'No error log found.';
                
                // 2. Ask Skill Evaluator for a patch
                const evaluatorPrompt = `
                    CRITICAL FAILURE: The ${task.role} failed to complete task "${task.title}".
                    Failure Context: ${failureContext}
                    
                    Identify why they failed and provide a systemic "fix". 
                    Reply in format:
                    FIX_TYPE: [SKILL|PROMPT]
                    CONTENT: [New skill name or prompt addition]
                `;

                try {
                    const response = await generateAgentResponse("You are the System Architect. Identify and fix bot failures.", evaluatorPrompt);
                    
                    if (response.includes('FIX_TYPE: SKILL')) {
                        const skillName = response.match(/CONTENT:\s*(.*)/)[1].trim();
                        db.run(`INSERT OR IGNORE INTO skills (name, description) VALUES (?, ?)`, [skillName, `Self-healed skill to fix: ${task.title}`]);
                        db.get(`SELECT id FROM skills WHERE name = ?`, [skillName], (err, skill) => {
                            if (skill) {
                                db.run(`INSERT OR IGNORE INTO agent_skills (agent_id, skill_id) VALUES (?, ?)`, [task.assigned_agent_id, skill.id]);
                            }
                        });
                        io.emit('live_feed', {
                            agent: 'System',
                            message: `[SELF-HEALING]: Patched ${task.role} with new skill: [${skillName}]. Retrying task...`,
                            time: new Date().toISOString()
                        });
                    }

                    // Reset task to pending so it can try again with the new 'knowledge'
                    db.run(`UPDATE tasks SET status = 'pending', updated_at = datetime('now') WHERE id = ?`, [task.id]);

                } catch (e) {
                    console.error('Self-healing failed', e);
                }
            });
        });
    }, 60000); // Check every minute
}

module.exports = { startSelfHealing };
