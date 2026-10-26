import { Linking } from 'react-native';

/**
 * Deschide conversația WhatsApp cu mesajul precompletat.
 * Returnează false dacă WhatsApp nu poate fi deschis.
 */
export async function openWhatsApp(phone: string, message: string): Promise<boolean> {
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
