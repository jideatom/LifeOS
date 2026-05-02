# LifeOS App

LifeOS is a health operating system for fasting, Abuja/Yoruba nutrition, StrongLifts-style training, Fitbit recovery signals and Notion-backed daily planning.

## Current Foundation

- React + TypeScript + Vite dashboard
- Fasting-first daily command center
- Yoruba low-carb nutrition model
- Home gym StrongLifts plan
- Fitbit app -> Health Connect -> LifeOS sync design
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
