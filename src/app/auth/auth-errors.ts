/** Turns Firebase Auth errors into messages users can act on. */
export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return 'Please choose a stronger password: 8+ characters with upper- and lowercase letters, a number and a symbol.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/account-exists-with-different-credential':
      return 'This email already has an account. Sign in with your password instead.';
    case 'auth/popup-blocked':
      return 'The sign-in popup was blocked. Allow popups for this site and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
