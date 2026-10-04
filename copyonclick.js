// Click-to-copy for the donation addresses, plus the quotes block.
//
// This uses event delegation on the document instead of binding to the elements
// that happen to exist at DOMContentLoaded. The support modal is built by
// siteFooter.mjs (ensureSupportModal), which REPLACES the modal's markup — so
// element-bound listeners ended up attached to detached nodes and clicking an
// address silently stopped copying and stopped showing the orange toast.
//
// Delegation also survives the modal being rebuilt again, which it has been more
// than once.
document.addEventListener('click', function (event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const quotes = target.closest('#quotes');
    if (quotes) {
        copyToClipboard(quotes.innerText, 'Quote copied to clipboard!');
        return;
    }

    const hit = target.closest('.qr-code, .qr-code-text');
    if (!hit) return;
    const value = copyValueFor(hit);
    if (!value) return;
    copyToClipboard(value, messageFor(value, hit));
});

// Work out what to copy. The QR image carries no text of its own, so fall back to
// the address printed beside it inside the same .qr-code-wrapper.
function copyValueFor(element) {
    const wrapper = element.closest('.qr-code-wrapper');
    const beside = wrapper ? wrapper.querySelector('.qr-code-text') : null;
    const candidates = [
        element.getAttribute ? element.getAttribute('title') : '',
        element.textContent,
        beside ? beside.textContent : ''
    ];
    for (const candidate of candidates) {
        const value = (candidate || '').trim();
        if (value) return value;
    }
    return '';
}

function messageFor(value, element) {
    const wrapper = element.closest('.qr-code-wrapper');
    const label = wrapper && wrapper.querySelector('strong') ? wrapper.querySelector('strong').textContent : '';
    const haystack = (label + ' ' + value).toLowerCase();
    if (haystack.indexOf('lightning') !== -1 || value.indexOf('@') !== -1 || value.indexOf('lnbc') === 0) {
        return 'Bitcoin lightning address copied to clipboard!';
    }
    if (value.indexOf('ark1') === 0) {
        return 'Ark address copied to clipboard!';
    }
    return 'On-chain bitcoin address copied to clipboard!';
}

function copyToClipboard(content, message) {
    const finish = function () { flashNotification(message); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(content).then(finish).catch(function () {
            fallbackCopy(content);
            finish();
        });
        return;
    }
    fallbackCopy(content);
    finish();
}

// For non-secure contexts where navigator.clipboard is unavailable.
function fallbackCopy(content) {
    try {
        const scratch = document.createElement('textarea');
        scratch.value = content;
        scratch.setAttribute('readonly', '');
        scratch.style.position = 'fixed';
        scratch.style.top = '-1000px';
        document.body.appendChild(scratch);
        scratch.select();
        document.execCommand('copy');
        scratch.remove();
    } catch (error) {
        // Nothing else to try; the toast still tells the user what was intended.
    }
}

var notificationTimer = null;

// Some pages ship more than one .copy-notification banner, so update all of them
// and let whichever is actually reachable do the job.
function flashNotification(message) {
    const banners = Array.prototype.slice.call(document.querySelectorAll('.copy-notification'));
    if (!banners.length) return;
    banners.forEach(function (banner) {
        banner.textContent = message;
        banner.style.display = 'block';
    });
    if (notificationTimer) clearTimeout(notificationTimer);
    notificationTimer = setTimeout(function () {
        banners.forEach(function (banner) { banner.style.display = 'none'; });
        notificationTimer = null;
    }, 3500);
}
