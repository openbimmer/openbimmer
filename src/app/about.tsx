import * as WebBrowser from 'expo-web-browser';
import { Text, View } from 'react-native';

import { Logo } from '@/components/logo';
import { Screen } from '@/components/screen';
import { Card, Group, Row, SectionTitle } from '@/components/ui';
import { PRIVACY_URL, REPO_URL } from '@/lib/links';
import { colors, space, type } from '@/theme';

const LIBRARIES = ['Expo', 'React Native', 'react-native-ble-plx', 'react-native-svg', 'Reanimated', 'zustand', 'Inter', 'Barlow'];

export default function About() {
  return (
    <Screen>
      <View style={{ alignItems: 'center', gap: space.md, marginTop: space.lg, marginBottom: space.md }}>
        <Logo size={76} />
        <Text style={[type.title, { color: colors.text }]}>OpenBimmer</Text>
        <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center' }]}>
          A free, open-source dashboard, data logger and diagnostics app for BMW turbo engines.
        </Text>
      </View>

      <SectionTitle title="What it does" />
      <Card>
        <Text style={[type.body, { color: colors.textSecondary }]}>
          OpenBimmer reads standardised OBD-II data (SAE J1979) from the engine computer through an ELM327 Bluetooth LE adapter: live
          values, fault codes and readiness monitors. It only reads data and clears fault codes on request. It does not change the
          software of your car.
        </Text>
      </Card>

      <SectionTitle title="Disclaimer" />
      <Card style={{ gap: space.sm }}>
        <Text style={[type.body, { color: colors.textSecondary }]}>
          Use at your own risk. The software is provided as is, without warranty of any kind. Estimated values like torque and power are
          calculated from what the engine computer reports and are not dyno results.
        </Text>
        <Text style={[type.body, { color: colors.textSecondary }]}>
          Never operate the app while driving. Performance measurements belong on closed roads or race tracks.
        </Text>
        <Text style={[type.body, { color: colors.textSecondary }]}>
          OpenBimmer is an independent community project. It is not affiliated with, endorsed by or connected to BMW AG or any tuning
          company. BMW and the engine designations are trademarks of their owners and are used only to describe compatibility.
        </Text>
      </Card>

      <SectionTitle title="Privacy" />
      <Card>
        <Text style={[type.body, { color: colors.textSecondary }]}>
          No account, no analytics, no ads. Logs, results and settings stay on your phone until you share them yourself. Location is only
          used while the performance timer is open with GPS selected.
        </Text>
      </Card>

      <Group style={{ marginTop: space.sm }}>
        <Row icon="lock" title="Full privacy policy" chevron onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)} last />
      </Group>

      <SectionTitle title="Open source" />
      <Group>
        <Row icon="code" title="github.com/openbimmer" subtitle="MIT license. Contributions welcome." chevron onPress={() => WebBrowser.openBrowserAsync(REPO_URL)} last />
      </Group>
      <Text style={[type.caption, { color: colors.textTertiary, marginTop: space.md, paddingHorizontal: 4 }]}>
        Built with {LIBRARIES.join(', ')}.
      </Text>
    </Screen>
  );
}
