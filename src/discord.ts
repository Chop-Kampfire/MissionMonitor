/**
 * Discord Bot
 *
 * Handles Discord events for Mission Control:
 * - Submission detection in mission THREADS (not main channel)
 * - Pre-creates 1-5 vote reactions for judges to click
 * - Only judges can vote (non-judge reactions removed)
 * - Votes persisted to disk for Google Sheets export
 */

import {
  Client,
  GatewayIntentBits,
  Events,
  ThreadChannel,
} from 'discord.js';
import { config } from './config';
import {
  createSubmission,
  getSubmissionByMessage,
  getMissionByThread,
  registerMission,
  recordVote,
  removeVote,
} from './storage';

// Create Discord client with required intents
export const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
});

// Vote emoji mappings
const VOTE_EMOJIS: Record<string, number> = {
  '1️⃣': 1,
  '2️⃣': 2,
  '3️⃣': 3,
  '4️⃣': 4,
  '5️⃣': 5,
};

// Ordered array for pre-creating reactions
const VOTE_EMOJI_ORDER = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];

const CONFIRMATION_EMOJI = '📝';

// In-memory index for quick message -> submission lookups
// This is rebuilt on each message, file storage is source of truth
const messageToSubmissionId = new Map<string, string>();

// ============================================================================
// Event Handlers
// ============================================================================

discordClient.once(Events.ClientReady, (client) => {
  console.log(`[Discord] Bot ready: ${client.user?.tag}`);
  console.log(`[Discord] Watching guild: ${config.discordGuildId}`);
  console.log(`[Discord] Mission channel: ${config.discordMissionChannelId}`);
});

/**
 * Handle new messages in mission THREADS
 * Submissions are posted as replies in threads under mission posts.
 * Check if it's a submission (contains URL) and pre-create vote reactions.
 */
discordClient.on(Events.MessageCreate, async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Only process messages in threads
  if (!message.channel.isThread()) return;

  const thread = message.channel as ThreadChannel;

  // Check if thread's parent is the mission channel
  if (thread.parentId !== config.discordMissionChannelId) return;

  // Check if message contains a URL (potential submission)
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = message.content.match(urlRegex);

  if (urls && urls.length > 0) {
    console.log(`[Discord] Submission in thread "${thread.name}" from ${message.author.tag}: ${urls[0]}`);

    // Ensure mission is registered (create if first submission)
    let mission = getMissionByThread(thread.id);
    if (!mission) {
      // Default deadline: 7 days from now (can be updated via command)
      const defaultDeadline = new Date();
      defaultDeadline.setDate(defaultDeadline.getDate() + 7);
      mission = registerMission(thread.id, thread.name, defaultDeadline);
    }

    // Create submission in file storage
    const submission = createSubmission(
      message.id,
      message.channel.id,
      thread.id,
      mission.id,
      message.author.id,
      message.author.tag,
      message.content,
      urls
    );

    // Track in memory for quick lookups
    messageToSubmissionId.set(message.id, submission.id);

    // Add confirmation reaction and pre-create vote reactions
    try {
      // First add confirmation emoji
      await message.react(CONFIRMATION_EMOJI);
      console.log(`[Discord] Submission confirmed: ${message.id}`);

      // Pre-create all vote reactions (1-5) for judges to click
      for (const emoji of VOTE_EMOJI_ORDER) {
        await message.react(emoji);
      }
      console.log(`[Discord] Vote reactions pre-created on submission: ${message.id}`);
    } catch (error) {
      console.error('[Discord] Failed to add reactions:', error);
    }
  }
});

/**
 * Handle reaction additions
 * Process judge votes on confirmed submissions.
 * Non-judge reactions are removed to keep voting clean.
 */
discordClient.on(Events.MessageReactionAdd, async (reaction, user) => {
  // Ignore bot reactions (including our pre-created ones)
  if (user.bot) return;

  // Fetch partial data if needed
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      console.error('[Discord] Error fetching reaction:', error);
      return;
    }
  }

  const emoji = reaction.emoji.name;
  if (!emoji) return;

  // Check if this is a vote emoji
  const voteScore = VOTE_EMOJIS[emoji];
  if (voteScore === undefined) return;

  const messageId = reaction.message.id;

  // Look up submission (check memory first, then file storage)
  let submissionId = messageToSubmissionId.get(messageId);
  if (!submissionId) {
    const submission = getSubmissionByMessage(messageId);
    if (!submission) {
      // Not a tracked submission
      return;
    }
    submissionId = submission.id;
    messageToSubmissionId.set(messageId, submissionId);
  }

  // Check if user has judge role
  let member = reaction.message.guild?.members.cache.get(user.id);
  if (!member) {
    // Try to fetch member if not cached
    try {
      member = await reaction.message.guild?.members.fetch(user.id);
    } catch (e) {
      console.log(`[Discord] Could not fetch member ${user.id}`);
      return;
    }
  }

  const hasJudgeRole = config.discordJudgeRoleIds.some(roleId =>
    member?.roles.cache.has(roleId)
  );

  if (!hasJudgeRole) {
    // Remove non-judge reactions
    console.log(`[Discord] Removing non-judge reaction from ${user.tag}`);
    try {
      await reaction.users.remove(user.id);
    } catch (e) {
      console.error('[Discord] Failed to remove reaction:', e);
    }
    return;
  }

  // Record the judge vote to file storage
  recordVote(submissionId, user.id, voteScore);
  console.log(`[Discord] Judge vote recorded: ${user.tag} gave ${voteScore} to submission ${submissionId}`);
});

/**
 * Handle reaction removals
 * Remove vote if judge removes their reaction
 */
discordClient.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (user.bot) return;

  const emoji = reaction.emoji.name;
  if (!emoji || !VOTE_EMOJIS[emoji]) return;

  const messageId = reaction.message.id;

  // Look up submission
  let submissionId = messageToSubmissionId.get(messageId);
  if (!submissionId) {
    const submission = getSubmissionByMessage(messageId);
    if (!submission) return;
    submissionId = submission.id;
  }

  // Remove the vote from file storage
  removeVote(submissionId, user.id);
  console.log(`[Discord] Vote removed: ${user.tag} from submission ${submissionId}`);
});

// ============================================================================
// Bot Lifecycle
// ============================================================================

/**
 * Start the Discord bot
 */
export async function startDiscordBot(): Promise<void> {
  console.log('[Discord] Starting bot...');

  try {
    await discordClient.login(config.discordBotToken);
  } catch (error) {
    console.error('[Discord] Failed to login:', error);
    throw error;
  }
}

/**
 * Stop the Discord bot gracefully
 */
export async function stopDiscordBot(): Promise<void> {
  console.log('[Discord] Stopping bot...');
  await discordClient.destroy();
}
