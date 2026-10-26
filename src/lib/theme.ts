import { useColorScheme } from 'react-native';

/**
 * Paletă caldă, ca hârtia unui carnet de casă: fond crem, cerneală închisă,
 * accent verde-brad. Culorile utilităților sunt singurele saturate și apar
 * mereu și ca nuanță deschisă (fundalul iconițelor și al etichetelor).
 */
const light = {
  background: '#F4F1EB',
  surface: '#FFFFFF',
  /** Suprafață secundară: câmpuri, rânduri evidențiate */
  surfaceAlt: '#F0ECE4',
  text: '#1D1C1A',
  textMuted: '#6E695F',
  border: '#E4DED3',
  accent: '#2F6F5E',
  /** Text pe accent */
  onAccent: '#FFFFFF',
  water: '#2672B8',
  electricity: '#C2870E',
  gas: '#CF5427',
  association: '#7457A8',
  danger: '#B3261E',
  warning: '#A86A00',
  success: '#2D7A3A',
  whatsapp: '#1FA855',
  /** Tamburii contorului */
  drum: '#1B2328',
  drumText: '#F3F5F6',
  drumDecimal: '#B3261E',
  /** Fundalul cardului principal de pe Acasă */
  hero: '#2F6F5E',
  heroText: '#FFFFFF',
  heroMuted: '#CFE3DC',
};

const dark: typeof light = {
  background: '#111312',
  surface: '#1A1D1B',
  surfaceAlt: '#222623',
  text: '#ECEAE4',
  textMuted: '#9E9A91',
  border: '#2B302C',
  accent: '#7CC4AB',
  onAccent: '#0E1F19',
  water: '#6CB4E8',
  electricity: '#EDB24A',
  gas: '#F0875E',
  association: '#B79BE6',
  danger: '#F2B8B5',
  warning: '#F0C064',
  success: '#86CE91',
  whatsapp: '#4ED583',
  drum: '#05080A',
  drumText: '#F3F5F6',
  drumDecimal: '#E0584F',
  hero: '#1F3D34',
  heroText: '#ECEAE4',
  heroMuted: '#9FC4B6',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Aceeași culoare, transparentă: '#2672B8' + 0.12 → '#2672B81F' */
export function tint(color: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${color}${a}`;
}

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24 } as const;
export const radius = 16;

/** Cifre cu lățime egală — indexurile și sumele se aliniază în coloane. */
export const tabular = { fontVariant: ['tabular-nums' as const] };
