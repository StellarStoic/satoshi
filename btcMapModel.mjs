const API_BASE = 'https://api.btcmap.org/v4';
export const BTC_MAP_AUTH_URL = `${API_BASE}/auth/nostr`;
export const BTC_MAP_SAVED_URL = `${API_BASE}/places/saved`;
export const BTC_MAP_HEAT_PLACES_URL = `${API_BASE}/places?fields=id%2Clat%2Clon`;

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

function heatMercator(lon, lat) {
  const latitude = Math.max(-85, Math.min(85, Number(lat) || 0)) * Math.PI / 180;
  return {
    x:(Number(lon) + 180) / 360,
    y:.5 - Math.log(Math.tan(Math.PI / 4 + latitude / 2)) / (2 * Math.PI),
  };
}

function heatLngLat(x, y) {
  const longitude = Math.max(-179.999999, Math.min(179.999999, x * 360 - 180));
  return [longitude, (2 * Math.atan(Math.exp((.5 - y) * 2 * Math.PI)) - Math.PI / 2) * 180 / Math.PI];
}

function roundHeatHex(q, r) {
  const x = q;
  const z = r;
  const y = -x - z;
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return {q:rx, r:rz};
}

function heatHexSize(zoom) {
  return Math.max(.00000012, .022 / (2 ** Math.max(0, Number(zoom) - 2)));
}

export function btcMapHeatFeatures(places = [], zoom = 2) {
  const size = heatHexSize(zoom);
  const bins = new Map();
  for (const place of places) {
    const lat = Number(place?.lat);
    const lon = Number(place?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const point = heatMercator(lon, lat);
    const cell = roundHeatHex(
      ((Math.sqrt(3) / 3) * point.x - point.y / 3) / size,
      (2 * point.y / 3) / size,
    );
    const key = `${cell.q}:${cell.r}`;
    const bin = bins.get(key) || {q:cell.q, r:cell.r, count:0};
    bin.count += 1;
    bins.set(key, bin);
  }
  return [...bins.values()].map(bin => {
    const center = {x:size * Math.sqrt(3) * (bin.q + bin.r / 2), y:size * 1.5 * bin.r};
    const ring = Array.from({length:6}, (_, index) => {
      const angle = (60 * index - 30) * Math.PI / 180;
      return heatLngLat(center.x + size * Math.cos(angle), center.y + size * Math.sin(angle));
    });
    ring.push(ring[0]);
    const [centerLon, centerLat] = heatLngLat(center.x, center.y);
    return {
      type:'Feature',
      properties:{count:bin.count, label:String(bin.count), centerLon, centerLat},
      geometry:{type:'Polygon', coordinates:[ring]},
    };
  });
}

export const PLACE_DETAIL_FIELDS = [
  'id', 'lat', 'lon', 'icon', 'name', 'address', 'opening_hours', 'comments',
  'created_at', 'updated_at', 'verified_at', 'osm_id', 'osm_url', 'phone',
  'website', 'twitter', 'facebook', 'instagram', 'line', 'telegram', 'email',
  'boosted_until', 'required_app_url', 'description', 'image', 'payment_provider',
  'osm:shop', 'osm:amenity', 'osm:tourism', 'osm:craft', 'osm:office',
  'osm:leisure', 'osm:healthcare', 'osm:cuisine', 'osm:product', 'osm:service',
  'osm:description', 'osm:goods', 'osm:produce', 'osm:clothes', 'osm:beauty',
  'osm:healthcare:speciality', 'osm:sport', 'osm:second_hand',
  'osm:delivery', 'osm:takeaway', 'osm:payment:onchain', 'osm:payment:lightning',
  'osm:payment:lightning_contactless', 'osm:payment:bitcoin',
].join(',');

function readableTag(value = '') {
  return String(value).split(/[;,]/).map(part => part.trim()).filter(Boolean)
    .map(part => part.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())).join(', ');
}

export function placeOfferingFacts(place = {}) {
  const facts = [];
  const categories = [
    ['osm:shop', 'Shop'], ['osm:amenity', 'Type'], ['osm:tourism', 'Type'],
    ['osm:craft', 'Craft'], ['osm:office', 'Office'], ['osm:leisure', 'Leisure'],
    ['osm:healthcare', 'Healthcare'],
  ];
  categories.forEach(([field, label]) => {
    if (place[field]) facts.push({label, value:readableTag(place[field])});
  });
  [
    ['osm:cuisine', 'Cuisine'], ['osm:product', 'Products'], ['osm:goods', 'Goods'],
    ['osm:produce', 'Produce'], ['osm:clothes', 'Clothes'], ['osm:beauty', 'Beauty'],
    ['osm:healthcare:speciality', 'Speciality'], ['osm:sport', 'Sport'],
    ['osm:service', 'Services'], ['osm:second_hand', 'Second-hand'],
  ]
    .forEach(([field, label]) => {
      if (place[field]) facts.push({label, value:readableTag(place[field])});
    });
  if (/^(yes|only)$/i.test(String(place['osm:delivery'] || ''))) facts.push({label:'Option', value:'Delivery'});
  if (/^(yes|only)$/i.test(String(place['osm:takeaway'] || ''))) facts.push({label:'Option', value:'Takeaway'});
  if (!facts.length && place.icon) facts.push({label:'Type', value:readableTag(place.icon)});
  return facts.filter((fact, index) => fact.value
    && facts.findIndex(candidate => candidate.label === fact.label && candidate.value === fact.value) === index);
}

export function placeDescription(place = {}) {
  return String(place.description || place['osm:description'] || '').trim();
}

export function placePaymentMethods(place = {}) {
  const methods = [];
  if (/^(yes|only)$/i.test(String(place['osm:payment:onchain'] || ''))) methods.push('On-chain');
  if (/^(yes|only)$/i.test(String(place['osm:payment:lightning'] || ''))) methods.push('Lightning');
  if (/^(yes|only)$/i.test(String(place['osm:payment:lightning_contactless'] || ''))) methods.push('Contactless Lightning');
  if (!methods.length && /^(yes|only)$/i.test(String(place['osm:payment:bitcoin'] || ''))) methods.push('Bitcoin');
  return methods.join(', ');
}

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

export function viewportCoverageContains(coverage, center, radiusKm) {
  if (!coverage) return false;
  return haversineKm(coverage.center, center) + Number(radiusKm) <= Number(coverage.radiusKm);
}

export function isIgnorableMapError(error) {
  const message = String(error?.message || error || '');
  return /expected value to be of type number, but found null instead/i.test(message)
    || /(?:aborterror|operation was aborted)/i.test(message);
}

export function placeFeature(place = {}) {
  const lat = Number(place.lat);
  const lon = Number(place.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const markerKey = String(place.id ?? `${lat}:${lon}`);
  const markerHash = [...markerKey].reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0, 7);
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
      tilt:(markerHash % 41) - 20,
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

/* ---------------------------------------------------------------- reviews, on Nostr
 *
 * BTC Map has no reviews and no ratings: `/v4/places/{id}/reviews` is a 404 and the only thing the API
 * carries is a per-place `comment` with no author and no score, which this page already shows under
 * "Recent visitor notes". No NIP defines reviews either, so this is a small convention of our own:
 *
 *   kind 1, with
 *     ['r', 'https://btcmap.org/merchant/<id>']   the place it is about
 *     ['t', 'btcmap-review']                      what makes it a review rather than a note
 *     ['rating', '1'..'5']                        optional, because a review can be text alone
 *
 * The place reference is the merchant URL rather than the bare id so a review stays attached to the same
 * place across clients, and so anyone can look the place up from the note alone. One review per pubkey per
 * place, the newest wins — the same rule the room's polls and votes use.
 */

export const BTC_MAP_REVIEW_HASHTAG = 'btcmap-review';
export const BTC_MAP_REVIEW_RATINGS = [1, 2, 3, 4, 5];

/** The review's own reference to a place. */
export function btcMapPlaceReference(placeId) {
  return `https://btcmap.org/merchant/${Number(placeId)}`;
}

function cleanRating(value) {
  const rating = Math.round(Number(value));
  return BTC_MAP_REVIEW_RATINGS.includes(rating) ? rating : null;
}

/** The tags a review carries. A rating outside 1-5 is dropped rather than clamped. */
export function btcMapReviewTags(placeId, rating) {
  const tags = [['r', btcMapPlaceReference(placeId)], ['t', BTC_MAP_REVIEW_HASHTAG]];
  const clean = cleanRating(rating);
  if (clean !== null) tags.push(['rating', String(clean)]);
  return tags;
}

/** The filter that asks the relays for this place's reviews. */
export function btcMapReviewFilter(placeId) {
  return {
    kinds: [1],
    '#r': [btcMapPlaceReference(placeId)],
    '#t': [BTC_MAP_REVIEW_HASHTAG],
    limit: 100,
  };
}

/** One event as a review of this place, or null when it is about something else. */
export function parseBtcMapReview(event, placeId) {
  if (!event || Number(event.kind) !== 1) return null;
  const tags = Array.isArray(event.tags) ? event.tags : [];
  const reference = btcMapPlaceReference(placeId);
  if (!tags.some(tag => tag[0] === 'r' && tag[1] === reference)) return null;
  if (!tags.some(tag => tag[0] === 't' && tag[1] === BTC_MAP_REVIEW_HASHTAG)) return null;
  const ratingTag = tags.find(tag => tag[0] === 'rating');
  return {
    id: String(event.id || ''),
    pubkey: String(event.pubkey || ''),
    created_at: Number(event.created_at) || 0,
    text: String(event.content || '').trim(),
    rating: ratingTag ? cleanRating(ratingTag[1]) : null,
  };
}

/** Every review of one place: one per pubkey, newest first, with the average over the rated ones. */
export function collectBtcMapReviews(events = [], placeId) {
  const byAuthor = new Map();
  for (const event of events) {
    const review = parseBtcMapReview(event, placeId);
    if (!review) continue;
    if (!review.text && review.rating === null) continue;      // an empty note says nothing
    const previous = byAuthor.get(review.pubkey);
    if (previous && previous.created_at >= review.created_at) continue;
    byAuthor.set(review.pubkey, review);
  }
  const reviews = [...byAuthor.values()].sort((a, b) => b.created_at - a.created_at);
  const rated = reviews.filter(review => review.rating !== null);
  const average = rated.length
    ? rated.reduce((sum, review) => sum + review.rating, 0) / rated.length
    : null;
  return { reviews, count: reviews.length, rated: rated.length, average };
}
