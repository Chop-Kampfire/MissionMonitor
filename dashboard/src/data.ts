/**
 * Data layer — reads bot JSON files (read-only) and manages engagement.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { Mission, Submission, EngagementData, TweetMetrics } from './types';

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const MISSIONS_FILE = path.join(DATA_DIR, 'missions.json');
const SUBMISSIONS_FILE = path.join(DATA_DIR, 'submissions.json');
const ENGAGEMENT_FILE = path.join(DATA_DIR, 'engagement.json');

const MAX_FETCH_HISTORY = 30;

// Tweet URL regex — matches twitter.com and x.com status URLs
const TWEET_URL_REGEX = /https?:\/\/(?:twitter\.com|x\.com)\/(\w+)\/status\/(\d+)/;

// ============================================================================
// Bot data (read-only)
// ============================================================================

export function loadMissions(): Mission[] {
  try {
    const content = fs.readFileSync(MISSIONS_FILE, 'utf-8');
    const data = JSON.parse(content);
    return data.missions || [];
  } catch {
    return [];
  }
}

export function loadSubmissions(): Submission[] {
  try {
    const content = fs.readFileSync(SUBMISSIONS_FILE, 'utf-8');
    const data = JSON.parse(content);
    return data.submissions || [];
  } catch {
    return [];
  }
}

// ============================================================================
// Engagement data (dashboard-owned)
// ============================================================================

export function loadEngagement(): EngagementData {
  try {
    const content = fs.readFileSync(ENGAGEMENT_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { tweets: [], lastPollAt: null, lastManualRefreshAt: null };
  }
}

export function saveEngagement(data: EngagementData): void {
  fs.writeFileSync(ENGAGEMENT_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ============================================================================
// Tweet ID extraction
// ============================================================================

export interface ExtractedTweet {
  tweetId: string;
  username: string;
  submissionId: string;
  missionId: string;
}

export function extractTweetsFromSubmissions(submissions: Submission[]): ExtractedTweet[] {
  const tweets: ExtractedTweet[] = [];

  for (const sub of submissions) {
    for (const url of sub.urls) {
      const match = url.match(TWEET_URL_REGEX);
      if (match) {
        tweets.push({
          tweetId: match[2],
          username: match[1],
          submissionId: sub.id,
          missionId: sub.missionId,
        });
      }
    }
    // Also check content for tweet URLs
    const contentMatch = sub.content.match(TWEET_URL_REGEX);
    if (contentMatch) {
      const alreadyFound = tweets.some(
        t => t.tweetId === contentMatch[2] && t.submissionId === sub.id
      );
      if (!alreadyFound) {
        tweets.push({
          tweetId: contentMatch[2],
          username: contentMatch[1],
          submissionId: sub.id,
          missionId: sub.missionId,
        });
      }
    }
  }

  return tweets;
}

// ============================================================================
// Engagement update helpers
// ============================================================================

export function upsertTweetMetrics(
  engagement: EngagementData,
  metrics: TweetMetrics
): void {
  const idx = engagement.tweets.findIndex(t => t.tweetId === metrics.tweetId);

  if (idx >= 0) {
    const existing = engagement.tweets[idx];
    // Add snapshot to history
    existing.fetchHistory.push({
      timestamp: new Date().toISOString(),
      impressions: metrics.impressions,
      likes: metrics.likes,
      retweets: metrics.retweets,
      replies: metrics.replies,
      quotes: metrics.quotes,
      bookmarks: metrics.bookmarks,
    });
    // Cap history
    if (existing.fetchHistory.length > MAX_FETCH_HISTORY) {
      existing.fetchHistory = existing.fetchHistory.slice(-MAX_FETCH_HISTORY);
    }
    // Update current values
    existing.impressions = metrics.impressions;
    existing.likes = metrics.likes;
    existing.retweets = metrics.retweets;
    existing.replies = metrics.replies;
    existing.quotes = metrics.quotes;
    existing.bookmarks = metrics.bookmarks;
    existing.authorUsername = metrics.authorUsername;
    existing.authorFollowerCount = metrics.authorFollowerCount;
    existing.lastFetchedAt = new Date().toISOString();
  } else {
    metrics.firstFetchedAt = new Date().toISOString();
    metrics.lastFetchedAt = metrics.firstFetchedAt;
    metrics.fetchHistory = [{
      timestamp: metrics.firstFetchedAt,
      impressions: metrics.impressions,
      likes: metrics.likes,
      retweets: metrics.retweets,
      replies: metrics.replies,
      quotes: metrics.quotes,
      bookmarks: metrics.bookmarks,
    }];
    engagement.tweets.push(metrics);
  }
}
