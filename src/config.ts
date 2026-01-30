/**
 * Configuration loader for Mission Control Bot
 *
 * Simplified version - Discord monitoring + Google Sheets export only.
 * Notion integration will be added later.
 */

import * as dotenv from 'dotenv';

dotenv.config();

export interface BotConfig {
  // Telegram (optional - for status commands only)
  telegramBotToken: string;
  telegramAllowedChatIds: string[];

  // Discord (required)
  discordBotToken: string;
  discordGuildId: string;
  discordMissionChannelId: string;
  discordJudgeRoleIds: string[];

  // Google Sheets (required for export)
  googleSpreadsheetId: string;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string = ''): string {
  return process.env[key] || defaultValue;
}

function parseArray(value: string): string[] {
  if (!value) return [];
  return value.split(',').map(s => s.trim()).filter(Boolean);
}

export function loadConfig(): BotConfig {
  return {
    // Telegram (optional)
    telegramBotToken: optionalEnv('TELEGRAM_BOT_TOKEN', ''),
    telegramAllowedChatIds: parseArray(optionalEnv('TELEGRAM_ALLOWED_CHAT_IDS', '-5226358270')),

    // Discord (required)
    discordBotToken: requireEnv('DISCORD_BOT_TOKEN'),
    discordGuildId: optionalEnv('DISCORD_GUILD_ID', '826115122799837205'),
    discordMissionChannelId: optionalEnv('DISCORD_MISSION_CHANNEL_ID', '1308506959032488067'),
    discordJudgeRoleIds: parseArray(optionalEnv('DISCORD_JUDGE_ROLE_IDS', '1351377449744728105')),

    // Google Sheets (required)
    googleSpreadsheetId: requireEnv('GOOGLE_SPREADSHEET_ID'),
  };
}

export const config = loadConfig();
