import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';
import { session } from './src/services';
import { totpAccounts } from './src/totp/accountsStore';

// Cierra la sesión del navegador si la app se abrió desde el redirect (necesario en web).
WebBrowser.maybeCompleteAuthSession();

export default function App() {
  useEffect(() => {
    // Recupera la sesión desde el refresh_token en SecureStore (si existe) y las cuentas TOTP.
    void session.restore();
    void totpAccounts.load();
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
