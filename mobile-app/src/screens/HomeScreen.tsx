import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { describeError } from '../api/errors';
import type { MeResponse } from '../api/types';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import type { ScreenProps } from '../navigation/types';
import { api, http, session } from '../services';
import { colors, monoFont, spacing } from '../theme';

type RefreshDemo = { tone: 'success' | 'danger'; message: string } | null;

export function HomeScreen({ navigation }: ScreenProps<'Home'>) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [demo, setDemo] = useState<RefreshDemo>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const loadMe = useCallback(async () => {
    try {
      setError(null);
      setMe(await api.me());
    } catch (err) {
      setError(describeError(err));
    }
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  /**
   * Demostración del Silent Refresh: invalida el access_token en memoria y lanza 3
   * peticiones concurrentes. Todas reciben 401, se encolan y se resuelven con UNA renovación.
   */
  const runRefreshDemo = async () => {
    setDemoLoading(true);
    setDemo(null);
    const before = http.stats.refreshCount;
    session.simulateAccessTokenExpiry();
    try {
      await Promise.all([api.me(), api.me(), api.me()]);
      const refreshes = http.stats.refreshCount - before;
      setDemo({
        tone: 'success',
        message: `3 peticiones recibieron 401 → ${refreshes} renovación (POST /auth/refresh) → las 3 se reintentaron con éxito sin cerrar la sesión.`,
      });
    } catch (err) {
      setDemo({ tone: 'danger', message: describeError(err) });
    } finally {
      setDemoLoading(false);
    }
  };

  const logout = async () => {
    setLoggingOut(true);
    await session.logout();
  };

  const accessToken = session.getAccessToken();

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await loadMe();
              setRefreshing(false);
            }}
          />
        }
      >
        <Card>
          <Text style={styles.hello}>Hola{me ? `, ${me.name}` : ''}</Text>
          <Text style={styles.muted}>{me?.email ?? 'Cargando perfil…'}</Text>
          {error ? <Banner tone="danger" message={error} /> : null}
        </Card>

        <Card>
          <Text style={styles.section}>Sesión</Text>
          <Row label="access_token" value={accessToken ? `${accessToken.slice(0, 16)}…` : '—'} hint="solo en memoria (5 min)" />
          <Row label="refresh_token" value="••••••••" hint="Keychain / Keystore (30 días)" />
        </Card>

        <View style={styles.actions}>
          <Button title="Abrir Bóveda Crítica" onPress={() => navigation.navigate('Vault')} />
          <Button title="Autenticador TOTP" variant="secondary" onPress={() => navigation.navigate('Authenticator')} />
        </View>

        <Card>
          <Text style={styles.section}>Prueba de Silent Refresh</Text>
          <Text style={styles.muted}>Simula la expiración del access_token y lanza 3 peticiones concurrentes.</Text>
          {demo ? <Banner tone={demo.tone} message={demo.message} /> : null}
          <Button title="Ejecutar prueba" variant="secondary" loading={demoLoading} onPress={() => void runRefreshDemo()} />
        </Card>

        <Button title="Cerrar sesión" variant="ghost" loading={loggingOut} onPress={() => void logout()} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
      <Text style={styles.rowHint}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  hello: { fontSize: 22, fontWeight: '700', color: colors.text },
  muted: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  section: { fontSize: 16, fontWeight: '700', color: colors.text },
  actions: { gap: spacing.md },
  row: { paddingVertical: spacing.xs },
  rowLabel: { fontSize: 12, color: colors.muted },
  rowValue: { fontSize: 14, fontFamily: monoFont, color: colors.text },
  rowHint: { fontSize: 12, color: colors.success },
});
