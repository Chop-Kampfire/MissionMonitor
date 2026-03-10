/**
 * Mission success scoring — aggregates tweet metrics into mission-level scores
 */

import { Mission, TweetMetrics, MissionScore, LeaderboardEntry } from './types';
import { loadMissions, loadEngagement } from './data';

function totalEngagement(t: TweetMetrics): number {
  return t.likes + t.retweets + t.replies + t.quotes + t.bookmarks;
}

function engagementRate(t: TweetMetrics): number {
  if (t.impressions === 0) return 0;
  return totalEngagement(t) / t.impressions;
}

function followerNormalized(t: TweetMetrics): number {
  if (t.authorFollowerCount === 0) return 0;
  return totalEngagement(t) / t.authorFollowerCount;
}

export function calculateMissionScores(): MissionScore[] {
  const missions = loadMissions();
  const engagement = loadEngagement();

  const rawScores: MissionScore[] = [];

  for (const mission of missions) {
    const tweets = engagement.tweets.filter(t => t.missionId === mission.id);

    const submissionCount = tweets.length;
    const totalImpressions = tweets.reduce((sum, t) => sum + t.impressions, 0);
    const avgImpressions = submissionCount > 0 ? totalImpressions / submissionCount : 0;
    const avgEngRate = submissionCount > 0
      ? tweets.reduce((sum, t) => sum + engagementRate(t), 0) / submissionCount
      : 0;
    const avgFollowerNorm = submissionCount > 0
      ? tweets.reduce((sum, t) => sum + followerNormalized(t), 0) / submissionCount
      : 0;

    rawScores.push({
      missionId: mission.id,
      title: mission.title,
      status: mission.status,
      deadline: mission.deadline,
      submissionCount,
      totalImpressions,
      avgImpressions,
      avgEngagementRate: avgEngRate,
      avgFollowerNormalized: avgFollowerNorm,
      successScore: 0, // Calculated after normalization
      trackedTweets: tweets.length,
    });
  }

  // Normalize and calculate final scores
  const maxImpressions = Math.max(...rawScores.map(s => s.avgImpressions), 1);
  const maxEngRate = Math.max(...rawScores.map(s => s.avgEngagementRate), 0.001);
  const maxSubmissions = Math.max(...rawScores.map(s => s.submissionCount), 1);
  const maxFollowerNorm = Math.max(...rawScores.map(s => s.avgFollowerNormalized), 0.001);

  for (const score of rawScores) {
    const normImpressions = score.avgImpressions / maxImpressions;
    const normEngRate = score.avgEngagementRate / maxEngRate;
    const normSubmissions = score.submissionCount / maxSubmissions;
    const normFollower = score.avgFollowerNormalized / maxFollowerNorm;

    score.successScore = Math.round(
      (normImpressions * 0.3 + normEngRate * 0.4 + normSubmissions * 0.2 + normFollower * 0.1) * 100
    );
  }

  return rawScores.sort((a, b) => b.successScore - a.successScore);
}

export function getMissionDetail(missionId: string): {
  mission: Mission | undefined;
  tweets: (TweetMetrics & { totalEngagement: number; engagementRate: number })[];
} {
  const missions = loadMissions();
  const mission = missions.find(m => m.id === missionId);
  const engagement = loadEngagement();

  const tweets = engagement.tweets
    .filter(t => t.missionId === missionId)
    .map(t => ({
      ...t,
      totalEngagement: totalEngagement(t),
      engagementRate: engagementRate(t),
    }))
    .sort((a, b) => b.totalEngagement - a.totalEngagement);

  return { mission, tweets };
}

export function getLeaderboard(limit: number = 25): LeaderboardEntry[] {
  const missions = loadMissions();
  const engagement = loadEngagement();
  const missionMap = new Map(missions.map(m => [m.id, m]));

  return engagement.tweets
    .map(t => ({
      tweetId: t.tweetId,
      submissionId: t.submissionId,
      missionId: t.missionId,
      missionTitle: missionMap.get(t.missionId)?.title || 'Unknown Mission',
      authorUsername: t.authorUsername,
      authorFollowerCount: t.authorFollowerCount,
      impressions: t.impressions,
      likes: t.likes,
      retweets: t.retweets,
      replies: t.replies,
      quotes: t.quotes,
      bookmarks: t.bookmarks,
      totalEngagement: totalEngagement(t),
      engagementRate: engagementRate(t),
    }))
    .sort((a, b) => b.totalEngagement - a.totalEngagement)
    .slice(0, limit);
}
