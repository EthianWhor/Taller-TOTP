import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from 'react-native';
import { ApiError, describeError, NetworkError } from '../api/errors';
import type { MfaVerifyResponse } from '../api/types';
import { sha1 } from '../crypto/nativeHash';
import { generateTotp } from '../crypto/totp';
import { api } from '../services';
import { colors, monoFont, radius, spacing } from '../theme';
import { useTotpAccounts } from '../totp/accountsStore';
import { Banner } from './Banner';
import { Button } from './Button';

interface Props {
  visible: boolean;
  stepUpToken: string | null;
  onVerified: (result: MfaVerifyResponse, code: string) => void;
  onCancel: () => void;
  /** El step_up_token expiró o se agotaron los intentos: hay que pedir uno nuevo. */
  onRestart: () => void;
}

type Feedback = { tone: 'danger' | 'warning'; title: string; message: string } | null;

export function StepUpModal({ visible, stepUpToken, onVerified, onCancel, onRestart }: Props) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const inputRef = useRef<TextInputInstance>(null);
  const accounts = useTotpAccounts();

  useEffect(() => {
    if (visible) {
      setCode('');
      setFeedback(null);
    }
  }, [visible, stepUpToken]);

  const submit = async (value = code) => {
    if (!stepUpToken || !/^\d{6}$/.test(value) || loading) return;
    setLoading(true);
    setFeedback(null);
    try {
      const result = await api.verifyMfa(stepUpToken, value);
      onVerified(result, value);
    } catch (err) {
      setCode('');
      if (err instanceof ApiError && err.status === 409) {
        setFeedback({
          tone: 'danger',
          title: '409 Conflict — Replay Attack Detected',
          message: 'Este código ya fue utilizado. Espera a que tu autenticador muestre el siguiente.',
        });
      } else if (err instanceof ApiError && err.code === 'invalid_code') {
        const left = err.body?.attempts_remaining;
        setFeedback({
          tone: 'warning',
          title: 'Código incorrecto',
          message: `Verifica el código y la hora del teléfono.${typeof left === 'number' ? ` Intentos restantes: ${left}.` : ''}`,
        });
      } else if (err instanceof ApiError && (err.status === 429 || err.code === 'invalid_token')) {
        setFeedback({ tone: 'warning', title: 'Verificación reiniciada', message: describeError(err) });
        onRestart();
      } else if (err instanceof NetworkError) {
        setFeedback({ tone: 'danger', title: 'Sin conexión', message: err.message });
      } else {
        setFeedback({ tone: 'danger', title: 'Error', message: describeError(err) });
      }
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  const onChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6) void submit(digits);
  };

  /** Atajo de demostración: toma el código actual del autenticador local de esta app. */
  const fillFromLocal = async (secret: string) => {
    const local = await generateTotp(sha1, secret, Date.now());
    setCode(local);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Verificación en dos pasos</Text>
            <Text style={styles.subtitle}>
              La Bóveda Crítica exige un segundo factor. Ingresa el código de 6 dígitos de tu autenticador.
            </Text>

            <Pressable onPress={() => inputRef.current?.focus()} style={styles.boxes} accessible={false}>
              {Array.from({ length: 6 }, (_, i) => (
                <View key={i} style={[styles.box, i === code.length && styles.boxActive]}>
                  <Text style={styles.digit}>{code[i] ?? ''}</Text>
                </View>
              ))}
            </Pressable>
            <TextInput
              ref={inputRef}
              value={code}
              onChangeText={onChange}
              keyboardType="number-pad"
              inputMode="numeric"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              style={styles.hiddenInput}
              accessibilityLabel="Código de verificación de 6 dígitos"
            />

            {feedback ? <Banner tone={feedback.tone} title={feedback.title} message={feedback.message} /> : null}

            <Button
              title="Verificar"
              onPress={() => void submit()}
              loading={loading}
              disabled={code.length !== 6 || !stepUpToken}
            />

            {accounts.length > 0 ? (
              <View style={styles.local}>
                <Text style={styles.localTitle}>Usar el código de mi autenticador local</Text>
                {accounts.map((a) => (
                  <Button
                    key={a.id}
                    variant="secondary"
                    title={`${a.issuer} · ${a.account}`}
                    onPress={() => void fillFromLocal(a.secret)}
                  />
                ))}
              </View>
            ) : null}

            <Button title="Cancelar" variant="ghost" onPress={onCancel} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(7, 42, 99, 0.45)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg * 1.5,
    borderTopRightRadius: radius.lg * 1.5,
    maxHeight: '90%',
  },
  content: { padding: spacing.xl, gap: spacing.md },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  boxes: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: spacing.sm },
  box: {
    width: 46,
    height: 58,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  boxActive: { borderColor: colors.brand },
  digit: { fontFamily: monoFont, fontSize: 28, fontWeight: '700', color: colors.text },
  hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  local: { gap: spacing.sm, marginTop: spacing.sm },
  localTitle: { fontSize: 13, fontWeight: '600', color: colors.muted },
});
