import { Alert, Linking, Platform } from 'react-native';

export function callPhone(phone: string) {
  const url = `tel:${phone}`;
  Linking.canOpenURL(url)
    .then((supported) => {
      if (supported) return Linking.openURL(url);
      Alert.alert('Unable to call', `Phone calls are not supported on this device. Number: ${phone}`);
    })
    .catch(() => Alert.alert('Error', 'Could not initiate the call.'));
}

export function openWhatsApp(phone: string, message?: string) {
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const waUrl = `https://wa.me/${cleanPhone}${text}`;

  Linking.openURL(waUrl).catch(() => {
    Alert.alert('WhatsApp not found', 'WhatsApp is not installed on this device.');
  });
}

export const BENBAX_PHONE = '+2330598204414';
