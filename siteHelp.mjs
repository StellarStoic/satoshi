export const PAGE_HELP = Object.freeze({
    '/': {
        title: 'About Satoshi.si',
        description: 'Satoshi.si is a collection of practical Bitcoin tools, learning experiences, games, market data, news, and creative experiments.'
    },
    '/index.html': {
        title: 'About Satoshi.si',
        description: 'Satoshi.si is a collection of practical Bitcoin tools, learning experiences, games, market data, news, and creative experiments.'
    },
    '/chart.html': {
        title: 'About the history chart',
        description: 'Compare the historical price of currencies, stocks, commodities, and indexes with their value measured in Bitcoin.'
    },
    '/converter.html': {
        title: 'About the converter',
        description: 'Convert Bitcoin, sats, currencies, and other assets together. Drag a currency to the first position to make it the amount that drives every conversion below it.'
    },
    '/bitcoinTxCost.html': {
        title: 'About Bitcoin and Ark transaction costs',
        description: 'Choose where bitcoin starts and ends to estimate ordinary on-chain mining fees, Ark and Lightning service fees, boarding, or offboarding. The final wallet quote may differ.'
    },
    '/entropy.html': {
        title: 'About the entropy lab',
        description: 'Explore how unpredictable input becomes wallet entropy, why strong randomness matters, and why guessing a properly generated Bitcoin wallet is effectively impossible.'
    },
    '/living.html': {
        title: 'About cost of living',
        description: 'Compare selected European living costs over time in fiat and Bitcoin, with inflation included for context.'
    },
    '/lotteryTOS.html': {
        title: 'About these terms',
        description: 'These terms explain how the Lucky Sats Lottery works, what participants agree to, and the limits of the service.'
    },
    '/luckysats.html': {
        title: 'About Lucky Sats',
        description: 'Lucky Sats embeds the lottery experience so you can participate and review its information without leaving Satoshi.si.'
    },
    '/news.html': {
        title: 'About Bitcoin and Nostr News',
        description: 'Browse Bitcoin and Nostr stories gathered from selected public feeds. Search the stream, filter sources and keywords, or add your own RSS and Nostr sources locally.'
    },
    '/nip05.html': {
        title: 'About NIP-05',
        description: 'Learn about readable Nostr identifiers and the available satoshi.si NIP-05 names that can point to your Nostr public key.'
    },
    '/nip05store.html': {
        title: 'About the NIP-05 name store',
        description: 'Buy a name like yourname@satoshi.si with Lightning, on-chain bitcoin, or Ark. It goes live after payment, has no renewal fee, allows one name per public key, and can be used with the satoshi.si Nostr relay.'
    },
    '/stickyNotes.html': {
        title: 'About Pinstr',
        description: 'Pinstr notes are small public messages signed with your Nostr identity and placed on a shared'
            + ' board. Tag people with @, choose how long a note lives, and post with a subscription: 10 sats a'
            + ' week, less with a satoshi.si name — free with a 3-character one.',
        sections: [
            {
                label: 'In plain words',
                paragraphs: [
                    'Pinstr notes are small public messages, signed with your Nostr identity or a random anonymous one,'
                    + ' and placed on a shared board. Choose where the note will be visible, and choose how long it'
                    + ' lives. Perfect for small areas and groups pinning notes to each other.',
                    'You can name people in a note: type @ and pick from the names that come up. Anyone with a NIP-05'
                    + ' name can be tagged — on any domain, not only satoshi.si. The note carries the person\u2019s public'
                    + ' key and the board draws their name in its place. Open the sort button to show only notes that'
                    + ' tag you. That view works for a signed-in identity, but not for a temporary anonymous one.',
                    'Add up to three optional hashtags in the separate field. Type words separated by commas; Pinstr'
                    + ' adds the # for you. Spaces around commas are fine, but each hashtag itself must be one word.',
                    'The sort button can keep the board focused on the newest 5 or 15 notes, the last day, the last'
                    + ' week, or notes that mention you. Signed-in Nostr users can also keep on “Notes from my follows”'
                    + ' to limit any of those views to people they follow. That choice stays in this browser. A green'
                    + ' outline around the sort button means a filter is active. Filtered notes become faint blank paper'
                    + ' with no pin: hold the paper for four seconds to reveal one note for a minute. A note can also'
                    + ' end up buried under other notes on a busy board: the pile stands in the order notes have'
                    + ' earned, one reaction per reader counting as a hundred sats weighed against a zap\'s sats, so a note'
                    + ' with six reactions stands ahead of one that took a single twenty-one-sat zap. Notes nobody'
                    + ' has touched yet keep the order they were written in. Then switch on “Show pins of covered notes” in the'
                    + ' same panel and a buried note keeps its pin above the pile, so you can reach it; using that pin'
                    + ' opens the note\'s details and brings the note to the front for twenty-one seconds.',
                    'You choose how long a note stays on this board: a day, a week, a month, six months or a year.'
                    + ' Satoshi.si stops showing it at the chosen time and deletes its relay copy. Nostr is public,'
                    + ' so another relay, app, archive, screenshot or person may keep a copy. The timer is not a promise'
                    + ' that the event vanishes everywhere. You cannot extend the board time after pinning — pin it again'
                    + ' if you need it here for longer — and a year is the longest this board offers.',
                    'Posting is a pass rather than a payment per note: 10 sats for a week, or 411 for a year, which is'
                    + ' about 21% less than paying weekly. While the pass lasts you can pin as many notes as you like.'
                    + ' A satoshi.si name makes the same pass cheaper, and how short the name is decides how much:'
                    + ' three characters post free, four characters pay half (5 sats a week or 205 a year), and five or'
                    + ' more pay three quarters (7 sats a week or 308 a year). The name is what was bought, and shorter'
                    + ' names cost more to begin with — which is why three characters are the tier that pays nothing.'
                    + ' A pass is not the only way in: with a NIP-05 name of your own, on any domain, you can instead'
                    + ' pay for one note with work. The button offers Free with POW, and pinning then finds 25 bits of'
                    + ' work on the note\'s own id — about 34 million hashes, a few minutes on a phone with the page open,'
                    + ' and nothing to pay. The work has to be on the exact note you publish, so the mining happens when'
                    + ' you press Pin note, after you place it; a note you move afterwards has to be mined again.'
                    + ' A note\'s details then say how it was paid for, under its event id: a hammer if it was mined,'
                    + ' the Bitcoin mark if it was paid for with Bitcoin, and a coin if it was paid for in cash. A note'
                    + ' published before the mark existed shows nothing there — which is what an empty row means.'
                    + ' The signature at a note\'s foot is a button: press it to react to that note, or to zap its writer'
                    + ' sats. A reaction is signed by you and published where the note lives; a zap is paid from any'
                    + ' lightning wallet you hold, and the writer\'s own server records the receipt.',
                    'You do not have to decide about the pass before you start writing. Write the note, press the button,'
                    + ' pay for the pass, and the note you were already writing goes onto the board by itself. For the rest'
                    + ' of the pass the button simply says Place your note.',
                    'Not signed in? An anonymous note costs 69 sats. Your browser creates a one-time key that can pin one'
                    + ' note and cannot buy a weekly or yearly pass. The key stays on this device for up to 24 hours only'
                    + ' so an interrupted payment or publication can finish. Leave anonymous mode and the key is deleted; returning'
                    + ' creates a new one.',
                    'When a pass runs out, it does not change notes you already pinned. Satoshi.si keeps showing them'
                    + ' until their chosen board time ends; only new notes need another pass.',
                    'You pay in sats straight from your own wallet. The first QR includes every method offered for the'
                    + ' invoice, so your wallet can choose; the buttons below it show separate Ark, Lightning, or on-chain'
                    + ' codes when available. Satoshi.si never sees your private key or controls your wallet. The payment'
                    + ' service receives only the quoted payment and keeps a record of the pass that the board checks when you post.',
                ]
            },
            {
                label: 'Technical',
                paragraphs: [
                    'A note is one kind 1 Nostr event signed by your own signer: a browser extension, a bunker, or a key'
                    + ' pasted for a single visit. The text is the event content and everything else travels in tags:'
                    + ' ["t","pinstr"], up to three additional hashtag t tags, ["client","satoshi.si"], and one'
                    + ' ["sticky","v1",color,x,y,rotation,font] whose x'
                    + ' and y coordinates are fractions of the board and whose rotation is in degrees, and ["alt",…].'
                    + ' Colours are yellow, pink, blue, green, orange, and the text is capped at 501 characters. Before you'
                    + ' pay, the content is hashed with sha256 over the string v1, the colour, the font and the text, each on its'
                    + ' own line. The event that publishes is therefore the event that was paid for.',
                    'Placement is deliberately not part of that commitment: you place the note after paying, so its'
                    + ' position and tilt are bounds-checked when the event is published instead of being fixed in advance.',
                    'Liveliness travels the same way, and it is mandatory. Every note carries exactly one NIP-40'
                    + ' ["expiration","<unix seconds>"] tag, computed as the moment it was written plus the term chosen'
                    + ' from the ladder — a day, a week, a month, six months or a year, and no longer. The payment'
                    + ' service refuses a pin without that tag, one whose term falls outside the ladder, and one whose'
                    + ' moment has already passed by the time it is published, because the relay drops an event that'
                    + ' arrives expired. The satoshi.si relay never serves an expired event, and a cleanup deletes its'
                    + ' stored copy every ten minutes. NIP-40 is advisory across Nostr: it cannot make another relay,'
                    + ' client, archive or person erase a copy. The note menu shows the local cutoff and a live countdown.'
                    + ' A note on the'
                    + ' relay that names no expiration at all is not drawn either: this board shows only notes that'
                    + ' say when they go, so a note written past the desk is invisible here rather than permanent.',
                    'Mentions follow NIP-27 and are the reason a tag means something. Typing @ offers the names the'
                    + ' board can resolve — the satoshi.si store it is served from, or any name@domain it asks directly —'
                    + ' and only a key that answers with a NIP-05 name can be picked. What travels is the canonical form:'
                    + ' the text carries nostr:npub1\u2026 and the event carries one ["p","<64-hex>"] tag per person, at'
                    + ' most five, each a different key. The desk refuses a ["p", \u2026] tag whose key the text never'
                    + ' names, a sixth, a repeated key, and any mention at all on a note from a temporary identity.'
                    + ' Mentions cost nothing extra: one note, one price, however many people it names.',
                    'Sorting is local: the board first reads its ordinary note events, then filters what is drawn in this'
                    + ' browser. “Notes from my follows” reads the signed-in account’s latest NIP-02 kind 3 contact-list'
                    + ' event from public relays and matches the note author against its p tags. The contact list is not'
                    + ' sent to satoshi.si or written into a note; only the toggle preference is kept in local storage.',
                    'While placing a paid note, the whole board is the gesture surface. One finger moves the note.'
                    + ' Two fingers rotate the note and zoom the board together around their midpoint, so the paper'
                    + ' stays under control even when the fingers begin away from it.',
                    'Once notes are pinned, they are part of the board surface: dragging or pinching over ordinary paper'
                    + ' pans and zooms the board just like touching the bare board. Pins remain buttons for note details.',
                    'Every pin belongs to a geohash of three to nine characters: you enter one or pick it on the'
                    + ' map view, where zooming changes the grid between those depths. A place that straddles two'
                    + ' or three cells — a building on a corner — can be pinned to all of them at once, as long as the cells'
                    + ' touch (along an edge or at a corner) and there are no more than nine: one note, one price. The note'
                    + ' names each of those cells in its own ["g",<cell>] tag, the boards above them so it is also findable'
                    + ' on the wider boards, ["i","geo:<cell>"] for the cell it was written on, and ["k","geo"] — unless you'
                    + ' mark it exact-only, when only the cells themselves are named and the note appears on those boards'
                    + ' alone. This is organisation, not privacy: a published note is public.',
                    'Around me asks the browser where you are, and then asks how much ground to cover: a building,'
                    + ' a neighbourhood, a city, a state or a country, which are geohash depths 8, 7, 5, 4 and 3 — about 19 m,'
                    + ' 153 m, 4.9 km, 20 km'
                    + ' and 156 km of cell height, and a cell is the same height at every latitude. The position is turned'
                    + ' into a geohash inside the page and is never sent anywhere: the board asks the relay for that'
                    + ' geohash, not for you. The size is the reader\u2019s own choice because a board is only as useful as'
                    + ' the depth it is read at, and the answer says so when the device was less accurate than the cell'
                    + ' is tall. If it is one place you look at every day, tick to keep it: the board then opens on'
                    + ' that cell on every visit, and the address bar keeps no board of its own — a link somebody'
                    + ' sends you still opens the board it names.',
                    'The map in the board chooser also keeps **saved places**: tap cells, give them a name you will'
                    + ' recognise, and the name and its geohash wait there in this browser. Tapping one opens that'
                    + ' board; nothing is sent anywhere and no name ever leaves the device.',
                    'A pass is a subscription record the payment service keeps against your public key: a week or a year,'
                    + ' extended rather than restarted when you renew early, covering any number of pins while'
                    + ' it is active. The yearly price is the weekly price for 52 weeks less 21% (10 × 52 = 520 → 411),'
                    + ' and a member price is a share of that list price, floored: half is 5 and 205, three quarters is 7'
                    + ' and 308, and a three-character name pays nothing at all.',
                    'A pin from a key with no active pass is refused with a subscription-required answer; the board then'
                    + ' buys the pass and repeats the same action, which the second time comes back already settled at zero'
                    + ' sats along with its publish token.',
                    'The publish token is bound to the note content hash, its geohash and its identity mode, lives 15'
                    + ' minutes and is spent once, so a token bought for one note cannot publish a different one in another'
                    + ' cell. The service verifies the event id and signature before the relay sees the event, and the relay'
                    + ' admits a write only for the exact event id that was paid for. An anonymous key pays 69 sats and may'
                    + ' publish one pin only; it cannot buy a subscription. An anonymous note must carry the'
                    + ' ["anonymous","24h-local-key"] marker; a named'
                    + ' note must not.',
                    'The payment sheet builds a BIP-321 bitcoin: URI from the exact order amount and every destination'
                    + ' returned by the service. It can carry Ark and Lightning parameters beside an on-chain address;'
                    + ' compatible wallets choose a rail, while the individual tabs contain only one rail. A rail asking'
                    + ' for any other amount is refused. Reading is always free: the relay serves every'
                    + ' published note to anyone, and an expired pass deletes, hides and rewrites nothing.',
                ]
            },
        ]
    },
    '/offers.html': {
        title: 'About the P2P order book',
        description: 'Compare public peer-to-peer Bitcoin buy and sell offers from several markets in one place, then continue on the original platform.'
    },
    '/opreturn.html': {
        title: 'About OP_RETURN write',
        description: 'Write a short public message into a real Bitcoin transaction. Once confirmed, the transaction becomes part of Bitcoin history.',
        sections: [
            {
                label: 'In plain words',
                paragraphs: [
                    'OP_RETURN is a small space in a Bitcoin transaction for data instead of money. This page lets you place a short message there. The message carries zero sats and cannot be spent.',
                    'The limit is 80 bytes, which is not always the same as 80 visible characters. For example, 80 basic English letters use 80 bytes and fit exactly. One orange-heart emoji uses 4 bytes, so 20 orange hearts fill the same space. The counter below the message shows the real size as you type.',
                    'Write up to 80 bytes, then pay the displayed price. One QR contains every payment method currently available for the order, while the buttons below it let you choose Ark, Lightning, or on-chain separately when a wallet cannot read the combined request. The service then prepares and broadcasts the Bitcoin transaction. Confirmation depends on miners and the network, just like any other on-chain transaction.',
                    'Everything written this way is public. Anyone can read, copy, quote, or archive it, and a confirmed transaction cannot be edited. Never write a password, recovery phrase, private key, personal information, or anything else that should remain secret.',
                    'Every new message written here is eligible for OP_RETURN read because it is public anyway. The optional checkbox colors the card border and message with the current theme and adds a “via satoshi.si” label. It does not identify or authenticate the writer.',
                    'Each opened card gets a background pattern from its transaction ID. Think of the ID as a recipe: the same transaction always makes the same colors and shapes. The full message, transaction ID, date, time, and a small satoshi.si logo remain visible on the card.'
                ]
            },
            {
                label: 'Technical',
                paragraphs: [
                    'The page encodes the message as UTF-8 and limits the result to 80 bytes. ASCII characters usually use one byte; emoji and accented characters may use several, which is why the byte counter matters more than the number of visible characters.',
                    'The transaction output script begins with OP_RETURN (0x6a), followed by a data-push opcode and the message bytes. Messages up to 75 bytes use a direct push length; messages from 76 to 80 bytes use OP_PUSHDATA1. The output value is zero, and the script is provably unspendable.',
                    'Creating an order returns supported Bitcoin payment instructions. The payment modal combines the returned on-chain address, BOLT11 invoice, and Ark address into a BIP-321 request when at least two are available, while retaining each instruction as a separate fallback. After payment is detected, a separate service wallet selects its own coins, creates the zero-value OP_RETURN output and a change output when appropriate, applies an on-chain mining fee, signs the transaction, and broadcasts it. No wallet key or signing secret is sent to this page.',
                    'The displayed total combines the service charge with a mining-fee estimate. The final transaction fee depends on its actual input count, virtual size, and fee rate. The page follows the order through payment, broadcast, and publication and then exposes the resulting transaction id.',
                    'For the share card, a deterministic hash of the transaction ID selects a hue, one of four CSS pattern families, an angle, and pattern spacing. The result is layered over a dark gradient. No random value or private data is used, so the same transaction ID reproduces the same pattern on both pages and in the downloadable PNG.',
                    'A confirmed OP_RETURN is committed by the block and remains verifiable through Bitcoin’s chain of hashes. Archival nodes and indexes may retain its full contents indefinitely, while pruning nodes may discard old block bodies after validation. Either way, publishing should be treated as irreversible and public.'
                ]
            }
        ]
    },
    '/opreturnBoard.html': {
        title: 'About OP_RETURN read',
        description: 'Browse public text found in OP_RETURN outputs on the Bitcoin blockchain, with the newest readable messages first.',
        sections: [
            {
                label: 'In plain words',
                paragraphs: [
                    'OP_RETURN read is a window into short public messages placed inside Bitcoin transactions. Reading is free and does not require an account or wallet.',
                    'An accent-colored border and message plus a “via satoshi.si” label mean the writer chose visible satoshi.si branding. Grey entries are unbranded public messages. The logo appears on every opened share card and neither style proves who wrote a message.',
                    'Select a message to see a larger share view containing the complete message, complete transaction ID, date, time, and a small satoshi.si logo. The board does not own or edit the on-chain message; it only presents public blockchain data.',
                    'The card background is a visual fingerprint made from the transaction ID. The ID chooses the colors, lines or dots, angle, and spacing, so reopening the same transaction produces the same design.',
                    'This is a filtered reading view, not every OP_RETURN ever created. Many outputs contain software markers, proofs, hashes, or other machine data rather than sentences. Public content may also be inaccurate or offensive, so treat it as somebody’s message, not as a fact endorsed by satoshi.si.'
                ]
            },
            {
                label: 'Technical',
                paragraphs: [
                    'The reader obtains recent OP_RETURN records from a public blockchain index, requests older pages as you scroll, and merges those records with public messages published through satoshi.si. It sorts the newest results first and removes repeated text within each fetched page.',
                    'For raw scripts, the decoder accepts scripts beginning with OP_RETURN (0x6a) followed by a direct data push or OP_PUSHDATA1. It decodes the remaining bytes as strict UTF-8 and rejects malformed bytes, empty values, and disallowed control characters.',
                    'A language filter hides common protocol payloads, address-like strings, long hexadecimal blobs, single-token markers, and other machine-oriented data. This is a readability heuristic: it can hide a genuine message or allow unusual data through, and it is not a complete classification of the blockchain.',
                    'The optional branding flag controls the accent-colored border and message plus the “via satoshi.si” label. Without it an entry stays neutral grey, even when the site helped publish it. The share card always carries the small site logo as the origin of the generated image.',
                    'The share-pattern function hashes the public transaction ID and maps the resulting integer to a hue, one of four CSS pattern families, a rotation angle, and spacing value. It layers that repeatable pattern over a dark gradient. Because there is no random input, the same transaction ID produces the same CSS design on OP_RETURN write and OP_RETURN read.',
                    'The transaction id links the displayed text to its source transaction. The board never decrypts private data because OP_RETURN messages shown here are public by design, and no private keys, wallet credentials, or signing material are needed to read them.'
                ]
            }
        ]
    },
    '/priceScanner.html': {
        title: 'About the price scanner',
        description: 'Point your camera at a printed or handwritten price. On-device recognition finds the amount and overlays its current Bitcoin or sat value without uploading the camera image.'
    },
    '/quotes.html': {
        title: 'About Words of Satoshi',
        description: 'Read a rotating selection of Satoshi Nakamoto quotations. Select a quote to copy it, or use refresh to reveal another.'
    },
    '/selfCustody.html': {
        title: 'About self-custody',
        description: 'Learn what Bitcoin self-custody really means and compare wallet, signing-device, backup, and node options for taking control of your keys.'
    },
    '/settings.html': {
        title: 'About settings',
        description: 'Manage preferences stored in this browser, including optional site features. These choices stay on your device unless a feature clearly says otherwise.'
    },
    '/ticketVerifier.html': {
        title: 'About ticket verification',
        description: 'Verify a Lucky Sats Lottery ticket and independently check whether its numbers and result match the published draw.'
    },
    '/whitepaper.html': {
        title: 'About the Bitcoin whitepaper',
        description: 'Read the original Bitcoin whitepaper or open an available translation to understand the peer-to-peer electronic cash system described by Satoshi Nakamoto.'
    }
});

const EXISTING_TRIGGER_SELECTOR = [
    '.info-modal-trigger',
    '.lofi-help-trigger',
    '#helpIcon',
    '#mood-info-modal-btn'
].join(',');

function normalisePath(pathname) {
    if (!pathname || pathname === '/') return '/';
    const cleanPath = pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '');
    const filename = cleanPath.slice(cleanPath.lastIndexOf('/'));
    return filename.endsWith('.html') ? filename : cleanPath;
}

function currentPagePath() {
    const path = normalisePath(location.pathname);
    // pinstr.si mirrors stickyNotes.html at its root. The page body is the reliable
    // identity there; using only "/" would load the home-page help and leave its
    // trigger outside the Pinstr toolbar.
    if (path === '/' && document.body?.classList.contains('sticky-page')) return '/stickyNotes.html';
    return path;
}

export function helpForPath(pathname) {
    return PAGE_HELP[normalisePath(pathname)] || null;
}

/**
 * An explainer's paragraphs, grouped into views.
 *
 * A page may supply `sections` — each a label and its paragraphs — and the dialog
 * then shows one view at a time, so the plain-language telling is not buried under
 * the technical one. The original flat `details` list still works: it becomes a
 * single unlabelled view and renders exactly as it always did.
 */
export function helpSections(help) {
    const sections = (Array.isArray(help?.sections) ? help.sections : [])
        .map(section => ({
            label: typeof section?.label === 'string' ? section.label : '',
            paragraphs: (Array.isArray(section?.paragraphs) ? section.paragraphs : [])
                .filter(text => typeof text === 'string' && text.length)
        }))
        .filter(section => section.paragraphs.length);
    if (sections.length) return sections;

    const details = (Array.isArray(help?.details) ? help.details : [])
        .filter(text => typeof text === 'string' && text.length);
    return details.length ? [{label: '', paragraphs: details}] : [];
}

/** An explainer as one string, so what it claims can be checked as a whole. */
export function helpCopy(help) {
    return [help?.title, help?.description, ...helpSections(help).flatMap(section => [section.label, ...section.paragraphs])]
        .filter(text => typeof text === 'string' && text.length)
        .join(' ');
}

function iconMarkup() {
    return '<i class="lni lni-question-mark-circle" aria-hidden="true"></i>';
}

const TOP_RIGHT_COMPANIONS = Object.freeze({
    '/opreturn.html': {selector: '#listIcon', group: true, icon: true},
    '/opreturnBoard.html': {selector: '#writeIcon', group: true, icon: true},
    '/quotes.html': {selector: '#next-quote', group: true, icon: true},
    '/converter.html': {selector: '.add-currency-icon', group: true, icon: true},
    '/news.html': {selector: '#openNewsSettings', group: true, icon: true},
    '/priceScanner.html': {selector: '.scanner-top-controls', wide: true},
    '/isBip39.html': {selector: '#openWordlistSettings', group: true, icon: true},
    '/wallet.html': {selector: '#openWalletSettings', group: true, icon: true},
    '/MoscowTime.html': {selector: '#openMoscowSettings', group: true, icon: true},
    '/stickyNotes.html': {selector: '.sticky-help-slot', mount: true}
});

function groupTopRightControls(trigger, companion) {
    trigger.classList.add('site-help-trigger--grouped');
    companion.classList.add('site-help-companion--grouped');
    // Keep both controls at the document root so one shared rule aligns them.
    document.body.append(trigger, companion);
    document.querySelector('.site-help-actions')?.remove();
}

function alignTopRightControls(trigger) {
    const config = TOP_RIGHT_COMPANIONS[currentPagePath()];
    if (!config) return;
    const companion = document.querySelector(config.selector);
    if (!companion) return;
    if (config.mount) {
        companion.removeAttribute('aria-hidden');
        companion.append(trigger);
        trigger.classList.add('site-help-trigger--embedded', 'sticky-top-button');
        return;
    }
    companion.classList.add('site-help-companion');
    if (config.icon) companion.classList.add('site-help-companion--icon');
    if (config.group) {
        groupTopRightControls(trigger, companion);
        return;
    }
    if (companion.parentElement !== document.body) document.body.append(companion);
    trigger.classList.add(config.wide ? 'site-help-trigger--wide-offset' : 'site-help-trigger--offset');
}

function styleExistingTrigger(trigger) {
    trigger.classList.add('site-help-trigger');
    alignTopRightControls(trigger);
    trigger.innerHTML = iconMarkup();
    trigger.setAttribute('aria-haspopup', 'dialog');

    if (!trigger.getAttribute('aria-label')) trigger.setAttribute('aria-label', 'About this page');
    if (!trigger.getAttribute('title')) trigger.setAttribute('title', trigger.getAttribute('aria-label'));

    if (trigger.tagName !== 'BUTTON') {
        trigger.setAttribute('role', 'button');
        trigger.setAttribute('tabindex', '0');
        trigger.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            trigger.click();
        });
    }
    if (trigger.parentElement !== document.body) document.body.append(trigger);
}

function helpParagraph(text) {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    return paragraph;
}

/**
 * What goes under the description. One view renders as plain paragraphs, exactly as
 * the flat list always did; more than one renders as a switchable panel, so a page
 * can explain itself both simply and in detail without either drowning the other.
 */
function createHelpBody(help) {
    const sections = helpSections(help);
    if (sections.length <= 1) {
        return [...(sections[0]?.paragraphs || [])].map(helpParagraph);
    }

    const tablist = document.createElement('div');
    tablist.className = 'site-help-dialog__tabs';
    tablist.setAttribute('role', 'tablist');
    tablist.setAttribute('aria-label', 'Explanation');

    const tabs = [];
    const panels = [];
    const select = index => {
        tabs.forEach((tab, position) => tab.setAttribute('aria-selected', position === index ? 'true' : 'false'));
        panels.forEach((panel, position) => { panel.hidden = position !== index; });
    };

    sections.forEach((section, index) => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'site-help-dialog__tab';
        tab.id = `siteHelpTab${index}`;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-controls', `siteHelpPanel${index}`);
        tab.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
        tab.textContent = section.label;
        tab.addEventListener('click', () => select(index));
        // A tablist is expected to answer the arrow keys as well as the pointer.
        tab.addEventListener('keydown', event => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
            event.preventDefault();
            const next = (index + (event.key === 'ArrowRight' ? 1 : sections.length - 1)) % sections.length;
            select(next);
            tabs[next]?.focus();
        });

        const panel = document.createElement('div');
        panel.className = 'site-help-dialog__panel';
        panel.id = `siteHelpPanel${index}`;
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', tab.id);
        panel.hidden = index !== 0;
        section.paragraphs.forEach(text => panel.append(helpParagraph(text)));

        tabs.push(tab);
        panels.push(panel);
        tablist.append(tab);
    });

    return [tablist, ...panels];
}

function createHelpDialog(help) {
    const dialog = document.createElement('dialog');
    dialog.id = 'siteHelpDialog';
    dialog.className = 'site-help-dialog';
    dialog.setAttribute('aria-labelledby', 'siteHelpTitle');

    const content = document.createElement('div');
    content.className = 'site-help-dialog__content';

    const title = document.createElement('h2');
    title.id = 'siteHelpTitle';
    title.textContent = help.title;

    const description = document.createElement('p');
    description.textContent = help.description;


    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'site-help-dialog__close';
    close.setAttribute('aria-label', 'Close');
    close.title = 'Close';
    close.textContent = '\u00d7';
    close.addEventListener('click', () => dialog.close());

    content.append(close, title, description, ...createHelpBody(help));
    dialog.append(content);
    dialog.addEventListener('click', event => {
        if (event.target === dialog) dialog.close();
    });
    document.body.append(dialog);
    return dialog;
}

function createHelpTrigger(dialog, help) {
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.id = 'siteHelpTrigger';
    trigger.className = 'site-help-trigger';
    trigger.setAttribute('aria-label', help.title);
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-controls', dialog.id);
    trigger.title = help.title;
    trigger.innerHTML = iconMarkup();
    trigger.addEventListener('click', () => dialog.showModal());
    alignTopRightControls(trigger);
    if (!trigger.parentElement) document.body.append(trigger);
}

export function initialiseSiteHelp() {
    const existing = document.querySelector(EXISTING_TRIGGER_SELECTOR);
    if (existing) {
        styleExistingTrigger(existing);
        return;
    }

    if (document.getElementById('siteHelpTrigger')) return;
    const help = PAGE_HELP[currentPagePath()] || null;
    if (!help) return;
    const dialog = createHelpDialog(help);
    createHelpTrigger(dialog, help);
}

if (typeof document !== 'undefined') initialiseSiteHelp();
