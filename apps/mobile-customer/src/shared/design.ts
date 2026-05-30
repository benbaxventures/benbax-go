export const colors = {
  ink: '#111827',
  muted: '#5B6472',
  canvas: '#F7F8FA',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF2F6',
  primary: '#0E7C66',
  primaryDark: '#075E4D',
  accent: '#FFB020',
  danger: '#D92D20',
  success: '#138A5B',
  info: '#2563EB',
  border: '#D8DEE8'
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32
} as const;

export const radius = {
  sm: 6,
  md: 8,
  lg: 14,
  pill: 999
} as const;

export const typography = {
  family: {
    body: 'Inter, system-ui, sans-serif'
  },
  size: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 28
  }
} as const;
