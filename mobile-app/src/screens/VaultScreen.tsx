import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, describeError } from '../api/errors';
import type { MfaVerifyResponse, VaultResponse } from '../api/types';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { StepUpModal } from '../components/StepUpModal';
import { useNow } from '../hooks/useNow';
import type { ScreenProps } from '../navigation/types';
import { api, session } from '../services';
import { colors, monoFont, spacing } from '../theme';

type ViewState =
  | { kind: 'loading' }
  | { kind: 'locked'; stepUpToken: string | null }
  | { kind: 'open'; data: VaultResponse }
  | { kind: 'error'; message: string };

type ReplayResult = { tone: 'success' | 'danger'; title: string; message: string } | null;

/**
 * Bóveda Crítica: protegida con Step-Up. Si la API responde 403 mfa_required,
 * la pantalla atrapa el error y abre el modal 2FA con el step_up_token recibido.
 */
export function VaultScreen({ navigation }: ScreenProps<'Vault'>) {
  const [state, setState] = useState<ViewState>({ kind: 'loading' });
  const [lastCode, setLastCode] = useState<string | null>(null);
  const [replay, setReplay] = useState<ReplayResult>(null);
  const [replayLoading, setReplayLoading] = useState(false);
  const mounted = useRef(true);
  const now = useNow(1000);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    const elevated = session.getElevatedToken();
    try {
      const data = await api.vault(elevated);
      if (mounted.current) setState({ kind: 'open', data });
    } catch (err) {
      if (!mounted.current) return;
      if (err instanceof ApiError && err.status === 401 && elevated) {
        // El elevated_token caducó en el servidor: se descarta y se repite con el token estándar.
        session.clearElevatedToken();
        void load();
      } else if (err instanceof ApiError && err.status === 403 && err.code === 'mfa_required') {
        const token = typeof err.body?.step_up_token === 'string' ? err.body.step_up_token : null;
        setState({ kind: 'locked', stepUpToken: token });
      } else {
        setState({ kind: 'error', message: describeError(err) });
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onVerified = (result: MfaVerifyResponse, code: string) => {
    session.setElevatedToken(result.elevated_token, result.expires_in);
    setLastCode(code);
    setReplay(null);
    void load();
  };

  /**
   * Prueba de aceptación 5: reenvía el MISMO código recién aceptado con un step_up_token
   * nuevo. El backend debe responder 409 Conflict (Replay Attack Detected).
   */
  const replayLastCode = async () => {
    if (!lastCode) return;
    setReplayLoading(true);
    setReplay(null);
    try {
      let stepUpToken: string | null = null;
      try {
        await api.vault(null); // con el access_token estándar => 403 + step_up_token
      } catch (err) {
        if (err instanceof ApiError && err.code === 'mfa_required') {
          stepUpToken = typeof err.body?.step_up_token === 'string' ? err.body.step_up_token : null;
        } else {
          throw err;
        }
      }
      if (!stepUpToken) throw new Error('No se obtuvo un step_up_token');
      await api.verifyMfa(stepUpToken, lastCode);
      setReplay({ tone: 'danger', title: 'El código fue aceptado de nuevo', message: 'La protección Anti-Replay no funcionó.' });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setReplay({
          tone: 'success',
          title: `Bloqueado: 409 Conflict`,
          message: `El backend respondió "${describeError(err)}". El código ${lastCode} no puede reutilizarse.`,
        });
      } else {
        setReplay({ tone: 'danger', title: 'Resultado inesperado', message: describeError(err) });
      }
    } finally {
      setReplayLoading(false);
    }
  };

  const closeVault = () => {
    session.clearElevatedToken();
    navigation.goBack();
  };

  const elevatedExpiresAt = session.getElevatedExpiresAt();
  const remaining = elevatedExpiresAt ? Math.max(0, Math.ceil((elevatedExpiresAt - now) / 1000)) : 0;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {state.kind === 'loading' ? <ActivityIndicator size="large" color={colors.brand} style={styles.loader} /> : null}

        {state.kind === 'error' ? (
          <>
            <Banner tone="danger" title="No se pudo abrir la bóveda" message={state.message} />
            <Button title="Reintentar" onPress={() => void load()} />
          </>
        ) : null}

        {state.kind === 'locked' ? (
          <Card>
            <Text style={styles.lockIcon}>🔒</Text>
            <Text style={styles.title}>Bóveda bloqueada</Text>
            <Text style={styles.muted}>
              La API respondió 403 Forbidden (mfa_required). Verifica tu segundo factor para elevar la sesión.
            </Text>
            <Button title="Verificar con código TOTP" onPress={() => void load()} />
          </Card>
        ) : null}

        {state.kind === 'open' ? (
          <>
            <Banner
              tone="success"
              title="Acceso autorizado con 2FA"
              message={`Sesión elevada (mfa_verified: true). Expira en ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}.`}
            />
            <Card>
              <Text style={styles.title}>Datos sensibles</Text>
              {state.data.secrets.map((s) => (
                <View key={s.label} style={styles.row}>
                  <Text style={styles.label}>{s.label}</Text>
                  <Text style={styles.value} selectable>
                    {s.value}
                  </Text>
                </View>
              ))}
              <Text style={styles.meta}>Consultado: {new Date(state.data.accessed_at).toLocaleString()}</Text>
            </Card>

            {lastCode ? (
              <Card>
                <Text style={styles.title}>Prueba Anti-Replay</Text>
                <Text style={styles.muted}>
                  Reenvía de inmediato el código {lastCode} recién usado. El backend debe rechazarlo con 409.
                </Text>
                {replay ? <Banner tone={replay.tone} title={replay.title} message={replay.message} /> : null}
                <Button
                  title="Reenviar el mismo código"
                  variant="secondary"
                  loading={replayLoading}
                  onPress={() => void replayLastCode()}
                />
              </Card>
            ) : null}

            <Button title="Cerrar bóveda" variant="ghost" onPress={closeVault} />
          </>
        ) : null}
      </ScrollView>

      <StepUpModal
        visible={state.kind === 'locked' && !!state.stepUpToken}
        stepUpToken={state.kind === 'locked' ? state.stepUpToken : null}
        onVerified={onVerified}
        onCancel={() => setState({ kind: 'locked', stepUpToken: null })}
        onRestart={() => void load()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  loader: { marginTop: spacing.xxl },
  lockIcon: { fontSize: 40, textAlign: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  muted: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  row: { paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  label: { fontSize: 12, color: colors.muted },
  value: { fontSize: 16, fontFamily: monoFont, color: colors.text, marginTop: 2 },
  meta: { fontSize: 12, color: colors.muted, marginTop: spacing.sm },
});
