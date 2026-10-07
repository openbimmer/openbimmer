import * as WebBrowser from 'expo-web-browser';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Card, Group, Label, Notice, Row, SectionTitle } from '@/components/ui';
import { colors, space, type } from '@/theme';

const ADAPTERS = [
  { name: 'Vgate iCar Pro BLE 4.0', note: 'Compact, low standby current, widely available.', query: 'Vgate iCar Pro BLE 4.0' },
  { name: 'Veepeak OBDCheck BLE / BLE+', note: 'Bluetooth LE ELM327 compatible.', query: 'Veepeak OBDCheck BLE' },
  { name: 'vLinker MC+ / FS (BLE models)', note: 'Fast firmware with good multi-request support.', query: 'vLinker BLE OBD' },
  { name: 'OBDLink CX', note: 'Bluetooth LE adapter designed for BMW owners.', query: 'OBDLink CX' },
];

function amazon(query: string) {
  return `https://www.amazon.de/s?k=${encodeURIComponent(query)}`;
}

export default function Adapters() {
  return (
    <Screen underHeader>
      <View style={{ gap: space.sm, marginTop: space.md }}>
        <Text style={[type.title, { color: colors.text, fontSize: 26 }]}>Which adapter do I need?</Text>
        <Text style={[type.body, { color: colors.textSecondary }]}>
          OpenBimmer talks to any ELM327 compatible adapter that uses Bluetooth LE (Bluetooth 4.0 or newer). These work on iPhone and
          Android and cost between 20 and 80 euros.
        </Text>
      </View>

      <SectionTitle title="Bluetooth LE adapters" />
      <Group>
        {ADAPTERS.map((a, i) => (
          <Row
            key={a.name}
            icon="antenna"
            iconTint={colors.accentStrong}
            title={a.name}
            subtitle={a.note}
            chevron
            onPress={() => WebBrowser.openBrowserAsync(amazon(a.query))}
            last={i === ADAPTERS.length - 1}
          />
        ))}
      </Group>
      <Text style={[type.caption, styles.foot]}>Links open an Amazon search. OpenBimmer has no affiliation with any seller.</Text>

      <SectionTitle title="Good to know" />
      <View style={{ gap: space.sm }}>
        <Notice
          tone="warn"
          title="iPhone needs Bluetooth LE"
          body="Cheap blue 'ELM327 v1.5' boxes use classic Bluetooth. iOS does not allow apps to use those, so they will not show up on an iPhone."
        />
        <Notice
          title="Clones can be slow"
          body="Some very cheap clones do not support several values per request. OpenBimmer detects this and falls back to single requests, which lowers the update rate."
        />
      </View>

      <SectionTitle title="Where is the OBD port?" />
      <Card style={{ gap: space.sm }}>
        <Label>All supported BMW models</Label>
        <Text style={[type.body, { color: colors.textSecondary }]}>
          In the driver footwell, to the left of the steering column, usually behind a small cover. Plug the adapter in, switch the
          ignition on, then connect from the Garage tab.
        </Text>
        <Text style={[type.body, { color: colors.textSecondary }]}>
          Most adapters draw a little power while plugged in. Unplug it if the car stands for more than a few days.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  foot: { color: colors.textTertiary, marginTop: space.sm, paddingHorizontal: 4 },
});
