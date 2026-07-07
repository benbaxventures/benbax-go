const appJson = require('./app.json');

module.exports = () => {
  const driverProjectId =
    process.env.EXPO_PUBLIC_DRIVER_EAS_PROJECT_ID ?? '12d0a70a-1626-4e4c-b900-8d844978d653';
  const apiBaseUrl =
    process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://benbax-go.onrender.com/api/v1';
  const socketUrl =
    process.env.EXPO_PUBLIC_SOCKET_URL ?? 'https://benbax-go.onrender.com';
  const googleMapsApiKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? 'your-google-maps-api-key';

  return {
    ...appJson,
    expo: {
      ...appJson.expo,
      android: {
        ...appJson.expo.android,
        config: {
          ...(appJson.expo.android?.config ?? {}),
          googleMaps: {
            apiKey: googleMapsApiKey,
          },
        },
      },
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
