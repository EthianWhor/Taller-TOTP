import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSession } from '../auth/useSession';
import { AddAccountScreen } from '../screens/AddAccountScreen';
import { AuthenticatorScreen } from '../screens/AuthenticatorScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { VaultScreen } from '../screens/VaultScreen';
import { WelcomeScreen } from '../screens/WelcomeScreen';
import { colors } from '../theme';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Las pantallas disponibles dependen del estado de sesión. Cuando el refresh_token
 * vence, el SessionManager pasa a 'unauthenticated' y la navegación vuelve
 * automáticamente a la pantalla de bienvenida.
 */
export function RootNavigator() {
  const { status } = useSession();

  if (status === 'restoring') {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerTintColor: colors.brand,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {status === 'authenticated' ? (
        <>
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Inicio' }} />
          <Stack.Screen name="Vault" component={VaultScreen} options={{ title: 'Bóveda Crítica' }} />
        </>
      ) : (
        <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
      )}
      <Stack.Screen name="Authenticator" component={AuthenticatorScreen} options={{ title: 'Autenticador' }} />
      <Stack.Screen
        name="AddAccount"
        component={AddAccountScreen}
        options={{ title: 'Agregar cuenta', presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
