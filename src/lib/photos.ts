import { saveToGallery } from 'casamea-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getSetting } from '@/db/repo';

import { DEVICE } from './settingsKeys';

/** Albumul din Galerie în care copiem pozele contoarelor */
export const GALLERY_ALBUM = 'Indexa';
/** Marcaj în numele pozelor alese din galerie (sunt deja acolo, nu le mai copiem) */
const FROM_GALLERY = '-gal-';

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

/**
 * Alege o poză din galerie (selectorul de poze al sistemului, fără permisiuni)
 * și o copiază în directorul permanent al aplicației. Returnează URI-ul sau null.
 */
export async function pickMeterPhoto(prefix: string): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (result.canceled || !result.assets?.[0]) return null;
  return persistPhoto(result.assets[0].uri, `${prefix}${FROM_GALLERY}`);
}

/** Text simplu pentru nume de fișier: „Bucătărie” → „Bucatarie” */
function fileSafe(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Copiază poza unei citiri în Galerie, albumul Indexa (dacă nu e oprit pe telefonul
 * ăsta și dacă poza nu vine chiar din galerie). Nu aruncă erori: e doar o copie.
 */
export async function copyToGallery(db: SQLiteDatabase, uri: string | null, label: string, date: string): Promise<void> {
  if (!uri || uri.includes(FROM_GALLERY)) return;
  try {
    if ((await getSetting(db, DEVICE.saveToGallery)) === '0') return;
    await saveToGallery(uri, GALLERY_ALBUM, `Indexa_${fileSafe(label)}_${date}_${Date.now() % 100000}.jpg`);
  } catch {
    // galeria e opțională
  }
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
