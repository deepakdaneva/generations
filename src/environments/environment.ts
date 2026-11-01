// Local development: talks to the Firebase Emulator Suite. "demo-" project ids
// never reach real Firebase services, so these values are placeholders.
export const environment = {
  production: false,
  useEmulators: true,
  firebase: {
    apiKey: 'demo-api-key',
    authDomain: 'demo-generations.firebaseapp.com',
    projectId: 'demo-generations',
  } as object | null,
};
