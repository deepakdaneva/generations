// Deployed builds (UAT, Production). The Firebase web config is not baked in:
// it is loaded at startup from Firebase Hosting's reserved /__/firebase/init.json,
// so the same build works for whichever project it is deployed to.
export const environment = {
  production: true,
  useEmulators: false,
  firebase: null as object | null,
};
