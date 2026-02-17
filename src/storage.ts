/**
 * File-based storage for Mission Control Bot
 *
 * Persists submissions and mission mappings to disk.
 * Survives bot restarts.
 */

import * as fs from 'fs';
import * as path from 'path';

// Storage directory (relative to bot root)
const STORAGE_DIR = path.join(__dirname, '..', 'data');
const SUBMISSIONS_FILE = path.join(STORAGE_DIR, 'submissions.json');
const MISSIONS_FILE = path.join(STORAGE_DIR, 'missions.json');
const TEMPLATES_FILE = path.join(STORAGE_DIR, 'templates.json');

// ============================================================================
// Types
// ============================================================================

export interface Mission {
  id: string;
  title: string;
  threadId: string;
  deadline: string;
  status: 'active' | 'closed' | 'exported';
  createdAt: string;
  exportedAt?: string;
  brief?: string; // Optional: full mission brief content
  telegramMessageId?: string; // Message ID of mission announcement in Telegram
  telegramChatId?: string; // Chat ID where mission was announced
}

export interface Vote {
  judgeId: string;
  score: number;
  timestamp: string;
}

export interface Submission {
  id: string;
  messageId: string;
  channelId: string;
  threadId: string;
  missionId: string;
  userId: string;
  userTag: string;
  content: string;
  urls: string[];
  votes: Vote[];
  submittedAt: string;
  exported: boolean;
  source: 'discord' | 'telegram'; // Where submission came from
}

export interface MissionTemplate {
  id: string;
  name: string;
  briefContent: string;
  defaultDeadlineDays: number;
  claudePromptOverride?: string;
  announcementFormat?: string;
  roleIds?: string[];
  createdAt: string;
  updatedAt: string;
}

interface SubmissionsData {
  submissions: Submission[];
}

interface MissionsData {
  missions: Mission[];
}

interface TemplatesData {
  templates: MissionTemplate[];
}

// ============================================================================
// Initialization
// ============================================================================

function ensureStorageDir(): void {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
    console.log(`[Storage] Created data directory: ${STORAGE_DIR}`);
  }
}

function loadSubmissions(): SubmissionsData {
  ensureStorageDir();
  if (!fs.existsSync(SUBMISSIONS_FILE)) {
    return { submissions: [] };
  }
  const content = fs.readFileSync(SUBMISSIONS_FILE, 'utf-8');
  return JSON.parse(content);
}

function saveSubmissions(data: SubmissionsData): void {
  ensureStorageDir();
  fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function loadMissions(): MissionsData {
  ensureStorageDir();
  if (!fs.existsSync(MISSIONS_FILE)) {
    return { missions: [] };
  }
  const content = fs.readFileSync(MISSIONS_FILE, 'utf-8');
  return JSON.parse(content);
}

function saveMissions(data: MissionsData): void {
  ensureStorageDir();
  fs.writeFileSync(MISSIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ============================================================================
// Mission Functions
// ============================================================================

/**
 * Register a new mission (called when mission thread is created)
 */
export function registerMission(
  threadId: string,
  title: string,
  deadline: Date,
  brief?: string
): Mission {
  console.log(`[Storage] DEBUG: registerMission called - threadId=${threadId}, title="${title}"`);

  const data = loadMissions();

  // Check if already exists
  const existing = data.missions.find(m => m.threadId === threadId);
  if (existing) {
    console.log(`[Storage] DEBUG: Mission already exists: ${existing.id}`);
    return existing;
  }

  const mission: Mission = {
    id: `mission-${Date.now()}`,
    title,
    threadId,
    deadline: deadline.toISOString(),
    status: 'active',
    createdAt: new Date().toISOString(),
    brief,
  };

  data.missions.push(mission);
  saveMissions(data);
  console.log(`[Storage] Mission registered: ${mission.id} - "${title}"`);
  return mission;
}

/**
 * Get mission by thread ID
 */
export function getMissionByThread(threadId: string): Mission | null {
  const data = loadMissions();
  return data.missions.find(m => m.threadId === threadId) || null;
}

/**
 * Get mission by mission ID
 */
export function getMissionById(missionId: string): Mission | null {
  const data = loadMissions();
  return data.missions.find(m => m.id === missionId) || null;
}

/**
 * Get mission by Telegram message ID
 */
export function getMissionByTelegramMessage(messageId: string): Mission | null {
  const data = loadMissions();
  return data.missions.find(m => m.telegramMessageId === messageId) || null;
}

/**
 * Update mission with Telegram message info
 */
export function updateMissionTelegramInfo(
  missionId: string,
  telegramMessageId: string,
  telegramChatId: string
): void {
  const data = loadMissions();
  const mission = data.missions.find(m => m.id === missionId);
  if (mission) {
    mission.telegramMessageId = telegramMessageId;
    mission.telegramChatId = telegramChatId;
    saveMissions(data);
    console.log(`[Storage] Mission ${missionId} updated with Telegram info: msgId=${telegramMessageId}, chatId=${telegramChatId}`);
  }
}

/**
 * Mark mission as closed (thread locked, awaiting export)
 */
export function markMissionClosed(missionId: string): void {
  const data = loadMissions();
  const mission = data.missions.find(m => m.id === missionId);
  if (mission) {
    mission.status = 'closed';
    saveMissions(data);
    console.log(`[Storage] Mission marked closed: ${missionId}`);
  }
}

/**
 * Get all active missions (not yet exported)
 */
export function getActiveMissions(): Mission[] {
  const data = loadMissions();
  return data.missions.filter(m => m.status === 'active');
}

/**
 * Get missions past their deadline that haven't been exported
 */
export function getMissionsPastDeadline(): Mission[] {
  const now = new Date();
  const data = loadMissions();
  return data.missions.filter(
    m => m.status === 'active' && new Date(m.deadline) < now
  );
}

/**
 * Mark mission as exported
 */
export function markMissionExported(missionId: string): void {
  const data = loadMissions();
  const mission = data.missions.find(m => m.id === missionId);
  if (mission) {
    mission.status = 'exported';
    mission.exportedAt = new Date().toISOString();
    saveMissions(data);
    console.log(`[Storage] Mission marked exported: ${missionId}`);
  }
}

// ============================================================================
// Submission Functions
// ============================================================================

/**
 * Create a new submission
 */
export function createSubmission(
  messageId: string,
  channelId: string,
  threadId: string,
  missionId: string,
  userId: string,
  userTag: string,
  content: string,
  urls: string[],
  source: 'discord' | 'telegram' = 'discord'
): Submission {
  console.log(`[Storage] DEBUG: createSubmission called - messageId=${messageId}, userId=${userId}, source=${source}`);

  const data = loadSubmissions();

  const submission: Submission = {
    id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    messageId,
    channelId,
    threadId,
    missionId,
    userId,
    userTag,
    content,
    urls,
    votes: [],
    submittedAt: new Date().toISOString(),
    exported: false,
    source,
  };

  data.submissions.push(submission);
  saveSubmissions(data);
  console.log(`[Storage] Submission created: ${submission.id} (source: ${source})`);
  return submission;
}

/**
 * Get submission by message ID
 */
export function getSubmissionByMessage(messageId: string): Submission | null {
  const data = loadSubmissions();
  return data.submissions.find(s => s.messageId === messageId) || null;
}

/**
 * Get all submissions for a mission
 */
export function getSubmissionsByMission(missionId: string): Submission[] {
  const data = loadSubmissions();
  return data.submissions.filter(s => s.missionId === missionId);
}

/**
 * Add or update a vote on a submission
 */
export function recordVote(submissionId: string, judgeId: string, score: number): void {
  console.log(`[Storage] DEBUG: recordVote called - submissionId=${submissionId}, judgeId=${judgeId}, score=${score}`);

  const data = loadSubmissions();
  const submission = data.submissions.find(s => s.id === submissionId);

  if (!submission) {
    console.error(`[Storage] Submission not found: ${submissionId}`);
    return;
  }

  // Check if judge already voted
  const existingVoteIndex = submission.votes.findIndex(v => v.judgeId === judgeId);
  const vote: Vote = {
    judgeId,
    score,
    timestamp: new Date().toISOString(),
  };

  if (existingVoteIndex >= 0) {
    // Update existing vote
    submission.votes[existingVoteIndex] = vote;
    console.log(`[Storage] Vote updated: judge ${judgeId} changed to ${score} on ${submissionId}`);
  } else {
    // Add new vote
    submission.votes.push(vote);
    console.log(`[Storage] Vote recorded: judge ${judgeId} gave ${score} to ${submissionId}`);
  }

  saveSubmissions(data);
}

/**
 * Remove a vote from a submission
 */
export function removeVote(submissionId: string, judgeId: string): void {
  console.log(`[Storage] DEBUG: removeVote called - submissionId=${submissionId}, judgeId=${judgeId}`);

  const data = loadSubmissions();
  const submission = data.submissions.find(s => s.id === submissionId);

  if (!submission) return;

  submission.votes = submission.votes.filter(v => v.judgeId !== judgeId);
  saveSubmissions(data);
  console.log(`[Storage] Vote removed: judge ${judgeId} from ${submissionId}`);
}

/**
 * Mark submissions as exported
 */
export function markSubmissionsExported(missionId: string): void {
  const data = loadSubmissions();
  data.submissions.forEach(s => {
    if (s.missionId === missionId) {
      s.exported = true;
    }
  });
  saveSubmissions(data);
}

// ============================================================================
// Template Functions
// ============================================================================

function loadTemplates(): TemplatesData {
  ensureStorageDir();
  if (!fs.existsSync(TEMPLATES_FILE)) {
    return { templates: [] };
  }
  const content = fs.readFileSync(TEMPLATES_FILE, 'utf-8');
  return JSON.parse(content);
}

function saveTemplates(data: TemplatesData): void {
  ensureStorageDir();
  fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Create a new mission template
 */
export function createTemplate(input: {
  name: string;
  briefContent: string;
  defaultDeadlineDays: number;
  claudePromptOverride?: string;
  announcementFormat?: string;
}): MissionTemplate {
  const data = loadTemplates();

  // Check for duplicate name (case-insensitive)
  const existing = data.templates.find(
    t => t.name.toLowerCase() === input.name.toLowerCase()
  );
  if (existing) {
    throw new Error(`Template "${input.name}" already exists.`);
  }

  const template: MissionTemplate = {
    id: `tmpl-${Date.now()}`,
    name: input.name,
    briefContent: input.briefContent,
    defaultDeadlineDays: input.defaultDeadlineDays,
    claudePromptOverride: input.claudePromptOverride,
    announcementFormat: input.announcementFormat,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  data.templates.push(template);
  saveTemplates(data);
  console.log(`[Storage] Template created: ${template.id} - "${template.name}"`);
  return template;
}

/**
 * Get template by name (case-insensitive)
 */
export function getTemplateByName(name: string): MissionTemplate | null {
  const data = loadTemplates();
  return data.templates.find(
    t => t.name.toLowerCase() === name.toLowerCase()
  ) || null;
}

/**
 * Get all templates sorted by createdAt desc
 */
export function getAllTemplates(): MissionTemplate[] {
  const data = loadTemplates();
  return data.templates.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Update a template by ID
 */
export function updateTemplate(
  id: string,
  updates: Partial<Pick<MissionTemplate, 'name' | 'briefContent' | 'defaultDeadlineDays' | 'claudePromptOverride' | 'announcementFormat'>>
): MissionTemplate | null {
  const data = loadTemplates();
  const template = data.templates.find(t => t.id === id);
  if (!template) return null;

  // If renaming, check for conflicts
  if (updates.name && updates.name.toLowerCase() !== template.name.toLowerCase()) {
    const conflict = data.templates.find(
      t => t.id !== id && t.name.toLowerCase() === updates.name!.toLowerCase()
    );
    if (conflict) {
      throw new Error(`Template "${updates.name}" already exists.`);
    }
  }

  Object.assign(template, updates, { updatedAt: new Date().toISOString() });
  saveTemplates(data);
  console.log(`[Storage] Template updated: ${template.id} - "${template.name}"`);
  return template;
}

/**
 * Delete a template by ID
 */
export function deleteTemplate(id: string): boolean {
  const data = loadTemplates();
  const index = data.templates.findIndex(t => t.id === id);
  if (index < 0) return false;

  const removed = data.templates.splice(index, 1)[0];
  saveTemplates(data);
  console.log(`[Storage] Template deleted: ${removed.id} - "${removed.name}"`);
  return true;
}

/**
 * Resolve {{placeholder}} variables in template text
 */
export function resolveTemplateVariables(
  text: string,
  vars: Record<string, string>
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match);
}
