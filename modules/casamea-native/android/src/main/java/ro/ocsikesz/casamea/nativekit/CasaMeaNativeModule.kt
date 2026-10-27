package ro.ocsikesz.casamea.nativekit

import android.content.ClipData
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import androidx.exifinterface.media.ExifInterface
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream

class CasaMeaNativeModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun rect(r: Rect?): Map<String, Int> =
    if (r == null) mapOf("left" to 0, "top" to 0, "right" to 0, "bottom" to 0)
    else mapOf("left" to r.left, "top" to r.top, "right" to r.right, "bottom" to r.bottom)

  private fun open(uri: String): InputStream? {
    val u = Uri.parse(uri)
    return if (u.scheme == null || u.scheme == "file") File(u.path ?: uri).inputStream() else context.contentResolver.openInputStream(u)
  }

  /** Poza ca Bitmap, rotită după EXIF și micșorată ca latura mare să fie ≤ maxSide. */
  private fun loadUpright(uri: String, maxSide: Int): Bitmap {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    open(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxSide) sample *= 2
    val opts = BitmapFactory.Options().apply { inSampleSize = sample }
    val raw = open(uri)?.use { BitmapFactory.decodeStream(it, null, opts) }
      ?: throw IllegalArgumentException("Poza nu a putut fi citită")
    val orientation = try {
      open(uri)?.use { ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL) }
        ?: ExifInterface.ORIENTATION_NORMAL
    } catch (e: Exception) {
      ExifInterface.ORIENTATION_NORMAL
    }
    val m = Matrix()
    when (orientation) {
      ExifInterface.ORIENTATION_ROTATE_90 -> m.postRotate(90f)
      ExifInterface.ORIENTATION_ROTATE_180 -> m.postRotate(180f)
      ExifInterface.ORIENTATION_ROTATE_270 -> m.postRotate(270f)
      else -> {}
    }
    val scale = maxSide.toFloat() / maxOf(raw.width, raw.height)
    if (scale < 1f) m.postScale(scale, scale)
    if (m.isIdentity) return raw
    val out = Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, m, true)
    if (out !== raw) raw.recycle()
    return out
  }

  /** Alb-negru cu contrast întins (2%–98% din luminozitate): cifrele ies mai bine pe poze întunecate. */
  private fun boostContrast(src: Bitmap): Bitmap {
    val gray = Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888)
    Canvas(gray).drawBitmap(src, 0f, 0f, Paint().apply { colorFilter = ColorMatrixColorFilter(ColorMatrix().apply { setSaturation(0f) }) })
    val px = IntArray(gray.width * gray.height)
    gray.getPixels(px, 0, gray.width, 0, 0, gray.width, gray.height)
    val hist = IntArray(256)
    for (p in px) hist[p and 0xFF]++
    var lo = 0
    var hi = 255
    var acc = 0
    val cut = px.size / 50
    while (lo < 255 && acc + hist[lo] < cut) { acc += hist[lo]; lo++ }
    acc = 0
    while (hi > 0 && acc + hist[hi] < cut) { acc += hist[hi]; hi-- }
    val range = maxOf(1, hi - lo)
    for (i in px.indices) {
      val v = (((px[i] and 0xFF) - lo) * 255 / range).coerceIn(0, 255)
      px[i] = Color.rgb(v, v, v)
    }
    gray.setPixels(px, 0, gray.width, 0, 0, gray.width, gray.height)
    return gray
  }

  private fun runOcr(image: InputImage, width: Int, height: Int, promise: Promise) {
    val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    recognizer.process(image)
      .addOnSuccessListener { text ->
        val lines = ArrayList<Map<String, Any>>()
        for (block in text.textBlocks) {
          for (line in block.lines) {
            val elements = ArrayList<Map<String, Any>>()
            for (el in line.elements) {
              elements.add(mapOf("text" to el.text, "frame" to rect(el.boundingBox)))
            }
            lines.add(mapOf("text" to line.text, "frame" to rect(line.boundingBox), "elements" to elements))
          }
        }
        recognizer.close()
        promise.resolve(mapOf("width" to width, "height" to height, "lines" to lines))
      }
      .addOnFailureListener { e ->
        recognizer.close()
        promise.reject(CodedException("OCR_FAILED", e.message ?: "Recunoașterea textului a eșuat", e))
      }
  }

  private fun installedWhatsApp(pm: PackageManager): String? {
    for (pkg in listOf("com.whatsapp", "com.whatsapp.w4b")) {
      try {
        @Suppress("DEPRECATION")
        pm.getPackageInfo(pkg, 0)
        return pkg
      } catch (e: PackageManager.NameNotFoundException) {
        // încercăm următorul
      }
    }
    return null
  }

  override fun definition() = ModuleDefinition {
    Name("CasaMeaNative")

    /**
     * OCR pe o poză (file:// sau content://): rânduri și cuvinte cu poziția lor în imagine.
     * Cu `enhance`, citește o variantă alb-negru cu contrast întins (pentru poze întunecate).
     */
    AsyncFunction("recognizeText") { uri: String, enhance: Boolean, promise: Promise ->
      try {
        if (enhance) {
          val upright = loadUpright(uri, 2000)
          val boosted = boostContrast(upright)
          upright.recycle()
          runOcr(InputImage.fromBitmap(boosted, 0), boosted.width, boosted.height, promise)
        } else {
          val image = InputImage.fromFilePath(context, Uri.parse(uri))
          runOcr(image, image.width, image.height, promise)
        }
      } catch (e: Exception) {
        promise.reject(CodedException("OCR_FAILED", e.message ?: "Poza nu a putut fi citită", e))
      }
    }

    /**
     * Lipește pozele una sub alta, fiecare cu eticheta deasupra, într-un singur JPEG
     * (WhatsApp trimite fiecare poză ca mesaj separat; așa pleacă un singur mesaj).
     */
    AsyncFunction("combineImages") { files: List<String>, labels: List<String>, promise: Promise ->
      try {
        val width = 1080
        val labelH = 96
        val gap = 12
        val parts = files.map { f ->
          val b = loadUpright(f, 1600)
          val h = (b.height * (width.toFloat() / b.width)).toInt()
          val scaled = Bitmap.createScaledBitmap(b, width, h, true)
          if (scaled !== b) b.recycle()
          scaled
        }
        val total = parts.sumOf { it.height + labelH } + gap * (parts.size - 1).coerceAtLeast(0)
        val out = Bitmap.createBitmap(width, total, Bitmap.Config.RGB_565)
        val canvas = Canvas(out)
        canvas.drawColor(Color.WHITE)
        val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
          color = Color.rgb(29, 28, 26)
          textSize = 52f
          typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        var y = 0
        parts.forEachIndexed { i, b ->
          canvas.drawText(labels.getOrElse(i) { "" }, 32f, y + labelH * 0.68f, text)
          y += labelH
          canvas.drawBitmap(b, 0f, y.toFloat(), null)
          y += b.height + gap
          b.recycle()
        }
        val dir = File(context.cacheDir, "share").apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() }
        val file = File(dir, "indexa-${System.currentTimeMillis()}.jpg")
        FileOutputStream(file).use { out.compress(Bitmap.CompressFormat.JPEG, 85, it) }
        out.recycle()
        promise.resolve(Uri.fromFile(file).toString())
      } catch (e: Exception) {
        promise.reject(CodedException("COMBINE_FAILED", e.message ?: "Pozele nu au putut fi combinate", e))
      }
    }

    /**
     * Copiază o poză în Galerie, în albumul dat (Pictures/<album>). Android 10+ nu cere
     * nicio permisiune pentru asta; pe versiuni mai vechi întoarce false.
     */
    AsyncFunction("saveToGallery") { file: String, album: String, name: String, promise: Promise ->
      try {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
          promise.resolve(false)
          return@AsyncFunction
        }
        val resolver = context.contentResolver
        val values = ContentValues().apply {
          put(MediaStore.Images.Media.DISPLAY_NAME, name)
          put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
          put(MediaStore.Images.Media.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/$album")
          put(MediaStore.Images.Media.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
        if (uri == null) {
          promise.resolve(false)
          return@AsyncFunction
        }
        resolver.openOutputStream(uri)?.use { out -> open(file)?.use { it.copyTo(out) } }
        values.clear()
        values.put(MediaStore.Images.Media.IS_PENDING, 0)
        resolver.update(uri, values, null, null)
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject(CodedException("GALLERY_FAILED", e.message ?: "Poza nu a putut fi salvată în galerie", e))
      }
    }

    Function("isWhatsAppInstalled") {
      installedWhatsApp(context.packageManager) != null
    }

    /**
     * Deschide WhatsApp cu textul și pozele atașate. Cu număr de telefon, merge direct
     * în conversația respectivă (dacă WhatsApp o acceptă); altfel alegi tu contactul.
     */
    Function("shareToWhatsApp") { phone: String, text: String, files: List<String> ->
      val ctx = context
      val pkg = installedWhatsApp(ctx.packageManager)
      if (pkg == null) {
        false
      } else {
        val authority = "${ctx.packageName}.casamea.fileprovider"
        val uris = ArrayList<Uri>()
        for (f in files) {
          val path = Uri.parse(f).path ?: continue
          val file = File(path)
          if (file.exists()) uris.add(FileProvider.getUriForFile(ctx, authority, file))
        }
        val intent = Intent(if (uris.size > 1) Intent.ACTION_SEND_MULTIPLE else Intent.ACTION_SEND)
        intent.setPackage(pkg)
        intent.putExtra(Intent.EXTRA_TEXT, text)
        if (phone.isNotEmpty()) intent.putExtra("jid", "$phone@s.whatsapp.net")
        when {
          uris.isEmpty() -> intent.type = "text/plain"
          uris.size == 1 -> {
            intent.type = "image/jpeg"
            intent.putExtra(Intent.EXTRA_STREAM, uris[0])
            intent.clipData = ClipData.newRawUri("", uris[0])
          }
          else -> {
            intent.type = "image/jpeg"
            intent.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
            val clip = ClipData.newRawUri("", uris[0])
            for (i in 1 until uris.size) clip.addItem(ClipData.Item(uris[i]))
            intent.clipData = clip
          }
        }
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        val activity = appContext.currentActivity
        if (activity != null) {
          activity.startActivity(intent)
        } else {
          intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          ctx.startActivity(intent)
        }
        true
      }
    }
  }
}
