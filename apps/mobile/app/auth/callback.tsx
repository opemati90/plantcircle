import { Redirect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';

/**
 * Where Apple and Google sign-in return (`auth/callback`). In the browser this runs inside the
 * sign-in popup: completing the auth session hands the result back to the page that opened it,
 * which exchanges the code (signInWithOAuth) and closes the popup. Opened any other way (a stale
 * link, the app cold-started by the redirect), there is nothing to complete: go home.
 */
const completed = WebBrowser.maybeCompleteAuthSession();

export default function AuthCallback() {
  if (completed.type === 'success') return null;
  return <Redirect href="/home" />;
}
