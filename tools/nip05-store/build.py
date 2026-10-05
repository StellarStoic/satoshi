#!/usr/bin/env python3
"""
Builds nip05store.html out of nip05.html, so the new page inherits the site's real
chrome (nav menu, footer, consent modal, copy toast) instead of a hand-copy that
drifts. Only the middle content and the head's title/description/scripts change.

Boundaries are asserted, so a future edit to nip05.html that moves them fails this
build loudly rather than silently producing a broken page.
"""

from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SOURCE = REPO / 'nip05.html'
CONTENT = Path(__file__).with_name('content.html')
TARGET = REPO / 'nip05store.html'

lines = SOURCE.read_text(encoding='utf-8').splitlines()

# --- boundaries: located, not hardcoded, so an edit to nip05.html's head or its
# nav menu cannot silently shift the cut. Both are asserted below.
menu_start = next(i for i, line in enumerate(lines) if '<div id="menu">' in line)
depth = 0
menu_end = None
for i in range(menu_start, len(lines)):
    depth += lines[i].count('<div') - lines[i].count('</div>')
    if depth == 0:
        menu_end = i
        break
assert menu_end is not None, 'the nav menu is never closed'
HEAD_END = menu_start            # 0-based: everything above <div id="menu">
NAV_START, NAV_END = menu_start + 1, menu_end + 1

# The tail starts at the separator comment above the footer, located rather than
# hardcoded so an edit higher up the file cannot silently shift it.
footer_idx = next(i for i, line in enumerate(lines) if 'Footer with Email' in line)
TAIL_START = footer_idx  # 0-based: the comment line directly above the footer
while TAIL_START > 0 and (lines[TAIL_START - 1].strip().startswith('<!--') or not lines[TAIL_START - 1].strip()):
    TAIL_START -= 1
TAIL_START += 1  # back to 1-based

assert '<div id="menu">' in lines[NAV_START - 1], f'line {NAV_START} is not the menu: {lines[NAV_START - 1]!r}'
assert lines[NAV_END - 1].strip() == '</div>', f'line {NAV_END} is not a </div>: {lines[NAV_END - 1]!r}'
# The nav block must be tag-balanced, which is the real test that the cut is clean.
nav_block = lines[NAV_START - 1:NAV_END]
opens = sum(line.count('<div') + line.count('<ul') for line in nav_block)
closes = sum(line.count('</div>') + line.count('</ul>') for line in nav_block)
assert opens == closes, f'the nav block is unbalanced: {opens} opens vs {closes} closes'
assert not lines[NAV_END].strip(), f'line {NAV_END + 1} should be blank, got {lines[NAV_END]!r}'
assert 'nip05-container' in lines[NAV_END + 1], f'line {NAV_END + 2} should start the old content: {lines[NAV_END + 1]!r}'
assert 'Footer with Email' in '\n'.join(lines[TAIL_START - 1:TAIL_START + 3]), 'the tail boundary moved'
tail = lines[TAIL_START - 1:]
assert any('nip05.js' in line for line in tail), 'the page script is not in the tail any more'

head = lines[:HEAD_END]
nav = lines[NAV_START - 1:NAV_END]
content = CONTENT.read_text(encoding='utf-8').splitlines()

# --- head edits ---
new_head = []
for line in head:
    if line.strip().startswith('<title>'):
        new_head.append('    <title>NIP-05 Name Store — claim yourname@satoshi.si</title>')
        continue
    new_head.append(line)
head = new_head

# A description for search engines, inserted after the viewport tag.
viewport = next(i for i, line in enumerate(head) if 'name="viewport"' in line)
if not any('name="description"' in line for line in head):
    head.insert(viewport + 1, '    <meta name="description" content="Claim a NIP-05 name like yourname@satoshi.si. '
                             'Pay in sats over Lightning, on-chain or Ark, and use the same key to publish to '
                             'the satoshi.si nostr relay.">')

# The store page needs no page-specific stylesheet of its own beyond the block in
# its content, and does need the local QR generator available early.
head = [line for line in head if 'nip05.css' not in line]
head_close = next(i for i, line in enumerate(head) if line.strip() == '</head>')
head.insert(head_close, '    <script src="/qrCodeGenerator_1_4_4.js" defer></script>')

# --- tail edit: the page's own script becomes the store module ---
new_tail = []
for line in tail:
    if 'nip05.js' in line:
        new_tail.append('    <script type="module" src="/nip05store.mjs"></script>')
        continue
    new_tail.append(line)
tail = new_tail

out = head + nav + content + tail
TARGET.write_text('\n'.join(out) + '\n', encoding='utf-8')

# --- report ---
text = TARGET.read_text(encoding='utf-8')
checks = {
    'inherits the nav menu': '<div id="menu">' in text,
    'inherits the footer': 'Footer with Email' in text or 'class="footer"' in text,
    'inherits the consent modal': 'cookieConsentModal' in text,
    'inherits the copy toast': 'copy-notification' in text,
    'loads the store module': '/nip05store.mjs' in text,
    'does not load the old page script': 'nip05.js' not in text,
    'title replaced': 'NIP-05 Name Store' in text,
    'has a meta description': 'name="description"' in text,
    'has the store form': 'id="storeName"' in text and 'id="createOrder"' in text,
    'has the pay and done cards': 'id="payCard"' in text and 'id="doneCard"' in text,
}
print(f'wrote {TARGET} ({len(out)} lines)')
for name, ok in checks.items():
    print(f'  {"OK " if ok else "FAIL"} {name}')
assert all(checks.values()), 'a required piece is missing'
