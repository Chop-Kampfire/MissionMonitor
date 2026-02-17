/**
 * Command Handlers
 *
 * Business logic for bot commands. Platform-agnostic - can be called from
 * Telegram or Discord handlers.
 */

import { searchCampaigns, CampaignResult } from '../services/notion';
import { generateMissionBrief, generateTweetSuggestions, MissionBriefResult, TweetSuggestion } from '../services/claude';
import {
  MissionTemplate,
  createTemplate,
  getTemplateByName,
  getAllTemplates,
  deleteTemplate,
  resolveTemplateVariables,
} from '../storage';

export interface CommandResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Escape special characters for Telegram MarkdownV2
 */
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

// ============================================================================
// /mission Command
// ============================================================================

/**
 * Handle /mission <topic> command
 *
 * 1. Search Notion for matching campaigns
 * 2. Aggregate content if multiple related pieces
 * 3. Generate mission brief via Claude
 * 4. Format for Telegram
 */
export async function handleMissionCommand(topic: string): Promise<CommandResult> {
  try {
    // Search for campaigns
    const campaigns = await searchCampaigns(topic);

    if (campaigns.length === 0) {
      return {
        success: false,
        error: `No campaigns found matching "${topic}". Try a different search term.`,
      };
    }

    // Aggregate content from all matching campaigns
    const aggregatedContent = campaigns
      .map(c => `## ${c.title}\n\n${c.content}`)
      .join('\n\n---\n\n');

    const sourceUrls = campaigns.map(c => c.url);

    // Generate mission brief via Claude
    const brief = await generateMissionBrief(
      campaigns[0].title, // Use first campaign title as mission title
      aggregatedContent,
      sourceUrls
    );

    // Format for Telegram
    const message = formatMissionBrief(brief, campaigns.length);

    return {
      success: true,
      message,
    };
  } catch (error) {
    console.error('[Mission] Error:', error);
    return {
      success: false,
      error: 'Failed to generate mission brief. Please try again.',
    };
  }
}

/**
 * Format mission brief for Telegram
 */
function formatMissionBrief(brief: MissionBriefResult, sourceCount: number): string {
  const lines: string[] = [];

  // Header
  lines.push(`\u{1F3AF} *MISSION: ${escapeMarkdown(brief.title)}*`);
  lines.push('');

  // Key message
  lines.push('*KEY MESSAGE:*');
  lines.push(escapeMarkdown(brief.keyMessage));
  lines.push('');

  // Divider
  lines.push('\u2501'.repeat(35));
  lines.push('');

  // Supporting points
  lines.push('*SUPPORTING POINTS:*');
  lines.push('');
  for (const point of brief.supportingPoints) {
    lines.push(`\u2022 ${escapeMarkdown(point)}`);
  }
  lines.push('');

  // Divider
  lines.push('\u2501'.repeat(35));
  lines.push('');

  // Optional angles
  lines.push('*OPTIONAL ANGLES:*');
  lines.push('');
  for (const angle of brief.optionalAngles) {
    lines.push(`\u{1F4A1} ${escapeMarkdown(angle)}`);
  }
  lines.push('');

  // Divider
  lines.push('\u2501'.repeat(35));
  lines.push('');

  // Example tweets
  lines.push('*EXAMPLE TWEETS:*');
  lines.push('');
  for (let i = 0; i < brief.exampleTweets.length; i++) {
    lines.push(`*Tweet ${i + 1}:*`);
    lines.push('```');
    lines.push(brief.exampleTweets[i]);
    lines.push('```');
    lines.push('');
  }

  // Divider
  lines.push('\u2501'.repeat(35));
  lines.push('');

  // Sources
  lines.push('*SOURCES:*');
  for (const url of brief.sourceLinks) {
    lines.push(escapeMarkdown(url));
  }
  lines.push('');

  // Footer
  lines.push(`_Aggregated from ${sourceCount} campaign content piece${sourceCount > 1 ? 's' : ''}_`);

  return lines.join('\n');
}

// ============================================================================
// /tweets Command
// ============================================================================

/**
 * Handle /tweets <topic> command
 *
 * 1. Search Notion for content matching topic
 * 2. Aggregate facts and quotes
 * 3. Generate tweet suggestions via Claude
 * 4. Format for Telegram
 */
export async function handleTweetsCommand(topic: string): Promise<CommandResult> {
  try {
    // Search for content
    const campaigns = await searchCampaigns(topic);

    if (campaigns.length === 0) {
      return {
        success: false,
        error: `No content found matching "${topic}". Try a different search term.`,
      };
    }

    // Prepare content for Claude
    const contentPieces = campaigns.map(c => ({
      title: c.title,
      content: c.content,
      url: c.url,
    }));

    // Generate suggestions via Claude
    const suggestions = await generateTweetSuggestions(topic, contentPieces);

    // Format for Telegram
    const message = formatTweetSuggestions(topic, suggestions, campaigns.length);

    return {
      success: true,
      message,
    };
  } catch (error) {
    console.error('[Tweets] Error:', error);
    return {
      success: false,
      error: 'Failed to generate tweet suggestions. Please try again.',
    };
  }
}

/**
 * Format tweet suggestions for Telegram
 */
function formatTweetSuggestions(topic: string, suggestions: TweetSuggestion[], sourceCount: number): string {
  const lines: string[] = [];

  // Header
  lines.push(`\u{1F426} *TWEET SUGGESTIONS: ${escapeMarkdown(topic)}*`);
  lines.push('');
  lines.push('\u2501'.repeat(35));
  lines.push('');

  // Each suggestion
  for (let i = 0; i < suggestions.length; i++) {
    const s = suggestions[i];

    lines.push(`*${i + 1}\\. ${escapeMarkdown(s.hook)}*`);
    lines.push('');
    lines.push(`\u{1F4F1} *Twitter:* ${escapeMarkdown(s.twitterAngle)}`);
    lines.push(`\u{1F4BC} *LinkedIn:* ${escapeMarkdown(s.linkedinAngle)}`);
    lines.push(`\u{1F517} ${escapeMarkdown(s.sourceUrl)}`);
    lines.push('');
    lines.push('\u2501'.repeat(35));
    lines.push('');
  }

  // Footer
  lines.push(`_Generated from ${sourceCount} content source${sourceCount > 1 ? 's' : ''}_`);

  return lines.join('\n');
}

// ============================================================================
// /help Command
// ============================================================================

/**
 * Handle /help command
 */
export function handleHelpCommand(): string {
  return '*Mission Control Bot*\n\n' +
    'Available commands:\n\n' +
    '*/mission <topic>*\n' +
    'Create a mission brief from campaign content\\.\n' +
    'Example: \\`/mission Morgan Stanley\\`\n\n' +
    '*/tweets <topic>*\n' +
    'Generate 10 tweet suggestions for a topic\\.\n' +
    'Example: \\`/tweets Pyth Pro\\`\n\n' +
    '*Template Commands:*\n' +
    '*/tm <name> \\[var\\=val \\.\\.\\.\\]*\n' +
    'Create mission from a template\\.\n' +
    'Example: \\`/tm weekly topic\\="Pyth V3"\\`\n\n' +
    '*/templates*\n' +
    'List all saved templates\\.\n\n' +
    '*/tnew* \\(reply to brief text\\)\n' +
    'Create a new template\\.\n' +
    'Example: reply with \\`/tnew name\\=weekly deadline\\=7\\`\n\n' +
    '*/tview <name>*\n' +
    'View full template details\\.\n\n' +
    '*/tdel <name>*\n' +
    'Delete a template\\.\n\n' +
    '*/help*\n' +
    'Show this help message\\.\n\n' +
    '\\-\\-\\-\n' +
    '_Powered by Pyth Mission Control v2\\.0_';
}

// ============================================================================
// Template Commands
// ============================================================================

export interface TemplateMissionResult {
  success: boolean;
  title: string;
  resolvedBrief: string;
  deadlineDays: number;
  announcementText?: string;
  error?: string;
}

/**
 * Build built-in template variables for the current moment
 */
function buildBuiltinVars(deadlineDays: number): Record<string, string> {
  const now = new Date();
  const deadlineDate = new Date(now.getTime() + deadlineDays * 24 * 60 * 60 * 1000);
  return {
    date: now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    date_short: now.toISOString().slice(0, 10),
    deadline_date: deadlineDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    deadline_days: String(deadlineDays),
  };
}

/**
 * Handle /tm <name> [var=val ...] — create mission from template
 */
export function handleTemplateMissionCommand(
  templateName: string,
  userVars: Record<string, string>
): TemplateMissionResult {
  const template = getTemplateByName(templateName);
  if (!template) {
    return { success: false, title: '', resolvedBrief: '', deadlineDays: 7, error: `Template "${templateName}" not found.` };
  }

  const deadlineDays = userVars.deadline_days
    ? parseInt(userVars.deadline_days, 10)
    : template.defaultDeadlineDays;

  const builtinVars = buildBuiltinVars(deadlineDays);
  const allVars = { ...builtinVars, ...userVars };

  const resolvedBrief = resolveTemplateVariables(template.briefContent, allVars);

  // Derive title
  const title = allVars.title || (allVars.topic
    ? `${template.name} - ${allVars.topic}`
    : template.name);

  // Resolve announcement format if present
  let announcementText: string | undefined;
  if (template.announcementFormat) {
    announcementText = resolveTemplateVariables(template.announcementFormat, { ...allVars, title });
  }

  return {
    success: true,
    title,
    resolvedBrief,
    deadlineDays,
    announcementText,
  };
}

/**
 * Handle /templates — list all templates
 */
export function handleListTemplatesCommand(): CommandResult {
  const templates = getAllTemplates();
  if (templates.length === 0) {
    return { success: true, message: '_No templates saved yet\\. Use /tnew to create one\\._' };
  }

  const lines: string[] = ['*Saved Templates:*\n'];
  for (const t of templates) {
    const preview = t.briefContent.length > 60
      ? t.briefContent.slice(0, 60) + '...'
      : t.briefContent;
    lines.push(`*${escapeMarkdown(t.name)}* \\(${t.defaultDeadlineDays}d\\)`);
    lines.push(`  ${escapeMarkdown(preview)}\n`);
  }
  lines.push(`_${templates.length} template${templates.length !== 1 ? 's' : ''} total_`);

  return { success: true, message: lines.join('\n') };
}

/**
 * Handle /tview <name> — view full template details
 */
export function handleViewTemplateCommand(name: string): CommandResult {
  const template = getTemplateByName(name);
  if (!template) {
    return { success: false, error: `Template "${name}" not found.` };
  }

  // Detect placeholders
  const placeholders: string[] = [];
  const regex = /\{\{(\w+)\}\}/g;
  let match;
  while ((match = regex.exec(template.briefContent)) !== null) {
    if (!placeholders.includes(match[1])) {
      placeholders.push(match[1]);
    }
  }

  const lines: string[] = [
    `*Template: ${escapeMarkdown(template.name)}*\n`,
    `*Deadline:* ${template.defaultDeadlineDays} days`,
    `*Created:* ${escapeMarkdown(new Date(template.createdAt).toLocaleDateString())}\n`,
    `*Brief:*`,
    `\`\`\``,
    template.briefContent,
    `\`\`\``,
  ];

  if (placeholders.length > 0) {
    lines.push(`\n*Placeholders:* ${placeholders.map(p => `\\{\\{${escapeMarkdown(p)}\\}\\}`).join(', ')}`);
  }

  if (template.claudePromptOverride) {
    lines.push(`\n*Claude prompt override:* ${escapeMarkdown(template.claudePromptOverride)}`);
  }

  if (template.announcementFormat) {
    lines.push(`\n*Announcement format:*`);
    lines.push(`\`\`\``);
    lines.push(template.announcementFormat);
    lines.push(`\`\`\``);
  }

  return { success: true, message: lines.join('\n') };
}

/**
 * Handle /tnew — create a new template
 */
export function handleCreateTemplateCommand(input: {
  name: string;
  briefContent: string;
  defaultDeadlineDays: number;
  claudePromptOverride?: string;
  announcementFormat?: string;
}): CommandResult {
  try {
    const template = createTemplate(input);
    return {
      success: true,
      message: '\u2705 Template *' + escapeMarkdown(template.name) + '* created\\!\n\nUse \\`/tm ' + escapeMarkdown(template.name) + '\\` to create a mission from it\\.',
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Handle /tdel <name> — delete a template
 */
export function handleDeleteTemplateCommand(name: string): CommandResult {
  const template = getTemplateByName(name);
  if (!template) {
    return { success: false, error: `Template "${name}" not found.` };
  }

  deleteTemplate(template.id);
  return {
    success: true,
    message: `✅ Template *${escapeMarkdown(template.name)}* deleted\\.`,
  };
}
