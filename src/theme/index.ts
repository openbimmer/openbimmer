import type { TextStyle } from 'react-native';

export const colors = {
  background: '#07080A',
  surface: '#0F1114',
  surfaceRaised: '#16191D',
  surfacePressed: '#1D2126',
  border: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.12)',
  text: '#F2F4F6',
  textSecondary: '#959CA6',
  textTertiary: '#5C636D',
  accent: '#3D7BFF',
  accentStrong: '#5B8FFF',
  accentSoft: 'rgba(61,123,255,0.14)',
  good: '#2ED47A',
  goodSoft: 'rgba(46,212,122,0.14)',
  warn: '#FFB020',
  warnSoft: 'rgba(255,176,32,0.14)',
  danger: '#FF4D4D',
  dangerSoft: 'rgba(255,77,77,0.14)',
  track: '#1A1E23',
  scrim: 'rgba(0,0,0,0.6)',
} as const;

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  numMedium: 'BarlowSemiCondensed_500Medium',
  numSemibold: 'BarlowSemiCondensed_600SemiBold',
  numBold: 'BarlowSemiCondensed_700Bold',
} as const;

export const radius = { sm: 10, md: 14, lg: 20, xl: 26, pill: 999 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 } as const;

const tabular: TextStyle['fontVariant'] = ['tabular-nums'];

export const type = {
  hero: { fontFamily: fonts.numBold, fontSize: 76, lineHeight: 80, letterSpacing: -1, fontVariant: tabular },
  display: { fontFamily: fonts.numBold, fontSize: 44, lineHeight: 48, letterSpacing: -0.5, fontVariant: tabular },
  value: { fontFamily: fonts.numSemibold, fontSize: 30, lineHeight: 34, fontVariant: tabular },
  valueSmall: { fontFamily: fonts.numSemibold, fontSize: 22, lineHeight: 26, fontVariant: tabular },
  title: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 36, letterSpacing: -0.8 },
  headline: { fontFamily: fonts.semibold, fontSize: 19, lineHeight: 24, letterSpacing: -0.3 },
  body: { fontFamily: fonts.regular, fontSize: 15.5, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15.5, lineHeight: 22 },
  callout: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19 },
  caption: { fontFamily: fonts.medium, fontSize: 12.5, lineHeight: 16 },
  label: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 1.1, textTransform: 'uppercase' },
  mono: { fontFamily: fonts.numMedium, fontSize: 14, lineHeight: 18, letterSpacing: 0.3, fontVariant: tabular },
} satisfies Record<string, TextStyle>;
