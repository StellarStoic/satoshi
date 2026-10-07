export const PAY_SERVICE_ORIGIN = 'https://pay.satoshi.si';
export const LEGACY_NIP05_ORIGIN = 'https://nip05.satoshi.si';

export function payServiceUrl(product, path = '') {
  const cleanProduct = String(product || '').replace(/^\/+|\/+$/g, '');
  const cleanPath = String(path || '').replace(/^\/+/, '');
  return `${PAY_SERVICE_ORIGIN}/${cleanProduct}/v1${cleanPath ? `/${cleanPath}` : ''}`;
}
