package dz.absorbs.app.presentation.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.staggeredgrid.LazyVerticalStaggeredGrid
import androidx.compose.foundation.lazy.staggeredgrid.StaggeredGridCells
import androidx.compose.foundation.lazy.staggeredgrid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import dz.absorbs.app.R
import dz.absorbs.app.data.Post
import dz.absorbs.app.data.Profile
import dz.absorbs.app.domain.SocialRepository as Repo
import dz.absorbs.app.presentation.components.DzAvatar
import dz.absorbs.app.presentation.components.DzIcon
import dz.absorbs.app.presentation.components.EmptyState
import dz.absorbs.app.presentation.components.ShimmerBox
import dz.absorbs.app.presentation.components.VerifiedBadge
import dz.absorbs.app.presentation.i18n.LocalStr
import dz.absorbs.app.presentation.theme.Dz
import dz.absorbs.app.presentation.viewmodel.onMain

@Composable
fun ExploreScreen(onOpenProfile: (String) -> Unit, onOpenComments: (Post) -> Unit) {
    val s = LocalStr.current
    var query by remember { mutableStateOf("") }
    var people by remember { mutableStateOf<List<Profile>>(emptyList()) }
    var posts by remember { mutableStateOf<List<Post>?>(null) }
    var searching by remember { mutableStateOf(false) }

    fun runSearch() {
        val q = query.trim()
        if (q.length < 2) return
        searching = true
        Repo.searchPeople(q) { list, _ -> onMain { people = list ?: emptyList() } }
        Repo.searchPosts(q) { list, _ -> onMain { posts = list ?: emptyList(); searching = false } }
    }

    LaunchedEffect(Unit) {
        Repo.explore { list, _ -> onMain { if (posts == null) posts = list ?: emptyList() } }
    }

    Column(Modifier.fillMaxSize()) {
        Text(
            s.explore, style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(start = 16.dp, top = 14.dp, end = 16.dp),
        )
        Row(
            Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text("${s.searchPeople} · ${s.searchPosts}") },
                singleLine = true,
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(999.dp),
                leadingIcon = { DzIcon(R.drawable.ic_lucide_search, tint = MaterialTheme.colorScheme.onSurfaceVariant, size = 20.dp) },
            )
            Spacer(Modifier.width(8.dp))
            Box(
                Modifier.height(50.dp).background(Dz.primaryBrush(), RoundedCornerShape(999.dp))
                    .clickable { runSearch() }.padding(horizontal = 18.dp),
                contentAlignment = Alignment.Center,
            ) { DzIcon(R.drawable.ic_lucide_search, tint = Color.White, size = 20.dp) }
        }

        if (people.isNotEmpty()) {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(people, key = { it.id }) { person ->
                    androidx.compose.material3.Surface(
                        shape = RoundedCornerShape(20.dp),
                        color = MaterialTheme.colorScheme.surface,
                        modifier = Modifier.clickable { onOpenProfile(person.id) },
                    ) {
                        Row(
                            Modifier.padding(10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            DzAvatar(person.avatarUrl, person.displayName, 40.dp)
                            Spacer(Modifier.width(8.dp))
                            Column {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(person.displayName, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurface)
                                    if (person.verified) { Spacer(Modifier.width(3.dp)); VerifiedBadge(size = 13.dp) }
                                }
                                Text("@${person.username}", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
        }

        val grid = posts
        when {
            grid == null || searching -> ShimmerBox(Modifier.padding(12.dp), 300.dp)
            grid.isEmpty() -> EmptyState(R.drawable.ic_lucide_compass, s.noResults)
            else -> LazyVerticalStaggeredGrid(
                columns = StaggeredGridCells.Fixed(2),
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(10.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalItemSpacing = 8.dp,
            ) {
                items(grid, key = { it.id }) { post ->
                    val ratio = if ((post.id.hashCode() and 1) == 0) 0.78f else 1.25f
                    Box(
                        Modifier.fillMaxWidth().aspectRatio(ratio).clip(RoundedCornerShape(18.dp))
                            .background(Dz.DarkBg)
                            .clickable { onOpenComments(post) },
                    ) {
                        AsyncImage(post.imageUrl, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                        if (post.mediaType == "video") {
                            Box(
                                Modifier.padding(8.dp).background(Color(0x59000000), RoundedCornerShape(999.dp)).padding(6.dp),
                            ) { DzIcon(R.drawable.ic_lucide_play, tint = Color.White, size = 16.dp) }
                        }
                    }
                }
            }
        }
    }
}
