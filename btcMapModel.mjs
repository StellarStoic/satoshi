const API_BASE = 'https://api.btcmap.org/v4';
export const BTC_MAP_AUTH_URL = `${API_BASE}/auth/nostr`;
export const BTC_MAP_SAVED_URL = `${API_BASE}/places/saved`;

export function btcMapAuthTemplate(now = Date.now()) {
  return {
    kind:27235,
    created_at:Math.floor(now / 1000),
    tags:[['u', BTC_MAP_AUTH_URL], ['method', 'POST']],
    content:'',
  };
}

export function nip98Authorization(event) {
  const bytes = new TextEncoder().encode(JSON.stringify(event));
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return `Nostr ${btoa(binary)}`;
}

export const PLACE_DETAIL_FIELDS = [
  'id', 'lat', 'lon', 'icon', 'name', 'address', 'opening_hours', 'comments',
  'created_at', 'updated_at', 'verified_at', 'osm_id', 'osm_url', 'phone',
  'website', 'twitter', 'facebook', 'instagram', 'line', 'telegram', 'email',
  'boosted_until', 'required_app_url', 'description', 'image', 'payment_provider',
].join(',');

export function btcMapSearchUrl(query = '', location = null, limit = 30) {
  const params = new URLSearchParams({q:String(query).trim(), limit:String(Math.max(1, Math.min(100, limit)))});
  if (Number.isFinite(location?.lat) && Number.isFinite(location?.lon)) {
    params.set('lat', String(location.lat));
    params.set('lon', String(location.lon));
  }
  return `${API_BASE}/search/?${params}`;
}

export function btcMapPlacesUrl({lat, lon, radiusKm}) {
  const params = new URLSearchParams({
    lat:String(lat), lon:String(lon), radius_km:String(Math.max(1, Math.min(300, Math.ceil(radiusKm)))),
  });
  return `${API_BASE}/places/search/?${params}`;
}

export function btcMapPlaceUrl(id) {
  return `${API_BASE}/places/${encodeURIComponent(String(id))}?fields=${encodeURIComponent(PLACE_DETAIL_FIELDS)}`;
}

export function btcMapCommentsUrl(id) {
  return `${API_BASE}/places/${encodeURIComponent(String(id))}/comments`;
}

export function haversineKm(left, right) {
  const radians = value => Number(value) * Math.PI / 180;
  const lat1 = radians(left?.lat);
  const lat2 = radians(right?.lat);
  const deltaLat = lat2 - lat1;
  const deltaLon = radians(right?.lon) - radians(left?.lon);
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
}

export function viewportRadiusKm(center, northEast) {
  return Math.max(1, Math.min(300, haversineKm(center, northEast)));
}

export function placeFeature(place = {}) {
  const lat = Number(place.lat);
  const lon = Number(place.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    type:'Feature',
    geometry:{type:'Point', coordinates:[lon, lat]},
    properties:{
      id:String(place.id ?? ''),
      name:String(place.name || 'Bitcoin place'),
      icon:String(place.icon || 'storefront'),
      address:String(place.address || ''),
      verifiedAt:String(place.verified_at || ''),
      boosted:Boolean(place.boosted_until && Date.parse(place.boosted_until) > Date.now()),
    },
  };
}

export function placeCollection(places = []) {
  return {type:'FeatureCollection', features:places.map(placeFeature).filter(Boolean)};
}

export function verificationLabel(value = '', now = Date.now()) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'Not recently verified';
  const days = Math.max(0, Math.floor((now - timestamp) / 86400000));
  if (days === 0) return 'Verified today';
  if (days < 31) return `Verified ${days} day${days === 1 ? '' : 's'} ago`;
  if (days < 730) {
    const months = Math.max(1, Math.round(days / 30.44));
    return `Verified ${months} month${months === 1 ? '' : 's'} ago`;
  }
  return `Last verified ${new Date(timestamp).toLocaleDateString()}`;
}

export function safeHttpUrl(value = '') {
  try {
    const url = new URL(String(value));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

export function osmPlaceUrl(place = {}) {
  const direct = safeHttpUrl(place.osm_url);
  if (direct) return direct;
  const lat = Number(place.lat);
  const lon = Number(place.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=19/${lat}/${lon}`;
}
