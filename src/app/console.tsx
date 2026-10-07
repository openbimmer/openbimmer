import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Platform, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/ui';
import type { CommandLog } from '@/obd/elm327';
import { session, useConnection } from '@/obd/session';
import { colors, space, type } from '@/theme';

function time(at: number) {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

export default function Console() {
  const insets = useSafeAreaInsets();
  const status = useConnection((s) => s.status);
  const adapter = useConnection((s) => s.adapter);
  const [entries, setEntries] = useState<CommandLog[]>(() => session.consoleLog());

  useEffect(() => {
    const timer = setInterval(() => setEntries(session.consoleLog()), 600);
    return () => clearInterval(timer);
  }, []);

  const share = () => {
    const text = [
      `OpenBimmer adapter console`,
      `Adapter: ${adapter ? `${adapter.name} ${adapter.version} ${adapter.protocolName}` : 'none'}`,
      '',
      ...entries.map((e) => `${time(e.at)} ${e.dir === 'tx' ? '>' : '<'} ${e.text}`),
    ].join('\n');
    Share.share({ message: text });
  };

  const data = [...entries].reverse();

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          headerRight: () => <IconButton icon="share" label="Share console log" onPress={share} size={34} background="transparent" />,
        }}
      />
      <FlatList
        data={data}
        keyExtractor={(item, index) => `${item.at}-${index}`}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + space.xl, paddingTop: Platform.OS === 'android' ? space.md : 0 }}
        ListHeaderComponent={
          <Text style={[type.caption, { color: colors.textTertiary, marginBottom: space.md }]}>
            {status === 'connected' ? 'Newest first. The last 300 lines are kept.' : 'Connect an adapter to see the traffic between the app and the ELM327.'}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.line}>
            <Text style={[type.mono, styles.time]}>{time(item.at)}</Text>
            <Text style={[type.mono, { color: item.dir === 'tx' ? colors.accentStrong : colors.textSecondary, flex: 1 }]} selectable>
              {item.dir === 'tx' ? '› ' : '‹ '}
              {item.text || '(empty)'}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  line: { flexDirection: 'row', gap: space.md, paddingVertical: 3 },
  time: { color: colors.textTertiary, fontSize: 12, width: 86 },
});
