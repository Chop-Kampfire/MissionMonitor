/**
 * Mission Control Bot - Main Entry Point
 *
 * Starts Telegram bot, Discord bot, and deadline checker.
 * Handles graceful shutdown.
 */

import { startTelegramBot, stopTelegramBot } from './telegram';
import { startDiscordBot, stopDiscordBot } from './discord';
import { startDeadlineChecker, stopDeadlineChecker } from './deadline-checker';

console.log('='.repeat(50));
console.log('  Mission Control Bot');
console.log('  Version: 1.0.0');
console.log('='.repeat(50));
console.log('');

/**
 * Graceful shutdown handler
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`\n[Main] Received ${signal}, shutting down...`);

  try {
    stopDeadlineChecker();
    stopTelegramBot();
    await stopDiscordBot();
    console.log('[Main] Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[Main] Error during shutdown:', error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

/**
 * Main function - start all services
 */
async function main(): Promise<void> {
  console.log('[Main] Starting services...\n');

  try {
    // Start bots in parallel
    await Promise.all([
      startTelegramBot(),
      startDiscordBot(),
    ]);

    // Start deadline checker (runs every 5 minutes)
    startDeadlineChecker();

    console.log('\n[Main] All services started successfully!');
    console.log('[Main] - Telegram bot: listening for commands');
    console.log('[Main] - Discord bot: monitoring mission threads');
    console.log('[Main] - Deadline checker: every 5 minutes');
    console.log('[Main] Press Ctrl+C to stop.\n');

  } catch (error) {
    console.error('[Main] Failed to start services:', error);
    process.exit(1);
  }
}

// Run
main();
