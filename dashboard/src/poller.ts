/**
 * Scheduled metric fetcher — polls Twitter API for tweet engagement data
 */

import {
  loadSubmissions,
  loadEngagement,
  saveEngagement,
  extractTweetsFromSubmissions,
  upsertTweetMetrics,
} from './data';
import { fetchTweetMetrics, apiResponseToTweetMetrics } from './twitter';
import { pollPartnerClips } from './partners';

const MANUAL_REFRESH_COOLDOWN = 15 * 60 * 1000; // 15 minutes
const STALE_TWEET_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

let pollIntervalHandle: ReturnType<typeof setInterval> | null = null;

export async function runPoll(bearerToken: string): Promise<{ fetched: number; updated: number }> {
  console.log('[Poller] Starting poll...');

  const submissions = loadSubmissions();
  const extracted = extractTweetsFromSubmissions(submissions);

  if (extracted.length === 0) {
    console.log('[Poller] No tweet URLs found in submissions.');
    return { fetched: 0, updated: 0 };
  }

  // Filter out stale tweets (>7 days old) — poll them less frequently
  const engagement = loadEngagement();
  const now = Date.now();

  const tweetIdsToFetch = extracted.filter(t => {
    const existing = engagement.tweets.find(e => e.tweetId === t.tweetId);
    if (!existing) return true; // Never fetched
    const tweetAge = now - new Date(existing.tweetCreatedAt || existing.firstFetchedAt).getTime();
    if (tweetAge > STALE_TWEET_AGE) {
      // Stale tweets: only fetch if last fetch was >24h ago
      const lastFetch = now - new Date(existing.lastFetchedAt).getTime();
      return lastFetch > 24 * 60 * 60 * 1000;
    }
    return true;
  });

  const uniqueIds = [...new Set(tweetIdsToFetch.map(t => t.tweetId))];
  console.log(`[Poller] Fetching metrics for ${uniqueIds.length} tweets (${extracted.length} total tracked)`);

  const apiResults = await fetchTweetMetrics(uniqueIds, bearerToken);

  let updated = 0;
  for (const ext of tweetIdsToFetch) {
    const result = apiResults.get(ext.tweetId);
    if (!result) continue;

    const metrics = apiResponseToTweetMetrics(
      ext.tweetId,
      ext.submissionId,
      ext.missionId,
      result.metrics,
      result.user
    );
    upsertTweetMetrics(engagement, metrics);
    updated++;
  }

  engagement.lastPollAt = new Date().toISOString();
  saveEngagement(engagement);

  console.log(`[Poller] Poll complete. Fetched ${apiResults.size}, updated ${updated} tweet records.`);
  return { fetched: apiResults.size, updated };
}

export async function manualRefresh(bearerToken: string): Promise<{ success: boolean; message: string }> {
  const engagement = loadEngagement();

  if (engagement.lastManualRefreshAt) {
    const elapsed = Date.now() - new Date(engagement.lastManualRefreshAt).getTime();
    if (elapsed < MANUAL_REFRESH_COOLDOWN) {
      const remaining = Math.ceil((MANUAL_REFRESH_COOLDOWN - elapsed) / 60000);
      return { success: false, message: `Rate limited. Try again in ${remaining} minute(s).` };
    }
  }

  const result = await runPoll(bearerToken);
  const eng = loadEngagement();
  eng.lastManualRefreshAt = new Date().toISOString();
  saveEngagement(eng);

  return { success: true, message: `Refreshed. Fetched ${result.fetched}, updated ${result.updated} tweets.` };
}

export function startPolling(bearerToken: string, intervalHours: number): void {
  const intervalMs = intervalHours * 60 * 60 * 1000;
  console.log(`[Poller] Scheduling polls every ${intervalHours} hours`);

  // Run immediately on start
  runPoll(bearerToken).catch(err => console.error('[Poller] Initial poll failed:', err));
  pollPartnerClips(bearerToken).catch(err => console.error('[Poller] Initial partner poll failed:', err));

  pollIntervalHandle = setInterval(() => {
    runPoll(bearerToken).catch(err => console.error('[Poller] Scheduled poll failed:', err));
    pollPartnerClips(bearerToken).catch(err => console.error('[Poller] Scheduled partner poll failed:', err));
  }, intervalMs);
}

export function stopPolling(): void {
  if (pollIntervalHandle) {
    clearInterval(pollIntervalHandle);
    pollIntervalHandle = null;
    console.log('[Poller] Polling stopped');
  }
}
