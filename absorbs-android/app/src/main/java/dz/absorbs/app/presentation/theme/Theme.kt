package dz.absorbs.app.presentation.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dz.absorbs.app.R
import dz.absorbs.app.presentation.i18n.Lang

/**
 * Dz connect — "Aurora Light · High Contrast" palette.
 * Pearl mesh background, deep ink text (WCAG-friendly), saturated aurora gradients
 * (indigo → violet → fuchsia) with emerald / amber / sky / rose accents.
 */
object Dz {
    // Brand aurora
    val Indigo = Color(0xFF4F46E5)
    val IndigoDeep = Color(0xFF3730A3)
    val Violet = Color(0xFF7C3AED)
    val Fuchsia = Color(0xFFC026D3)
    val Sky = Color(0xFF0284C7)
    val Emerald = Color(0xFF059669)
    val EmeraldDeep = Color(0xFF047857)
    val Teal = Color(0xFF0D9488)
    val Amber = Color(0xFFD97706)
    val Rose = Color(0xFFE11D48)
    val Danger = Color(0xFFDC2626)

    // Surfaces & text (light)
    val Ink = Color(0xFF141A30)          // near-navy ink — 15+ contrast on pearl
    val InkSoft = Color(0xFF45507A)      // secondary text — 7+ contrast
    val Pearl = Color(0xFFFAF9FF)        // app background
    val PearlDeep = Color(0xFFF0EEFA)    // mesh shadow tone
    val CardLine = Color(0x1F4F46E5)     // hairline borders (indigo, alpha)

    // Dark twins (kept for the opt-in dark mode)
    val DarkBg = Color(0xFF0B1020)
    val DarkSurface = Color(0xFF141A33)
    val DarkSurface2 = Color(0xFF1B2340)
    val DarkInk = Color(0xFFF2F4FF)
    val DarkInkSoft = Color(0xFFA9B2DE)

    fun appBrush(dark: Boolean): Brush = if (dark) {
        Brush.linearGradient(listOf(Color(0xFF1A1240), Color(0xFF0B1020), Color(0xFF170F2E)))
    } else {
        Brush.linearGradient(listOf(Color(0xFFFFFFFF), Color(0xFFF4F2FF), Color(0xFFFDF0F7)))
    }

    /** Signature aurora gradient — buttons, FAB, key actions. */
    fun primaryBrush(): Brush = Brush.linearGradient(listOf(Indigo, Violet, Fuchsia))

    /** Secondary aurora (sky → indigo) — AI surfaces, chat accents. */
    fun aiBrush(): Brush = Brush.linearGradient(listOf(Color(0xFF0EA5E9), Indigo, Violet))

    @Deprecated("Renamed to Amber")
    val Gold = Amber

    /** Story / avatar ring — full spectrum sweep. */
    fun ringBrush(): Brush = Brush.sweepGradient(listOf(Indigo, Violet, Fuchsia, Amber, Emerald, Sky, Indigo))
}

/** IBM Plex Sans Arabic — signature UI face for Arabic + Latin (matches the web app). */
val PlexArabicFamily = FontFamily(
    Font(R.font.plex_arabic_regular, FontWeight.Normal),
    Font(R.font.plex_arabic_medium, FontWeight.Medium),
    Font(R.font.plex_arabic_semibold, FontWeight.SemiBold),
    Font(R.font.plex_arabic_bold, FontWeight.Bold),
)

/** Poppins — Latin display (wordmark, numerals). */
val PoppinsFamily = FontFamily(
    Font(R.font.poppins_regular, FontWeight.Normal),
    Font(R.font.poppins_medium, FontWeight.Medium),
    Font(R.font.poppins_semibold, FontWeight.SemiBold),
    Font(R.font.poppins_bold, FontWeight.Bold),
)

/** Tajawal Black — oversized display glyphs (splash, big numbers). */
val TajawalBlack = FontFamily(Font(R.font.tajawal_black, FontWeight.Black))

@Suppress("UNUSED_VARIABLE")
private val LegacyCairoKept = R.font.cairo

private fun dzTypography(lang: Lang): Typography {
    val f = if (lang == Lang.AR) PlexArabicFamily else PoppinsFamily
    val display = if (lang == Lang.AR) PlexArabicFamily else PoppinsFamily
    return Typography(
        headlineLarge = TextStyle(fontFamily = display, fontWeight = FontWeight.Bold, fontSize = 30.sp, lineHeight = 38.sp),
        headlineMedium = TextStyle(fontFamily = display, fontWeight = FontWeight.Bold, fontSize = 25.sp, lineHeight = 32.sp),
        titleLarge = TextStyle(fontFamily = f, fontWeight = FontWeight.Bold, fontSize = 20.sp, lineHeight = 27.sp),
        titleMedium = TextStyle(fontFamily = f, fontWeight = FontWeight.SemiBold, fontSize = 16.5.sp, lineHeight = 22.sp),
        bodyLarge = TextStyle(fontFamily = f, fontWeight = FontWeight.Normal, fontSize = 15.sp, lineHeight = 23.sp),
        bodyMedium = TextStyle(fontFamily = f, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 21.sp),
        bodySmall = TextStyle(fontFamily = f, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 17.sp),
        labelLarge = TextStyle(fontFamily = f, fontWeight = FontWeight.SemiBold, fontSize = 14.sp),
        labelSmall = TextStyle(fontFamily = f, fontWeight = FontWeight.Medium, fontSize = 11.sp),
    )
}

@Composable
fun DzTheme(dark: Boolean = isSystemInDarkTheme(), lang: Lang = Lang.AR, content: @Composable () -> Unit) {
    val scheme = if (dark) {
        darkColorScheme(
            primary = Color(0xFF9D8CFF), onPrimary = Color(0xFF1B1240),
            primaryContainer = Color(0xFF2E2258), onPrimaryContainer = Color(0xFFE9E4FF),
            secondary = Color(0xFF38BDF8), onSecondary = Color(0xFF062A3F),
            tertiary = Color(0xFFE879F9), onTertiary = Color(0xFF3B0530),
            background = Dz.DarkBg, surface = Dz.DarkSurface,
            surfaceVariant = Dz.DarkSurface2,
            onBackground = Dz.DarkInk, onSurface = Dz.DarkInk,
            onSurfaceVariant = Dz.DarkInkSoft, error = Color(0xFFFCA5A5),
            outline = Color(0xFF33406B),
        )
    } else {
        lightColorScheme(
            primary = Dz.Indigo, onPrimary = Color.White,
            primaryContainer = Color(0xFFE4E1FF), onPrimaryContainer = Dz.IndigoDeep,
            secondary = Dz.Violet, onSecondary = Color.White,
            secondaryContainer = Color(0xFFF1E5FF), onSecondaryContainer = Color(0xFF4C1D95),
            tertiary = Dz.Fuchsia, onTertiary = Color.White,
            tertiaryContainer = Color(0xFFFCE0F7), onTertiaryContainer = Color(0xFF701A75),
            background = Dz.Pearl, surface = Color.White,
            surfaceVariant = Color(0xFFEFEDFA),
            onBackground = Dz.Ink, onSurface = Dz.Ink,
            onSurfaceVariant = Dz.InkSoft, error = Dz.Danger,
            outline = Color(0xFFC9C6E8),
        )
    }
    MaterialTheme(
        colorScheme = scheme,
        typography = dzTypography(lang),
        shapes = Shapes(
            extraSmall = androidx.compose.foundation.shape.RoundedCornerShape(10.dp),
            small = androidx.compose.foundation.shape.RoundedCornerShape(14.dp),
            medium = androidx.compose.foundation.shape.RoundedCornerShape(18.dp),
            large = androidx.compose.foundation.shape.RoundedCornerShape(24.dp),
            extraLarge = androidx.compose.foundation.shape.RoundedCornerShape(30.dp),
        ),
        content = content,
    )
}
