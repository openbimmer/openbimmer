import { SymbolView, type SymbolWeight } from 'expo-symbols';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

import { icons, type IconName } from './icon-names';

type Props = {
  name: IconName;
  size?: number;
  color: ColorValue;
  weight?: SymbolWeight;
  style?: StyleProp<ViewStyle>;
};

export function Icon({ name, size = 22, color, weight = 'semibold', style }: Props) {
  return <SymbolView name={icons[name].ios as never} size={size} tintColor={color} weight={weight} style={style} />;
}
