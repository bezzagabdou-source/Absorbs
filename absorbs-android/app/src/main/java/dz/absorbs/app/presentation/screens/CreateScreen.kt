package dz.absorbs.app.presentation.screens

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.ImageDecoder
import android.graphics.Paint
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import coil.compose.AsyncImage
import dz.absorbs.app.R
import dz.absorbs.app.domain.SocialRepository as Repo
import dz.absorbs.app.presentation.components.DzIcon
import dz.absorbs.app.presentation.components.GradientButton
import dz.absorbs.app.presentation.i18n.LocalStr
import dz.absorbs.app.presentation.theme.Dz
import dz.absorbs.app.presentation.viewmodel.onMain
import java.io.ByteArrayOutputStream
import java.io.File

private class ImgFilter(val name: String, val values: FloatArray?) {
    fun composeFilter(): ColorFilter? = values?.let { ColorFilter.colorMatrix(androidx.compose.ui.graphics.ColorMatrix(it)) }
}

private val FILTERS = listOf(
    ImgFilter("طبيعي", null),
    ImgFilter("دافئ", floatArrayOf(
        1.12f, 0f, 0f, 0f, 0f,
        0f, 1.02f, 0f, 0f, 0f,
        0f, 0f, 0.86f, 0f, 0f,
        0f, 0f, 0f, 1f, 0f,
    )),
    ImgFilter("بارد", floatArrayOf(
        0.88f, 0f, 0f, 0f, 0f,
        0f, 1.0f, 0f, 0f, 0f,
        0f, 0f, 1.14f, 0f, 0f,
        0f, 0f, 0f, 1f, 0f,
    )),
    ImgFilter("أحادي", floatArrayOf(
        0.33f, 0.59f, 0.11f, 0f, 0f,
        0.33f, 0.59f, 0.11f, 0f, 0f,
        0.33f, 0.59f, 0.11f, 0f, 0f,
        0f, 0f, 0f, 1f, 0f,
    )),
    ImgFilter("حيوي", floatArrayOf(
        1.25f, -0.08f, -0.08f, 0f, 0f,
        -0.08f, 1.25f, -0.08f, 0f, 0f,
        -0.08f, -0.08f, 1.25f, 0f, 0f,
        0f, 0f, 0f, 1f, 0f,
    )),
)

/** Decode → downscale (max 1600px) → apply filter → JPEG 82%. Real client-side compression. */
private fun processImage(ctx: Context, uri: Uri, filter: ImgFilter): ByteArray? {
    return try {
        val src: Bitmap = if (Build.VERSION.SDK_INT >= 28) {
            ImageDecoder.decodeBitmap(ImageDecoder.createSource(ctx.contentResolver, uri)) { decoder, _, _ ->
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                decoder.isMutableRequired = true
            }
        } else {
            ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) }
        } ?: return null
        val maxDim = 1600
        val scale = if (maxOf(src.width, src.height) > maxDim) maxDim.toFloat() / maxOf(src.width, src.height) else 1f
        val scaled = if (scale < 1f) Bitmap.createScaledBitmap(src, (src.width * scale).toInt(), (src.height * scale).toInt(), true) else src
        val outBmp = if (filter.values != null) {
            val filtered = Bitmap.createBitmap(scaled.width, scaled.height, Bitmap.Config.ARGB_8888)
            val paint = Paint().apply { colorFilter = ColorMatrixColorFilter(ColorMatrix(filter.values)) }
            Canvas(filtered).drawBitmap(scaled, 0f, 0f, paint)
            filtered
        } else scaled
        val baos = ByteArrayOutputStream()
        outBmp.compress(Bitmap.CompressFormat.JPEG, 82, baos)
        baos.toByteArray()
    } catch (_: Exception) {
        null
    }
}

@Composable
fun CreateScreen(storyModeInitial: Boolean, onDone: () -> Unit, onCancel: () -> Unit) {
    val s = LocalStr.current
    val ctx = LocalContext.current
    var storyMode by remember { mutableStateOf(storyModeInitial) }
    var mediaUri by remember { mutableStateOf<Uri?>(null) }
    var mediaIsVideo by remember { mutableStateOf(false) }
    var caption by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf(FILTERS[0]) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val gallery = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) {
            mediaUri = uri
            mediaIsVideo = ctx.contentResolver.getType(uri)?.startsWith("video") == true
        }
    }
    var cameraFile by remember { mutableStateOf<File?>(null) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        if (ok && cameraFile != null) {
            mediaUri = Uri.fromFile(cameraFile)
            mediaIsVideo = false
        }
    }

    fun launchCamera() {
        val dir = File(ctx.cacheDir, "images").apply { mkdirs() }
        val file = File(dir, "shot_${System.currentTimeMillis()}.jpg")
        cameraFile = file
        val uri = FileProvider.getUriForFile(ctx, "dz.absorbs.app.fileprovider", file)
        camera.launch(uri)
    }

    fun publish() {
        val uri = mediaUri
        if (storyMode && uri == null) { error = s.gallery; return }
        if (!storyMode && uri == null && caption.isBlank()) { error = s.whatsNew; return }
        busy = true; error = null
        if (uri == null) {
            Repo.createPost(caption.trim(), null, "image") { err ->
                onMain { busy = false; if (err == null) onDone() else error = err }
            }
            return
        }
        fun runPublish() {
            try {
                if (mediaIsVideo) {
                    val bytes = ctx.contentResolver.openInputStream(uri)?.readBytes()
                    if (bytes == null || bytes.size > 30 * 1024 * 1024) {
                        onMain { busy = false; error = "30MB max" }
                        return
                    }
                    Repo.upload("post-images", bytes, "video/mp4") { url, err ->
                        onMain {
                            if (url == null) { busy = false; error = err }
                            else Repo.createPost(caption.trim(), url, "video") { e2 ->
                                onMain { busy = false; if (e2 == null) onDone() else error = e2 }
                            }
                        }
                    }
                } else {
                    val bytes = processImage(ctx, uri, filter)
                    if (bytes == null) { onMain { busy = false; error = s.errorGeneric }; return }
                    if (storyMode) {
                        Repo.createStory(bytes, "image/jpeg", caption.trim()) { err ->
                            onMain { busy = false; if (err == null) onDone() else error = err }
                        }
                    } else {
                        Repo.uploadPostImage(bytes, "image/jpeg") { url, err ->
                            onMain {
                                if (url == null) { busy = false; error = err }
                                else Repo.createPost(caption.trim(), url, "image") { e2 ->
                                    onMain { busy = false; if (e2 == null) onDone() else error = e2 }
                                }
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                onMain { busy = false; error = e.message ?: s.errorGeneric }
            }
        }
        Thread { runPublish() }.start()
    }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(40.dp).background(MaterialTheme.colorScheme.surface, CircleShape).clickable { onCancel() },
                contentAlignment = Alignment.Center,
            ) { DzIcon(R.drawable.ic_lucide_x, tint = MaterialTheme.colorScheme.onSurface, size = 20.dp) }
            Spacer(Modifier.width(10.dp))
            Text(if (storyMode) s.storyMode else s.createPost, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.weight(1f))
            // mode toggle
            Row(
                Modifier.background(MaterialTheme.colorScheme.surface, RoundedCornerShape(999.dp)).padding(4.dp),
            ) {
                ModeChip(s.postMode, !storyMode) { storyMode = false }
                ModeChip(s.storyMode, storyMode) { storyMode = true }
            }
        }
        Spacer(Modifier.height(16.dp))

        // Media preview / picker
        Box(
            Modifier.fillMaxWidth().height(300.dp).clip(RoundedCornerShape(24.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)),
            contentAlignment = Alignment.Center,
        ) {
            val uri = mediaUri
            if (uri != null && !mediaIsVideo) {
                AsyncImage(
                    model = uri, contentDescription = null, modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Crop, colorFilter = filter.composeFilter(),
                )
            } else if (uri != null) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    DzIcon(R.drawable.ic_lucide_clapperboard, tint = Dz.Teal, size = 44.dp)
                    Spacer(Modifier.height(8.dp))
                    Text("Video ✓", color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Bold)
                }
            } else {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        PickerButton(R.drawable.ic_lucide_image, s.gallery) {
                            gallery.launch(
                                PickVisualMediaRequest(
                                    if (storyMode) ActivityResultContracts.PickVisualMedia.ImageOnly
                                    else ActivityResultContracts.PickVisualMedia.ImageAndVideo
                                )
                            )
                        }
                        if (!storyMode || true) {
                            PickerButton(R.drawable.ic_lucide_camera, s.camera) { launchCamera() }
                        }
                    }
                }
            }
        }

        if (mediaUri != null && !mediaIsVideo) {
            Spacer(Modifier.height(12.dp))
            Text(s.filters, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurface)
            Spacer(Modifier.height(6.dp))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(FILTERS) { f ->
                    val active = f.name == filter.name
                    Box(
                        Modifier.clip(RoundedCornerShape(999.dp))
                            .background(if (active) Dz.primaryBrush() else androidx.compose.ui.graphics.Brush.linearGradient(listOf(MaterialTheme.colorScheme.surface, MaterialTheme.colorScheme.surface)))
                            .clickable { filter = f }
                            .padding(horizontal = 16.dp, vertical = 9.dp),
                    ) {
                        Text(f.name, color = if (active) Color.White else MaterialTheme.colorScheme.onSurface, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }

        Spacer(Modifier.height(14.dp))
        OutlinedTextField(
            value = caption, onValueChange = { caption = it },
            placeholder = { Text(s.addCaption) },
            modifier = Modifier.fillMaxWidth().weight(1f),
            shape = RoundedCornerShape(20.dp), maxLines = 8,
        )
        error?.let {
            Text(it, color = MaterialTheme.colorScheme.error, fontSize = 13.sp, modifier = Modifier.padding(top = 8.dp))
        }
        Spacer(Modifier.height(14.dp))
        GradientButton(if (busy) s.publishing else s.publish, Modifier.fillMaxWidth(), enabled = !busy) { publish() }
    }
}

@Composable
private fun ModeChip(text: String, active: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.clip(RoundedCornerShape(999.dp))
            .then(if (active) Modifier.background(Dz.primaryBrush()) else Modifier)
            .clickable { onClick() }
            .padding(horizontal = 14.dp, vertical = 8.dp),
    ) {
        Text(text, color = if (active) Color.White else MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun PickerButton(icon: Int, label: String, onClick: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.clickable { onClick() },
    ) {
        Box(
            Modifier.size(64.dp).background(Dz.primaryBrush(), CircleShape),
            contentAlignment = Alignment.Center,
        ) { DzIcon(icon, tint = Color.White, size = 28.dp) }
        Spacer(Modifier.height(6.dp))
        Text(label, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)
    }
}
