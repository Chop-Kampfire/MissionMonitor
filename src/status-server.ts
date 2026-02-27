/**
 * Lightweight HTTP status server for the Mission Control Bot dashboard.
 *
 * Serves:
 *   GET /              → dashboard HTML
 *   GET /style.css     → dashboard styles
 *   GET /dashboard.js  → dashboard client script
 *   GET /status.json   → live service health payload
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'discord.js';
import { config } from './config';
import { isSheetsConfigured } from './sheets';
import { getActiveMissions, getSubmissionsByMission } from './storage';

const PORT = parseInt(process.env.STATUS_PORT || '3000', 10);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const START_TIME = Date.now();
const VERSION = '2.0.0';

// References set at boot from index.ts
let discordClientRef: Client | null = null;
let telegramRunning = false;

export function setDiscordClient(client: Client) {
  discordClientRef = client;
}

export function setTelegramRunning(running: boolean) {
  telegramRunning = running;
}

// ---------------------------------------------------------------------------
// Status payload builder
// ---------------------------------------------------------------------------

interface ServiceStatus {
  name: string;
  status: 'operational' | 'down' | 'unconfigured';
  detail: string;
}

function buildStatus(): object {
  const services: ServiceStatus[] = [];

  // Discord
  const discordReady = discordClientRef?.isReady() ?? false;
  services.push({
    name: 'Discord Bot',
    status: discordReady ? 'operational' : 'down',
    detail: discordReady
      ? `Logged in as ${discordClientRef!.user?.tag}`
      : 'Not connected',
  });

  // Telegram
  services.push({
    name: 'Telegram Bot',
    status: telegramRunning ? 'operational' : 'down',
    detail: telegramRunning ? 'Long-polling active' : 'Not running',
  });

  // Notion
  const notionConfigured = !!config.notionToken;
  services.push({
    name: 'Notion API',
    status: notionConfigured ? 'operational' : 'unconfigured',
    detail: notionConfigured ? 'Token configured' : 'No token set',
  });

  // Claude
  const claudeConfigured = !!config.anthropicApiKey;
  services.push({
    name: 'Claude API',
    status: claudeConfigured ? 'operational' : 'unconfigured',
    detail: claudeConfigured ? `Model: ${config.claudeModel}` : 'No API key set',
  });

  // Google Sheets
  const sheetsOk = isSheetsConfigured();
  services.push({
    name: 'Google Sheets',
    status: sheetsOk ? 'operational' : 'unconfigured',
    detail: sheetsOk ? 'Configured' : 'Not configured',
  });

  // Active missions summary
  const activeMissions = getActiveMissions();
  let totalSubmissions = 0;
  for (const m of activeMissions) {
    totalSubmissions += getSubmissionsByMission(m.id).length;
  }
  services.push({
    name: 'Active Missions',
    status: 'operational',
    detail: `${activeMissions.length} mission${activeMissions.length !== 1 ? 's' : ''}, ${totalSubmissions} submission${totalSubmissions !== 1 ? 's' : ''}`,
  });

  return {
    version: VERSION,
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
    lastUpdated: new Date().toISOString(),
    services,
  };
}

// ---------------------------------------------------------------------------
// Static file helpers
// ---------------------------------------------------------------------------

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function serveFile(res: http.ServerResponse, filePath: string) {
  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';

  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

let server: http.Server | null = null;

export function startStatusServer(): void {
  server = http.createServer((req, res) => {
    const url = req.url?.split('?')[0] || '/';

    if (url === '/status.json') {
      const payload = JSON.stringify(buildStatus());
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
      res.end(payload);
      return;
    }

    // Static dashboard files
    const fileMap: Record<string, string> = {
      '/': 'index.html',
      '/index.html': 'index.html',
      '/style.css': 'style.css',
      '/dashboard.js': 'dashboard.js',
    };

    const fileName = fileMap[url];
    if (fileName) {
      serveFile(res, path.join(PUBLIC_DIR, fileName));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Status] Dashboard running at http://0.0.0.0:${PORT}`);
  });
}

export function stopStatusServer(): void {
  if (server) {
    server.close();
    server = null;
    console.log('[Status] Server stopped');
  }
}
