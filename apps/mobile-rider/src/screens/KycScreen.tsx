import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { BadgeCheck, Camera, FileUp, Image as ImageIcon } from 'lucide-react-native';
import { ActivityIndicator, Alert, Text, TextInput, View } from 'react-native';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { apiRequest } from '../services/api';
import { theme } from '../theme/tokens';

type DocumentType = 'GHANA_CARD' | 'PASSPORT_PHOTO' | 'DRIVER_LICENSE' | 'VEHICLE_PHOTO';

type UploadSignature = {
  cloudName?: string;
  apiKey?: string;
  timestamp: number;
  folder: string;
  signature: string;
};

const documents: Array<{ type: DocumentType; label: string }> = [
  { type: 'GHANA_CARD', label: 'Ghana Card' },
  { type: 'PASSPORT_PHOTO', label: 'Passport photo' },
  { type: 'DRIVER_LICENSE', label: 'Driver license' },
  { type: 'VEHICLE_PHOTO', label: 'Vehicle photo' }
];

export function KycScreen() {
  const [uploaded, setUploaded] = useState<Partial<Record<DocumentType, string>>>({});
  const [vehicleType, setVehicleType] = useState('Motorbike');
  const [plateNumber, setPlateNumber] = useState('');
  const [activeType, setActiveType] = useState<DocumentType | null>(null);

  async function uploadFromCamera(type: DocumentType) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera permission needed', 'Allow camera access to capture KYC documents.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.85
    });
    if (!result.canceled) {
      await uploadAsset(type, {
        uri: result.assets[0]?.uri,
        name: `${type.toLowerCase()}.jpg`,
        type: result.assets[0]?.mimeType ?? 'image/jpeg'
      });
    }
  }

  async function uploadFromLibrary(type: DocumentType) {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo permission needed', 'Allow photo access to choose KYC documents.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.85
    });
    if (!result.canceled) {
      await uploadAsset(type, {
        uri: result.assets[0]?.uri,
        name: `${type.toLowerCase()}.jpg`,
        type: result.assets[0]?.mimeType ?? 'image/jpeg'
      });
    }
  }

  async function uploadFromFile(type: DocumentType) {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: true
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      await uploadAsset(type, {
        uri: asset?.uri,
        name: asset?.name ?? `${type.toLowerCase()}.jpg`,
        type: asset?.mimeType ?? 'application/octet-stream'
      });
    }
  }

  async function uploadAsset(type: DocumentType, asset: { uri: string | undefined; name: string; type: string }) {
    if (!asset.uri) return;
    setActiveType(type);
    try {
      const signature = await apiRequest<UploadSignature>('/media/cloudinary-signature', {
        method: 'POST'
      });
      if (!signature.cloudName || !signature.apiKey || !signature.signature) {
        throw new Error('Cloudinary is not configured on the API.');
      }

      const form = new FormData();
      form.append('file', {
        uri: asset.uri,
        name: asset.name,
        type: asset.type
      } as unknown as Blob);
      form.append('api_key', signature.apiKey);
      form.append('timestamp', String(signature.timestamp));
      form.append('folder', signature.folder);
      form.append('signature', signature.signature);

      const cloudinaryResponse = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/auto/upload`, {
        method: 'POST',
        body: form
      });
      const cloudinaryBody = (await cloudinaryResponse.json()) as { secure_url?: string; error?: { message?: string } };
      if (!cloudinaryResponse.ok || !cloudinaryBody.secure_url) {
        throw new Error(cloudinaryBody.error?.message ?? 'Upload failed');
      }

      await apiRequest('/riders/me/kyc', {
        method: 'POST',
        body: JSON.stringify({
          documentType: type,
          fileUrl: cloudinaryBody.secure_url,
          vehicleType,
          plateNumber
        })
      });

      setUploaded((current) => ({ ...current, [type]: cloudinaryBody.secure_url }));
      Alert.alert('Uploaded', `${documents.find((document) => document.type === type)?.label ?? 'Document'} submitted for review.`);
    } catch (error) {
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setActiveType(null);
    }
  }

  return (
    <Screen>
      <Text style={{ fontSize: 26, fontWeight: '900', color: theme.colors.ink }}>KYC</Text>
      <View style={{ backgroundColor: theme.colors.surface, borderRadius: 8, padding: 16, gap: 8 }}>
        <BadgeCheck size={24} color={theme.colors.primary} />
        <Text style={{ color: theme.colors.ink, fontWeight: '900' }}>Verify rider identity</Text>
        <Text style={{ color: theme.colors.muted }}>Upload Ghana Card, license, vehicle details, and complete facial verification.</Text>
      </View>

      <View style={{ backgroundColor: theme.colors.surface, borderRadius: 8, padding: 14, gap: 10 }}>
        <Text style={{ color: theme.colors.ink, fontWeight: '900' }}>Vehicle details</Text>
        <Text style={{ color: theme.colors.muted, fontSize: 13, fontWeight: '600' }}>Vehicle type</Text>
        <TextInput
          value={vehicleType}
          onChangeText={setVehicleType}
          placeholder="e.g. Car, Motorbike, Tricycle"
          placeholderTextColor={theme.colors.muted}
          style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 12, color: theme.colors.ink }}
        />
        <Text style={{ color: theme.colors.muted, fontSize: 13, fontWeight: '600' }}>Plate number</Text>
        <TextInput
          value={plateNumber}
          onChangeText={setPlateNumber}
          placeholder="e.g. GW-1234-20"
          placeholderTextColor={theme.colors.muted}
          autoCapitalize="characters"
          style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 12, color: theme.colors.ink }}
        />
      </View>

      {documents.map((document) => {
        const isBusy = activeType === document.type;
        const isUploaded = Boolean(uploaded[document.type]);
        return (
          <View key={document.type} style={{ backgroundColor: theme.colors.surface, borderRadius: 8, padding: 14, gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.ink, fontWeight: '900' }}>{document.label}</Text>
                <Text style={{ color: isUploaded ? theme.colors.primary : theme.colors.muted }}>
                  {isUploaded ? 'Submitted for review' : 'Capture or upload a clear image/document.'}
                </Text>
              </View>
              {isBusy ? <ActivityIndicator color={theme.colors.primary} /> : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Button label="Camera" icon={<Camera size={18} color="#fff" />} onPress={() => uploadFromCamera(document.type)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Gallery" icon={<ImageIcon size={18} color={theme.colors.ink} />} onPress={() => uploadFromLibrary(document.type)} variant="secondary" />
              </View>
            </View>
            <Button label="File upload" icon={<FileUp size={18} color={theme.colors.ink} />} onPress={() => uploadFromFile(document.type)} variant="secondary" />
          </View>
        );
      })}
    </Screen>
  );
}
