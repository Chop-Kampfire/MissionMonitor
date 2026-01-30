/**
 * Telegram Bot (Simplified)
 *
 * Status commands only - no Notion/Claude integration.
 * Just provides status info about the Discord monitoring.
 */

import { Bot, Context } from 'grammy';
import { config } from './config';
import { getActiveMissions, getMissionsPastDeadline } from './storage';

let telegramBot: Bot | null = null;

/**
 * Check if message is from allowed chat
 */
function isAllowedChat(ctx: Context): boolean {
  const chatId = ctx.chat?.id?.toString();
  if (!chatId) return false;

  if (config.telegramAllowedChatIds.length === 0) return true;
  return config.telegramAllowedChatIds.includes(chatId);
}

/**
 * Start the Telegram bot (optional - only if token provided)
 */
export async function startTelegramBot(): Promise<void> {
  if (!config.telegramBotToken) {
    console.log('[Telegram] No token provided, skipping Telegram bot');
    return;
  }

  console.log('[Telegram] Starting bot...');

  telegramBot = new Bot(config.telegramBotToken);

  // /status - Show current monitoring status
  telegramBot.command('status', async (ctx) => {
    if (!isAllowedChat(ctx)) return;

    const activeMissions = getActiveMissions();
    const pastDeadline = getMissionsPastDeadline();

    let message = '*Mission Control Status*\n\n';
    message += `Active missions: ${activeMissions.length}\n`;
    message += `Past deadline \\(pending export\\): ${pastDeadline.length}\n\n`;

    if (activeMissions.length > 0) {
      message += '*Active Missions:*\n';
      activeMissions.slice(0, 5).forEach(m => {
        const deadline = new Date(m.deadline).toLocaleDateString();
        message += `• ${m.title.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&')} \\(${deadline}\\)\n`;
      });
    }

    await ctx.reply(message, { parse_mode: 'MarkdownV2' });
  });

  // /help
  telegramBot.command('help', async (ctx) => {
    if (!isAllowedChat(ctx)) return;

    await ctx.reply(
      '*Mission Control Bot*\n\n' +
      '*Commands:*\n' +
      '/status \\- Show monitoring status\n' +
      '/help \\- Show this message',
      { parse_mode: 'MarkdownV2' }
    );
  });

  // /start
  telegramBot.command('start', async (ctx) => {
    await ctx.reply(
      '*Mission Control Bot*\n\n' +
      'Discord monitoring \\+ Google Sheets export\\.\n' +
      'Use /status to check current missions\\.',
      { parse_mode: 'MarkdownV2' }
    );
  });

  // Error handling
  telegramBot.catch((err) => {
    console.error('[Telegram] Bot error:', err);
  });

  // Start polling
  await telegramBot.start({
    onStart: (botInfo) => {
      console.log(`[Telegram] Bot started: @${botInfo.username}`);
    },
  });
}

/**
 * Stop the Telegram bot gracefully
 */
export function stopTelegramBot(): void {
  if (telegramBot) {
    console.log('[Telegram] Stopping bot...');
    telegramBot.stop();
  }
}
