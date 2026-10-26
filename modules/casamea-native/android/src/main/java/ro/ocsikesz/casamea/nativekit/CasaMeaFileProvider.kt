package ro.ocsikesz.casamea.nativekit

import androidx.core.content.FileProvider

/** Subclasă proprie, ca să nu intre în conflict cu alte FileProvider-e din manifest. */
class CasaMeaFileProvider : FileProvider()
