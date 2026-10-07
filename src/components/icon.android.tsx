import { MaterialSymbols_400Regular_Filled } from '@expo-google-fonts/material-symbols/400Regular_Filled';
import { MaterialSymbols_500Medium } from '@expo-google-fonts/material-symbols/500Medium';
import { SymbolView, type SymbolWeight } from 'expo-symbols';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

import { filledOnAndroid, icons, type IconName } from './icon-names';

const filled = { name: 'MaterialSymbols_400Regular_Filled', font: MaterialSymbols_400Regular_Filled };
const medium = { name: 'MaterialSymbols_500Medium', font: MaterialSymbols_500Medium };

export const androidIconFonts = {
  [filled.name]: filled.font,
  [medium.name]: medium.font,
};

type Props = {
  name: IconName;
  size?: number;
  color: ColorValue;
  weight?: SymbolWeight;
  style?: StyleProp<ViewStyle>;
};

export function Icon({ name, size = 22, color, style }: Props) {
  const weight = filledOnAndroid[name] ? filled : medium;
  return (
    <SymbolView
      name={{ android: icons[name].android as never }}
      size={size}
      tintColor={color}
      weight={{ ios: 'regular', android: weight }}
      style={style}
    />
  );
}
