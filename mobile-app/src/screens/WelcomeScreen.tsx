import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { describeError } from '../api/errors';
import { LoginCancelledError } from '../auth/authorize';
import { OAuthCallbackError } from '../auth/oauthCallback';
import { useSession } from '../auth/useSession';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import type { ScreenProps } from '../navigation/types';
import { session } from '../services';
import { colors, spacing } from '../theme';

export function WelcomeScreen({ navigation }: ScreenProps<'Welcome'>) {
  const { reason } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasStoredSession, setHasStoredSession] = useState(false);

  useEffect(() => {
    void session.hasStoredSession().then(setHasStoredSession);
  }, [reason]);

  const login = async () => {
    setLoading(true);
    setError(null);
    try {
      await session.login();
    } catch (err) {
      if (err instanceof LoginCancelledError) return;
      if (err instanceof OAuthCallbackError && err.kind === 'state_mismatch') {
        setError('El parámetro state no coincidió (posible CSRF). Por seguridad se abortó el inicio de sesión.');
      } else {
        setError(describeError(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const retryRestore = async () => {
    setLoading(true);
    setError(null);
    await session.restore();
    setLoading(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.brand}>UNIVERSIDAD DE LA SABANA</Text>
          <Text style={styles.title}>Seguridad Móvil</Text>
          <Text style={styles.subtitle}>OAuth 2.0 + PKCE · Almacenamiento seguro · Step-Up 2FA (TOTP)</Text>
        </View>

        {reason === 'expired' ? (
          <Banner tone="warning" title="Sesión finalizada" message="Tu sesión expiró o fue revocada. Inicia sesión de nuevo." />
        ) : null}
        {reason === 'offline' ? (
          <Banner tone="warning" title="Sin conexión" message="No pudimos renovar tu sesión. El autenticador sigue funcionando sin red." />
        ) : null}
        {error ? <Banner tone="danger" title="No se pudo iniciar sesión" message={error} /> : null}

        <View style={styles.actions}>
          <Button
            title="Iniciar sesión"
            onPress={() => void login()}
            loading={loading}
            accessibilityHint="Abre el navegador seguro del sistema para autenticarte"
          />
          {reason === 'offline' && hasStoredSession ? (
            <Button title="Reintentar sesión guardada" variant="secondary" onPress={() => void retryRestore()} />
          ) : null}
          <Button title="Abrir autenticador (offline)" variant="secondary" onPress={() => navigation.navigate('Authenticator')} />
        </View>

        <Text style={styles.footnote}>
          El inicio de sesión se abre en el navegador del sistema (no en una WebView). La app nunca ve tu contraseña ni
          guarda un client_secret.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, padding: spacing.xl, gap: spacing.lg, justifyContent: 'center' },
  hero: { gap: spacing.sm, marginBottom: spacing.lg },
  brand: { color: colors.brand, fontWeight: '700', letterSpacing: 1, fontSize: 12 },
  title: { fontSize: 32, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 15, color: colors.muted, lineHeight: 22 },
  actions: { gap: spacing.md },
  footnote: { fontSize: 12, color: colors.muted, textAlign: 'center', lineHeight: 18, marginTop: spacing.lg },
});
