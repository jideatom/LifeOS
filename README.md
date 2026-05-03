# LifeOS App

LifeOS is a health operating system for fasting, Abuja/Yoruba nutrition, StrongLifts-style training, Fitbit recovery signals and Notion-backed daily planning.

## Current Foundation

- React + TypeScript + Vite dashboard
- Fasting-first daily command center
- Yoruba low-carb nutrition model
- Home gym StrongLifts plan
- Fitbit app -> Health Connect -> LifeOS sync design
- Editable recipes with local save and optional Notion auto-sync bridge
- Typed domain contracts in `src/domain/lifeos.ts`
- Architecture notes in `docs/`

## Scripts

```bash
npm install
npm run dev
npm run build
npm run lint
```

## Near-Term Roadmap

1. Wire dashboard data to local typed fixtures.
2. Add Notion connector for Daily Health Log, Fasting Sessions, Workout Log and Fitbit Sync Inbox.
3. Add authentication/config handling for Notion API credentials.
4. Build Android Health Connect bridge for Fitbit import.
5. Add readiness engine based on sleep, resting HR, soreness and fasting state.

## Data Backbone

Notion remains the editable source of truth during the first phase. The app becomes the daily interface.

Primary Notion modules:

- Daily Health Log
- Fasting Sessions
- May 2026 Meal Plan
- Food Database
- Workout Log
- Exercise Library
- Fitbit Sync Inbox
- Weekly Review

## Notion Recipe Auto-Sync

The frontend never stores a Notion token. Recipe edits sync through `api/recipes/upsert.js`, which is designed for a private serverless host such as Vercel.

Create a Notion database with these properties:

- `Name` - title
- `Type` - select
- `Carb Signal` - select
- `Base` - rich text
- `Protein` - rich text
- `Vehicle / Note` - rich text
- `Source` - select
- `LifeOS ID` - rich text
- `Updated At` - date

Serverless environment variables:

- `NOTION_TOKEN` - internal Notion integration token
- `NOTION_RECIPES_DATABASE_ID` - target recipes database id
- `LIFEOS_ALLOWED_ORIGIN` - optional, for example `https://jideatom.github.io`

Frontend environment variable:

- `VITE_LIFEOS_SYNC_API_URL` - full API URL, for example `https://your-lifeos-api.vercel.app/api/recipes/upsert`
