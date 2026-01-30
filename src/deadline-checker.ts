/**
 * Deadline Checker for Mission Control Bot
 *
 * Runs periodically to check for missions past their deadline
 * and triggers Google Sheets export.
 */

import { getMissionsPastDeadline, StoredMission } from './storage';
import { exportMissionToSheets } from './sheets';

// Check interval: 5 minutes
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

let checkInterval: NodeJS.Timeout | null = null;

/**
 * Check for missions past deadline and export them
 */
async function checkDeadlines(): Promise<void> {
  const missionsPastDeadline = getMissionsPastDeadline();

  if (missionsPastDeadline.length === 0) {
    return;
  }

  console.log(`[DeadlineChecker] Found ${missionsPastDeadline.length} mission(s) past deadline`);

  for (const mission of missionsPastDeadline) {
    console.log(`[DeadlineChecker] Processing: "${mission.title}" (deadline: ${mission.deadline})`);

    const result = await exportMissionToSheets(mission);

    if (result.success) {
      console.log(`[DeadlineChecker] Exported "${mission.title}" - ${result.rowCount} submissions`);
    } else {
      console.error(`[DeadlineChecker] Failed to export "${mission.title}": ${result.error}`);
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
