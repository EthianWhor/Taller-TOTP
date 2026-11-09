import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { validateBase32Secret } from '../crypto/base32';
import { OtpAuthParseError, parseOtpAuthUri } from '../crypto/otpauth';
import type { ScreenProps } from '../navigation/types';
import { colors, monoFont, radius, spacing } from '../theme';
import { totpAccounts } from '../totp/accountsStore';

type Mode = 'scan' | 'manual';

export function AddAccountScreen({ navigation }: ScreenProps<'AddAccount'>) {
  const [mode, setMode] = useState<Mode>('scan');

  const saveFromUri = async (uri: string) => {
    const parsed = parseOtpAuthUri(uri);
    await totpAccounts.add({ issuer: parsed.issuer, account: parsed.account, secret: parsed.secret });
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.tabs} accessibilityRole="tablist">
        {(['scan', 'manual'] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            style={[styles.tab, mode === m && styles.tabActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === m }}
          >
            <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>
              {m === 'scan' ? 'Escanear QR' : 'Ingresar semilla'}
            </Text>
          </Pressable>
        ))}
      </View>
      {mode === 'scan' ? (
        <QrScanner onUri={saveFromUri} onManual={() => setMode('manual')} />
      ) : (
        <ManualEntry onSaved={() => navigation.goBack()} onUri={saveFromUri} />
      )}
    </SafeAreaView>
  );
}

/** Opción A: escaneo del QR otpauth:// con expo-camera. */
function QrScanner({ onUri, onManual }: { onUri: (uri: string) => Promise<void>; onManual: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);

  const onScanned = async ({ data }: BarcodeScanningResult) => {
    if (locked.current) return;
    locked.current = true;
    try {
      await onUri(data);
    } catch (err) {
      setError(err instanceof OtpAuthParseError ? err.message : 'No se pudo guardar la cuenta');
      // Permite reintentar tras un momento para no leer el mismo QR en bucle.
      setTimeout(() => (locked.current = false), 1500);
    }
  };

  if (!permission) return <View style={styles.flex} />;

  if (!permission.granted) {
    return (
      <View style={styles.padded}>
        <Banner
          title="Permiso de cámara"
          message="Necesitamos la cámara solo para leer el código QR de tu autenticador. Nada se graba ni se envía."
        />
        <Button title="Permitir cámara" onPress={() => void requestPermission()} />
        <Button title="Ingresar la semilla manualmente" variant="secondary" onPress={onManual} />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <CameraView
        style={styles.flex}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={onScanned}
      />
      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.frame} />
        <Text style={styles.overlayText}>Apunta al QR otpauth:// (por ejemplo, la página /enroll)</Text>
      </View>
      {error ? (
        <View style={styles.errorBox}>
          <Banner tone="danger" message={error} />
        </View>
      ) : null}
    </View>
  );
}

/** Opción B: semilla Base32 pegada a mano (indispensable en emuladores sin cámara). */
function ManualEntry({ onSaved, onUri }: { onSaved: () => void; onUri: (uri: string) => Promise<void> }) {
  const [issuer, setIssuer] = useState('UniSabana');
  const [account, setAccount] = useState('estudiante@unisabana.edu.co');
  const [secret, setSecret] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isUri = secret.trim().toLowerCase().startsWith('otpauth://');
  const validation = isUri ? null : validateBase32Secret(secret);
  const fieldError = touched && validation && !validation.ok ? validation.error : null;

  const save = async () => {
    setTouched(true);
    setError(null);
    setSaving(true);
    try {
      if (isUri) {
        await onUri(secret.trim());
        return;
      }
      if (!validation?.ok) return;
      await totpAccounts.add({
        issuer: issuer.trim() || 'Sin emisor',
        account: account.trim() || 'cuenta',
        secret: validation.normalized,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la cuenta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.padded} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Emisor</Text>
        <TextInput style={styles.input} value={issuer} onChangeText={setIssuer} autoCorrect={false} />
        <Text style={styles.label}>Cuenta</Text>
        <TextInput
          style={styles.input}
          value={account}
          onChangeText={setAccount}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />
        <Text style={styles.label}>Semilla Base32 (o URI otpauth://)</Text>
        <TextInput
          style={[styles.input, styles.secretInput, fieldError && styles.inputError]}
          value={secret}
          onChangeText={setSecret}
          onBlur={() => setTouched(true)}
          placeholder="JBSWY3DPEHPK3PXP"
          autoCapitalize="characters"
          autoCorrect={false}
          spellCheck={false}
          secureTextEntry={false}
          multiline
          accessibilityHint="Solo letras A a Z y dígitos 2 a 7"
        />
        {fieldError ? <Text style={styles.fieldError}>{fieldError}</Text> : null}
        {!fieldError && validation?.ok ? (
          <Text style={styles.fieldOk}>Semilla válida ({validation.normalized.length * 5} bits)</Text>
        ) : null}
        {error ? <Banner tone="danger" message={error} /> : null}
        <Button title="Guardar en el dispositivo" onPress={() => void save()} loading={saving} />
        <Text style={styles.hint}>La semilla se guarda cifrada en Keychain / Keystore (expo-secure-store).</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  padded: { padding: spacing.lg, gap: spacing.md },
  tabs: {
    flexDirection: 'row',
    margin: spacing.lg,
    marginBottom: 0,
    backgroundColor: colors.brandSoft,
    borderRadius: radius.md,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.sm, alignItems: 'center' },
  tabActive: { backgroundColor: colors.surface },
  tabText: { color: colors.muted, fontWeight: '600' },
  tabTextActive: { color: colors.brand },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  frame: { width: 240, height: 240, borderWidth: 3, borderColor: '#fff', borderRadius: radius.lg },
  overlayText: {
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    textAlign: 'center',
    marginHorizontal: spacing.xl,
  },
  errorBox: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.xl },
  label: { fontSize: 13, fontWeight: '600', color: colors.text },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  secretInput: { fontFamily: monoFont, minHeight: 64, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger },
  fieldError: { color: colors.danger, fontSize: 13 },
  fieldOk: { color: colors.success, fontSize: 13 },
  hint: { color: colors.muted, fontSize: 12, textAlign: 'center' },
});
