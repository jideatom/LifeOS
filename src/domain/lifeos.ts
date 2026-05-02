export type Readiness = 'Green' | 'Yellow' | 'Red'

export type DayType = 'Fasting/Healthy' | 'Relax' | 'Recovery' | 'Travel/Busy'

export type FastingStatus = 'Planned' | 'Fasting' | 'Eating Window' | 'Completed' | 'Skipped'

export type WorkoutPlan =
  | 'StrongLifts A'
  | 'StrongLifts B'
  | 'Accessory'
  | 'Conditioning'
  | 'Mobility/Recovery'
  | 'Rest'

export type NutritionMode =
  | 'Yoruba low-carb'
  | 'Yoruba relax'
  | 'General low-carb'
  | 'Seasonal relax'

export type DailyHealthLog = {
  id: string
  day: string
  date: string
  dayType: DayType
  fastingStatus: FastingStatus
  fastProtocol: '16:8' | '18:6' | '20:4' | 'No strict fast'
  eatingWindow: string
  nutritionMode: NutritionMode
  workoutPlan: WorkoutPlan
  readiness: Readiness
  sleepHours?: number
  sleepScore?: number
  restingHeartRate?: number
  steps?: number
  activeZoneMinutes?: number
  caloriesBurned?: number
  weightKg?: number
}

export type HealthConnectDailyImport = {
  date: string
  source: 'Health Connect'
  syncStatus: 'Not synced' | 'Imported' | 'Reviewed' | 'Needs attention' | 'Error'
  sleepHours?: number
  sleepScore?: number
  restingHeartRate?: number
  steps?: number
  activeZoneMinutes?: number
  caloriesBurned?: number
  distanceKm?: number
  workoutMinutes?: number
  weightKg?: number
}

export function computeReadiness(input: Pick<DailyHealthLog, 'sleepHours' | 'restingHeartRate'>) {
  if (input.sleepHours !== undefined && input.sleepHours < 5) return 'Red' satisfies Readiness
  if (input.sleepHours !== undefined && input.sleepHours < 6.5) return 'Yellow' satisfies Readiness
  if (input.restingHeartRate !== undefined && input.restingHeartRate > 80) {
    return 'Yellow' satisfies Readiness
  }
  return 'Green' satisfies Readiness
}
