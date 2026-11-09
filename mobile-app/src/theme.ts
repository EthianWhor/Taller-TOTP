import { Platform } from 'react-native';

export const colors = {
  brand: '#0B3D91',
  brandDark: '#072A63',
  brandSoft: '#E8EEF9',
  background: '#F3F5F9',
  surface: '#FFFFFF',
  text: '#1B1F29',
  muted: '#5B6475',
  border: '#D9DFEA',
  success: '#0F7B4B',
  successSoft: '#E6F4EC',
  warning: '#B54708',
  warningSoft: '#FEF0E6',
  danger: '#B42318',
  dangerSoft: '#FEF3F2',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16 } as const;

/** Tipografía monoespaciada para los códigos TOTP. */
export const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
