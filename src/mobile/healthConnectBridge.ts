import { registerPlugin } from '@capacitor/core'
import type { PhoneHealthSnapshot } from './phoneHealthSync'

export type HealthConnectBridgeStatus = {
  available: boolean
  providerStatus: 'available' | 'update_required' | 'unavailable'
  permissionsGranted: boolean
  grantedPermissions: string[]
}

export type NativePhoneSyncResult = {
  ok: boolean
  syncedAt: string
  metrics: PhoneHealthSnapshot & {
    sync_status: string
    synced_at: string
  }
}

type HealthConnectBridgePlugin = {
  getStatus(): Promise<HealthConnectBridgeStatus>
  grantPermissions(): Promise<HealthConnectBridgeStatus>
  syncToday(): Promise<NativePhoneSyncResult>
}

export const HealthConnectBridge = registerPlugin<HealthConnectBridgePlugin>('HealthConnectBridge')

export function isNativePhoneShell() {
  return Boolean((window as Window & { Capacitor?: unknown }).Capacitor)
}
