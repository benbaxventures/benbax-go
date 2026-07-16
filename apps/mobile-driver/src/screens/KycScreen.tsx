import Constants from 'expo-constants';
import { BadgeCheck, Camera, CheckCircle2, FileUp, Image as ImageIcon } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Text, TextInput, View } from 'react-native';
import { Button } from '../components/Button';
import { OfflineBanner } from '../components/OfflineBanner';
import { Screen } from '../components/Screen';
import { apiRequest } from '../services/api';
import { theme } from '../theme/tokens';

type DocumentType = 'SELFIE' | 'GHANA_CARD' | 'PASSPORT_PHOTO' | 'DRIVER_LICENSE' | 'VEHICLE_PHOTO';

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
};

type DocumentPickerModule = {
  getDocumentAsync: (
    options: Record<string, unknown>
  ) => Promise<{ canceled: boolean; assets: PickedAsset[] | null }>;
};

const documents: Array<{ type: DocumentType; label: string }> = [
  { type: 'SELFIE', label: 'Selfie / Portrait' },
  { type: 'GHANA_CARD', label: 'Ghana Card' },
  { type: 'DRIVER_LICENSE', label: 'Driver license' },
  { type: 'VEHICLE_PHOTO', label: 'Vehicle photo' },
];

const isExpoGo = Constants.appOwnership === 'expo';

function showNativePickerUnavailable(kind: 'camera' | 'gallery' | 'file') {
  const label = kind === 'file' ? 'file upload' : kind;
  Alert.alert(
    'Native picker unavailable',
    `The ${label} picker is not available in Expo Go. Use a dev build to test document capture.`
  );
}

async function loadImagePicker(kind: 'camera' | 'gallery'): Promise<ImagePickerModule | null> {
  if (isExpoGo) {
    showNativePickerUnavailable(kind);
    return null;
  }

  try {
    const module = await import('expo-image-picker');
    return module.default ?? module;
  } catch {
    showNativePickerUnavailable(kind);
    return null;
  }
}

async function loadDocumentPicker(): Promise<DocumentPickerModule | null> {
  if (isExpoGo) {
    showNativePickerUnavailable('file');
    return null;
  }

  try {
    const module = await import('expo-document-picker');
    const picker = module.default ?? module;
    if (typeof picker.getDocumentAsync !== 'function') {
      showNativePickerUnavailable('file');
      return null;
    }
    return picker;
  } catch {
    showNativePickerUnavailable('file');
    return null;
  }
}

export function KycScreen() {
  const [uploaded, setUploaded] = useState<Partial<Record<DocumentType, string>>>({});
  const [localUris, setLocalUris] = useState<Partial<Record<DocumentType, string>>>({});
  const [vehicleType, setVehicleType] = useState('Car');
  const [plateNumber, setPlateNumber] = useState('');
  const [activeType, setActiveType] = useState<DocumentType | null>(null);

  const uploadedCount = Object.keys(uploaded).length;
  const totalDocs = documents.length;
  const progressPct = Math.round((uploadedCount / totalDocs) * 100);

  async function uploadFromCamera(type: DocumentType) {
    const ImagePicker = await loadImagePicker('camera');
    if (!ImagePicker) return;

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        if (type !== 'SELFIE') {
          // Fallback to library for non-selfie docs
          await uploadFromLibrary(type);
        } else {
          Alert.alert('Camera permission needed', 'Allow camera access to capture your selfie.');
        }
        return;
      }

      // No `allowsEditing` for selfies: on Android the cropper runs as a
      // separate activity that frequently makes the OS destroy MainActivity,
      // losing the captured photo and snapping the flow back to the start.
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.5,
      });
      if (!result.canceled && result.assets) {
        const uri = result.assets[0]?.uri;
        if (uri) {
          setLocalUris((current) => ({ ...current, [type]: uri }));
        }
        await uploadAsset(type, {
          uri,
          name: `${type.toLowerCase()}.jpg`,
          type: result.assets[0]?.mimeType ?? 'image/jpeg',
        });
      }
    } catch (error) {
      Alert.alert(
        'Camera unavailable',
        error instanceof Error ? error.message : 'Could not open the camera.'
      );
    }
  }

  async function uploadFromLibrary(type: DocumentType) {
    const ImagePicker = await loadImagePicker('gallery');
    if (!ImagePicker) return;

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photo permission needed', 'Allow photo access to choose KYC documents.');
        return;
      }

      // Same reason as the camera path: the selfie cropper activity can make
      // Android destroy MainActivity and drop the picked image.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.5,
      });
      if (!result.canceled && result.assets) {
        const uri = result.assets[0]?.uri;
        if (uri) {
          setLocalUris((current) => ({ ...current, [type]: uri }));
        }
        await uploadAsset(type, {
          uri,
          name: `${type.toLowerCase()}.jpg`,
          type: result.assets[0]?.mimeType ?? 'image/jpeg',
        });
      }
    } catch (error) {
      Alert.alert(
        'Gallery unavailable',
        error instanceof Error ? error.message : 'Could not open the photo gallery.'
      );
    }
  }

  async function uploadFromFile(type: DocumentType) {
    const DocumentPicker = await loadDocumentPicker();
    if (!DocumentPicker) return;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets) {
        const asset = result.assets[0];
        await uploadAsset(type, {
          uri: asset?.uri,
          name: asset?.name ?? `${type.toLowerCase()}.jpg`,
          type: asset?.mimeType ?? 'application/octet-stream',
        });
      }
    } catch (error) {
      Alert.alert(
        'File upload unavailable',
        error instanceof Error ? error.message : 'Could not open the file picker.'
      );
    }
  }

  async function uploadAsset(
    type: DocumentType,
    asset: { uri: string | undefined; name: string; type: string } | PickedAsset
  ) {
    if (!asset.uri) return;
    setActiveType(type);
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
        name: asset.name ?? `${type.toLowerCase()}.jpg`,
        type: 'type' in asset ? asset.type : (asset.mimeType ?? 'image/jpeg'),
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
          {
            method: 'POST',
            body: form,
            signal: uploadController.signal,
          }
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
          vehicleType,
          plateNumber,
        }),
      });

      setUploaded((current) => ({ ...current, [type]: cloudinaryBody.secure_url }));
      Alert.alert(
        'Uploaded',
        `${documents.find((d) => d.type === type)?.label ?? 'Document'} submitted for review.`
      );
    } catch (error) {
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setActiveType(null);
    }
  }

  return (
    <Screen>
      <OfflineBanner />
      {/* Header */}
      <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.ink }}>Driver KYC</Text>

      {/* Progress card */}
      <View
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: 12,
          padding: 16,
          gap: 10,
          borderLeftWidth: 4,
          borderLeftColor: progressPct === 100 ? theme.colors.primary : theme.colors.accent,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <BadgeCheck
            size={22}
            color={progressPct === 100 ? theme.colors.primary : theme.colors.accent}
          />
          <Text style={{ color: theme.colors.ink, fontWeight: '900' }}>Identity verification</Text>
        </View>
        <Text style={{ color: theme.colors.muted }}>
          Upload your documents and vehicle details to start earning.
        </Text>

        {/* Progress bar */}
        <View
          style={{
            height: 6,
            borderRadius: 3,
            backgroundColor: theme.colors.border,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${progressPct}%`,
              height: '100%',
              backgroundColor: progressPct === 100 ? theme.colors.primary : theme.colors.accent,
              borderRadius: 3,
            }}
          />
        </View>
        <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
          {uploadedCount} of {totalDocs} documents uploaded
        </Text>
      </View>

      {/* Selfie section - highlighted */}
      <View
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: 12,
          padding: 16,
          gap: 12,
          borderWidth: 2,
          borderColor: uploaded.SELFIE ? theme.colors.primary : theme.colors.border,
          borderStyle: uploaded.SELFIE ? 'solid' : 'dashed',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: uploaded.SELFIE ? theme.colors.primary + '20' : theme.colors.border,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {localUris.SELFIE ? (
              <Image
                source={{ uri: localUris.SELFIE }}
                style={{ width: 48, height: 48, borderRadius: 24 }}
              />
            ) : (
              <Camera
                size={22}
                color={uploaded.SELFIE ? theme.colors.primary : theme.colors.muted}
              />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.colors.ink, fontWeight: '900' }}>
              Selfie / Portrait photo
            </Text>
            <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
              {uploaded.SELFIE
                ? 'Your selfie has been submitted for verification'
                : 'Take a clear photo of your face to verify your identity'}
            </Text>
          </View>
          {uploaded.SELFIE ? <CheckCircle2 size={22} color={theme.colors.primary} /> : null}
        </View>

        {uploaded.SELFIE ? (
          <Button
            label="Update selfie"
            icon={<Camera size={18} color={theme.colors.ink} />}
            onPress={() => uploadFromCamera('SELFIE')}
            variant="secondary"
            loading={activeType === 'SELFIE'}
          />
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button
                label="Take photo"
                icon={<Camera size={18} color="#fff" />}
                onPress={() => uploadFromCamera('SELFIE')}
                loading={activeType === 'SELFIE'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="Gallery"
                icon={<ImageIcon size={18} color={theme.colors.ink} />}
                onPress={() => uploadFromLibrary('SELFIE')}
                variant="secondary"
              />
            </View>
          </View>
        )}
      </View>

      {/* Vehicle details */}
      <View
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: 12,
          padding: 16,
          gap: 12,
        }}
      >
        <Text style={{ color: theme.colors.ink, fontWeight: '900' }}>Vehicle details</Text>
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
      </View>

      {/* Document list with photo previews */}
      {documents
        .filter((d) => d.type !== 'SELFIE')
        .map((document) => {
          const isBusy = activeType === document.type;
          const isUploaded = Boolean(uploaded[document.type]);
          const localUri = localUris[document.type];
          return (
            <View
              key={document.type}
              style={{
                backgroundColor: theme.colors.surface,
                borderRadius: 12,
                padding: 16,
                gap: 10,
                borderWidth: 1,
                borderColor: isUploaded ? theme.colors.primary + '40' : theme.colors.border,
              }}
            >
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {/* Thumbnail preview */}
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 8,
                    backgroundColor: isUploaded ? theme.colors.primary + '10' : theme.colors.canvas,
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  {localUri ? (
                    <Image
                      source={{ uri: localUri }}
                      style={{ width: 56, height: 56, borderRadius: 8 }}
                    />
                  ) : (
                    <ImageIcon
                      size={22}
                      color={isUploaded ? theme.colors.primary : theme.colors.muted}
                    />
                  )}
                </View>

                <View style={{ flex: 1, justifyContent: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: theme.colors.ink, fontWeight: '900' }}>
                      {document.label}
                    </Text>
                    {isUploaded ? <CheckCircle2 size={16} color={theme.colors.primary} /> : null}
                  </View>
                  <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                    {isUploaded ? 'Submitted for review' : 'Capture or upload a clear image'}
                  </Text>
                </View>

                {isBusy ? <ActivityIndicator color={theme.colors.primary} /> : null}
              </View>

              {!isUploaded ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Camera"
                      icon={<Camera size={18} color="#fff" />}
                      onPress={() => uploadFromCamera(document.type)}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Gallery"
                      icon={<ImageIcon size={18} color={theme.colors.ink} />}
                      onPress={() => uploadFromLibrary(document.type)}
                      variant="secondary"
                    />
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Re-upload"
                      icon={<Camera size={18} color="#fff" />}
                      onPress={() => uploadFromCamera(document.type)}
                      loading={isBusy}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="From file"
                      icon={<FileUp size={18} color={theme.colors.ink} />}
                      onPress={() => uploadFromFile(document.type)}
                      variant="secondary"
                    />
                  </View>
                </View>
              )}
            </View>
          );
        })}

      {/* Complete KYC CTA */}
      {uploadedCount > 0 && uploadedCount < totalDocs ? (
        <View
          style={{
            backgroundColor: theme.colors.canvas,
            borderRadius: 12,
            padding: 16,
            gap: 4,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: theme.colors.ink, fontWeight: '900', fontSize: 15 }}>
            {uploadedCount} of {totalDocs} documents uploaded
          </Text>
          <Text style={{ color: theme.colors.muted, fontSize: 13, textAlign: 'center' }}>
            Upload all {totalDocs} documents and fill in vehicle details to complete verification.
          </Text>
        </View>
      ) : null}

      {uploadedCount === totalDocs ? (
        <View
          style={{
            backgroundColor: theme.colors.primary + '10',
            borderRadius: 12,
            padding: 16,
            gap: 6,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: theme.colors.primary + '30',
          }}
        >
          <CheckCircle2 size={32} color={theme.colors.primary} />
          <Text style={{ color: theme.colors.primary, fontWeight: '900', fontSize: 16 }}>
            All documents submitted!
          </Text>
          <Text style={{ color: theme.colors.muted, fontSize: 13, textAlign: 'center' }}>
            Your KYC is under review. You will be notified once verified — usually within 24 hours.
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}
