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
        title: 'About Nostr sticky notes',
        description: 'Sticky notes are small public messages signed with your Nostr identity and placed on a shared'
            + ' corkboard. Tag people with @, choose how long a note lives, and post with a subscription: 10 sats a'
            + ' week, or 5 with a satoshi.si name.',
        sections: [
            {
                label: 'In plain words',
                paragraphs: [
                    'Sticky notes are small public messages, signed with your Nostr identity or a random anonymous one,'
                    + ' and placed on a shared corkboard. Choose where the note will be visible, and choose how long it'
                    + ' lives. Perfect for small areas and groups pinning notes to each other.',
                    'You can name people in a note: type @ and pick from the names that come up. Anyone with a NIP-05'
                    + ' name can be tagged — on any domain, not only satoshi.si. The note carries the person\u2019s public'
                    + ' key and the board draws their name in its place. The person button at the top of the board shows'
                    + ' only the notes that tag you, and it works for a signed-in identity that has a name of its own: a'
                    + ' temporary anonymous identity has no name, so that button stays out of reach for one.',
                    'Every note is temporary, and you choose how temporary. A slider offers a day, a week, a month, six'
                    + ' months or a year, and it starts at a month. The note states the exact moment it will go, and the'
                    + ' relay that holds it deletes it then, so the board stays a board people walk past rather than an'
                    + ' archive of everything ever written. You cannot extend a note after it is pinned — pin it again'
                    + ' if you need it for longer — and a year is the longest this board offers.',
                    'Posting is a pass rather than a payment per note: 10 sats for a week, or 411 for a year, which is'
                    + ' about 21% less than paying weekly. While the pass lasts you can pin as many notes as you like and'
                    + ' remove your own, with no per-note price. If you own a satoshi.si name such as yourname@satoshi.si,'
                    + ' the same pass costs half: 5 sats a week or 205 a year.',
                    'You do not have to decide about the pass before you start writing. Write the note, press the button,'
                    + ' pay for the pass, and the note you were already writing goes onto the board by itself. For the rest'
                    + ' of the pass the button simply says that posting is included.',
                    'Not signed in? An anonymous note costs 42 sats each. Your browser invents a temporary identity for'
                    + ' that note, keeps its key only on this device, and forgets it after 24 hours. A pass never applies to'
                    + ' an anonymous note: each one costs 42 sats.',
                    'When a pass runs out, nothing you already pinned disappears. Your notes stay on the board for'
                    + ' everyone to read; only new notes and removals need a pass.',
                    'You pay in sats over Lightning or Ark, straight from your own wallet. Satoshi.si never sees your'
                    + ' private key and never holds your sats; the pass is a record the board checks when you post.',
                ]
            },
            {
                label: 'Technical',
                paragraphs: [
                    'A note is one kind 1 Nostr event signed by your own signer: a browser extension, a bunker, or a key'
                    + ' pasted for a single visit. The text is the event content and everything else travels in tags:'
                    + ' ["t","satoshi-sticky"], ["client","satoshi.si"], one ["sticky","v1",color,x,y,rotation,font] whose x'
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
                    + ' arrives expired. The relay never serves an expired event, and a cleanup deletes expired events'
                    + ' from its store every ten minutes. A removal carries no expiration on purpose: an expiring'
                    + ' deletion would be deleted itself, and the note it removed would come back. A note on the'
                    + ' relay that names no expiration at all is not drawn either: this board shows only notes that'
                    + ' say when they go, so a note written past the desk is invisible here rather than permanent.',
                    'Mentions follow NIP-27 and are the reason a tag means something. Typing @ offers the names the'
                    + ' board can resolve — the satoshi.si store it is served from, or any name@domain it asks directly —'
                    + ' and only a key that answers with a NIP-05 name can be picked. What travels is the canonical form:'
                    + ' the text carries nostr:npub1\u2026 and the event carries one ["p","<64-hex>"] tag per person, at'
                    + ' most five, each a different key. The desk refuses a ["p", \u2026] tag whose key the text never'
                    + ' names, a sixth, a repeated key, and any mention at all on a note from a temporary identity or on'
                    + ' a removal. Mentions cost nothing extra: one note, one price, however many people it names.',
                    'Every pin belongs to a geohash of four to nine characters: you enter one or pick it on the'
                    + ' map view, where zooming changes the grid between those depths. A place that straddles two'
                    + ' or three cells — a building on a corner — can be pinned to all of them at once, as long as the cells'
                    + ' touch (along an edge or at a corner) and there are no more than nine: one note, one price. The note'
                    + ' names each of those cells in its own ["g",<cell>] tag, the boards above them so it is also findable'
                    + ' on the wider boards, ["i","geo:<cell>"] for the cell it was written on, and ["k","geo"] — unless you'
                    + ' mark it exact-only, when only the cells themselves are named and the note appears on those boards'
                    + ' alone. This is organisation, not privacy: a published note is public.',
                    'Around me asks the browser where you are, and then asks how much ground to cover: a building,'
                    + ' a neighbourhood, a city or a state, which are geohash depths 8, 7, 5 and 4 — about 19 m,'
                    + ' 153 m, 4.9 km'
                    + ' and 20 km of cell height, and a cell is the same height at every latitude. The position is turned'
                    + ' into a geohash inside the page and is never sent anywhere: the board asks the relay for that'
                    + ' geohash, not for you. The size is the reader\u2019s own choice because a board is only as useful as'
                    + ' the depth it is read at, and the answer says so when the device was less accurate than the cell'
                    + ' is tall.',
                    'A pass is a subscription record the payment service keeps against your public key: a week or a year,'
                    + ' extended rather than restarted when you renew early, covering any number of pins and removals while'
                    + ' it is active. The yearly price is the weekly price for 52 weeks less 21% (10 × 52 = 520 → 411; with'
                    + ' a name, 5 × 52 = 260 → 205).',
                    'A pin from a key with no active pass is refused with a subscription-required answer; the board then'
                    + ' buys the pass and repeats the same action, which the second time comes back already settled at zero'
                    + ' sats along with its publish token.',
                    'A removal is a kind 5 deletion event signed by the same identity as the note, carrying ["e",<event'
                    + ' id>] with a relay hint and ["k","1"]. Only the author can order one: the service reads the target'
                    + ' note from the relay and compares its author before it prices anything.',
                    'The publish token is bound to the note content hash, its geohash and its identity mode, lives 15'
                    + ' minutes and is spent once, so a token bought for one note cannot publish a different one in another'
                    + ' cell. The service verifies the event id and signature before the relay sees the event, and the relay'
                    + ' admits a write only for the exact event id that was paid for. An anonymous note must carry the'
                    + ' ["anonymous","24h-local-key"] marker; a named note must not.',
                    'Payments are in sats over Lightning or Ark, for the amount the service calculated for that order,'
                    + ' and a rail asking for any other amount is refused. Reading is always free: the relay serves every'
                    + ' published note to anyone, and an expired pass deletes, hides and rewrites nothing.',
                ]
            },
        ]
    },
    '/offers.html': {
        title: 'About the P2P order book',
        description: 'Compare public peer-to-peer Bitcoin buy and sell offers from several markets in one place, then continue on the original platform.'
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
    '/quotes.html': {selector: '#next-quote', group: true, icon: true},
    '/converter.html': {selector: '.add-currency-icon', group: true, icon: true},
    '/news.html': {selector: '#openNewsSettings', group: true, icon: true},
    '/priceScanner.html': {selector: '.scanner-top-controls', wide: true},
    '/isBip39.html': {selector: '#openWordlistSettings', group: true, icon: true},
    '/wallet.html': {selector: '#openWalletSettings', group: true, icon: true},
    '/MoscowTime.html': {selector: '#openMoscowSettings', group: true, icon: true},
    '/stickyNotes.html': {selector: '.sticky-top-actions', wide: true}
});

function groupTopRightControls(trigger, companion) {
    trigger.classList.add('site-help-trigger--grouped');
    companion.classList.add('site-help-companion--grouped');
    // Keep both controls at the document root so one shared rule aligns them.
    document.body.append(trigger, companion);
    document.querySelector('.site-help-actions')?.remove();
}

function alignTopRightControls(trigger) {
    const config = TOP_RIGHT_COMPANIONS[normalisePath(location.pathname)];
    if (!config) return;
    const companion = document.querySelector(config.selector);
    if (!companion) return;
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
    if (trigger.parentElement !== document.body) document.body.append(trigger);
}

export function initialiseSiteHelp() {
    const existing = document.querySelector(EXISTING_TRIGGER_SELECTOR);
    if (existing) {
        styleExistingTrigger(existing);
        return;
    }

    if (document.getElementById('siteHelpTrigger')) return;
    const help = helpForPath(location.pathname);
    if (!help) return;
    const dialog = createHelpDialog(help);
    createHelpTrigger(dialog, help);
}

if (typeof document !== 'undefined') initialiseSiteHelp();
