const appJson = require('./app.json');

module.exports = () => {
  const driverProjectId = process.env.EXPO_PUBLIC_DRIVER_EAS_PROJECT_ID ?? 'your-driver-eas-project-id';
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api/v1';
  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? 'your-google-maps-api-key';

  return {
    ...appJson,
    expo: {
      ...appJson.expo,
      extra: {
        ...appJson.expo.extra,
        apiBaseUrl,
        googleMapsApiKey,
        eas: {
          ...appJson.expo.extra?.eas,
          projectId: driverProjectId
        }
      },
      updates: {
        ...appJson.expo.updates,
        url: `https://u.expo.dev/${driverProjectId}`
      }
    }
  };
};
