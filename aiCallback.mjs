import {completePollinationsAuthorization} from './pollinationsAuth.mjs';

const title = document.getElementById('callbackTitle');
const status = document.getElementById('callbackStatus');
const returnLink = document.getElementById('callbackReturn');

try {
  const returnUrl = await completePollinationsAuthorization();
  title.textContent = 'Connected';
  status.textContent = 'Returning to Synthetic Satoshi…';
  location.replace(returnUrl);
} catch (error) {
  title.textContent = 'Connection failed';
  status.textContent = error.message || 'Pollinations authorization failed.';
  returnLink.hidden = false;
}
