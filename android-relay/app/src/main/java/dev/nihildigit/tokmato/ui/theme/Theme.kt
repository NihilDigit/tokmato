package dev.nihildigit.tokmato.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext

// Default to the editorial palette. Dynamic color (Android 12+) is opt-in
// via the dynamicColor flag — disabled by default because Material You's
// system-derived colors fight the brand identity (every device gets a
// different tomato, defeating recognizability).
private val LightColors = lightColorScheme(
    primary = Tomato,
    onPrimary = Paper,
    primaryContainer = Paper2,
    onPrimaryContainer = Ink,
    secondary = Sage,
    onSecondary = Paper,
    secondaryContainer = Paper3,
    onSecondaryContainer = Ink2,
    tertiary = Teal,
    onTertiary = Paper,
    tertiaryContainer = Paper3,
    onTertiaryContainer = Ink2,
    background = Paper,
    onBackground = Ink,
    surface = Paper,
    onSurface = Ink,
    surfaceVariant = Paper2,
    onSurfaceVariant = Ink2,
    surfaceContainer = Paper2,
    surfaceContainerHigh = Paper3,
    outline = Ink3,
    outlineVariant = Paper3,
)

private val DarkColors = darkColorScheme(
    primary = Tomato,
    onPrimary = Paper,
    primaryContainer = Paper2Dark,
    onPrimaryContainer = InkDark,
    secondary = Sage,
    onSecondary = PaperDark,
    secondaryContainer = Paper3Dark,
    onSecondaryContainer = Ink2Dark,
    tertiary = Teal,
    onTertiary = PaperDark,
    tertiaryContainer = Paper3Dark,
    onTertiaryContainer = Ink2Dark,
    background = PaperDark,
    onBackground = InkDark,
    surface = PaperDark,
    onSurface = InkDark,
    surfaceVariant = Paper2Dark,
    onSurfaceVariant = Ink2Dark,
    surfaceContainer = Paper2Dark,
    surfaceContainerHigh = Paper3Dark,
    outline = Ink3Dark,
    outlineVariant = Paper3Dark,
)

@Composable
fun TokmatoRelayTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit,
) {
    val colors = when {
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val ctx = LocalContext.current
            if (darkTheme) dynamicDarkColorScheme(ctx) else dynamicLightColorScheme(ctx)
        }

        darkTheme -> DarkColors
        else -> LightColors
    }

    MaterialTheme(
        colorScheme = colors,
        typography = RelayTypography,
        content = content,
    )
}
