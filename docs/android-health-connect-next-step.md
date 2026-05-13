# Android Health Connect Next Step

This repo now has:

- a secure ingest endpoint at `/api/health/ingest`
- a Capacitor config for a future Android shell
- a small client helper at `src/mobile/phoneHealthSync.ts`
- a native `HealthConnectBridge` plugin scaffold inside `android/app`

## What still needs to be finished

The Android bridge now attempts to:

1. request Health Connect permissions
2. read daily steps, sleep, resting heart rate, weight, calories, distance, and workout totals
3. upload that snapshot to `/api/health/ingest`

The remaining work is validating the native build on a machine with a modern Android toolchain and then testing on-device.

## Recommended approach

Use a Capacitor Android shell for LifeOS and add a native plugin or bridge that reads Health Connect.

## Suggested daily sync payload

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

## Proposed implementation order

1. set Android build secrets in `android/local.properties` or environment variables:
   - `LIFEOS_HEALTH_API_BASE=https://life-os-lac-pi.vercel.app`
   - `LIFEOS_PHONE_SYNC_KEY=your_long_random_phone_sync_key`
2. build the Android shell with Java 11+ (preferably Java 17)
3. install on the phone
4. grant Health Connect permissions from the app
5. tap `Sync from this phone`
6. confirm the Supabase row contains real values instead of `NULL`

## Toolchain note

The first native compile attempt on this machine stopped before plugin compilation because the local Gradle runtime is still using Java 8. The Android shell now needs Java 11+ and is safest on Java 17.

## Why this is the right model

- Health Connect lives on Android
- Fitbit app lives on Android
- LifeOS is mobile first
- desktop is best treated as the shared dashboard, not the collector
