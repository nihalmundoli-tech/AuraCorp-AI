const db = require('./db');

async function checkKeysAndRunTest() {
    console.log('--- AuraCorp Diagnostic Test ---');

    // 1. Check for keys in DB
    const settings = await new Promise((resolve) => {
        db.get("SELECT * FROM app_settings WHERE user_id = (SELECT id FROM users WHERE username = 'admin')", [], (err, row) => {
            resolve(row);
        });
    });

    if (settings && settings.gemini_key) {
        console.log('✅ Gemini API Key found in persistent settings (masked):', settings.gemini_key.substring(0, 5) + '...');
    } else if (process.env.GEMINI_API_KEY) {
        console.log('✅ Gemini API Key found in environment variables (masked):', process.env.GEMINI_API_KEY.substring(0, 5) + '...');
    } else {
        console.log('❌ No Gemini API Key found. System will use MOCK RESPONSES for this test.');
    }

    // 2. Insert a test task for the CEO
    console.log('🚀 Triggering Test Task: "Mission Statement Synthesis"');
    db.run(`INSERT INTO tasks (title, description, assigned_agent_id, status) 
            VALUES (?, ?, (SELECT id FROM agents WHERE role = 'CEO'), ?)`,
        ['Synthesize Brand Mission', 'Define the 2026 vision for AuraCorp as the leader in digital labor.', 'pending'], (err) => {
            if (err) console.error('Failed to trigger task:', err);
            else {
                console.log('✅ Test Task added to queue. The Orchestrator will pick this up in the next loop.');
                console.log('Check your Dashboard "Task Stream" or "Notice Board" to see the CEO thinking!');
            }
            process.exit(0);
        });
}

checkKeysAndRunTest();
