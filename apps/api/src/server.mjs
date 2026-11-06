import { createApp } from './app.mjs';
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';
createApp().listen(port, host, () => console.log(`SEPJ API: http://${host}:${port}/api/health`));
