import { useLayoutEffect } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { TotpCard } from '../components/TotpCard';
import { useNow } from '../hooks/useNow';
import type { ScreenProps } from '../navigation/types';
import { colors, spacing } from '../theme';
import { totpAccounts, useTotpAccounts, type TotpAccount } from '../totp/accountsStore';

/**
 * Autenticador propio (RFC 6238). Todo el cálculo es local: no hace ninguna petición
 * de red, por lo que funciona en Modo Avión.
 */
export function AuthenticatorScreen({ navigation }: ScreenProps<'Authenticator'>) {
  const accounts = useTotpAccounts();
  const now = useNow(250);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => navigation.navigate('AddAccount')} hitSlop={12} accessibilityRole="button">
          <Text style={styles.headerAction}>Agregar</Text>
        </Pressable>
      ),
    });
  }, [navigation]);

  const confirmRemove = (account: TotpAccount) => {
    Alert.alert('Eliminar cuenta', `¿Eliminar ${account.issuer} (${account.account}) de este dispositivo?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => void totpAccounts.remove(account.id) },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={accounts}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Banner
            tone="success"
            title="Cálculo 100 % local"
            message="Los códigos se generan en el teléfono con HMAC-SHA1 nativo y el reloj del dispositivo. No requieren internet (Modo Avión)."
          />
        }
        renderItem={({ item }) => <TotpCard account={item} now={now} onLongPress={() => confirmRemove(item)} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Aún no tienes cuentas</Text>
            <Text style={styles.emptyText}>
              Escanea el QR de /enroll del backend o pega la semilla Base32 para empezar.
            </Text>
            <Button title="Agregar cuenta" onPress={() => navigation.navigate('AddAccount')} />
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.md },
  headerAction: { color: colors.brand, fontSize: 16, fontWeight: '600' },
  empty: { marginTop: spacing.xl, gap: spacing.md, alignItems: 'stretch' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptyText: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 },
});
