import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Icon } from '@/components/icon';
import { PressableScale } from '@/components/pressable-scale';
import { RecordButton } from '@/components/record-button';
import { Header, Screen } from '@/components/screen';
import { Button, Card, EmptyState, Group, Label, Notice, Row, SectionTitle, tap } from '@/components/ui';
import { ENGINE_MAP } from '@/data/engines';
import { convertChannel, formatDuration, formatNumber, type Units } from '@/lib/units';
import { CHANNEL_MAP, CHANNELS, channelSupported, type ChannelId } from '@/obd/pids';
import { useConnection } from '@/obd/session';
import { deleteLog, formatLogDate, type LogMeta, logSampleRate, renameLog, useLogs, useRecording } from '@/store/logs';
import { DEFAULT_LOG_CHANNELS, useSettings } from '@/store/settings';
import { colors, fonts, radius, space, type } from '@/theme';

function confirmDelete(log: LogMeta) {
  Alert.alert('Delete log?', `"${log.name}" will be removed from this phone. This cannot be undone.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => deleteLog(log.id) },
  ]);
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[type.label, { color: colors.textTertiary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        {label}
      </Text>
      <View style={styles.statValue}>
        <Text style={[type.valueSmall, { color: value === '–' ? colors.textTertiary : colors.text }]} numberOfLines={1}>
          {value}
        </Text>
        {unit && value !== '–' ? <Text style={[type.caption, { color: colors.textSecondary }]}>{unit}</Text> : null}
      </View>
    </View>
  );
}

function peak(log: LogMeta, id: ChannelId, units: Units) {
  const raw = log.peaks[id];
  if (raw === undefined) return { value: '–', unit: undefined };
  const c = convertChannel(CHANNEL_MAP[id], raw, units);
  return { value: formatNumber(c.value, c.decimals), unit: c.unit };
}

function LogCard({ log, units, onLongPress }: { log: LogMeta; units: Units; onLongPress: () => void }) {
  const boost = peak(log, 'boost', units);
  const rpm = peak(log, 'rpm', units);
  const engine = log.engineId ? ENGINE_MAP[log.engineId]?.code : null;
  const meta = [formatLogDate(log.startedAt, true), engine, `${log.channels.length} channels`].filter(Boolean).join(' · ');
  return (
    <PressableScale
      onPress={() => {
        tap();
        router.push(`/log/${log.id}`);
      }}
      onLongPress={onLongPress}
      delayLongPress={350}
      scaleTo={0.98}
      accessibilityRole="button"
      accessibilityLabel={`${log.name}, ${formatDuration(log.duration)}`}
      accessibilityHint="Opens the log. Long press to rename or delete."
      style={styles.logCard}>
      <View style={styles.logHead}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.bodyStrong, { color: colors.text }]} numberOfLines={1}>
            {log.name}
          </Text>
          <Text style={[type.caption, { color: colors.textSecondary }]} numberOfLines={1}>
            {meta}
          </Text>
        </View>
        <Icon name="chevronRight" size={13} color={colors.textTertiary} />
      </View>
      <View style={styles.stats}>
        <Stat label="Duration" value={formatDuration(log.duration)} />
        <Stat label="Rate" value={formatNumber(logSampleRate(log), 1)} unit="Hz" />
        <Stat label="Peak boost" value={boost.value} unit={boost.unit} />
        <Stat label="Max RPM" value={rpm.value} />
      </View>
    </PressableScale>
  );
}

function RenameModal({ log, onClose }: { log: LogMeta | null; onClose: () => void }) {
  const [name, setName] = useState('');
  const [forId, setForId] = useState<string | null>(null);
  if (log && forId !== log.id) {
    setForId(log.id);
    setName(log.name);
  }
  const save = () => {
    if (log && name.trim()) renameLog(log.id, name);
    onClose();
  };
  return (
    <Modal visible={!!log} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Cancel" />
        <View style={styles.modalCard}>
          <Text style={[type.headline, { color: colors.text }]}>Rename log</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            autoFocus
            selectTextOnFocus
            maxLength={80}
            returnKeyType="done"
            onSubmitEditing={save}
            placeholder="Log name"
            placeholderTextColor={colors.textTertiary}
            selectionColor={colors.accent}
            keyboardAppearance="dark"
            style={styles.input}
          />
          <View style={styles.modalActions}>
            <Button title="Cancel" variant="secondary" compact onPress={onClose} style={{ flex: 1 }} />
            <Button title="Save" compact onPress={save} disabled={!name.trim()} style={{ flex: 1 }} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ChannelPicker({ supported, recording }: { supported: Set<number>; recording: boolean }) {
  const selected = useSettings((s) => s.logChannels);
  const setLogChannels = useSettings((s) => s.setLogChannels);
  const available = useMemo(() => CHANNELS.filter((c) => channelSupported(c, supported)), [supported]);
  const set = new Set(selected);

  const toggle = (id: ChannelId, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setLogChannels(CHANNELS.map((c) => c.id).filter((c) => next.has(c)));
  };

  const count = available.filter((c) => set.has(c.id)).length;

  return (
    <View style={{ gap: space.sm }}>
      <SectionTitle
        title={`Channels · ${count} of ${available.length}`}
        action={count === available.length ? 'Defaults' : 'Select all'}
        onAction={() =>
          setLogChannels(count === available.length ? DEFAULT_LOG_CHANNELS : CHANNELS.map((c) => c.id).filter((id) => set.has(id) || available.some((a) => a.id === id)))
        }
      />
      {recording ? <Notice title="Recording in progress" body="Channel changes apply to the next log." /> : null}
      <Group>
        {available.map((c, i) => (
          <Row
            key={c.id}
            title={c.label}
            subtitle={c.rate === 'slow' ? 'Read every 2 seconds' : c.rate === 'medium' ? 'Read about twice a second' : undefined}
            toggle={set.has(c.id)}
            onToggle={(on) => toggle(c.id, on)}
            last={i === available.length - 1}
          />
        ))}
      </Group>
      <Text style={[type.caption, { color: colors.textTertiary, paddingHorizontal: 4 }]}>
        Fewer channels give a higher sample rate. Unsupported sensors are hidden while an adapter is connected.
      </Text>
    </View>
  );
}

export default function LogsScreen() {
  const logs = useLogs((s) => s.logs);
  const status = useConnection((s) => s.status);
  const supportedList = useConnection((s) => s.supported);
  const recording = useRecording((s) => s.recording);
  const logChannels = useSettings((s) => s.logChannels);
  const units = useSettings((s) => s.units);
  const [picking, setPicking] = useState(false);
  const [renaming, setRenaming] = useState<LogMeta | null>(null);

  const connected = status === 'connected';
  const supported = useMemo(() => new Set(connected ? supportedList : []), [connected, supportedList]);
  const effective = logChannels.filter((id) => CHANNEL_MAP[id] && channelSupported(CHANNEL_MAP[id], supported)).length;

  const openActions = (log: LogMeta) => {
    tap();
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: log.name,
          options: ['Rename', 'Delete', 'Cancel'],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 2,
          userInterfaceStyle: 'dark',
        },
        (index) => {
          if (index === 0) setRenaming(log);
          if (index === 1) confirmDelete(log);
        },
      );
      return;
    }
    Alert.alert(log.name, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(log) },
      { text: 'Rename', onPress: () => setRenaming(log) },
    ]);
  };

  const hint =
    effective === 0
      ? 'No channels selected. '
      : `Records ${effective} OBD ${effective === 1 ? 'channel' : 'channels'} to this phone, up to 30 minutes per log. `;

  return (
    <>
      <Screen>
        <Header eyebrow="Data logs" title="Logs" />

        <Card style={styles.recorder}>
          <View style={styles.recorderHead}>
            <View style={{ flex: 1, gap: 2 }}>
              <Label>Recorder</Label>
              <Text style={[type.headline, { color: colors.text }]}>
                {recording ? 'Recording' : connected ? 'Ready to record' : 'No adapter connected'}
              </Text>
            </View>
            <View style={[styles.statusDot, { backgroundColor: recording ? colors.danger : connected ? colors.good : colors.textTertiary }]} />
          </View>
          <RecordButton />
          <Text style={[type.callout, { color: colors.textSecondary }]}>
            {hint}
            <Text
              onPress={() => {
                tap();
                setPicking((p) => !p);
              }}
              accessibilityRole="button"
              style={{ color: colors.accentStrong, fontFamily: fonts.semibold }}>
              {picking ? 'Hide channels' : 'Choose channels'}
            </Text>
          </Text>
        </Card>

        {picking ? <ChannelPicker supported={supported} recording={recording} /> : null}

        {logs.length === 0 ? (
          <EmptyState
            icon="chart"
            title="No logs yet"
            body={
              connected
                ? 'Press Record above, drive, then press Stop to save your first log.'
                : 'Connect your OBD adapter, then press Record to capture your first log.'
            }
            action={
              connected ? null : (
                <Button title="Connect" icon="antenna" compact onPress={() => router.push('/connect')} style={{ marginTop: space.md }} />
              )
            }
          />
        ) : (
          <>
            <SectionTitle title={`Saved logs · ${logs.length}`} />
            <View style={{ gap: space.md }}>
              {logs.map((log) => (
                <LogCard key={log.id} log={log} units={units} onLongPress={() => openActions(log)} />
              ))}
            </View>
          </>
        )}
      </Screen>
      <RenameModal log={renaming} onClose={() => setRenaming(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  recorder: { gap: space.lg },
  recorderHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  logCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.lg,
  },
  logHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stats: { flexDirection: 'row', gap: space.sm },
  stat: { flex: 1, gap: 4, minWidth: 0 },
  statValue: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  modalWrap: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'center', padding: space.xl },
  modalCard: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    padding: space.xl,
    gap: space.lg,
  },
  input: {
    fontFamily: type.body.fontFamily,
    fontSize: type.body.fontSize,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    paddingHorizontal: space.lg,
    height: 48,
  },
  modalActions: { flexDirection: 'row', gap: space.md },
});
