import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import {
  BadgeCheck,
  Camera,
  Car,
  CheckCircle2,
  ChevronRight,
  DollarSign,
  Image as ImageIcon,
} from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button';
import { ErrorState } from '../components/ErrorState';
import { apiRequest } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { theme } from '../theme/tokens';

type OnboardingStep = 'welcome' | 'selfie' | 'vehicle' | 'documents' | 'complete';

type DocumentType = 'SELFIE' | 'GHANA_CARD' | 'DRIVER_LICENSE' | 'VEHICLE_PHOTO';

type UploadSignature = {
  cloudName?: string;
  apiKey?: string;
  timestamp: number;
  folder: string;
  signature: string;
};

type PickedAsset = {
  uri?: string;
  name?: string;
  mimeType?: string;
};

type ImagePickerModule = {
  requestCameraPermissionsAsync: () => Promise<{ granted: boolean }>;
  requestMediaLibraryPermissionsAsync: () => Promise<{ granted: boolean }>;
  launchCameraAsync: (
    options: Record<string, unknown>
  ) => Promise<{ canceled: boolean; assets: PickedAsset[] | null }>;
  launchImageLibraryAsync: (
    options: Record<string, unknown>
  ) => Promise<{ canceled: boolean; assets: PickedAsset[] | null }>;
  /** Android only: recovers a picker result after the OS killed the app while the camera was open. */
  getPendingResultAsync?: () => Promise<{
    canceled?: boolean;
    assets?: PickedAsset[] | null;
    /** Present on error results instead of assets. */
    code?: string;
  } | null>;
};

const isExpoGo = Constants.appOwnership === 'expo';

function showNativePickerUnavailable(kind: string) {
  Alert.alert(
    'Native picker unavailable',
    `The ${kind} picker is not available in Expo Go. Use a dev build to test document capture.`
  );
}

async function loadImagePicker(silent = false): Promise<ImagePickerModule | null> {
  if (isExpoGo) {
    if (!silent) showNativePickerUnavailable('camera');
    return null;
  }

  try {
    const module = await import('expo-image-picker');
    return module.default ?? module;
  } catch {
    if (!silent) showNativePickerUnavailable('camera');
    return null;
  }
}

// Android can kill the app process while the camera is open. Everything the
// driver has done so far is persisted here so a cold restart resumes the flow
// instead of starting over from step one.
const PROGRESS_KEY = 'benbax.driver.onboardingProgress';
const PENDING_CAPTURE_KEY = 'benbax.driver.onboardingPendingCapture';

type PersistedProgress = {
  step: OnboardingStep;
  selfieUri: string | null;
  selfieUploaded: boolean;
  vehicleType: string;
  plateNumber: string;
  vehiclePhotoUri: string | null;
  uploaded: Partial<Record<DocumentType, string>>;
  localDocUris: Partial<Record<DocumentType, string>>;
};

async function markPendingCapture(type: DocumentType): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_CAPTURE_KEY, type);
  } catch {
    // Best effort — worst case recovery is skipped.
  }
}

async function clearPendingCapture(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_CAPTURE_KEY);
  } catch {
    // Best effort.
  }
}

async function clearPersistedProgress(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([PROGRESS_KEY, PENDING_CAPTURE_KEY]);
  } catch {
    // Best effort.
  }
}

const STEPS: Array<{ key: OnboardingStep; label: string }> = [
  { key: 'welcome', label: 'Welcome' },
  { key: 'selfie', label: 'Selfie' },
  { key: 'vehicle', label: 'Vehicle' },
  { key: 'documents', label: 'Docs' },
  { key: 'complete', label: 'Done' },
];

const STEP_ORDER: OnboardingStep[] = ['welcome', 'selfie', 'vehicle', 'documents', 'complete'];

function StepIndicator({ current }: { current: OnboardingStep }) {
  const currentIndex = STEP_ORDER.indexOf(current);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
      {STEPS.map((step, i) => {
        const isCompleted = i < currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <View key={step.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View
              style={{
                width: isCurrent ? 28 : 20,
                height: isCurrent ? 28 : 20,
                borderRadius: isCurrent ? 14 : 10,
                backgroundColor: isCompleted
                  ? theme.colors.primary
                  : isCurrent
                    ? theme.colors.primary + '20'
                    : theme.colors.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isCompleted ? (
                <CheckCircle2 size={14} color="#fff" />
              ) : (
                <Text
                  style={{
                    color: isCurrent ? theme.colors.primary : theme.colors.muted,
                    fontWeight: '900',
                    fontSize: 11,
                  }}
                >
                  {i + 1}
                </Text>
              )}
            </View>
            {i < STEPS.length - 1 ? (
              <View
                style={{
                  width: 20,
                  height: 2,
                  backgroundColor: isCompleted ? theme.colors.primary : theme.colors.border,
                  borderRadius: 1,
                }}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export function OnboardingFlow({ onComplete }: { onComplete: () => void }) {
  const insets = useSafeAreaInsets();
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding);
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [selfieUri, setSelfieUri] = useState<string | null>(null);
  const [selfieUploaded, setSelfieUploaded] = useState(false);
  const [vehicleType, setVehicleType] = useState('Car');
  const [plateNumber, setPlateNumber] = useState('');
  const [vehiclePhotoUri, setVehiclePhotoUri] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<Partial<Record<DocumentType, string>>>({});
  const [localDocUris, setLocalDocUris] = useState<Partial<Record<DocumentType, string>>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const slideTo = useCallback(
    (nextStep: OnboardingStep) => {
      setStepError(null);
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => {
        setStep(nextStep);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      });
    },
    [fadeAnim]
  );

  // Restore persisted progress after an OS-forced restart (e.g. Android killed
  // the app while the camera was open), then recover any photo the camera
  // captured right before the process died.
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      let restored: PersistedProgress | null = null;
      let pendingType: DocumentType | null = null;

      try {
        const [rawProgress, rawPending] = await Promise.all([
          AsyncStorage.getItem(PROGRESS_KEY),
          AsyncStorage.getItem(PENDING_CAPTURE_KEY),
        ]);
        if (rawProgress) restored = JSON.parse(rawProgress) as PersistedProgress;
        if (rawPending) pendingType = rawPending as DocumentType;
      } catch {
        // Corrupt/unreadable progress — start fresh rather than crash.
      }

      if (cancelled) return;

      if (restored) {
        if (STEP_ORDER.includes(restored.step)) setStep(restored.step);
        setSelfieUri(restored.selfieUri ?? null);
        setSelfieUploaded(Boolean(restored.selfieUploaded));
        setVehicleType(restored.vehicleType || 'Car');
        setPlateNumber(restored.plateNumber ?? '');
        setVehiclePhotoUri(restored.vehiclePhotoUri ?? null);
        setUploaded(restored.uploaded ?? {});
        setLocalDocUris(restored.localDocUris ?? {});
      }

      setIsRestoring(false);

      if (pendingType) {
        await clearPendingCapture();
        await recoverPendingCapture(pendingType, restored);
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
    // Runs once on mount by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep progress persisted so a process restart never loses the driver's work.
  useEffect(() => {
    if (isRestoring) return;
    const progress: PersistedProgress = {
      step,
      selfieUri,
      selfieUploaded,
      vehicleType,
      plateNumber,
      vehiclePhotoUri,
      uploaded,
      localDocUris,
    };
    AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)).catch(() => {
      // Best effort — persistence failing should never block the flow.
    });
  }, [
    isRestoring,
    step,
    selfieUri,
    selfieUploaded,
    vehicleType,
    plateNumber,
    vehiclePhotoUri,
    uploaded,
    localDocUris,
  ]);

  async function recoverPendingCapture(type: DocumentType, restored: PersistedProgress | null) {
    const ImagePicker = await loadImagePicker(true);
    if (!ImagePicker?.getPendingResultAsync) return;

    try {
      // The native side may surface the pending result a moment after JS
      // starts, so poll briefly instead of checking once.
      let asset: PickedAsset | null | undefined = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        const pending = await ImagePicker.getPendingResultAsync();
        asset = pending && !pending.canceled && !pending.code ? pending.assets?.[0] : null;
        if (asset?.uri) break;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      if (!asset?.uri) return;

      const meta = restored
        ? { vehicleType: restored.vehicleType, plateNumber: restored.plateNumber }
        : undefined;

      if (type === 'SELFIE') {
        setSelfieUri(asset.uri);
        await uploadAsset(
          'SELFIE',
          {
            uri: asset.uri,
            name: 'selfie.jpg',
            type: asset.mimeType ?? 'image/jpeg',
          },
          meta
        );
      } else if (type === 'VEHICLE_PHOTO') {
        setVehiclePhotoUri(asset.uri);
      } else {
        setLocalDocUris((prev) => ({ ...prev, [type]: asset.uri }));
        await uploadAsset(
          type,
          {
            uri: asset.uri,
            name: `${type.toLowerCase()}.jpg`,
            type: asset.mimeType ?? 'image/jpeg',
          },
          meta
        );
      }
    } catch {
      // No recoverable result — the driver can simply retake the photo.
    }
  }

  async function handleSelfieCapture() {
    const ImagePicker = await loadImagePicker();
    if (!ImagePicker) return;

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Camera permission needed',
          'Allow camera access to capture your selfie for identity verification.'
        );
        return;
      }

      await markPendingCapture('SELFIE');
      // No `allowsEditing` here: on Android the cropper runs as a separate
      // activity that frequently makes the OS destroy MainActivity, losing the
      // captured selfie so the flow snaps back to the "Take a selfie" button.
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.5,
      });
      await clearPendingCapture();

      if (!result.canceled && result.assets?.[0]?.uri) {
        setSelfieUri(result.assets[0].uri);
        setSelfieUploaded(false);
        // Auto-upload selfie. uploadAsset marks selfieUploaded only on success,
        // so we must not force it true here — that would mask a failed upload.
        await uploadAsset('SELFIE', {
          uri: result.assets[0].uri,
          name: 'selfie.jpg',
          type: result.assets[0].mimeType ?? 'image/jpeg',
        });
      }
    } catch (error) {
      Alert.alert(
        'Camera unavailable',
        error instanceof Error ? error.message : 'Could not open the camera.'
      );
    }
  }

  async function handleVehiclePhoto() {
    const ImagePicker = await loadImagePicker();
    if (!ImagePicker) return;

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        const libPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!libPermission.granted) return;
        await markPendingCapture('VEHICLE_PHOTO');
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.5,
        });
        await clearPendingCapture();
        if (!result.canceled && result.assets?.[0]?.uri) {
          setVehiclePhotoUri(result.assets[0].uri);
        }
        return;
      }

      await markPendingCapture('VEHICLE_PHOTO');
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.5,
      });
      await clearPendingCapture();

      if (!result.canceled && result.assets?.[0]?.uri) {
        setVehiclePhotoUri(result.assets[0].uri);
      }
    } catch {
      Alert.alert('Camera unavailable', 'Could not open the camera.');
    }
  }

  async function uploadDocument(type: DocumentType) {
    const ImagePicker = await loadImagePicker();
    if (!ImagePicker) return;

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        const libPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!libPermission.granted) return;
        await markPendingCapture(type);
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.5,
        });
        await clearPendingCapture();
        if (!result.canceled && result.assets?.[0]?.uri) {
          const uri = result.assets[0].uri;
          setLocalDocUris((prev) => ({ ...prev, [type]: uri }));
          await uploadAsset(type, {
            uri,
            name: `${type.toLowerCase()}.jpg`,
            type: result.assets[0].mimeType ?? 'image/jpeg',
          });
        }
        return;
      }

      await markPendingCapture(type);
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.5,
      });
      await clearPendingCapture();

      if (!result.canceled && result.assets?.[0]?.uri) {
        const uri = result.assets[0].uri;
        setLocalDocUris((prev) => ({ ...prev, [type]: uri }));
        await uploadAsset(type, {
          uri,
          name: `${type.toLowerCase()}.jpg`,
          type: result.assets[0].mimeType ?? 'image/jpeg',
        });
      }
    } catch {
      Alert.alert('Camera unavailable', 'Could not open the camera.');
    }
  }

  async function uploadAsset(
    type: string,
    asset: { uri: string; name: string; type: string },
    meta?: { vehicleType?: string; plateNumber?: string }
  ) {
    setUploading(type);
    setStepError(null);
    try {
      const signature = await apiRequest<UploadSignature>('/media/cloudinary-signature', {
        method: 'POST',
      });
      if (!signature.cloudName || !signature.apiKey || !signature.signature) {
        throw new Error('Cloudinary is not configured on the API.');
      }

      const form = new FormData();
      form.append('file', {
        uri: asset.uri,
        name: asset.name,
        type: asset.type,
      } as unknown as Blob);
      form.append('api_key', signature.apiKey);
      form.append('timestamp', String(signature.timestamp));
      form.append('folder', signature.folder);
      form.append('signature', signature.signature);

      // React Native's fetch has no default timeout; a stalled multipart upload
      // on flaky mobile data would otherwise hang here forever, leaving the
      // button stuck on "Uploading...". Abort after 90s so the error surfaces.
      const uploadController = new AbortController();
      const uploadTimer = setTimeout(() => uploadController.abort(), 90_000);
      let cloudinaryResponse: Response;
      try {
        cloudinaryResponse = await fetch(
          `https://api.cloudinary.com/v1_1/${signature.cloudName}/auto/upload`,
          { method: 'POST', body: form, signal: uploadController.signal }
        );
      } catch (uploadError) {
        if (uploadError instanceof Error && uploadError.name === 'AbortError') {
          throw new Error('Upload timed out. Check your connection and try again.');
        }
        throw new Error('Could not reach the image server. Check your connection and try again.');
      } finally {
        clearTimeout(uploadTimer);
      }
      const cloudinaryBody = (await cloudinaryResponse.json()) as {
        secure_url?: string;
        error?: { message?: string };
      };
      if (!cloudinaryResponse.ok || !cloudinaryBody.secure_url) {
        throw new Error(cloudinaryBody.error?.message ?? 'Upload failed');
      }

      await apiRequest('/drivers/me/kyc', {
        method: 'POST',
        body: JSON.stringify({
          documentType: type,
          fileUrl: cloudinaryBody.secure_url,
          vehicleType: meta?.vehicleType ?? vehicleType,
          plateNumber: meta?.plateNumber ?? plateNumber,
        }),
      });

      if (type === 'SELFIE') {
        setSelfieUploaded(true);
      } else {
        setUploaded((prev) => ({ ...prev, [type as DocumentType]: cloudinaryBody.secure_url }));
      }
    } catch (error) {
      setStepError(error instanceof Error ? error.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(null);
    }
  }

  async function handleComplete() {
    // Upload vehicle photo if taken
    if (vehiclePhotoUri && !uploaded['VEHICLE_PHOTO']) {
      await uploadAsset('VEHICLE_PHOTO', {
        uri: vehiclePhotoUri,
        name: 'vehicle.jpg',
        type: 'image/jpeg',
      });
    }

    await completeOnboarding();
    await clearPersistedProgress();
    onComplete();
  }

  function canProceedFromVehicle() {
    return vehicleType.trim().length > 0 && plateNumber.trim().length >= 3;
  }

  if (isRestoring) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.canvas,
        }}
      >
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      {/* Fixed header */}
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 20,
          paddingBottom: 12,
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Image
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            source={require('../../assets/benbax-logo.png')}
            style={{ width: 28, height: 28, borderRadius: 6 }}
            resizeMode="contain"
          />
          <Text style={{ fontSize: 17, fontWeight: '800', color: theme.colors.ink }}>BENBAX</Text>
        </View>
        <StepIndicator current={step} />
      </View>

      {/* Scrollable step content */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        <Animated.View style={{ opacity: fadeAnim, gap: 16 }}>
          {stepError ? <ErrorState message={stepError} compact variant="error" /> : null}

          {/* Step 0: Welcome */}
          {step === 'welcome' && (
            <>
              <View style={{ alignItems: 'center', gap: 12, marginTop: 20 }}>
                <View
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 40,
                    backgroundColor: theme.colors.primary + '15',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Car size={40} color={theme.colors.primary} />
                </View>
                <Text
                  style={{
                    fontSize: 26,
                    fontWeight: '900',
                    color: theme.colors.ink,
                    textAlign: 'center',
                  }}
                >
                  Welcome to Benbax!
                </Text>
                <Text
                  style={{
                    color: theme.colors.muted,
                    fontSize: 15,
                    textAlign: 'center',
                    lineHeight: 22,
                    paddingHorizontal: 20,
                  }}
                >
                  You're almost ready to start earning. Complete your profile setup to begin
                  receiving ride requests and delivery offers.
                </Text>
              </View>

              <View style={{ gap: 10, marginTop: 10 }}>
                <FeatureRow
                  icon={<Camera size={20} color={theme.colors.primary} />}
                  title="Take a selfie"
                  description="Verify your identity with a clear photo of your face"
                />
                <FeatureRow
                  icon={<Car size={20} color={theme.colors.primary} />}
                  title="Add vehicle details"
                  description="Tell us about your vehicle type and plate number"
                />
                <FeatureRow
                  icon={<BadgeCheck size={20} color={theme.colors.primary} />}
                  title="Upload documents"
                  description="Optional: Ghana Card and driver license for faster verification"
                />
                <FeatureRow
                  icon={<DollarSign size={20} color={theme.colors.primary} />}
                  title="Start earning"
                  description="Go online and receive trips & deliveries in your area"
                />
              </View>

              <View style={{ marginTop: 12 }}>
                <Button
                  label="Get started"
                  icon={<ChevronRight size={18} color="#fff" />}
                  onPress={() => slideTo('selfie')}
                />
              </View>
            </>
          )}

          {/* Step 1: Selfie capture */}
          {step === 'selfie' && (
            <>
              <Text style={{ fontSize: 22, fontWeight: '900', color: theme.colors.ink }}>
                Take a selfie
              </Text>
              <Text style={{ color: theme.colors.muted, fontSize: 14 }}>
                We need a clear photo of your face for identity verification. This helps keep our
                community safe.
              </Text>

              <View
                style={{
                  backgroundColor: theme.colors.surface,
                  borderRadius: 16,
                  padding: 20,
                  alignItems: 'center',
                  gap: 16,
                  borderWidth: 2,
                  borderColor: selfieUploaded ? theme.colors.primary : theme.colors.border,
                  borderStyle: selfieUploaded ? 'solid' : 'dashed',
                }}
              >
                {/* Selfie preview circle */}
                <View
                  style={{
                    width: 140,
                    height: 140,
                    borderRadius: 70,
                    backgroundColor: selfieUri ? 'transparent' : theme.colors.canvas,
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    borderWidth: 3,
                    borderColor: selfieUploaded ? theme.colors.primary : theme.colors.border,
                  }}
                >
                  {selfieUri ? (
                    <Image
                      source={{ uri: selfieUri }}
                      style={{ width: 140, height: 140, borderRadius: 70 }}
                    />
                  ) : (
                    <Camera size={40} color={theme.colors.muted} />
                  )}
                </View>

                {selfieUploaded ? (
                  <View style={{ alignItems: 'center', gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <CheckCircle2 size={20} color={theme.colors.primary} />
                      <Text
                        style={{ color: theme.colors.primary, fontWeight: '800', fontSize: 15 }}
                      >
                        Selfie captured & uploaded
                      </Text>
                    </View>
                    <Button
                      label="Retake photo"
                      icon={<Camera size={16} color={theme.colors.ink} />}
                      onPress={handleSelfieCapture}
                      variant="secondary"
                    />
                  </View>
                ) : (
                  <Button
                    label={selfieUri ? 'Uploading...' : 'Take a selfie'}
                    icon={<Camera size={18} color="#fff" />}
                    onPress={handleSelfieCapture}
                    loading={uploading === 'SELFIE'}
                  />
                )}
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  gap: 10,
                  marginTop: 8,
                  justifyContent: 'center',
                  alignSelf: 'stretch',
                }}
              >
                <View style={{ flex: 1 }}>
                  <Button label="Back" onPress={() => slideTo('welcome')} variant="secondary" />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Continue"
                    onPress={() => slideTo('vehicle')}
                    disabled={!selfieUploaded}
                  />
                </View>
              </View>
            </>
          )}

          {/* Step 2: Vehicle details */}
          {step === 'vehicle' && (
            <>
              <Text style={{ fontSize: 22, fontWeight: '900', color: theme.colors.ink }}>
                Vehicle details
              </Text>
              <Text style={{ color: theme.colors.muted, fontSize: 14 }}>
                Tell us about the vehicle you'll be using for trips and deliveries.
              </Text>

              <View
                style={{
                  backgroundColor: theme.colors.surface,
                  borderRadius: 12,
                  padding: 16,
                  gap: 14,
                }}
              >
                <View style={{ gap: 4 }}>
                  <Text style={{ color: theme.colors.muted, fontSize: 13, fontWeight: '600' }}>
                    Vehicle type
                  </Text>
                  <TextInput
                    value={vehicleType}
                    onChangeText={setVehicleType}
                    placeholder="e.g. Car, Motorbike, Tricycle"
                    placeholderTextColor={theme.colors.muted}
                    style={{
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      borderRadius: 8,
                      padding: 12,
                      color: theme.colors.ink,
                    }}
                  />
                </View>

                <View style={{ gap: 4 }}>
                  <Text style={{ color: theme.colors.muted, fontSize: 13, fontWeight: '600' }}>
                    Plate number
                  </Text>
                  <TextInput
                    value={plateNumber}
                    onChangeText={setPlateNumber}
                    placeholder="e.g. GW-1234-20"
                    placeholderTextColor={theme.colors.muted}
                    autoCapitalize="characters"
                    style={{
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      borderRadius: 8,
                      padding: 12,
                      color: theme.colors.ink,
                    }}
                  />
                </View>

                <View style={{ gap: 4 }}>
                  <Text style={{ color: theme.colors.muted, fontSize: 13, fontWeight: '600' }}>
                    Vehicle photo
                  </Text>
                  <Text style={{ color: theme.colors.muted, fontSize: 11, marginBottom: 4 }}>
                    Optional — helps riders identify your vehicle
                  </Text>
                  <TouchableOpacity
                    onPress={handleVehiclePhoto}
                    style={{
                      borderWidth: 1,
                      borderColor: vehiclePhotoUri ? theme.colors.primary : theme.colors.border,
                      borderStyle: 'dashed',
                      borderRadius: 8,
                      padding: 16,
                      alignItems: 'center',
                      gap: 6,
                      backgroundColor: vehiclePhotoUri
                        ? theme.colors.primary + '08'
                        : 'transparent',
                    }}
                  >
                    {vehiclePhotoUri ? (
                      <View style={{ alignItems: 'center', gap: 4 }}>
                        <Image
                          source={{ uri: vehiclePhotoUri }}
                          style={{ width: 80, height: 60, borderRadius: 6 }}
                        />
                        <Text
                          style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '600' }}
                        >
                          Photo added
                        </Text>
                      </View>
                    ) : (
                      <>
                        <Camera size={24} color={theme.colors.muted} />
                        <Text style={{ color: theme.colors.muted, fontSize: 13 }}>
                          Tap to add vehicle photo
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button label="Back" onPress={() => slideTo('selfie')} variant="secondary" />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Continue"
                    onPress={() => slideTo('documents')}
                    disabled={!canProceedFromVehicle()}
                  />
                </View>
              </View>
            </>
          )}

          {/* Step 3: Documents (optional) */}
          {step === 'documents' && (
            <>
              <Text style={{ fontSize: 22, fontWeight: '900', color: theme.colors.ink }}>
                Upload documents
              </Text>
              <Text style={{ color: theme.colors.muted, fontSize: 14 }}>
                These are optional but recommended for faster verification. You can also do this
                later from your profile.
              </Text>

              {/* Ghana Card */}
              <DocUploadCard
                label="Ghana Card"
                type="GHANA_CARD"
                uploaded={Boolean(uploaded.GHANA_CARD)}
                localUri={localDocUris.GHANA_CARD ?? null}
                uploading={uploading === 'GHANA_CARD'}
                onUpload={() => uploadDocument('GHANA_CARD')}
              />

              {/* Driver License */}
              <DocUploadCard
                label="Driver License"
                type="DRIVER_LICENSE"
                uploaded={Boolean(uploaded.DRIVER_LICENSE)}
                localUri={localDocUris.DRIVER_LICENSE ?? null}
                uploading={uploading === 'DRIVER_LICENSE'}
                onUpload={() => uploadDocument('DRIVER_LICENSE')}
              />

              <View style={{ marginTop: 4 }}>
                <Text style={{ color: theme.colors.muted, fontSize: 12, textAlign: 'center' }}>
                  You can skip this step and upload documents later.
                </Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button label="Back" onPress={() => slideTo('vehicle')} variant="secondary" />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Continue" onPress={() => slideTo('complete')} />
                </View>
              </View>
            </>
          )}

          {/* Step 4: Complete */}
          {step === 'complete' && (
            <>
              <View style={{ alignItems: 'center', gap: 12, marginTop: 20 }}>
                <View
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 40,
                    backgroundColor: theme.colors.primary + '15',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CheckCircle2 size={44} color={theme.colors.primary} />
                </View>
                <Text
                  style={{
                    fontSize: 26,
                    fontWeight: '900',
                    color: theme.colors.ink,
                    textAlign: 'center',
                  }}
                >
                  All set, driver!
                </Text>
                <Text
                  style={{
                    color: theme.colors.muted,
                    fontSize: 15,
                    textAlign: 'center',
                    lineHeight: 22,
                    paddingHorizontal: 20,
                  }}
                >
                  Your profile has been submitted for review. You can start going online and
                  receiving trips while we verify your documents.
                </Text>
              </View>

              <View
                style={{
                  backgroundColor: theme.colors.surface,
                  borderRadius: 12,
                  padding: 16,
                  gap: 10,
                  marginTop: 10,
                }}
              >
                <SummaryRow
                  icon={<Camera size={18} color={theme.colors.primary} />}
                  label="Selfie"
                  status={selfieUploaded ? 'Uploaded' : 'Pending'}
                  done={selfieUploaded}
                />
                <SummaryRow
                  icon={<Car size={18} color={theme.colors.primary} />}
                  label={`Vehicle: ${vehicleType}`}
                  status={plateNumber}
                  done
                />
                <SummaryRow
                  icon={<BadgeCheck size={18} color={theme.colors.primary} />}
                  label="Ghana Card"
                  status={uploaded.GHANA_CARD ? 'Uploaded' : 'Skipped'}
                  done={Boolean(uploaded.GHANA_CARD)}
                />
                <SummaryRow
                  icon={<BadgeCheck size={18} color={theme.colors.primary} />}
                  label="Driver License"
                  status={uploaded.DRIVER_LICENSE ? 'Uploaded' : 'Skipped'}
                  done={Boolean(uploaded.DRIVER_LICENSE)}
                />
              </View>

              <View style={{ marginTop: 12 }}>
                <Button
                  label="Start earning"
                  icon={<DollarSign size={18} color="#fff" />}
                  onPress={handleComplete}
                  loading={uploading === 'VEHICLE_PHOTO'}
                />
              </View>
            </>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function FeatureRow({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: theme.colors.primary + '12',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.colors.ink, fontWeight: '800', fontSize: 14 }}>{title}</Text>
        <Text style={{ color: theme.colors.muted, fontSize: 12 }}>{description}</Text>
      </View>
    </View>
  );
}

function SummaryRow({
  icon,
  label,
  status,
  done,
}: {
  icon: React.ReactNode;
  label: string;
  status: string;
  done: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.colors.ink, fontWeight: '600', fontSize: 13 }}>{label}</Text>
      </View>
      <Text
        style={{
          color: done ? theme.colors.primary : theme.colors.muted,
          fontWeight: '700',
          fontSize: 12,
        }}
      >
        {status}
      </Text>
    </View>
  );
}

function DocUploadCard({
  label,
  uploaded,
  localUri,
  uploading,
  onUpload,
}: {
  label: string;
  type: DocumentType;
  uploaded: boolean;
  localUri: string | null;
  uploading: boolean;
  onUpload: () => void;
}) {
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: 12,
        padding: 14,
        gap: 10,
        borderWidth: 1,
        borderColor: uploaded ? theme.colors.primary + '40' : theme.colors.border,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 8,
            backgroundColor: uploaded ? theme.colors.primary + '10' : theme.colors.canvas,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {localUri ? (
            <Image source={{ uri: localUri }} style={{ width: 44, height: 44, borderRadius: 8 }} />
          ) : (
            <ImageIcon size={20} color={uploaded ? theme.colors.primary : theme.colors.muted} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.colors.ink, fontWeight: '800', fontSize: 14 }}>{label}</Text>
          <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
            {uploaded ? 'Uploaded' : 'Tap to upload'}
          </Text>
        </View>
        {uploaded ? <CheckCircle2 size={18} color={theme.colors.primary} /> : null}
      </View>
      {!uploaded ? (
        <Button
          label="Upload"
          icon={<Camera size={16} color="#fff" />}
          onPress={onUpload}
          loading={uploading}
        />
      ) : null}
    </View>
  );
}
