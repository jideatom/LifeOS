package io.misimisys.lifeos

import androidx.activity.result.ActivityResultLauncher
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import kotlin.math.roundToInt

@CapacitorPlugin(name = "HealthConnectBridge")
class HealthConnectBridgePlugin : Plugin() {
    private val providerPackageName = "com.google.android.apps.healthdata"
    private val pluginScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val requiredPermissions = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(WeightRecord::class),
        HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(RestingHeartRateRecord::class),
    )

    private var permissionsLauncher: ActivityResultLauncher<Set<String>>? = null
    private var pendingPermissionsCall: PluginCall? = null

    override fun load() {
        permissionsLauncher = bridge.activity.registerForActivityResult(
            PermissionController.createRequestPermissionResultContract()
        ) { granted ->
            val call = pendingPermissionsCall ?: return@registerForActivityResult
            pendingPermissionsCall = null
            call.resolve(
                JSObject().apply {
                    put("available", sdkStatus() == HealthConnectClient.SDK_AVAILABLE)
                    put("permissionsGranted", granted.containsAll(requiredPermissions))
                    put("grantedPermissions", granted.toJsArray())
                }
            )
        }
    }

    override fun handleOnDestroy() {
        pluginScope.cancel()
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        pluginScope.launch {
            try {
                val status = sdkStatus()
                val granted = grantedPermissions()
                call.resolve(
                    JSObject().apply {
                        put("available", status == HealthConnectClient.SDK_AVAILABLE)
                        put("providerStatus", sdkStatusLabel(status))
                        put("permissionsGranted", granted.containsAll(requiredPermissions))
                        put("grantedPermissions", granted.toJsArray())
                    }
                )
            } catch (error: Throwable) {
                call.reject(error.message ?: "Could not load Health Connect status")
            }
        }
    }

    @PluginMethod
    fun grantPermissions(call: PluginCall) {
        val status = sdkStatus()
        if (status != HealthConnectClient.SDK_AVAILABLE) {
            call.reject(
                if (status == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
                    "Health Connect needs an update on this phone."
                } else {
                    "Health Connect is not available on this phone."
                }
            )
            return
        }

        pendingPermissionsCall = call
        permissionsLauncher?.launch(requiredPermissions)
            ?: call.reject("Health Connect permission launcher is not ready")
    }

    @PluginMethod
    fun syncToday(call: PluginCall) {
        pluginScope.launch {
            try {
                val status = sdkStatus()
                if (status != HealthConnectClient.SDK_AVAILABLE) {
                    throw IllegalStateException(
                        if (status == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
                            "Health Connect must be updated before phone sync can run."
                        } else {
                            "Health Connect is not available on this phone."
                        }
                    )
                }

                val granted = grantedPermissions()
                if (!granted.containsAll(requiredPermissions)) {
                    throw IllegalStateException("Health Connect permissions are not granted yet.")
                }

                val snapshot = readTodaySnapshot()
                val syncedAt = Instant.now().toString()
                uploadSnapshot(snapshot, syncedAt)

                call.resolve(
                    JSObject().apply {
                        put("ok", true)
                        put("syncedAt", syncedAt)
                        put("metrics", snapshot.toJsObject(syncedAt))
                    }
                )
            } catch (error: Throwable) {
                call.reject(error.message ?: "Phone health sync failed")
            }
        }
    }

    private fun sdkStatus(): Int {
        return HealthConnectClient.getSdkStatus(context, providerPackageName)
    }

    private suspend fun grantedPermissions(): Set<String> {
        return try {
            healthClient().permissionController.getGrantedPermissions()
        } catch (_: Throwable) {
            emptySet()
        }
    }

    private fun healthClient(): HealthConnectClient {
        return HealthConnectClient.getOrCreate(context, providerPackageName)
    }

    private suspend fun readTodaySnapshot(): NativePhoneHealthSnapshot {
        val client = healthClient()
        val zone = ZoneId.systemDefault()
        val now = Instant.now()
        val startOfDay = ZonedDateTime.now(zone).toLocalDate().atStartOfDay(zone).toInstant()
        val lastMonth = now.minus(Duration.ofDays(30))
        val lastWeek = now.minus(Duration.ofDays(7))

        val aggregate = client.aggregate(
            AggregateRequest(
                metrics = setOf(
                    StepsRecord.COUNT_TOTAL,
                    DistanceRecord.DISTANCE_TOTAL,
                    TotalCaloriesBurnedRecord.ENERGY_TOTAL,
                ),
                timeRangeFilter = TimeRangeFilter.between(startOfDay, now),
            )
        )

        val sleepSessions = client.readRecords(
            ReadRecordsRequest(
                recordType = SleepSessionRecord::class,
                timeRangeFilter = TimeRangeFilter.between(startOfDay, now),
            )
        ).records

        val exerciseSessions = client.readRecords(
            ReadRecordsRequest(
                recordType = ExerciseSessionRecord::class,
                timeRangeFilter = TimeRangeFilter.between(startOfDay, now),
            )
        ).records

        val weightRecords = client.readRecords(
            ReadRecordsRequest(
                recordType = WeightRecord::class,
                timeRangeFilter = TimeRangeFilter.between(lastMonth, now),
                ascendingOrder = false,
                pageSize = 1,
            )
        ).records

        val restingHeartRateRecords = client.readRecords(
            ReadRecordsRequest(
                recordType = RestingHeartRateRecord::class,
                timeRangeFilter = TimeRangeFilter.between(lastWeek, now),
                ascendingOrder = false,
                pageSize = 1,
            )
        ).records

        val totalSleepHours = if (sleepSessions.isEmpty()) {
            null
        } else {
            sleepSessions.fold(Duration.ZERO) { total, session ->
                total.plus(Duration.between(session.startTime, session.endTime))
            }.toMinutes() / 60.0
        }

        val totalWorkoutMinutes = exerciseSessions
            .map { Duration.between(it.startTime, it.endTime).toMinutes().toInt() }
            .sum()
            .takeIf { it > 0 }

        return NativePhoneHealthSnapshot(
            date = ZonedDateTime.now(zone).toLocalDate().toString(),
            source = "Phone Health Sync",
            sleepHours = totalSleepHours,
            sleepScore = null,
            restingHeartRate = restingHeartRateRecords.firstOrNull()?.beatsPerMinute?.toDouble()?.roundToInt(),
            steps = aggregate[StepsRecord.COUNT_TOTAL]?.toInt(),
            activeZoneMinutes = null,
            caloriesBurned = aggregate[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.inKilocalories?.roundToInt(),
            distanceKm = aggregate[DistanceRecord.DISTANCE_TOTAL]?.inKilometers,
            workoutMinutes = totalWorkoutMinutes,
            weightKg = weightRecords.firstOrNull()?.weight?.inKilograms,
        )
    }

    private fun uploadSnapshot(snapshot: NativePhoneHealthSnapshot, syncedAt: String) {
        val syncKey = BuildConfig.LIFEOS_PHONE_SYNC_KEY.trim()
        if (syncKey.isBlank()) {
            throw IllegalStateException("LIFEOS_PHONE_SYNC_KEY is missing from the Android build configuration.")
        }

        val endpoint = "${BuildConfig.LIFEOS_HEALTH_API_BASE.trim().trimEnd('/')}/api/health/ingest"
        val payload = JSONObject().apply {
            put("date", snapshot.date)
            put("source", snapshot.source)
            put("sleep_hours", snapshot.sleepHours)
            put("sleep_score", snapshot.sleepScore)
            put("resting_heart_rate", snapshot.restingHeartRate)
            put("steps", snapshot.steps)
            put("active_zone_minutes", snapshot.activeZoneMinutes)
            put("calories_burned", snapshot.caloriesBurned)
            put("distance_km", snapshot.distanceKm)
            put("workout_minutes", snapshot.workoutMinutes)
            put("weight_kg", snapshot.weightKg)
            put("synced_at", syncedAt)
        }

        val connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 20_000
            readTimeout = 20_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("x-lifeos-phone-sync-key", syncKey)
        }

        try {
            OutputStreamWriter(connection.outputStream).use { writer ->
                writer.write(payload.toString())
            }

            val code = connection.responseCode
            if (code !in 200..299) {
                val message = connection.errorStream?.bufferedReader()?.use { it.readText() }?.takeIf { it.isNotBlank() }
                throw IllegalStateException(message ?: "Phone health ingest failed with HTTP $code")
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun sdkStatusLabel(status: Int): String {
        return when (status) {
            HealthConnectClient.SDK_AVAILABLE -> "available"
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update_required"
            else -> "unavailable"
        }
    }
}

private data class NativePhoneHealthSnapshot(
    val date: String,
    val source: String,
    val sleepHours: Double?,
    val sleepScore: Int?,
    val restingHeartRate: Int?,
    val steps: Int?,
    val activeZoneMinutes: Int?,
    val caloriesBurned: Int?,
    val distanceKm: Double?,
    val workoutMinutes: Int?,
    val weightKg: Double?,
) {
    fun toJsObject(syncedAt: String): JSObject {
        return JSObject().apply {
            put("date", date)
            put("source", source)
            put("sync_status", "Imported")
            put("sleep_hours", sleepHours)
            put("sleep_score", sleepScore)
            put("resting_heart_rate", restingHeartRate)
            put("steps", steps)
            put("active_zone_minutes", activeZoneMinutes)
            put("calories_burned", caloriesBurned)
            put("distance_km", distanceKm)
            put("workout_minutes", workoutMinutes)
            put("weight_kg", weightKg)
            put("synced_at", syncedAt)
        }
    }
}

private fun Set<String>.toJsArray(): JSArray {
    val array = JSArray()
    forEach { array.put(it) }
    return array
}
