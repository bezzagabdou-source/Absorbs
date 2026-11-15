package dz.absorbs.app.presentation.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dz.absorbs.app.data.Config
import dz.absorbs.app.presentation.components.GlassCard
import dz.absorbs.app.presentation.components.GradientButton
import dz.absorbs.app.presentation.i18n.LocalStr
import dz.absorbs.app.presentation.theme.Dz
import dz.absorbs.app.presentation.viewmodel.AppViewModel
import dz.absorbs.app.presentation.viewmodel.AuthViewModel

@Composable
fun AuthScreen(app: AppViewModel) {
    val s = LocalStr.current
    val ctx = LocalContext.current
    val vm = remember { AuthViewModel() }
    var signup by remember { mutableStateOf(false) }
    var email by remember { mutableStateOf("") }
    var pass by remember { mutableStateOf("") }
    var display by remember { mutableStateOf("") }
    var username by remember { mutableStateOf("") }

    // Floating aurora blobs
    val drift = rememberInfiniteTransition(label = "blobs")
    val dy by drift.animateFloat(-14f, 18f, infiniteRepeatable(tween(5200), RepeatMode.Reverse), label = "dy")
    val dy2 by drift.animateFloat(12f, -16f, infiniteRepeatable(tween(4600), RepeatMode.Reverse), label = "dy2")

    Box(Modifier.fillMaxSize().background(Dz.appBrush(MaterialTheme.colorScheme.background == Dz.DarkBg))) {
        androidx.compose.foundation.Canvas(Modifier.fillMaxSize()) {
            val dotColor = androidx.compose.ui.graphics.Color(0x144F46E5)
            var y = 24f
            while (y < size.height) {
                var x = 18f
                while (x < size.width) {
                    drawCircle(dotColor, radius = 1.6f, center = androidx.compose.ui.geometry.Offset(x, y))
                    x += 30f
                }
                y += 30f
            }
        }
        Box(Modifier.size(230.dp).offset(x = 240.dp, y = (-60 + dy).dp).background(Dz.Sky.copy(alpha = 0.20f), CircleShape))
        Box(Modifier.size(190.dp).offset(x = (-80).dp, y = (150 + dy2).dp).background(Dz.Fuchsia.copy(alpha = 0.20f), CircleShape))
        Box(Modifier.size(120.dp).align(Alignment.BottomEnd).offset(x = 40.dp, y = (30 - dy).dp).background(Dz.Indigo.copy(alpha = 0.16f), CircleShape))
        Box(Modifier.size(150.dp).align(Alignment.TopStart).offset(x = 30.dp, y = (60 - dy).dp).background(Dz.Violet.copy(alpha = 0.14f), CircleShape))

        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(26.dp))
            val ringTransition = rememberInfiniteTransition(label = "authRing")
            val ringAngle by ringTransition.animateFloat(
                0f, 360f,
                infiniteRepeatable(tween(2600), RepeatMode.Restart),
                label = "authRingAngle",
            )
            Box(Modifier.size(116.dp), contentAlignment = Alignment.Center) {
                androidx.compose.foundation.Canvas(Modifier.size(116.dp)) {
                    drawArc(
                        brush = Dz.ringBrush(),
                        startAngle = ringAngle, sweepAngle = 255f, useCenter = false,
                        style = androidx.compose.ui.graphics.drawscope.Stroke(width = 7.dp.toPx(), cap = androidx.compose.ui.graphics.StrokeCap.Round),
                    )
                }
                Box(
                    Modifier.size(88.dp).background(Dz.primaryBrush(), RoundedCornerShape(26.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Text("D", color = Color.White, fontFamily = dz.absorbs.app.presentation.theme.TajawalBlack, fontSize = 48.sp)
                }
            }
            Spacer(Modifier.height(14.dp))
            Text(
                "Dz connect",
                style = MaterialTheme.typography.headlineLarge.copy(
                    fontFamily = dz.absorbs.app.presentation.theme.PoppinsFamily,
                    fontWeight = FontWeight.Bold,
                    brush = androidx.compose.ui.graphics.Brush.linearGradient(listOf(Dz.Indigo, Dz.Violet, Dz.Fuchsia)),
                ),
            )
            Text(s.appTagline, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
            Spacer(Modifier.height(22.dp))

            AnimatedVisibility(true, enter = fadeIn(tween(500)) + slideInVertically(tween(550)) { it / 2 }) {
                GlassCard(Modifier.fillMaxWidth()) {
                    Column {
                        Row(Modifier.fillMaxWidth()) {
                            AuthTab(s.login, !signup, Modifier.weight(1f)) { signup = false }
                            AuthTab(s.signup, signup, Modifier.weight(1f)) { signup = true }
                        }
                        Spacer(Modifier.height(14.dp))
                        if (signup) {
                            OutlinedTextField(display, { display = it }, label = { Text(s.fullName) }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp))
                            Spacer(Modifier.height(10.dp))
                            OutlinedTextField(username, { username = it.lowercase() }, label = { Text(s.username) }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp))
                            Spacer(Modifier.height(10.dp))
                        }
                        OutlinedTextField(email, { email = it.trim() }, label = { Text(s.email) }, singleLine = true, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp))
                        Spacer(Modifier.height(10.dp))
                        OutlinedTextField(
                            pass, { pass = it }, label = { Text(s.password) }, singleLine = true,
                            visualTransformation = PasswordVisualTransformation(),
                            modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp),
                        )
                        if (!signup) {
                            Text(
                                s.forgotPassword,
                                color = Dz.Sky, fontSize = 13.sp, fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.fillMaxWidth().padding(top = 10.dp).clickable { vm.reset(email, s.resetSent) },
                                textAlign = TextAlign.End,
                            )
                        }
                        vm.error?.let {
                            Text(it, color = MaterialTheme.colorScheme.error, fontSize = 13.sp, modifier = Modifier.padding(top = 10.dp))
                        }
                        vm.info?.let {
                            Text(it, color = Dz.Violet, fontSize = 13.sp, modifier = Modifier.padding(top = 10.dp))
                        }
                        Spacer(Modifier.height(16.dp))
                        GradientButton(
                            text = if (vm.busy) "…" else if (signup) s.signup else s.login,
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !vm.busy,
                        ) {
                            when {
                                !email.contains("@") -> vm.error = "Email invalide / بريد غير صحيح"
                                pass.length < 6 -> vm.error = "6 caractères min / ٦ أحرف على الأقل"
                                signup && display.isBlank() -> vm.error = s.fullName
                                signup && !username.matches(Regex("^[a-z0-9_.]{3,20}$")) -> vm.error = "username: a-z 0-9 . _ (3-20)"
                                signup -> vm.signup(email, pass, username, display) { app.refreshSessionFlags() }
                                else -> vm.login(email, pass) { app.refreshSessionFlags() }
                            }
                        }
                        Spacer(Modifier.height(12.dp))
                        Box(
                            Modifier.fillMaxWidth().height(50.dp)
                                .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(999.dp))
                                .clickable {
                                    val url = "${Config.SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=dzconnect%3A%2F%2Fauth"
                                    ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                                },
                            contentAlignment = Alignment.Center,
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                GoogleGlyph(22.dp)
                                Spacer(Modifier.width(10.dp))
                                Text(s.continueGoogle, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface, fontSize = 14.sp)
                            }
                        }
                        AnimatedVisibility(vm.needsActivation) {
                            Column(
                                Modifier.fillMaxWidth().padding(top = 14.dp)
                                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f), RoundedCornerShape(16.dp))
                                    .padding(14.dp),
                            ) {
                                Text(s.checkEmail, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurface)
                                Text(
                                    s.resendLink, color = Dz.Sky, fontWeight = FontWeight.Bold, fontSize = 14.sp,
                                    modifier = Modifier.padding(top = 8.dp).clickable { vm.resend(email) },
                                )
                            }
                        }
                        Spacer(Modifier.height(14.dp))
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                            Text(s.privacy, color = Dz.Sky, fontSize = 13.sp, modifier = Modifier.clickable {
                                ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("${Config.SITE_URL}/privacy")))
                            })
                            Text("  ·  ", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(s.terms, color = Dz.Sky, fontSize = 13.sp, modifier = Modifier.clickable {
                                ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("${Config.SITE_URL}/terms")))
                            })
                        }
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
            Text(s.agreeTerms, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, textAlign = TextAlign.Center)
        }
    }
}

@Composable
private fun AuthTab(text: String, active: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier.height(42.dp)
            .background(if (active) Dz.primaryBrush() else Brushless, RoundedCornerShape(999.dp))
            .clickable { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = if (active) Color.White else MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold, fontSize = 14.sp)
    }
}

private val Brushless = androidx.compose.ui.graphics.Brush.linearGradient(listOf(Color.Transparent, Color.Transparent))


/** Official 4-color Google "G" glyph drawn with Canvas. */
@Composable
private fun GoogleGlyph(size: androidx.compose.ui.unit.Dp) {
    androidx.compose.foundation.Canvas(Modifier.size(size)) {
        val s = size.toPx()
        val stroke = s * 0.30f
        val inset = stroke / 2f
        val arc = androidx.compose.ui.graphics.drawscope.Stroke(width = stroke, cap = androidx.compose.ui.graphics.StrokeCap.Butt)
        // red (top-right), yellow (bottom-right), green (bottom-left), blue (left) arcs + blue bar
        drawArc(androidx.compose.ui.graphics.Color(0xFF4285F4), 150f, 90f, false, topLeft = androidx.compose.ui.geometry.Offset(inset, inset), size = androidx.compose.ui.geometry.Size(s - stroke, s - stroke), style = arc)
        drawArc(androidx.compose.ui.graphics.Color(0xFF34A853), 30f, 120f, false, topLeft = androidx.compose.ui.geometry.Offset(inset, inset), size = androidx.compose.ui.geometry.Size(s - stroke, s - stroke), style = arc)
        drawArc(androidx.compose.ui.graphics.Color(0xFFFBBC05), 270f, 90f, false, topLeft = androidx.compose.ui.geometry.Offset(inset, inset), size = androidx.compose.ui.geometry.Size(s - stroke, s - stroke), style = arc)
        drawArc(androidx.compose.ui.graphics.Color(0xFFEA4335), 180f, 105f, false, topLeft = androidx.compose.ui.geometry.Offset(inset, inset), size = androidx.compose.ui.geometry.Size(s - stroke, s - stroke), style = arc)
        drawRect(androidx.compose.ui.graphics.Color(0xFF4285F4), topLeft = androidx.compose.ui.geometry.Offset(s * 0.48f, s * 0.36f), size = androidx.compose.ui.geometry.Size(s * 0.42f, stroke))
    }
}
