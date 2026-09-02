import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT) || 8080;
const distPath = path.join(__dirname, 'dist');

app.disable('x-powered-by');
app.use(express.static(distPath, {
  index: false,
  maxAge: '1h',
}));

// React Router SPA fallback.
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`[MARKET_CASH_SERVER_STARTED] http://0.0.0.0:${port}`);
});
