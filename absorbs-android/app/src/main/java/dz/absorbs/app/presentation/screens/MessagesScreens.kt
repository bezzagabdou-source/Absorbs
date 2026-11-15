package dz.absorbs.app.presentation.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dz.absorbs.app.R
import dz.absorbs.app.data.ChatRealtime
import dz.absorbs.app.data.ThreadItem
import dz.absorbs.app.data.TimeAr
import dz.absorbs.app.domain.SocialRepository as Repo
import dz.absorbs.app.presentation.components.DzAvatar
import dz.absorbs.app.presentation.components.DzIcon
import dz.absorbs.app.presentation.components.EmptyState
import dz.absorbs.app.presentation.components.GlassCard
import dz.absorbs.app.presentation.components.ShimmerBox
import dz.absorbs.app.presentation.i18n.LocalStr
import dz.absorbs.app.presentation.theme.Dz
import dz.absorbs.app.presentation.viewmodel.AppViewModel
import dz.absorbs.app.presentation.viewmodel.ChatViewModel
import kotlinx.coroutines.delay

@Composable
fun ThreadsScreen(onOpenChat: (ThreadItem) -> Unit) {
    val s = LocalStr.current
    var threads by remember { mutableStateOf<List<ThreadItem>?>(null) }

    LaunchedEffect(Unit) {
        Repo.threads { list, _ ->
            dz.absorbs.app.presentation.viewmodel.onMain { threads = list ?: emptyList() }
        }
    }

    Column(Modifier.fillMaxSize()) {
        Text(
            s.messages, style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(start = 16.dp, top = 14.dp, end = 16.dp, bottom = 6.dp),
        )
        val list = threads
        when {
            list == null -> ShimmerBox(Modifier.padding(12.dp), 200.dp)
            list.isEmpty() -> EmptyState(R.drawable.ic_lucide_message_circle, s.noMessages)
            else -> LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 90.dp)) {
                items(list, key = { it.id }) { thread ->
                    GlassCard(
                        Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 5.dp)
                            .clickable { onOpenChat(thread) },
                        contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            DzAvatar(thread.other?.avatarUrl, thread.other?.displayName ?: "D", 50.dp)
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(thread.other?.displayName ?: "", fontWeight = FontWeight.Bold, fontSize = 15.sp, color = MaterialTheme.colorScheme.onSurface)
                                Text(
                                    previewOf(thread.lastMessage), fontSize = 13.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1,
                                )
                            }
                            Text(TimeAr.ago(thread.lastAt), fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}

private fun previewOf(raw: String): String = when {
    raw.startsWith("[image]") -> "صورة مرفقة"
    raw.startsWith("[voice]") -> "رسالة صوتية"
    raw.startsWith("[call|") -> "مكالمة"
    else -> raw
}

@Composable
fun ChatScreen(thread: ThreadItem, app: AppViewModel, onBack: () -> Unit) {
    val s = LocalStr.current
    val vm = remember(thread.id) { ChatViewModel(thread.id) }
    var input by remember { mutableStateOf("") }
    val listState = rememberLazyListState()

    val realtime = remember(thread.id) {
        ChatRealtime(
            threadId = thread.id,
            onMessage = { msg -> vm.onRealtimeMessage(msg) },
            onTyping = { vm.onTyping() },
            onPresence = { ids -> vm.onPresence(ids) },
        )
    }
    DisposableEffect(thread.id) {
        vm.load()
        realtime.connect()
        onDispose { realtime.close() }
    }
    // Polling fallback (in case Realtime is unavailable)
    LaunchedEffect(thread.id) {
        while (true) {
            delay(7000)
            vm.load()
        }
    }
    LaunchedEffect(vm.messages.size) {
        if (vm.messages.isNotEmpty()) listState.animateScrollToItem(vm.messages.size - 1)
    }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            androidx.compose.material3.IconButton(onClick = onBack) {
                DzIcon(R.drawable.ic_lucide_chevron_left, tint = MaterialTheme.colorScheme.onSurface)
            }
            DzAvatar(thread.other?.avatarUrl, thread.other?.displayName ?: "D", 42.dp)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(thread.other?.displayName ?: "", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = MaterialTheme.colorScheme.onSurface)
                Text(
                    when {
                        vm.peerTyping -> s.typing
                        vm.peerOnline -> s.online
                        else -> "@${thread.other?.username ?: ""}"
                    },
                    fontSize = 12.sp,
                    color = if (vm.peerOnline || vm.peerTyping) Dz.Emerald else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (vm.peerOnline) {
                Box(Modifier.size(10.dp).background(Dz.Emerald, CircleShape))
            }
        }

        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp),
            verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(6.dp),
        ) {
            items(vm.messages, key = { it.id }) { msg ->
                val mine = msg.mine
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = if (mine) androidx.compose.foundation.layout.Arrangement.End else androidx.compose.foundation.layout.Arrangement.Start,
                ) {
                    Box(
                        Modifier.fillMaxWidth(0.78f)
                            .background(
                                if (mine) Dz.primaryBrush()
                                else androidx.compose.ui.graphics.Brush.linearGradient(
                                    listOf(MaterialTheme.colorScheme.surface, MaterialTheme.colorScheme.surface),
                                ),
                                RoundedCornerShape(20.dp),
                            )
                            .padding(horizontal = 13.dp, vertical = 9.dp),
                    ) {
                        Column {
                            Text(
                                displayMessage(msg.content),
                                color = if (mine) Color.White else MaterialTheme.colorScheme.onSurface,
                                fontSize = 14.sp,
                            )
                            Text(
                                TimeAr.ago(msg.createdAt),
                                color = if (mine) Color(0xCCFFFFFF) else MaterialTheme.colorScheme.onSurfaceVariant,
                                fontSize = 10.sp,
                            )
                        }
                    }
                }
            }
        }

        Row(
            Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = input,
                onValueChange = {
                    input = it
                    realtime.sendTyping()
                },
                placeholder = { Text(s.writeMessage) },
                modifier = Modifier.weight(1f), shape = RoundedCornerShape(999.dp), maxLines = 4,
            )
            Spacer(Modifier.width(8.dp))
            Box(
                Modifier.size(50.dp).background(Dz.primaryBrush(), CircleShape).clickable {
                    val text = input.trim()
                    if (text.isNotBlank()) {
                        input = ""
                        vm.send(text)
                    }
                },
                contentAlignment = Alignment.Center,
            ) { DzIcon(R.drawable.ic_lucide_send, tint = Color.White, size = 21.dp) }
        }
    }
}

private fun displayMessage(raw: String): String = when {
    raw.startsWith("[image]") -> "صورة مرفقة"
    raw.startsWith("[voice]") -> "رسالة صوتية"
    raw.startsWith("[call|") -> "مكالمة"
    else -> raw
}
