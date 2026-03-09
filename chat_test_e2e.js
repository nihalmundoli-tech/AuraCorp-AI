const db = require('./db');
const { generateAgentResponse } = require('./services/llm');

async function testChat() {
    console.log('--- AuraCorp Chat E2E Test ---');

    // 1. Get CEO Agent
    const agent = await new Promise((resolve) => {
        db.get("SELECT * FROM agents WHERE role = 'CEO'", [], (err, row) => resolve(row));
    });

    if (!agent) {
        console.error('❌ CEO Agent not found in DB');
        process.exit(1);
    }
    console.log('✅ Found CEO Agent:', agent.id);

    // 2. Test LLM Response
    console.log('📡 Testing LLM Response (this may take a few seconds)...');
    try {
        const { generateAgentResponse } = require('./services/llm');
        const response = await generateAgentResponse(agent.system_prompt, 'Hello CEO, are you online?');
        console.log('✅ LLM Response received:', response.substring(0, 100) + '...');

        // 3. Test insertion into history
        db.run("INSERT INTO chat_history (agent_id, user_id, sender, message) VALUES (?, 1, 'user', ?)",
            [agent.id, 'Hello CEO, are you online?'], function (err) {
                if (err) console.error('❌ Failed to insert user message:', err);
                else {
                    console.log('✅ User message saved to history');
                    db.run("INSERT INTO chat_history (agent_id, user_id, sender, message) VALUES (?, 1, 'agent', ?)",
                        [agent.id, response], function (err2) {
                            if (err2) console.error('❌ Failed to insert agent message:', err2);
                            else {
                                console.log('✅ Agent response saved to history');
                                console.log('--- TEST COMPLETE: SUCCESS ---');
                                process.exit(0);
                            }
                        });
                }
            });
    } catch (e) {
        console.error('❌ Chat Test Failed:', e);
        process.exit(1);
    }
}

testChat();
