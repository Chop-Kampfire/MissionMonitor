# Mission Control Bot

Discord bot for monitoring mission submissions and exporting votes to Google Sheets.

## Features

- **Submission Detection**: Monitors mission threads for URLs posted by users
- **Automatic Reactions**: Adds 📝 + 1️⃣2️⃣3️⃣4️⃣5️⃣ vote reactions to submissions
- **Judge-Only Voting**: Only users with judge roles can vote; other reactions are removed
- **Vote Tracking**: Persists all votes to disk (survives restarts)
- **Google Sheets Export**: Automatically exports submissions when mission deadlines pass
- **Deadline Checker**: Runs every 5 minutes to check for expired missions

## How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│  Discord Server                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  Mission Channel                                              │  │
│  │  └── Mission Thread (e.g., "Morgan Stanley MDP")              │  │
│  │      ├── User posts URL → Bot adds 📝 + vote reactions        │  │
│  │      └── Judge clicks 1️⃣-5️⃣ → Vote recorded                   │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (deadline passes)
┌─────────────────────────────────────────────────────────────────────┐
│  Google Sheets                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  New tab: "Morgan Stanley MDP"                                │  │
│  │  ├── Submission ID, User, URL, Content                        │  │
│  │  ├── Vote Count, Average Score                                │  │
│  │  └── Individual Judge Scores                                  │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Installation

### Prerequisites

- Node.js 18+
- pm2 (`npm install -g pm2`)
- Discord bot with these intents enabled:
  - Guilds
  - Guild Messages
  - Guild Message Reactions
  - Message Content
- Google Cloud service account with Sheets API enabled

### Setup

```bash
# Clone repository
git clone https://github.com/Chop-Kampfire/MissionMonitor.git
cd MissionMonitor

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Build
npm run build

# Start with pm2
pm2 start dist/index.js --name mission-control
pm2 save
pm2 startup  # Run the command it outputs
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_BOT_TOKEN` | Yes | Bot token from Discord Developer Portal |
| `DISCORD_GUILD_ID` | Yes | Your Discord server ID |
| `DISCORD_MISSION_CHANNEL_ID` | Yes | Channel where mission threads are created |
| `DISCORD_JUDGE_ROLE_IDS` | Yes | Comma-separated role IDs that can vote |
| `GOOGLE_SPREADSHEET_ID` | Yes | Target spreadsheet ID for exports |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Yes | Service account email |
| `GOOGLE_PRIVATE_KEY` | Yes | Service account private key |
| `TELEGRAM_BOT_TOKEN` | No | Optional Telegram bot for status commands |

### Google Sheets Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create/select a project
3. Enable **Google Sheets API**
4. Create a **Service Account** (APIs & Services → Credentials)
5. Generate a JSON key for the service account
6. Share your spreadsheet with the service account email (Editor access)

### Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to Bot → Enable these Privileged Intents:
   - Message Content Intent
4. Copy the bot token
5. Invite bot to server with permissions:
   - Read Messages/View Channels
   - Send Messages
   - Add Reactions
   - Manage Messages (to remove non-judge reactions)

## Project Structure

```
├── src/
│   ├── index.ts          # Entry point, starts all services
│   ├── config.ts         # Environment variable loading
│   ├── discord.ts        # Discord bot (submission detection, voting)
│   ├── storage.ts        # File-based persistence (missions, submissions)
│   ├── sheets.ts         # Google Sheets export
│   ├── deadline-checker.ts # Periodic deadline monitoring
│   └── telegram.ts       # Optional Telegram status bot
├── data/                 # Runtime data (gitignored)
│   ├── missions.json     # Mission metadata and deadlines
│   └── submissions.json  # Submissions and votes
├── dist/                 # Compiled JavaScript (gitignored)
├── .env.example          # Environment template
├── package.json
└── tsconfig.json
```

## Commands

```bash
# View logs
pm2 logs mission-control

# Restart bot
pm2 restart mission-control

# Stop bot
pm2 stop mission-control

# Check status
pm2 status
```

## Workflow

1. **Mission Created**: Admin creates a thread in the mission channel
2. **Submissions**: Users post URLs in the thread
3. **Bot Reacts**: Bot adds 📝 (confirmed) + 1️⃣2️⃣3️⃣4️⃣5️⃣ (vote options)
4. **Judging**: Judges click a number to vote (1-5 scale)
5. **Vote Enforcement**: Non-judge reactions are automatically removed
6. **Deadline**: When deadline passes, bot exports to Google Sheets
7. **Export**: New sheet tab with all submissions, votes, and averages

## Data Storage

All data is persisted to JSON files in `data/`:

- **missions.json**: Mission metadata (title, thread ID, deadline, export status)
- **submissions.json**: All submissions with votes

Data survives bot restarts. Missions are marked as `exported` after Google Sheets export to prevent duplicates.

## License

MIT
