import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { Animated, Dimensions, Image, StatusBar } from 'react-native';

const { width } = Dimensions.get('window');
const LOGO_SIZE = Math.min(width * 0.35, 140);
const BRAND_GREEN = '#0E7C66';

type Props = {
  onReady: () => void;
  minDuration?: number;
};

export function AnimatedSplashScreen({ onReady, minDuration = 2200 }: Props) {
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.6)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const loaderOpacity = useRef(new Animated.Value(0)).current;
  const fadeOut = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const startTime = Date.now();

    // Phase 1: Logo fades in and scales up
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 5,
        tension: 60,
        useNativeDriver: true,
      }),
    ]).start();

    // Phase 2: Tagline fades in
    Animated.timing(taglineOpacity, {
      toValue: 1,
      duration: 500,
      delay: 700,
      useNativeDriver: true,
    }).start();

    // Phase 3: Loading dots appear
    Animated.timing(loaderOpacity, {
      toValue: 1,
      duration: 400,
      delay: 1200,
      useNativeDriver: true,
    }).start();

    // Phase 4: Hide native splash, then fade out and signal ready
    const run = async () => {
      try {
        await SplashScreen.hideAsync();
      } catch {
        // splash may already be hidden
      }

      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, minDuration - elapsed);

      setTimeout(() => {
        Animated.timing(fadeOut, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }).start(() => {
          onReady();
        });
      }, remaining);
    };

    run();

    return () => {
      // Cleanup not needed for ref-based animations
    };
  }, [logoOpacity, logoScale, taglineOpacity, loaderOpacity, fadeOut, onReady, minDuration]);

  return (
    <Animated.View
      style={{
        flex: 1,
        backgroundColor: BRAND_GREEN,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: fadeOut,
      }}
    >
      <StatusBar barStyle="light-content" backgroundColor={BRAND_GREEN} />

      {/* Logo */}
      <Animated.View
        style={{
          opacity: logoOpacity,
          transform: [{ scale: logoScale }],
          alignItems: 'center',
          justifyContent: 'center',
          width: LOGO_SIZE,
          height: LOGO_SIZE,
          borderRadius: LOGO_SIZE * 0.22,
          backgroundColor: 'rgba(255,255,255,0.15)',
          overflow: 'hidden',
        }}
      >
        <Image
          source={require('../../assets/benbax-logo.png') as number} // eslint-disable-line @typescript-eslint/no-require-imports
          style={{ width: LOGO_SIZE * 0.72, height: LOGO_SIZE * 0.72 }}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Company name */}
      <Animated.Text
        style={{
          color: '#fff',
          fontSize: 22,
          fontWeight: '900',
          marginTop: 20,
          letterSpacing: 1,
          opacity: taglineOpacity,
        }}
      >
        BENBAX COMPANY LTD
      </Animated.Text>

      {/* Tagline */}
      <Animated.Text
        style={{
          color: 'rgba(255,255,255,0.7)',
          fontSize: 14,
          marginTop: 6,
          opacity: taglineOpacity,
        }}
      >
        Fast delivery & logistics
      </Animated.Text>

      {/* Loading dots */}
      <Animated.View
        style={{
          flexDirection: 'row',
          gap: 6,
          marginTop: 48,
          opacity: loaderOpacity,
        }}
      >
        {[0, 1, 2].map((i) => (
          <Dot key={i} delay={i * 200} />
        ))}
      </Animated.View>
    </Animated.View>
  );
}

function Dot({ delay }: { delay: number }) {
  const bounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(bounce, {
          toValue: -10,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(bounce, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [bounce, delay]);

  return (
    <Animated.View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.8)',
        transform: [{ translateY: bounce }],
      }}
    />
  );
}
