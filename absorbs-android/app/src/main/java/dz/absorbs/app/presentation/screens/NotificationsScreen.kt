package dz.absorbs.app.presentation.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dz.absorbs.app.R
import dz.absorbs.app.data.TimeAr
import dz.absorbs.app.presentation.components.DzAvatar
import dz.absorbs.app.presentation.components.DzIcon
import dz.absorbs.app.presentation.components.EmptyState
import dz.absorbs.app.presentation.components.GlassCard
import dz.absorbs.app.presentation.components.ShimmerBox
import dz.absorbs.app.presentation.i18n.LocalStr
import dz.absorbs.app.presentation.theme.Dz
import dz.absorbs.app.presentation.viewmodel.NotificationsViewModel

@Composable
fun NotificationsScreen(onBack: () -> Unit, onOpenProfile: (String) -> Unit) {
    val s = LocalStr.current
    val vm = remember { NotificationsViewModel() }
    LaunchedEffect(Unit) { vm.load() }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) { DzIcon(R.drawable.ic_lucide_chevron_left, tint = MaterialTheme.colorScheme.onSurface) }
            Text(s.notifications, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f))
            if (vm.usingRealTable && vm.items.isNotEmpty()) {
                androidx.compose.material3.TextButton(onClick = { vm.markAllShown() }) {
                    Text(s.markAllRead, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = Dz.Indigo)
                }
            }
        }
        when {
            vm.loading -> ShimmerBox(Modifier.padding(12.dp), 220.dp)
            vm.items.isEmpty() -> EmptyState(R.drawable.ic_lucide_bell, s.noNotifications)
            else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 24.dp)) {
                items(vm.items) { notif ->
                    val (icon, color, action) = when (notif.kind) {
                        "like" -> Triple(R.drawable.ic_lucide_heart, Dz.Rose, s.likedYourPost)
                        "comment" -> Triple(R.drawable.ic_lucide_message_circle, Dz.Sky, s.commentedYourPost)
                        "reply" -> Triple(R.drawable.ic_lucide_reply, Dz.Violet, s.repliedToYourComment)
                        "message" -> Triple(R.drawable.ic_lucide_send, Dz.Teal, s.sentYouMessage)
                        "reaction" -> Triple(R.drawable.ic_lucide_heart, Dz.Fuchsia, s.reactedToYourPost)
                        "verify" -> Triple(R.drawable.ic_lucide_badge_check, Dz.Sky, s.verifyCongrats)
                        else -> Triple(R.drawable.ic_lucide_user, Dz.Amber, s.startedFollowing)
                    }
                    GlassCard(
                        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 5.dp)
                            .clickable { notif.actor?.id?.let(onOpenProfile) },
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box {
                                DzAvatar(notif.actor?.avatarUrl, notif.actor?.displayName ?: "D", 46.dp)
                                Box(
                                    Modifier.size(20.dp).align(Alignment.BottomEnd)
                                        .background(color, CircleShape),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    if (notif.kind == "reaction" && notif.text.isNotBlank()) {
                                        Text(notif.text, fontSize = 10.sp)
                                    } else {
                                        DzIcon(icon, tint = Color.White, size = 12.dp)
                                    }
                                }
                            }
                            Spacer(Modifier.width(11.dp))
                            Column(Modifier.weight(1f)) {
                                Text(
                                    if (notif.actor != null) "${notif.actor.displayName} $action" else action,
                                    fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurface,
                                )
                                if (notif.text.isNotBlank() && notif.kind !in setOf("reaction")) {
                                    Text(notif.text, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                                }
                            }
                            Text(TimeAr.ago(notif.createdAt), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}
