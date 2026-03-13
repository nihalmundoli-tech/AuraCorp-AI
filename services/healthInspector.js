// services/healthInspector.js
const db = require('../db');

/**
 * Health Inspector Service
 * Periodically checks bot health scores and triggers alerts.
 */
function startHealthInspector(io) {
    console.log('--- Bot Health Inspector Service Started ---');
    
    // Check every 30 seconds
    setInterval(async () => {
        const sql = `SELECT a.role, m.* FROM bot_metrics m JOIN agents a ON m.agent_id = a.id`;
        
        db.all(sql, [], (err, bots) => {
            if (err) return console.error('Health Inspector Error:', err);

            bots.forEach(bot => {
                let status = '🟢 Healthy';
                if (bot.last_health_score < 70) {
                    status = '🔴 Failure';
                } else if (bot.last_health_score < 90 || bot.failure_count > (bot.success_count * 0.1)) {
                    status = '🟡 Warning';
                }

                // If health is critical, broadcast an alert
                if (status === '🔴 Failure') {
                    io.emit('live_feed', {
                        agent: bot.role,
                        message: `CRITICAL FAILURE DETECTED: Health dropped to ${bot.last_health_score.toFixed(1)}%. Escalating to COO.`,
                        time: new Date().toISOString(),
                        type: 'alert'
                    });

                    // Log the critical incident
                    db.run(`INSERT INTO bot_logs (agent_id, action, result_summary) VALUES (?, ?, ?)`,
                        [bot.agent_id, 'SYSTEM_ALERT', `Health Inspector flagged as ${status} (${bot.last_health_score}%)`]);
                }
            });
        });
    }, 30000);
}

module.exports = { startHealthInspector };
