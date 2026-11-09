import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TotpAccount } from '../totp/accountsStore';
import { useTotp } from '../totp/useTotp';
import { colors, monoFont, spacing } from '../theme';
import { Card } from './Card';
import { CountdownBar } from './CountdownBar';

interface Props {
  account: TotpAccount;
  now: number;
  onLongPress?: () => void;
}

function formatCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

export function TotpCard({ account, now, onLongPress }: Props) {
  const { code, secondsLeft, counter, error } = useTotp(account.secret, now);
  const urgent = secondsLeft <= 5;

  return (
    <Pressable onLongPress={onLongPress} accessibilityHint="Mantén presionado para eliminar">
      <Card>
        <View style={styles.header}>
          <Text style={styles.issuer} numberOfLines={1}>
            {account.issuer}
          </Text>
          <Text style={[styles.seconds, urgent && styles.urgent]}>{secondsLeft}s</Text>
        </View>
        <Text style={styles.account} numberOfLines={1}>
          {account.account}
        </Text>
        <Text
          style={[styles.code, urgent && styles.urgent]}
          accessibilityLabel={code ? `Código ${code.split('').join(' ')}` : 'Calculando código'}
          selectable
        >
          {error ? '------' : code ? formatCode(code) : '··· ···'}
        </Text>
        <CountdownBar counter={counter} secondsLeft={secondsLeft} />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  issuer: { fontSize: 16, fontWeight: '700', color: colors.text, flex: 1 },
  account: { fontSize: 13, color: colors.muted },
  seconds: { fontSize: 14, fontWeight: '600', color: colors.muted, fontVariant: ['tabular-nums'] },
  code: {
    fontFamily: monoFont,
    fontSize: 44,
    fontWeight: '700',
    letterSpacing: 4,
    color: colors.brand,
    textAlign: 'center',
    marginVertical: spacing.sm,
    fontVariant: ['tabular-nums'],
  },
  urgent: { color: colors.danger },
});
