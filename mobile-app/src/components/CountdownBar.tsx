import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { TOTP_PERIOD_SECONDS } from '../crypto/totp';
import { colors } from '../theme';

interface Props {
  /** Ventana T actual; al cambiar, la barra se reinicia. */
  counter: number;
  secondsLeft: number;
  period?: number;
}

/**
 * Barra de progreso que decrece de 30 a 0 s. La animación corre en el hilo nativo
 * (useNativeDriver), así que es fluida aunque el hilo JS esté ocupado.
 */
export function CountdownBar({ counter, secondsLeft, period = TOTP_PERIOD_SECONDS }: Props) {
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const periodMs = period * 1000;
    const msLeft = Math.max(0, (counter + 1) * periodMs - Date.now());
    progress.setValue(msLeft / periodMs);
    const animation = Animated.timing(progress, {
      toValue: 0,
      duration: msLeft,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [counter, period, progress]);

  const urgent = secondsLeft <= 5;
  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityLabel={`Quedan ${secondsLeft} segundos`}
      accessibilityValue={{ min: 0, max: period, now: secondsLeft }}
    >
      <Animated.View
        style={[
          styles.fill,
          { backgroundColor: urgent ? colors.danger : colors.brand, transform: [{ scaleX: progress }] },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brandSoft,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    width: '100%',
    borderRadius: 4,
    transformOrigin: 'left',
  },
});
