import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

/**
 * Face o poză contorului și o copiază în directorul permanent al aplicației
 * (pozele din cache pot fi șterse de sistem). Returnează URI-ul sau null.
 */
export async function takeMeterPhoto(prefix: string, crop = false): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;

  // Cu decupare: încadrezi doar cifrele, iar recunoașterea e mult mai sigură
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: crop });
  if (result.canceled || !result.assets?.[0]) return null;
  return persistPhoto(result.assets[0].uri, prefix);
}

/** Copiază o poză din cache în directorul permanent al aplicației. */
export async function persistPhoto(uri: string, prefix: string): Promise<string> {
  const dir = new Directory(Paths.document, 'photos');
  dir.create({ idempotent: true });
  const dest = new File(dir, `${prefix}-${Date.now()}.jpg`);
  await new File(uri).copy(dest);
  return dest.uri;
}

export function deletePhoto(uri: string | null): void {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // poza lipsă nu e o problemă
  }
}
