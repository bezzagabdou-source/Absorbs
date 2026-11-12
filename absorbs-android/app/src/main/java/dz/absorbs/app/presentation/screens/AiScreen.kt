package dz.absorbs.app.presentation.screens

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dz.absorbs.app.R
import dz.absorbs.app.domain.SocialRepository as Repo
import dz.absorbs.app.presentation.components.DzIcon
import dz.absorbs.app.presentation.i18n.LocalStr
import dz.absorbs.app.presentation.theme.Dz
import dz.absorbs.app.presentation.viewmodel.onMain

private data class AiBubble(val role: String, val content: String)

@Composable
fun AiScreen() {
    val s = LocalStr.current
    val messages = remember { mutableStateListOf<AiBubble>() }
    var input by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()

    LaunchedEffect(Unit) {
        if (messages.isEmpty()) messages.add(AiBubble("assistant", s.aiWelcome))
    }
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) listState.animateScrollToItem(messages.size - 1)
    }

    fun send(text: String) {
        val t = text.trim()
        if (t.isBlank() || busy) return
        messages.add(AiBubble("user", t))
        busy = true
        val history = messages.takeLast(12).map { it.role to it.content }
        Repo.aiChat(history) { reply, err ->
            onMain {
                busy = false
                messages.add(AiBubble("assistant", reply ?: (err ?: s.aiHint)))
            }
        }
    }

    Column(Modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(42.dp).background(Brush.linearGradient(listOf(Dz.Sky, Dz.Emerald)), CircleShape),
                contentAlignment = Alignment.Center,
            ) { DzIcon(R.drawable.ic_lucide_sparkles, tint = Color.White, size = 22.dp) }
            Spacer(Modifier.width(10.dp))
            Column {
                Text(s.aiTitle, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurface)
                Text("Gemini · Dz connect", fontSize = 11.sp, color = Dz.Emerald, fontWeight = FontWeight.Bold)
            }
        }

        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(7.dp),
        ) {
            items(messages) { msg ->
                val mine = msg.role == "user"
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start,
                ) {
                    Box(
                        Modifier.fillMaxWidth(0.82f)
                            .background(
                                if (mine) Dz.primaryBrush()
                                else Brush.linearGradient(listOf(MaterialTheme.colorScheme.surface, MaterialTheme.colorScheme.surface)),
                                RoundedCornerShape(20.dp),
                            )
                            .padding(horizontal = 13.dp, vertical = 10.dp),
                    ) {
                        Column {
                            Text(msg.content, color = if (mine) Color.White else MaterialTheme.colorScheme.onSurface, fontSize = 14.sp)
                            if (!mine) {
                                Text(
                                    s.report, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(top = 5.dp).clickable {
                                        Repo.report("ai", "ai-${msg.content.hashCode()}", "محتوى مسيء من المساعد") { }
                                    },
                                )
                            }
                        }
                    }
                }
            }
            if (busy) {
                item {
                    Text("…", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 22.sp, modifier = Modifier.padding(8.dp))
                }
            }
        }

        LazyRow(
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            val chips = listOf(
                "أفكار منشورات عن الجزائر" to "أعطني 5 أفكار منشورات جذابة عن الحياة في الجزائر",
                "حسّن نصي" to "حسّن هذا النص لمنشور: ",
                "ردود ذكية" to "اقترح 3 ردود ذكية وقصيرة على تعليق إيجابي",
                "هاشتاغات" to "اقترح أفضل الهاشتاغات الجزائرية الرائجة اليوم",
            )
            items(chips) { (label, prompt) ->
                Box(
                    Modifier.clip(RoundedCornerShape(999.dp))
                        .background(MaterialTheme.colorScheme.surface)
                        .clickable { send(prompt) }
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                ) { Text(label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = Dz.Teal) }
            }
        }
        Spacer(Modifier.height(8.dp))

        Row(
            Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = input, onValueChange = { input = it },
                placeholder = { Text(s.aiHint) },
                modifier = Modifier.weight(1f), shape = RoundedCornerShape(999.dp), maxLines = 4,
            )
            Spacer(Modifier.width(8.dp))
            Box(
                Modifier.size(50.dp).background(Brush.linearGradient(listOf(Dz.Sky, Dz.Emerald)), CircleShape)
                    .clickable { val t = input; input = ""; send(t) },
                contentAlignment = Alignment.Center,
            ) { DzIcon(R.drawable.ic_lucide_send, tint = Color.White, size = 21.dp) }
        }
    }
}
