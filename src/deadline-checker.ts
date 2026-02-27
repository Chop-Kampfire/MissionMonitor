/**
 * Deadline Checker for Mission Control Bot
 *
 * Runs periodically to check for missions past their deadline,
 * posts announcements, closes threads, and exports to Google Sheets.
 */

import { getMissionsPastDeadline, getSubmissionsByMission, markMissionClosed } from './storage';
import { exportMissionToSheets, isSheetsConfigured } from './sheets';
import { closeThread, postMissionSummaryToThread, postMissionResultsToChannel, updateStarterEmbed } from './discord';

// Check interval: 5 minutes
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

let checkInterval: NodeJS.Timeout | null = null;

/**
 * Check for missions past deadline and process them
 */
async function checkDeadlines(): Promise<void> {
  const missionsPastDeadline = getMissionsPastDeadline();

  if (missionsPastDeadline.length === 0) {
    return;
  }

  console.log(`[DeadlineChecker] Found ${missionsPastDeadline.length} mission(s) past deadline`);

  for (const mission of missionsPastDeadline) {
    console.log(`[DeadlineChecker] Processing: "${mission.title}" (deadline: ${mission.deadline})`);

    // Step 1: Fetch submissions
    const submissions = getSubmissionsByMission(mission.id);
    console.log(`[DeadlineChecker] "${mission.title}" has ${submissions.length} submission(s)`);

    // Step 2: Post summary to thread (before locking)
    await postMissionSummaryToThread(mission.threadId, mission, submissions);

    // Step 3: Close/lock thread
    const threadClosed = await closeThread(mission.threadId);
    if (threadClosed) {
      console.log(`[DeadlineChecker] Thread closed for "${mission.title}"`);
    } else {
      console.warn(`[DeadlineChecker] Could not close thread for "${mission.title}"`);
    }

    // Step 4: Update the starter embed in the channel (🟢 ACTIVE → 🔴 CLOSED)
    await updateStarterEmbed(mission);

    // Step 5: Always mark mission as closed
    markMissionClosed(mission.id);

    // Step 6: Post results to results channel
    await postMissionResultsToChannel(mission, submissions);

    // Step 7: Export to Google Sheets (only if configured)
    if (isSheetsConfigured()) {
      const result = await exportMissionToSheets(mission);
      if (result.success) {
        console.log(`[DeadlineChecker] Exported "${mission.title}" - ${result.rowCount} submissions`);
      } else {
        console.error(`[DeadlineChecker] Failed to export "${mission.title}": ${result.error}`);
      }
    } else {
      console.log(`[DeadlineChecker] Sheets not configured, skipping export for "${mission.title}"`);
    }
  }
}

/**
 * Start the deadline checker
 */
export function startDeadlineChecker(): void {
  console.log('[DeadlineChecker] Starting deadline checker (every 5 minutes)');

  // Run immediately on start
  checkDeadlines().catch(err => {
    console.error('[DeadlineChecker] Error during initial check:', err);
  });

  // Then run periodically
  checkInterval = setInterval(() => {
    checkDeadlines().catch(err => {
      console.error('[DeadlineChecker] Error during periodic check:', err);
    });
  }, CHECK_INTERVAL_MS);
}

/**
 * Stop the deadline checker
 */
export function stopDeadlineChecker(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
    console.log('[DeadlineChecker] Stopped');
  }
}

/**
 * Manually trigger a check (for testing or manual export)
 */
export async function triggerCheck(): Promise<void> {
  console.log('[DeadlineChecker] Manual check triggered');
  await checkDeadlines();
}
