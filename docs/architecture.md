# LifeOS App Architecture

LifeOS starts as a web dashboard with Notion as the editable data backbone. The Android Health Connect bridge will become the native sync layer for Fitbit data.

## Modules

- Daily Health Log: one row per day, tying together fasting, nutrition, training, recovery and Fitbit metrics.
- Fasting: Zero-style fasting status, protocol, start/end, eating window and subjective logs.
- Nutrition: Abuja/Yoruba food database, no-go foods, low-carb supper rules and May 2026 meal plan.
- Fitness: StrongLifts/Strong-style training, exercise library and workout log.
- Health Sync: Health Connect imports from Fitbit Android app.
- Weekly Review: decisions for next week based on adherence, recovery and progression.

## Data Flow

```text
Fitbit watch
  -> Fitbit Android app
  -> Health Connect
  -> Android bridge
  -> LifeOS Fitbit Sync Inbox
  -> LifeOS Daily Health Log
```

```text
LifeOS web app
  -> Notion API
  -> Notion databases
```

## Build Slices

1. Static dashboard shell.
2. Typed domain models for daily health, sync import, fasting and workout records.
3. Notion API connector for reading/writing the existing databases.
4. Android Health Connect bridge for local phone sync.
5. Readiness engine that converts Fitbit recovery signals into training guidance.
6. Optional offline/PWA cache for dashboard use.

## Notion Databases

- LifeOS Daily Health Log
- LifeOS Fitbit Sync Inbox
- LifeOS Workout Log
- LifeOS Exercise Library
- LifeOS Weekly Review
- LifeOS May 2026 Meal Plan
- LifeOS Fasting Tracker
- LifeOS Food Database

## Product Principle

LifeOS should not replace Notion at first. It should make the daily workflow faster while Notion remains the editable source of truth.
