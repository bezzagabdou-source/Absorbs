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

/** Dz connect palette — pearl glass · emerald · teal · sky · gold (never pink/violet). */
object Dz {
    val Emerald = Color(0xFF059669)
    val EmeraldDeep = Color(0xFF047857)
    val Teal = Color(0xFF0D9488)
    val Sky = Color(0xFF0284C7)
    val Gold = Color(0xFFD97706)
    val Ink = Color(0xFF0B1F1A)
    val InkSoft = Color(0xFF3D5750)
    val Pearl = Color(0xFFF4FBF7)
    val Danger = Color(0xFFDC2626)

    val DarkBg = Color(0xFF06231F)
    val DarkSurface = Color(0xFF0C2B26)
    val DarkInk = Color(0xFFE9FBF2)
    val DarkInkSoft = Color(0xFF9FC4B6)

    fun appBrush(dark: Boolean): Brush = if (dark) {
        Brush.linearGradient(listOf(Color(0xFF07332B), Color(0xFF06231F), Color(0xFF04150F)))
    } else {
        Brush.linearGradient(listOf(Color(0xFFFFFFFF), Color(0xFFECFDF5), Color(0xFFE0F2FE)))
    }

    fun primaryBrush(): Brush = Brush.linearGradient(listOf(Emerald, Teal))
    fun ringBrush(): Brush = Brush.sweepGradient(listOf(Emerald, Teal, Sky, Gold, Emerald))
}

val PoppinsFamily = FontFamily(
    Font(R.font.poppins_regular, FontWeight.Normal),
    Font(R.font.poppins_medium, FontWeight.Medium),
    Font(R.font.poppins_semibold, FontWeight.SemiBold),
    Font(R.font.poppins_bold, FontWeight.Bold),
)
val CairoFamily = FontFamily(
    Font(R.font.cairo, FontWeight.Normal),
    Font(R.font.cairo, FontWeight.Medium),
    Font(R.font.cairo, FontWeight.SemiBold),
    Font(R.font.cairo, FontWeight.Bold),
)

private fun dzTypography(lang: Lang): Typography {
    val f = if (lang == Lang.AR) CairoFamily else PoppinsFamily
    return Typography(
        headlineLarge = TextStyle(fontFamily = f, fontWeight = FontWeight.Bold, fontSize = 30.sp),
        headlineMedium = TextStyle(fontFamily = f, fontWeight = FontWeight.Bold, fontSize = 24.sp),
        titleLarge = TextStyle(fontFamily = f, fontWeight = FontWeight.Bold, fontSize = 19.sp),
        titleMedium = TextStyle(fontFamily = f, fontWeight = FontWeight.SemiBold, fontSize = 16.sp),
        bodyLarge = TextStyle(fontFamily = f, fontWeight = FontWeight.Normal, fontSize = 15.sp, lineHeight = 22.sp),
        bodyMedium = TextStyle(fontFamily = f, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 20.sp),
        bodySmall = TextStyle(fontFamily = f, fontWeight = FontWeight.Normal, fontSize = 12.sp),
        labelLarge = TextStyle(fontFamily = f, fontWeight = FontWeight.SemiBold, fontSize = 14.sp),
        labelSmall = TextStyle(fontFamily = f, fontWeight = FontWeight.Medium, fontSize = 11.sp),
    )
}

@Composable
fun DzTheme(dark: Boolean = isSystemInDarkTheme(), lang: Lang = Lang.AR, content: @Composable () -> Unit) {
    val scheme = if (dark) {
        darkColorScheme(
            primary = Color(0xFF34D399), onPrimary = Color(0xFF06231F),
            secondary = Dz.Teal, tertiary = Dz.Sky,
            background = Dz.DarkBg, surface = Dz.DarkSurface,
            onBackground = Dz.DarkInk, onSurface = Dz.DarkInk,
            onSurfaceVariant = Dz.DarkInkSoft, error = Color(0xFFF87171),
        )
    } else {
        lightColorScheme(
            primary = Dz.Emerald, onPrimary = Color.White,
            secondary = Dz.Teal, tertiary = Dz.Sky,
            background = Dz.Pearl, surface = Color.White,
            onBackground = Dz.Ink, onSurface = Dz.Ink,
            onSurfaceVariant = Dz.InkSoft, error = Dz.Danger,
        )
    }
    MaterialTheme(
        colorScheme = scheme,
        typography = dzTypography(lang),
        shapes = Shapes(
            extraSmall = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
            small = androidx.compose.foundation.shape.RoundedCornerShape(12.dp),
            medium = androidx.compose.foundation.shape.RoundedCornerShape(16.dp),
            large = androidx.compose.foundation.shape.RoundedCornerShape(22.dp),
            extraLarge = androidx.compose.foundation.shape.RoundedCornerShape(28.dp),
        ),
        content = content,
    )
}
