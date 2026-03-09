const http = require('http');

async function testEndpoint() {
    console.log('Testing /api/chat/1 (CEO message)...');

    const postData = JSON.stringify({ message: "Hello CEO, what are the plans for today?" });

    const req = http.request({
        hostname: 'localhost',
        port: 3000,
        path: '/api/chat/1',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    }, (res) => {
        console.log(`STATUS: ${res.statusCode}`);
        res.setEncoding('utf8');
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
            try {
                const parsedData = JSON.parse(rawData);
                console.log('RESPONSE:', parsedData);
                if (parsedData.reply && !parsedData.error) {
                    console.log('✅ Chat endpoint is WORKING.');
                    process.exit(0);
                } else {
                    console.log('❌ Chat endpoint returned an error or no reply.');
                    process.exit(1);
                }
            } catch (e) {
                console.error('Failed to parse response:', e.message);
                process.exit(1);
            }
        });
    });

    req.on('error', (e) => {
        console.error(`Problem with request: ${e.message}`);
        process.exit(1);
    });

    req.write(postData);
    req.end();
}

testEndpoint();
