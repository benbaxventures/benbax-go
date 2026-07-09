const appJson = require('./app.json');

module.exports = () => {
  const driverProjectId =
    process.env.EXPO_PUBLIC_DRIVER_EAS_PROJECT_ID ?? '81c6b202-f147-4843-a15a-59c386d82b42';
  const apiBaseUrl =
    process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://benbaxapi-production.up.railway.app/api/v1';
  const socketUrl =
    process.env.EXPO_PUBLIC_SOCKET_URL ?? 'https://benbaxapi-production.up.railway.app';
  const googleMapsApiKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? 'your-google-maps-api-key';

  return {
    ...appJson,
    expo: {
      ...appJson.expo,
      extra: {
        ...appJson.expo.extra,
        apiBaseUrl,
        socketUrl,
        googleMapsApiKey,
        eas: {
          ...appJson.expo.extra?.eas,
          projectId: driverProjectId,
        },
      },
      updates: {
        ...appJson.expo.updates,
        url: `https://u.expo.dev/${driverProjectId}`,
      },
    },
  };
};
