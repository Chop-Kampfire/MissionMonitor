#!/bin/bash
# ==============================================================================
# fetch-gainzy-clips.sh
#
# Fetches tweets mentioning "gainzy" from 6 clipper accounts going back 4 months.
# Handles Twitter API rate limits by sleeping until the reset window.
# Tracks progress in a state file so it can resume if interrupted.
#
# Usage:
#   nohup bash /root/MissionMonitor/dashboard/fetch-gainzy-clips.sh >> /root/MissionMonitor/dashboard/fetch-clips.log 2>&1 &
#
# Monitor:
#   tail -f /root/MissionMonitor/dashboard/fetch-clips.log
# ==============================================================================

set -uo pipefail

BEARER=$(grep TWITTER_BEARER_TOKEN /root/MissionMonitor/dashboard/.env | cut -d= -f2-)
PARTNERS_JSON="/root/MissionMonitor/data/partners.json"
PARTNER_ID="partner-1773050585102"
STATE_FILE="/root/MissionMonitor/dashboard/.fetch-clips-state.json"
START_TIME="2025-11-10T00:00:00Z"

# Accounts to scan
# Mode: "mention" = filter for tweets mentioning gainzy; "video" = filter for video tweets
USERNAMES=("Zach_tradess" "EtanBoss" "BartonPumpClips" "CeePumpClips" "Niners" "NickIsRogue" "gainzy222")
declare -A USER_IDS
USER_IDS[Zach_tradess]="1937584834165006336"
USER_IDS[EtanBoss]="1347636540210622468"
USER_IDS[BartonPumpClips]="1957927057213530112"
USER_IDS[CeePumpClips]="2000998546909356033"
USER_IDS[Niners]="14983325"
USER_IDS[NickIsRogue]="1966892528453775363"
USER_IDS[gainzy222]="4107711"

declare -A USER_MODE
USER_MODE[Zach_tradess]="mention"
USER_MODE[EtanBoss]="mention"
USER_MODE[BartonPumpClips]="mention"
USER_MODE[CeePumpClips]="mention"
USER_MODE[Niners]="mention"
USER_MODE[NickIsRogue]="mention"
USER_MODE[gainzy222]="video"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# ---- State management (resume support) ----

init_state() {
  if [ ! -f "$STATE_FILE" ]; then
    echo '{}' > "$STATE_FILE"
    log "Created fresh state file"
  fi
}

get_state() {
  local username="$1" field="$2"
  jq -r ".\"${username}\".\"${field}\" // empty" "$STATE_FILE"
}

set_state() {
  local username="$1" field="$2" value="$3"
  local tmp=$(mktemp)
  jq ".\"${username}\".\"${field}\" = \"${value}\"" "$STATE_FILE" > "$tmp" && mv "$tmp" "$STATE_FILE"
}

# ---- Add clip directly to partners.json ----

add_clip_to_json() {
  local tweet_id="$1" username="$2" tweet_url="$3"
  local tmp=$(mktemp)

  # Check for duplicate
  local exists=$(jq --arg tid "$tweet_id" --arg pid "$PARTNER_ID" \
    '.partners[] | select(.id == $pid) | .clips[] | select(.tweetId == $tid) | .tweetId' \
    "$PARTNERS_JSON" 2>/dev/null)

  if [ -n "$exists" ]; then
    return 1  # duplicate
  fi

  local clip_id="clip-$(date +%s%N | cut -c1-13)-$(head /dev/urandom | tr -dc a-z0-9 | head -c4)"
  local now=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)

  jq --arg pid "$PARTNER_ID" \
     --arg cid "$clip_id" \
     --arg url "$tweet_url" \
     --arg tid "$tweet_id" \
     --arg user "$username" \
     --arg note "auto-import: @${username} (${USER_MODE[$username]:-mention})" \
     --arg now "$now" \
    '(.partners[] | select(.id == $pid) | .clips) += [{
      id: $cid,
      tweetUrl: $url,
      tweetId: $tid,
      postedBy: $user,
      note: $note,
      addedAt: $now,
      impressions: 0,
      likes: 0,
      retweets: 0,
      replies: 0,
      quotes: 0,
      bookmarks: 0,
      authorFollowerCount: 0,
      tweetCreatedAt: "",
      lastFetchedAt: "",
      fetchHistory: []
    }]' "$PARTNERS_JSON" > "$tmp" && mv "$tmp" "$PARTNERS_JSON"

  return 0
}

# ---- Rate-limit-aware API call ----

twitter_get() {
  local url="$1"
  local max_retries=50
  local attempt=0

  while [ $attempt -lt $max_retries ]; do
    local tmp_body=$(mktemp)
    local tmp_headers=$(mktemp)
    local http_code

    http_code=$(curl -s -o "$tmp_body" -D "$tmp_headers" -w "%{http_code}" "$url" -H "Authorization: Bearer ${BEARER}")

    if [ "$http_code" = "200" ]; then
      cat "$tmp_body"
      rm -f "$tmp_body" "$tmp_headers"
      return 0
    fi

    if [ "$http_code" = "429" ]; then
      local reset_ts
      reset_ts=$(grep -i "x-rate-limit-reset" "$tmp_headers" | tr -d '\r' | awk '{print $2}') || true
      local now_ts=$(date +%s)
      local wait_secs=900

      if [ -n "$reset_ts" ]; then
        wait_secs=$(( reset_ts - now_ts + 5 ))
        if [ $wait_secs -lt 10 ]; then wait_secs=10; fi
        if [ $wait_secs -gt 960 ]; then wait_secs=960; fi
      fi

      log "Rate limited. Sleeping ${wait_secs}s until reset..."
      rm -f "$tmp_body" "$tmp_headers"
      sleep "$wait_secs"
      attempt=$((attempt + 1))
      continue
    fi

    # Other error
    log "API error (HTTP ${http_code}): $(cat "$tmp_body" 2>/dev/null | head -c 200)"
    rm -f "$tmp_body" "$tmp_headers"
    return 1
  done

  log "Exceeded max retries"
  return 1
}

# ---- Fetch timeline for one account ----

fetch_account() {
  local username="$1"
  local user_id="${USER_IDS[$username]}"

  local status=$(get_state "$username" "status")
  if [ "$status" = "done" ]; then
    log "@${username}: Already completed, skipping"
    return
  fi

  log "@${username}: Starting timeline fetch (user_id=${user_id})"

  local next_token=$(get_state "$username" "next_token")
  local found=$(get_state "$username" "found")
  local added=$(get_state "$username" "added")
  local page=$(get_state "$username" "page")
  found=${found:-0}
  added=${added:-0}
  page=${page:-0}

  local mode="${USER_MODE[$username]:-mention}"
  log "@${username}: Mode = ${mode}"

  while true; do
    page=$((page + 1))
    local url="https://api.twitter.com/2/users/${user_id}/tweets?max_results=100&start_time=${START_TIME}&tweet.fields=created_at,author_id,text,attachments&expansions=author_id,attachments.media_keys&user.fields=username&media.fields=type"

    if [ -n "$next_token" ]; then
      url="${url}&pagination_token=${next_token}"
    fi

    local response
    response=$(twitter_get "$url") || {
      log "@${username}: API call failed on page ${page}, will resume later"
      set_state "$username" "page" "$page"
      return 1
    }

    local tweet_count
    tweet_count=$(echo "$response" | jq '.data // [] | length')

    if [ "$tweet_count" = "0" ] || [ -z "$tweet_count" ]; then
      log "@${username}: No more tweets (page ${page})"
      break
    fi

    # Filter tweets based on mode
    local matching
    if [ "$mode" = "video" ]; then
      # For video mode: find tweets that have media_keys pointing to video media
      matching=$(echo "$response" | jq -r '
        (.includes.media // []) as $media |
        [($media[] | select(.type == "video") | .media_key)] as $video_keys |
        .data[] |
        select(.attachments.media_keys != null) |
        select([.attachments.media_keys[] | select(. as $k | $video_keys | index($k))] | length > 0) |
        .id
      ' 2>/dev/null || true)
    else
      # For mention mode: filter for tweets mentioning gainzy
      matching=$(echo "$response" | jq -r '.data[] | select(.text | test("gainzy"; "i")) | .id' 2>/dev/null || true)
    fi

    local page_matches=0
    if [ -n "$matching" ]; then
      while IFS= read -r tweet_id; do
        [ -z "$tweet_id" ] && continue
        found=$((found + 1))
        page_matches=$((page_matches + 1))

        local tweet_url="https://x.com/${username}/status/${tweet_id}"
        add_clip_to_json "$tweet_id" "$username" "$tweet_url" && added=$((added + 1)) || true
      done <<< "$matching"
    fi

    log "@${username}: Page ${page} — ${tweet_count} tweets, ${page_matches} gainzy mentions (running total: ${found} found, ${added} added)"

    # Save progress
    set_state "$username" "found" "$found"
    set_state "$username" "added" "$added"
    set_state "$username" "page" "$page"

    # Next page?
    next_token=$(echo "$response" | jq -r '.meta.next_token // empty')
    set_state "$username" "next_token" "$next_token"

    if [ -z "$next_token" ]; then
      break
    fi
  done

  set_state "$username" "status" "done"
  set_state "$username" "next_token" ""
  log "@${username}: COMPLETE — ${found} gainzy mentions found, ${added} clips added"
}

# ---- Main ----

log "=========================================="
log "Gainzy Clip Fetcher — starting"
log "Period: ${START_TIME} to now"
log "Accounts: ${USERNAMES[*]}"
log "=========================================="

init_state

for username in "${USERNAMES[@]}"; do
  fetch_account "$username"
done

# Summary
log ""
log "=========================================="
log "ALL ACCOUNTS PROCESSED"
log "=========================================="

TOTAL_CLIPS=$(jq --arg pid "$PARTNER_ID" '.partners[] | select(.id == $pid) | .clips | length' "$PARTNERS_JSON")
log "Total clips in partners.json: ${TOTAL_CLIPS}"

log ""
log "Per-account results:"
for username in "${USERNAMES[@]}"; do
  f=$(get_state "$username" "found")
  a=$(get_state "$username" "added")
  s=$(get_state "$username" "status")
  log "  @${username}: ${f:-0} found, ${a:-0} added (${s:-pending})"
done

log ""
log "Next step: refresh metrics by running:"
log "  curl -s http://localhost:3001/api/partners/refresh"
log ""
log "Done!"
