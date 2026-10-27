import { requireOptionalNativeModule } from 'expo';

export interface OcrRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface OcrElement {
  text: string;
  frame: OcrRect;
}

export interface OcrLine {
  text: string;
  frame: OcrRect;
  elements: OcrElement[];
}

export interface OcrResult {
  width: number;
  height: number;
  lines: OcrLine[];
}

interface CasaMeaNativeModule {
  recognizeText(uri: string, enhance: boolean): Promise<OcrResult>;
  combineImages(files: string[], labels: string[]): Promise<string>;
  saveToGallery(file: string, album: string, name: string): Promise<boolean>;
  isWhatsAppInstalled(): boolean;
  shareToWhatsApp(phone: string, text: string, files: string[]): boolean;
}

/** null în medii fără modulul nativ (teste, web) */
const native = requireOptionalNativeModule<CasaMeaNativeModule>('CasaMeaNative');

export function isNativeAvailable(): boolean {
  return native !== null;
}

/** `enhance`: citește o variantă alb-negru cu contrast mărit (poze întunecate). */
export async function recognizeText(uri: string, enhance = false): Promise<OcrResult> {
  if (!native) throw new Error('Recunoașterea textului nu e disponibilă pe acest dispozitiv.');
  return native.recognizeText(uri, enhance);
}

/** Pozele una sub alta, cu etichete, într-un singur JPEG (file://). */
export async function combineImages(files: string[], labels: string[]): Promise<string | null> {
  if (!native) return null;
  return native.combineImages(files, labels);
}

/** Copie în Galerie, albumul `album`. false dacă nu se poate (Android < 10, fără modul). */
export async function saveToGallery(file: string, album: string, name: string): Promise<boolean> {
  if (!native) return false;
  return native.saveToGallery(file, album, name);
}

export function isWhatsAppInstalled(): boolean {
  return native?.isWhatsAppInstalled() ?? false;
}

export function shareToWhatsApp(phone: string, text: string, files: string[]): boolean {
  return native?.shareToWhatsApp(phone, text, files) ?? false;
}
