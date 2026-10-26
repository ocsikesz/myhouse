import { useColorScheme } from 'react-native';

const light = {
  background: '#F6F5F2',
  surface: '#FFFFFF',
  text: '#1C1B19',
  textMuted: '#6B6862',
  border: '#E3E0DA',
  accent: '#2F6F5E',
  water: '#2E7DB5',
  electricity: '#C98A1A',
  gas: '#C2552D',
  danger: '#B3261E',
  success: '#2E7D32',
};

const dark: typeof light = {
  background: '#121211',
  surface: '#1E1D1B',
  text: '#F2F0EC',
  textMuted: '#A29E97',
  border: '#33312D',
  accent: '#6BB8A1',
  water: '#6FB3E6',
  electricity: '#E8B04A',
  gas: '#E8835C',
  danger: '#F2B8B5',
  success: '#81C784',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24 } as const;
export const radius = 12;
