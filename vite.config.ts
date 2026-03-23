import { defineConfig, type Plugin } from 'vite';
import fs from 'fs';
import path from 'path';

// Dev proxy plugin: handles POST /api/ai-plan by calling Anthropic API
function llmProxyPlugin(): Plugin {
  return {
    name: 'llm-proxy',
    configureServer(server) {
      server.middlewares.use('/api/ai-plan', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }

        // Read request body
        let body = '';
        for await (const chunk of req) body += chunk;
        let gameState: unknown;
        try {
          gameState = JSON.parse(body).gameState;
        } catch {
          res.statusCode = 400;
          res.end('Invalid JSON');
          return;
        }

        // Load env vars
        const envPath = path.resolve(process.cwd(), '.env');
        let apiKey = process.env.ANTHROPIC_API_KEY || '';
        let model = process.env.LLM_MODEL || 'claude-sonnet-4-6';
        if (fs.existsSync(envPath)) {
          const envContent = fs.readFileSync(envPath, 'utf-8');
          for (const line of envContent.split('\n')) {
            const match = line.match(/^(\w+)=(.*)$/);
            if (match) {
              if (match[1] === 'ANTHROPIC_API_KEY') apiKey = match[2].trim();
              if (match[1] === 'LLM_MODEL') model = match[2].trim();
            }
          }
        }

        if (!apiKey) {
          res.statusCode = 500;
          res.end('ANTHROPIC_API_KEY not set in .env');
          return;
        }

        // Load system prompt
        const promptPath = path.resolve(process.cwd(), 'src/prompts/ai-plan.md');
        let systemPrompt = '';
        try {
          systemPrompt = fs.readFileSync(promptPath, 'utf-8');
        } catch {
          res.statusCode = 500;
          res.end('Could not read system prompt');
          return;
        }

        // Call Anthropic API
        try {
          const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model,
              max_tokens: 2048,
              system: systemPrompt,
              messages: [
                {
                  role: 'user',
                  content: `Current game state:\n${JSON.stringify(gameState, null, 2)}`,
                },
              ],
            }),
          });

          if (!apiRes.ok) {
            const errText = await apiRes.text();
            console.error('Anthropic API error:', apiRes.status, errText);
            res.statusCode = 502;
            res.end(`Anthropic API error: ${apiRes.status}`);
            return;
          }

          const apiData = await apiRes.json() as { content: Array<{ text: string }> };
          const text = apiData.content?.[0]?.text || '';

          res.setHeader('Content-Type', 'text/plain');
          res.end(text);
        } catch (err) {
          console.error('Proxy error:', err);
          res.statusCode = 502;
          res.end('Proxy error');
        }
      });
    },
  };
}

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [llmProxyPlugin()],
  server: {
    open: true,
  },
});
