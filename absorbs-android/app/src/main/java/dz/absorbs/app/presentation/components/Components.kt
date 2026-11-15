package dz.absorbs.app.presentation.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import dz.absorbs.app.R
import dz.absorbs.app.presentation.theme.Dz

/** Lucide icon (downloaded from github.com/lucide-icons/lucide, converted to vectors). */
@Composable
fun DzIcon(res: Int, modifier: Modifier = Modifier, tint: Color = Color.Unspecified, size: Dp = 24.dp) {
    Icon(painter = painterResource(res), contentDescription = null, modifier = modifier.size(size), tint = tint)
}

@Composable
fun DzAvatar(url: String?, name: String, size: Dp = 44.dp, ring: Brush? = null) {
    Box(
        modifier = Modifier
            .size(size)
            .then(if (ring != null) Modifier.background(ring, CircleShape).padding(2.5.dp) else Modifier)
            .background(MaterialTheme.colorScheme.surface, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        if (!url.isNullOrBlank()) {
            AsyncImage(
                model = url, contentDescription = null,
                modifier = Modifier.size(size).clip(CircleShape),
                contentScale = ContentScale.Crop,
            )
        } else {
            Box(
                modifier = Modifier.size(size).background(Dz.primaryBrush(), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = name.trim().firstOrNull()?.uppercase() ?: "D",
                    color = Color.White, fontWeight = FontWeight.Bold, fontSize = (size.value * 0.4).sp,
                )
            }
        }
    }
}

@Composable
fun VerifiedBadge(modifier: Modifier = Modifier, size: Dp = 16.dp) {
    Icon(
        painter = painterResource(R.drawable.ic_lucide_badge_check),
        contentDescription = null,
        modifier = modifier.size(size),
        tint = Dz.Sky,
    )
}

/** Frosted glass surface used across the app. */
@Composable
fun GlassCard(
    modifier: Modifier = Modifier,
    shape: RoundedCornerShape = RoundedCornerShape(24.dp),
    contentPadding: PaddingValues = PaddingValues(14.dp),
    content: @Composable () -> Unit,
) {
    val dark = MaterialTheme.colorScheme.background == Dz.DarkBg
    Box(
        modifier = modifier
            .background(
                if (dark) Color(0xE6141A33) else Color(0xF2FFFFFF), shape,
            )
            .border(1.dp, if (dark) Color(0x33FFFFFF) else Color(0x2E4F46E5), shape)
            .padding(contentPadding),
    ) { content() }
}

@Composable
fun GradientButton(
    text: String,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onClick: () -> Unit,
) {
    Box(
        modifier = modifier
            .height(52.dp)
            .background(if (enabled) Dz.primaryBrush() else Brush.linearGradient(listOf(Color.Gray, Color.Gray)), RoundedCornerShape(999.dp))
            .clickable(enabled = enabled) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 15.sp)
    }
}

/** Story circle with gradient (unviewed) or grey (viewed) ring. */
@Composable
fun StoryRing(
    avatarUrl: String?,
    name: String,
    viewed: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Column(
        modifier = modifier.width(74.dp).clickable { onClick() },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        DzAvatar(
            url = avatarUrl, name = name, size = 62.dp,
            ring = if (viewed) Brush.linearGradient(listOf(Color(0xFFC9DCD4), Color(0xFFC9DCD4))) else Dz.ringBrush(),
        )
        Spacer(Modifier.height(4.dp))
        Text(
            name, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
            color = MaterialTheme.colorScheme.onSurface, textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

/** Animated shimmer placeholder block. */
@Composable
fun ShimmerBox(modifier: Modifier = Modifier, height: Dp = 150.dp) {
    val transition = rememberInfiniteTransition(label = "shimmer")
    val alpha by transition.animateFloat(
        initialValue = 0.35f, targetValue = 0.85f,
        animationSpec = infiniteRepeatable(tween(900, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "shimmerAlpha",
    )
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(height)
            .background(Color(0xFFCFCBF0).copy(alpha = alpha), RoundedCornerShape(24.dp)),
    )
}

@Composable
fun EmptyState(iconRes: Int, text: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier.size(74.dp).background(Dz.primaryBrush(), CircleShape),
            contentAlignment = Alignment.Center,
        ) { DzIcon(iconRes, tint = Color.White, size = 32.dp) }
        Spacer(Modifier.height(14.dp))
        Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
    }
}

@Composable
fun OfflineBar(text: String) {
    Box(
        modifier = Modifier.fillMaxWidth().background(Dz.Amber).padding(horizontal = 14.dp, vertical = 7.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
    }
}

/** Animated heart like button (spring pop). */
@Composable
fun LikeButton(liked: Boolean, count: Int, onToggle: () -> Unit) {
    val scale = remember { Animatable(1f) }
    LaunchedEffect(liked) {
        if (liked) {
            scale.snapTo(0.6f)
            scale.animateTo(1.25f, spring(dampingRatio = 0.45f, stiffness = 320f))
            scale.animateTo(1f, spring(dampingRatio = 0.6f, stiffness = 300f))
        }
    }
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f))
            .clickable { onToggle() }
            .padding(horizontal = 13.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            painter = painterResource(R.drawable.ic_lucide_heart),
            contentDescription = null,
            modifier = Modifier.size(19.dp).scale(scale.value),
            tint = if (liked) Dz.Rose else MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.width(6.dp))
        Text("$count", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
    }
}


/** Facebook-style emoji reactions: one per user per post (v6 post_reactions). */
@Composable
fun ReactionsBar(
    counts: Map<String, Int>,
    mine: String?,
    onToggle: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var pickerOpen by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
    val total = counts.values.sum()
    val density = androidx.compose.ui.platform.LocalDensity.current
    Row(
        modifier,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // picker toggle — popup floats above the feed, no layout shift
        Box {
            Box(
                Modifier.size(34.dp).clip(CircleShape)
                    .background(if (mine != null) Dz.Violet.copy(alpha = 0.16f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f))
                    .clickable { pickerOpen = !pickerOpen },
                contentAlignment = Alignment.Center,
            ) {
                if (mine != null) Text(mine, fontSize = 17.sp)
                else DzIcon(R.drawable.ic_lucide_sparkles, tint = MaterialTheme.colorScheme.onSurfaceVariant, size = 17.dp)
            }
            if (pickerOpen) {
                androidx.compose.ui.window.Popup(
                    offset = with(density) { androidx.compose.ui.unit.IntOffset(0, 42.dp.roundToPx()) },
                    onDismissRequest = { pickerOpen = false },
                    properties = androidx.compose.ui.window.PopupProperties(focusable = true),
                ) {
                    Row(
                        Modifier.background(MaterialTheme.colorScheme.surface, RoundedCornerShape(999.dp))
                            .border(1.dp, MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(999.dp))
                            .padding(6.dp),
                    ) {
                        REACTION_EMOJIS.forEach { emoji ->
                            Text(
                                emoji,
                                fontSize = 23.sp,
                                modifier = Modifier
                                    .clip(CircleShape)
                                    .clickable { pickerOpen = false; onToggle(emoji) }
                                    .padding(6.dp),
                            )
                        }
                    }
                }
            }
        }
        if (total > 0) {
            Spacer(Modifier.width(8.dp))
            counts.entries.sortedByDescending { it.value }.forEach { (emoji, n) ->
                val mineThis = mine == emoji
                Box(
                    Modifier.padding(end = 4.dp)
                        .clip(RoundedCornerShape(999.dp))
                        .background(
                            if (mineThis) Dz.Violet.copy(alpha = 0.18f) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                        )
                        .clickable { onToggle(emoji) }
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                ) {
                    Text(
                        "$emoji $n",
                        fontSize = 12.sp, fontWeight = FontWeight.Bold,
                        color = if (mineThis) Dz.Violet else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

private val REACTION_EMOJIS = listOf("❤️", "🔥", "😂", "😮", "😢", "👏")
