import { useColorScheme } from 'react-native';

/**
 * Paletă rece, ca hârtia de calc și cadranele contoarelor.
 * Culorile utilităților sunt singurele saturate; restul rămâne neutru.
 */
const light = {
  background: '#ECEFF1',
  surface: '#FFFFFF',
  text: '#172026',
  textMuted: '#5E6A72',
  border: '#D5DBDF',
  accent: '#1E6A73',
  water: '#2475B0',
  electricity: '#B9790A',
  gas: '#C24E26',
  danger: '#B3261E',
  warning: '#A86A00',
  success: '#2D7A3A',
  /** Tamburii contorului */
  drum: '#1B2328',
  drumText: '#F3F5F6',
  drumDecimal: '#B3261E',
};

const dark: typeof light = {
  background: '#0F1417',
  surface: '#182026',
  text: '#E8EDF0',
  textMuted: '#93A1AA',
  border: '#2A353C',
  accent: '#5FB6BF',
  water: '#6CB4E8',
  electricity: '#EDB24A',
  gas: '#F0875E',
  danger: '#F2B8B5',
  warning: '#F0C064',
  success: '#86CE91',
  drum: '#05080A',
  drumText: '#F3F5F6',
  drumDecimal: '#E0584F',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24 } as const;
export const radius = 12;

/** Cifre cu lățime egală — indexurile și sumele se aliniază în coloane. */
export const tabular = { fontVariant: ['tabular-nums' as const] };
