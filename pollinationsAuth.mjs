export const POLLINATIONS_APP_KEY = 'pk_tmT2qnIoPEdplZkR';
export const POLLINATIONS_TOKEN_KEY = 'satoshiChatPollinationsToken';

const AUTH_BASE = 'https://enter.pollinations.ai';
const VERIFIER_KEY = 'satoshiChatPkceVerifier';
const STATE_KEY = 'satoshiChatOauthState';
const RETURN_KEY = 'satoshiChatReturnUrl';

function randomBase64Url(byteLength) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return base64Url(bytes);
}

function base64Url(bytes) {
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

export function callbackUrl() {
  return `${location.origin}/ai-callback.html`;
}

export async function beginPollinationsAuthorization() {
  if (!window.isSecureContext || !crypto.subtle) {
    throw new Error('Secure browser context required for Pollinations sign-in.');
  }
  const verifier = randomBase64Url(64);
  const state = randomBase64Url(24);
  const challenge = await sha256Base64Url(verifier);
  const returnUrl = `${location.pathname}${location.search}${location.hash}`;
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(RETURN_KEY, returnUrl);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: POLLINATIONS_APP_KEY,
    redirect_uri: callbackUrl(),
    scope: 'usage',
    expiry: '7',
    budget: '5',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  location.assign(`${AUTH_BASE}/authorize?${params}`);
}

export async function completePollinationsAuthorization(search = location.search) {
  const params = new URLSearchParams(search);
  const authorizationError = params.get('error');
  if (authorizationError) throw new Error(params.get('error_description') || authorizationError);
  const code = params.get('code');
  const returnedState = params.get('state');
  const expectedState = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!code || !returnedState || !expectedState || !verifier || returnedState !== expectedState) {
    throw new Error('Pollinations authorization could not be verified. Please start again from the chat.');
  }

  const response = await fetch(`${AUTH_BASE}/api/oauth/token`, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: POLLINATIONS_APP_KEY,
      redirect_uri: callbackUrl(),
      code_verifier: verifier,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.access_token !== 'string') {
    throw new Error(payload.error_description || payload.error || 'Pollinations token exchange failed.');
  }
  sessionStorage.setItem(POLLINATIONS_TOKEN_KEY, payload.access_token);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  const returnUrl = sessionStorage.getItem(RETURN_KEY) || '/';
  sessionStorage.removeItem(RETURN_KEY);
  const target = new URL(returnUrl, location.origin);
  return target.origin === location.origin ? `${target.pathname}${target.search}${target.hash}` : '/';
}
