import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const palette: Record<Tone, { bg: string; fg: string }> = {
  info: { bg: colors.brandSoft, fg: colors.brandDark },
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
};

export function Banner({ tone = 'info', title, message }: { tone?: Tone; title?: string; message: string }) {
  const { bg, fg } = palette[tone];
  return (
    <View
      style={[styles.box, { backgroundColor: bg }]}
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
    >
      {title ? <Text style={[styles.title, { color: fg }]}>{title}</Text> : null}
      <Text style={[styles.message, { color: fg }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.md, padding: spacing.md, gap: 2 },
  title: { fontWeight: '700', fontSize: 14 },
  message: { fontSize: 14, lineHeight: 20 },
});
