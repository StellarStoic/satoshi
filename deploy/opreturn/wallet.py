#!/usr/bin/env python3
"""Signs and broadcasts the message transactions.

BTCPay cannot do this part: its wallet API accepts addresses and BIP21 links only, and an
OP_RETURN output is neither. So this module builds the transaction itself, signs it with a
key that never leaves the machine, and broadcasts the raw bytes.

The key is one P2WPKH key in a file with mode 600. It holds only the fee pool, so what it
can lose is what is in that pool, not the store's revenue.

Signing uses openssl, which has secp256k1 built in, so nothing needs installing.
"""
from __future__ import annotations

import hashlib
import json
import os
import pathlib
import subprocess

# ---------------------------------------------------------------- bech32 (BIP173) ----

CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"


def _polymod(values):
    generator = [0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3]
    chk = 1
    for value in values:
        top = chk >> 25
        chk = ((chk & 0x1FFFFFF) << 5) ^ value
        for i in range(5):
            if (top >> i) & 1:
                chk ^= generator[i]
    return chk


def _hrp_expand(hrp):
    return [ord(c) >> 5 for c in hrp] + [0] + [ord(c) & 31 for c in hrp]


def _convertbits(data, frombits, tobits, pad=True):
    acc = bits = 0
    out = []
    maxv = (1 << tobits) - 1
    for value in data:
        acc = (acc << frombits) | value
        bits += frombits
        while bits >= tobits:
            bits -= tobits
            out.append((acc >> bits) & maxv)
    if pad and bits:
        out.append((acc << (tobits - bits)) & maxv)
    return out


def bech32_encode(hrp, data, spec="bech32"):
    const = 1 if spec == "bech32" else 0x2BC830A3
    polymod = _polymod(_hrp_expand(hrp) + data + [0, 0, 0, 0, 0, 0]) ^ const
    # Six five-bit groups, not one number: that is the whole checksum.
    checksum = [(polymod >> 5 * (5 - i)) & 31 for i in range(6)]
    return hrp + "1" + "".join(CHARSET[d] for d in data + checksum)


def segwit_address(hrp, version, program):
    data = [version] + _convertbits(program, 8, 5)
    return bech32_encode(hrp, data, "bech32" if version == 0 else "bech32m")


# ------------------------------------------------------------------------ hashing ----

def sha256(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()


def sha256d(data: bytes) -> bytes:
    return hashlib.sha256(hashlib.sha256(data).digest()).digest()


def hash160(data: bytes) -> bytes:
    return hashlib.new("ripemd160", hashlib.sha256(data).digest()).digest()


def varint(n: int) -> bytes:
    if n < 0xFD:
        return bytes([n])
    if n <= 0xFFFF:
        return b"\xfd" + n.to_bytes(2, "little")
    if n <= 0xFFFFFFFF:
        return b"\xfe" + n.to_bytes(4, "little")
    return b"\xff" + n.to_bytes(8, "little")


def push(data: bytes) -> bytes:
    if len(data) <= 75:
        return bytes([len(data)]) + data
    if len(data) <= 0xFF:
        return b"\x4c" + bytes([len(data)]) + data
    return b"\x4d" + len(data).to_bytes(2, "little") + data


# ------------------------------------------------------------------------- keys ----

def generate_key(path: pathlib.Path) -> bytes:
    """Creates a secp256k1 key at `path` and returns the 33-byte compressed public key."""
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["openssl", "ecparam", "-name", "secp256k1", "-genkey", "-noout",
                    "-out", str(path)], check=True, capture_output=True)
    path.chmod(0o600)
    return public_key(path)


def public_key(path: pathlib.Path) -> bytes:
    out = subprocess.run(["openssl", "ec", "-in", str(path), "-pubout", "-conv_form",
                          "compressed", "-outform", "DER"], check=True, capture_output=True).stdout
    # A compressed point is the last 33 bytes of the DER SubjectPublicKeyInfo.
    return out[-33:]


def sign_hash(path: pathlib.Path, digest: bytes) -> bytes:
    """DER-encoded ECDSA signature over a 32-byte digest, normalised to low-S."""
    der = subprocess.run(["openssl", "dgst", "-sha256", "-sign", str(path)],
                         input=digest, check=True, capture_output=True).stdout
    r, s = _parse_der(der)
    order = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
    if s > order // 2:
        s = order - s
    return _encode_der(r, s)


def _parse_der(sig: bytes):
    if sig[0] != 0x30:
        raise ValueError("not a DER signature")
    index = 2
    if sig[1] & 0x80:
        index += sig[1] & 0x7F
    if sig[index] != 0x02:
        raise ValueError("bad DER r")
    r_len = sig[index + 1]
    r = int.from_bytes(sig[index + 2:index + 2 + r_len], "big")
    index += 2 + r_len
    if sig[index] != 0x02:
        raise ValueError("bad DER s")
    s_len = sig[index + 1]
    s = int.from_bytes(sig[index + 2:index + 2 + s_len], "big")
    return r, s


def _encode_der(r: int, s: int) -> bytes:
    def encode_int(value):
        raw = value.to_bytes((value.bit_length() + 7) // 8 or 1, "big")
        if raw[0] & 0x80:
            raw = b"\x00" + raw
        return b"\x02" + bytes([len(raw)]) + raw
    body = encode_int(r) + encode_int(s)
    return b"\x30" + bytes([len(body)]) + body


# -------------------------------------------------------------- BIP143 signing ----

SIGHASH_ALL = 1
SEQUENCE_FINAL = 0xFFFFFFFF


def serialize_output(value: int, script: bytes) -> bytes:
    return value.to_bytes(8, "little") + varint(len(script)) + script


def _serialize_tx(version, inputs, outputs, locktime, witnesses=None) -> bytes:
    out = version.to_bytes(4, "little")
    if witnesses is not None:
        out += b"\x00\x01"
    out += varint(len(inputs))
    for txid, vout, script_sig, sequence in inputs:
        out += bytes.fromhex(txid)[::-1] + vout.to_bytes(4, "little") + varint(len(script_sig)) + script_sig + sequence.to_bytes(4, "little")
    out += varint(len(outputs))
    for value, script in outputs:
        out += serialize_output(value, script)
    if witnesses is not None:
        for stack in witnesses:
            out += varint(len(stack))
            for item in stack:
                out += varint(len(item)) + item
    out += locktime.to_bytes(4, "little")
    return out


def sighash_p2wpkh(version, inputs, outputs, locktime, index, amount, pubkey_hash, sighash=SIGHASH_ALL) -> tuple[bytes, bytes]:
    """BIP143 digest for input `index`, which spends a P2WPKH output of `amount`."""
    hash_prevouts = sha256d(b"".join(bytes.fromhex(txid)[::-1] + vout.to_bytes(4, "little")
                                     for txid, vout, _, _ in inputs))
    hash_sequence = sha256d(b"".join(sequence.to_bytes(4, "little")
                                    for _, _, _, sequence in inputs))
    hash_outputs = sha256d(b"".join(serialize_output(value, script) for value, script in outputs))
    txid, vout, _, sequence = inputs[index]
    script_code = b"\x76\xa9\x14" + pubkey_hash + b"\x88\xac"  # 25 bytes, prefix added below
    preimage = (version.to_bytes(4, "little") + hash_prevouts + hash_sequence
                + bytes.fromhex(txid)[::-1] + vout.to_bytes(4, "little")
                + varint(len(script_code)) + script_code
                + amount.to_bytes(8, "little") + sequence.to_bytes(4, "little")
                + hash_outputs + locktime.to_bytes(4, "little") + sighash.to_bytes(4, "little"))
    return sha256d(preimage), preimage


# --------------------------------------------------------------------- spending ----

def op_return_script(text: str) -> bytes:
    data = text.encode("utf-8")
    if not data or len(data) > 80:
        raise ValueError("a message is 1 to 80 bytes")
    return b"\x6a" + push(data)


def estimate_vsize(inputs: int, message_bytes: int, change_outputs: int = 1) -> int:
    """Virtual size of a P2WPKH-funded transaction carrying one OP_RETURN.

    The witness is discounted to a quarter, so counting raw bytes overpays. A P2WPKH
    input is 41 bytes of base data plus 108 weight units of witness: 68 vbytes.
    """
    base = 4 + 1 + 1 + 4                      # version, in count, out count, locktime
    spend_inputs = inputs * 41
    change = change_outputs * 31              # value 8 + length 1 + P2WPKH script 22
    push = 1 if message_bytes <= 75 else 2
    op_return = 8 + 1 + push + message_bytes
    witness = inputs * (1 + 1 + 72 + 1 + 33)  # stack count + lengths + signature + pubkey
    weight = (base + spend_inputs + change + op_return) * 4 + witness
    return (weight + 3) // 4


def build_and_sign(message: str, utxos, address_program: bytes, key_path: pathlib.Path,
                   pubkey: bytes, feerate: float = 2.0, version: int = 2) -> tuple[str, dict]:
    """Returns (raw transaction hex, summary).

    utxos: [{"txid": ..., "vout": n, "value": sats}]
    """
    if not utxos:
        raise ValueError("no coins to spend")
    script_pubkey = b"\x00\x14" + address_program                      # P2WPKH output
    outputs = [(0, op_return_script(message))]

    # Fees: one P2WPKH input is ~68 vbytes, two outputs ~62, the OP_RETURN adds its own
    # bytes. Estimate, then rebuild once with the real change so the total lands right.
    def assemble(change_value):
        outs = list(outputs)
        if change_value > 0:
            outs.append((change_value, script_pubkey))
        return outs

    total_in = sum(u["value"] for u in utxos)
    inputs = [(u["txid"], u["vout"], b"", SEQUENCE_FINAL) for u in utxos]
    message_bytes = len(message.encode("utf-8"))
    vsize = estimate_vsize(len(inputs), message_bytes, 1)
    fee = int(vsize * feerate) + 1
    change = total_in - fee
    if change < 546:
        # Not enough left to be worth an output: let the miner have it.
        fee = total_in
        change = 0
    final_outputs = assemble(change)

    witnesses = []
    for index, utxo in enumerate(utxos):
        digest, _ = sighash_p2wpkh(version, inputs, final_outputs, 0, index, utxo["value"],
                                  address_program, SIGHASH_ALL)
        signature = sign_hash(key_path, digest) + bytes([SIGHASH_ALL])
        witnesses.append([signature, pubkey])

    raw = _serialize_tx(version, inputs, final_outputs, 0, witnesses=witnesses)
    summary = {
        "messageBytes": len(message.encode("utf-8")),
        "inputs": len(inputs),
        "totalIn": total_in,
        "fee": fee,
        "change": change,
        "feerate": round(fee / (len(raw)), 2),
        "size": len(raw),
        "txid": sha256d(raw)[::-1].hex(),
    }
    return raw.hex(), summary


# ------------------------------------------------------------------- key export ----

BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def base58check(payload: bytes) -> str:
    data = payload + sha256d(payload)[:4]
    number = int.from_bytes(data, "big")
    out = ""
    while number:
        number, remainder = divmod(number, 58)
        out = BASE58[remainder] + out
    padding = len(data) - len(data.lstrip(b"\x00"))
    return "1" * padding + out


def private_scalar(path: pathlib.Path) -> bytes:
    """The 32-byte private key out of the PEM, so it can be carried to another wallet."""
    der = subprocess.run(["openssl", "ec", "-in", str(path), "-outform", "DER"],
                         check=True, capture_output=True).stdout
    marker = der.find(b"\x04\x20")
    if marker < 0:
        raise ValueError("no 32-byte private key in this PEM")
    return der[marker + 2:marker + 34]


def key_as_wif(path: pathlib.Path, testnet: bool = False) -> str:
    """WIF for import into Electrum, Sparrow or any wallet that takes one.

    This is the recovery path if the machine that holds the PEM is gone: the WIF plus a
    wallet that accepts it reaches the same coins. Treat the output as the money itself.
    """
    version = b"\xef" if testnet else b"\x80"
    return base58check(version + private_scalar(path) + b"\x01")


# --------------------------------------------------------------- plain payments ----

def decode_segwit(address: str):
    """Returns (version, program) for a bech32/bech32m segwit address."""
    address = address.strip().lower()
    separator = address.rfind("1")
    if separator < 1:
        raise ValueError("not a segwit address")
    hrp, rest = address[:separator], address[separator + 1:]
    words = []
    for char in rest:
        index = CHARSET.find(char)
        if index < 0:
            raise ValueError(f"bad character {char!r}")
        words.append(index)
    body, checksum = words[:-6], words[-6:]
    for spec, const in (("bech32", 1), ("bech32m", 0x2BC830A3)):
        if _polymod(_hrp_expand(hrp) + body + checksum) == const:
            break
    else:
        raise ValueError("checksum does not match")
    if not body:
        raise ValueError("empty witness program")
    version = body[0]
    program = bytes(_convertbits(body[1:], 5, 8, False))
    expected = 20 if version == 0 else 32
    if len(program) != expected:
        raise ValueError("unexpected witness program length")
    if version == 0 and spec != "bech32":
        raise ValueError("version 0 needs bech32, this address is bech32m")
    if version > 0 and spec != "bech32m":
        raise ValueError("this version needs bech32m")
    return version, program


def script_for_address(address: str) -> bytes:
    version, program = decode_segwit(address)
    prefix = b"\x00" if version == 0 else bytes([0x50 + version])
    return prefix + bytes([len(program)]) + program


def build_payment(utxos, destination_address: str, key_path: pathlib.Path, pubkey: bytes,
                  feerate: float = 2.0, version: int = 2) -> tuple[str, dict]:
    """Spends the pool back out to any segwit address. This is the withdrawal."""
    if not utxos:
        raise ValueError("no coins to spend")
    spend_script = b"\x00\x14" + hash160(pubkey)
    send_script = script_for_address(destination_address)
    inputs = [(u["txid"], u["vout"], b"", SEQUENCE_FINAL) for u in utxos]
    total_in = sum(u["value"] for u in utxos)
    fee = int((len(_serialize_tx(version, inputs, [(0, send_script)], 0,
                                witnesses=[[b"\x00" * 71, pubkey] for _ in inputs])) + 20) * feerate) + 1
    amount = total_in - fee
    if amount <= 0:
        raise ValueError(f"{(fee)} sats of fee leaves nothing to send")
    outputs = [(amount, send_script)]
    witnesses = []
    for index, utxo in enumerate(utxos):
        digest, _ = sighash_p2wpkh(version, inputs, outputs, 0, index, utxo["value"],
                                  hash160(pubkey), SIGHASH_ALL)
        witnesses.append([sign_hash(key_path, digest) + bytes([SIGHASH_ALL]), pubkey])
    raw = _serialize_tx(version, inputs, outputs, 0, witnesses=witnesses)
    summary = {"sent": amount, "fee": fee, "totalIn": total_in, "inputs": len(inputs),
               "to": destination_address, "txid": sha256d(raw)[::-1].hex()}
    return raw.hex(), summary


def fetch_utxos(address: str, base: str = "https://mempool.space/api"):
    import json as _json
    import urllib.request as _url
    opener = _url.build_opener(_url.ProxyHandler({}))
    with opener.open(f"{base}/address/{address}/utxo", timeout=25) as response:
        return _json.loads(response.read().decode())


def broadcast(raw_hex: str, base: str = "https://mempool.space/api"):
    import urllib.error as _err
    import urllib.request as _url
    opener = _url.build_opener(_url.ProxyHandler({}))
    request = _url.Request(f"{base}/tx", data=raw_hex.encode(),
                           headers={"content-type": "text/plain"}, method="POST")
    try:
        with opener.open(request, timeout=30) as response:
            return response.read().decode().strip()
    except _err.HTTPError as error:
        return "ERROR " + error.read().decode("utf-8", "replace")[:300]


def pool_address(key_path: pathlib.Path, hrp: str = "bc") -> str:
    return segwit_address(hrp, 0, hash160(public_key(key_path)))


DEFAULT_KEY = pathlib.Path("/opt/data/.opreturn/pool-key.pem")


if __name__ == "__main__":
    import sys

    command = sys.argv[1] if len(sys.argv) > 1 else "address"
    key_path = pathlib.Path(os.environ.get("OPRETURN_POOL_KEY", str(DEFAULT_KEY)))

    if command == "address":
        if not key_path.exists():
            generate_key(key_path)
            print("generated", key_path)
        print(pool_address(key_path))
    elif command == "wif":
        print(key_as_wif(key_path))
        print("this is the money itself: do not paste it into a chat or a web page", file=sys.stderr)
    elif command == "balance":
        utxos = fetch_utxos(pool_address(key_path))
        print(sum(int(u["value"]) for u in utxos), "sats in", len(utxos), "coins")
    elif command == "sweep":
        if len(sys.argv) < 3:
            raise SystemExit("usage: wallet.py sweep <segwit address> [--broadcast]")
        destination = sys.argv[2]
        script_for_address(destination)  # fails early on a bad address
        utxos = fetch_utxos(pool_address(key_path))
        if not utxos:
            raise SystemExit("nothing to sweep")
        raw, summary = build_payment(
            [{"txid": u["txid"], "vout": u["vout"], "value": int(u["value"])} for u in utxos],
            destination, key_path, public_key(key_path))
        print(json.dumps(summary, indent=1))
        if "--broadcast" in sys.argv:
            print("broadcast:", broadcast(raw))
        else:
            print("raw:", raw)
            print("add --broadcast to send it")
