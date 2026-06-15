const http = require('http');
const https = require('https');

const DEEPSEEK_TOKEN = process.env.DEEPSEEK_TOKEN;
const AUTH_KEY = process.env.AUTH_KEY || 'deepseek-key-2026';

function checkAuth(req) {
    const auth = req.headers.authorization || '';
    return auth.replace('Bearer ', '') === AUTH_KEY;
}

function askDeepSeek(prompt, systemPrompt) {
    return new Promise((resolve) => {
        const data = JSON.stringify({
            messages: [
                { role: 'system', content: systemPrompt || 'You are a helpful assistant.' },
                { role: 'user', content: prompt }
            ],
            model: 'deepseek-v4-pro',
            stream: false,
            temperature: 0.7,
            max_tokens: 4000
        });

        const options = {
            hostname: 'chat.deepseek.com',
            path: '/api/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + DEEPSEEK_TOKEN,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
                'User-Agent': 'Mozilla/5.0',
                'Accept': '*/*'
            },
            timeout: 60000
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(body);
                    if (json.choices && json.choices[0]) {
                        resolve(json.choices[0].message.content);
                    } else {
                        resolve('[DeepSeek Error: ' + body.substring(0, 200) + ']');
                    }
                } catch (e) {
                    resolve('[Parse Error]');
                }
            });
        });

        req.on('error', (e) => resolve('[Error: ' + e.message + ']'));
        req.on('timeout', () => { req.destroy(); resolve('[Timeout]'); });
        req.write(data);
        req.end();
    });
}

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.writeHead(200); res.end(); return;
    }

    if (req.url === '/' || req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            service: 'DeepSeek Proxy',
            status: 'online',
            model: 'deepseek-chat'
        }));
        return;
    }

    if (req.url === '/v1/chat' && req.method === 'POST') {
        if (!checkAuth(req)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
        }

        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const prompt = data.prompt || '';
                const systemPrompt = data.systemPrompt || '';

                const answer = await askDeepSeek(prompt, systemPrompt);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, answer: answer, model: 'deepseek-chat' }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    res.writeHead(404);
    res.end('Not found');
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log('DeepSeek Proxy on port ' + PORT);
});
