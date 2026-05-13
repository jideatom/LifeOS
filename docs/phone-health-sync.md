# LifeOS Phone Health Sync

LifeOS is mobile first, so phone health data should reach Supabase from the phone, not from the desktop browser.

## Target flow

1. Fitbit watch writes into the Fitbit app.
2. Fitbit app writes health signals into the phone-side health source.
3. LifeOS phone sync layer reads those values on the phone.
4. LifeOS posts a daily snapshot to the secure ingest endpoint.
5. Supabase stores the shared row.
6. Desktop and web dashboards reflect the shared row.

## Secure ingest endpoint

`POST /api/health/ingest`

Required header:

```txt
x-lifeos-phone-sync-key: <LIFEOS_PHONE_SYNC_KEY>
```

Recommended Vercel env:

```txt
LIFEOS_PHONE_SYNC_KEY=<long random secret>
```

## Example payload

```json
{
  "date": "2026-05-13",
  "source": "Phone Health Sync",
  "sleep_hours": 7.2,
  "sleep_score": 81,
  "resting_heart_rate": 66,
  "steps": 6305,
  "active_zone_minutes": 21,
  "calories_burned": 2264,
  "distance_km": 4.8,
  "workout_minutes": 42,
  "weight_kg": 101.5
}
```

## What this unlocks

- phone becomes the primary health collector
- desktop becomes the mirror dashboard
- Google OAuth bridge can stay as an optional fallback
- future Android wrapper or Capacitor build only needs to gather the metrics and POST them

## Next implementation layer

The next real build step is an Android-capable LifeOS shell that can:

- read Health Connect directly on the phone
- bundle Fitbit/Health Connect values into a daily snapshot
- post that snapshot to `/api/health/ingest`
