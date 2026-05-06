package dev.nihildigit.tokmato.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.android.gms.tasks.Task
import com.google.firebase.messaging.FirebaseMessaging
import dev.nihildigit.tokmato.R
import dev.nihildigit.tokmato.net.RelayApi
import dev.nihildigit.tokmato.prefs.AppPrefs
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

private const val CODE_LENGTH = 4

@Composable
fun BindScreen(onBound: (userId: String) -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current

    var code by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var errorRes by remember { mutableStateOf<Int?>(null) }
    val focusRequester = remember { FocusRequester() }

    LaunchedEffect(Unit) {
        focusRequester.requestFocus()
    }

    Column(verticalArrangement = Arrangement.spacedBy(20.dp)) {
        Text(
            text = stringResource(R.string.bind_kicker),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = stringResource(R.string.bind_title),
            style = MaterialTheme.typography.displayMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = stringResource(R.string.bind_subtitle),
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        Spacer(Modifier.height(12.dp))

        // The code input is a single hidden BasicTextField; the four
        // visible boxes mirror its current value. This avoids the
        // multi-field focus dance that always feels jittery on Android
        // soft keyboards.
        Box {
            BasicTextField(
                value = code,
                onValueChange = {
                    val digits = it.filter { ch -> ch.isDigit() }.take(CODE_LENGTH)
                    code = digits
                    errorRes = null
                    if (digits.length == CODE_LENGTH) {
                        keyboard?.hide()
                    }
                },
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.NumberPassword,
                    imeAction = ImeAction.Done,
                ),
                modifier = Modifier
                    .focusRequester(focusRequester)
                    .alpha(0f)
                    .size(1.dp),
                textStyle = TextStyle(color = MaterialTheme.colorScheme.onSurface),
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                repeat(CODE_LENGTH) { i ->
                    CodeBox(
                        digit = code.getOrNull(i)?.toString().orEmpty(),
                        active = i == code.length,
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }

        if (errorRes != null) {
            Text(
                text = stringResource(errorRes!!),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        }

        Spacer(Modifier.height(8.dp))

        Button(
            onClick = {
                if (code.length != CODE_LENGTH || busy) return@Button
                busy = true
                errorRes = null
                focusManager.clearFocus()
                scope.launch {
                    val token = runCatching { fetchFcmToken() }.getOrNull()
                    if (token == null) {
                        busy = false
                        errorRes = R.string.bind_error_network
                        return@launch
                    }
                    when (val r = RelayApi.redeemPairCode(code, token)) {
                        is RelayApi.RedeemResult.Ok -> {
                            AppPrefs(ctx).fcmToken = token
                            onBound(r.userId)
                        }

                        is RelayApi.RedeemResult.InvalidCode -> {
                            errorRes = R.string.bind_error_invalid
                            code = ""
                            focusRequester.requestFocus()
                        }

                        is RelayApi.RedeemResult.Network -> {
                            errorRes = R.string.bind_error_network
                        }
                    }
                    busy = false
                }
            },
            enabled = code.length == CODE_LENGTH && !busy,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            contentPadding = PaddingValues(vertical = 16.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
            ),
        ) {
            Text(
                text = stringResource(if (busy) R.string.bind_pending else R.string.bind_cta),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Medium,
            )
        }
    }
}

@Composable
private fun CodeBox(digit: String, active: Boolean, modifier: Modifier = Modifier) {
    val borderColor = if (active) MaterialTheme.colorScheme.primary
    else MaterialTheme.colorScheme.outline
    val borderWidth = if (active) 2.dp else 1.dp

    Box(
        modifier = modifier
            .height(72.dp)
            .background(MaterialTheme.colorScheme.surfaceContainer, RoundedCornerShape(14.dp))
            .border(borderWidth, borderColor, RoundedCornerShape(14.dp))
            .padding(8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = digit,
            style = MaterialTheme.typography.displayMedium,
            color = MaterialTheme.colorScheme.onSurface,
            fontWeight = FontWeight.Normal,
            textAlign = TextAlign.Center,
            fontSize = 36.sp,
        )
    }
}

private suspend fun fetchFcmToken(): String =
    suspendCancellableCoroutine { cont ->
        val task: Task<String> = FirebaseMessaging.getInstance().token
        task.addOnSuccessListener { cont.resume(it) }
        task.addOnFailureListener { cont.resumeWithException(it) }
    }
