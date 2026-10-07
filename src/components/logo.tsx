import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme';

export function Logo({ size = 64, framed = true }: { size?: number; framed?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {framed ? <Rect x={0} y={0} width={100} height={100} rx={26} fill={colors.surfaceRaised} /> : null}
      <Path
        d="M 27.4 72.6 A 32 32 0 1 1 72.6 72.6"
        stroke={framed ? '#2A3038' : colors.track}
        strokeWidth={9}
        strokeLinecap="round"
        fill="none"
      />
      <Path d="M 27.4 72.6 A 32 32 0 0 1 66 22.3" stroke={colors.accent} strokeWidth={9} strokeLinecap="round" fill="none" />
      <Line x1={50} y1={50} x2={63} y2={27.5} stroke={colors.text} strokeWidth={5} strokeLinecap="round" />
      <Circle cx={50} cy={50} r={6} fill={colors.text} />
    </Svg>
  );
}
