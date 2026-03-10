/**
 * Entry point — loads env, starts server + polling scheduler
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { createServer, startServer } from './server';
import { startPolling } from './poller';

const BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN;
const PORT = parseInt(process.env.DASHBOARD_PORT || '3001', 10);
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_HOURS || '6', 10);

if (!BEARER_TOKEN) {
  console.error('[Dashboard] TWITTER_BEARER_TOKEN is required. Set it in .env');
  process.exit(1);
}

console.log('[Dashboard] Starting Tweet Engagement Dashboard...');

const app = createServer(BEARER_TOKEN, PORT);
startServer(app, PORT);
startPolling(BEARER_TOKEN, POLL_INTERVAL);

console.log(`[Dashboard] Polling every ${POLL_INTERVAL} hours`);
