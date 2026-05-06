package dev.nihildigit.tokmato.net

import dev.nihildigit.tokmato.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/**
 * Thin OkHttp client for the two relay-only RPCs:
 *   - POST /api/rpc/redeem-device-pair-code
 *   - POST /api/rpc/save-fcm-token  (used for token rotation after bind)
 *
 * No auth header — bind happens via pair-code, subsequent token rotations
 * authenticate via the bound userId we hold in prefs (server side resolves
 * the userId from the token Hash; if the bound userId no longer holds the
 * token, the response is REBIND_REQUIRED).
 */
object RelayApi {
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    private val json = Json { ignoreUnknownKeys = true }
    private val JSON = "application/json".toMediaType()

    @Serializable
    private data class RedeemRequest(val code: String, val fcmToken: String)

    @Serializable
    private data class RedeemResponse(val ok: Boolean, val sub: String? = null, val error: String? = null)

    @Serializable
    private data class TokenRefreshRequest(val sub: String, val token: String)

    sealed class RedeemResult {
        data class Ok(val userId: String) : RedeemResult()
        data object InvalidCode : RedeemResult()
        data object Network : RedeemResult()
    }

    suspend fun redeemPairCode(code: String, fcmToken: String): RedeemResult = withContext(Dispatchers.IO) {
        val body = json.encodeToString(RedeemRequest.serializer(), RedeemRequest(code, fcmToken))
            .toRequestBody(JSON)
        val req = Request.Builder()
            .url("${BuildConfig.API_BASE}/api/rpc/redeem-device-pair-code")
            .post(body)
            .build()
        runCatching {
            client.newCall(req).execute().use { resp ->
                val text = resp.body?.string().orEmpty()
                if (!resp.isSuccessful) return@use RedeemResult.InvalidCode
                val parsed = json.decodeFromString(RedeemResponse.serializer(), text)
                if (parsed.ok && parsed.sub != null) RedeemResult.Ok(parsed.sub) else RedeemResult.InvalidCode
            }
        }.getOrElse { RedeemResult.Network }
    }

    sealed class RotateResult {
        data object Ok : RotateResult()
        data object RebindRequired : RotateResult()
        data object Network : RotateResult()
    }

    /**
     * Server treats a write to an unknown userId as a no-op + 410 Gone.
     * We surface that as RebindRequired so the UI can prompt re-pair.
     */
    suspend fun rotateFcmToken(userId: String, fcmToken: String): RotateResult = withContext(Dispatchers.IO) {
        val body = json.encodeToString(TokenRefreshRequest.serializer(), TokenRefreshRequest(userId, fcmToken))
            .toRequestBody(JSON)
        val req = Request.Builder()
            .url("${BuildConfig.API_BASE}/api/rpc/save-fcm-token-relay")
            .post(body)
            .build()
        runCatching {
            client.newCall(req).execute().use { resp ->
                when (resp.code) {
                    200 -> RotateResult.Ok
                    410 -> RotateResult.RebindRequired
                    else -> RotateResult.Network
                }
            }
        }.getOrElse { RotateResult.Network }
    }
}
