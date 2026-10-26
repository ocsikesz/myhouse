package ro.ocsikesz.casamea.nativekit

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Rect
import android.net.Uri
import androidx.core.content.FileProvider
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class CasaMeaNativeModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun rect(r: Rect?): Map<String, Int> =
    if (r == null) mapOf("left" to 0, "top" to 0, "right" to 0, "bottom" to 0)
    else mapOf("left" to r.left, "top" to r.top, "right" to r.right, "bottom" to r.bottom)

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

    /** OCR pe o poză (file:// sau content://): rânduri și cuvinte cu poziția lor în imagine. */
    AsyncFunction("recognizeText") { uri: String, promise: Promise ->
      try {
        val image = InputImage.fromFilePath(context, Uri.parse(uri))
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
            promise.resolve(mapOf("width" to image.width, "height" to image.height, "lines" to lines))
          }
          .addOnFailureListener { e ->
            recognizer.close()
            promise.reject(CodedException("OCR_FAILED", e.message ?: "Recunoașterea textului a eșuat", e))
          }
      } catch (e: Exception) {
        promise.reject(CodedException("OCR_FAILED", e.message ?: "Poza nu a putut fi citită", e))
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
