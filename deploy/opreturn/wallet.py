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
    estimate = assemble(546)
    vsize = len(_serialize_tx(version, inputs, estimate, 0, witnesses=[[b"\x00" * 71, pubkey] for _ in inputs])) + 4
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


def pool_address(key_path: pathlib.Path, hrp: str = "bc") -> str:
    return segwit_address(hrp, 0, hash160(public_key(key_path)))


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "address":
        path = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else "/opt/data/.opreturn/pool-key.pem")
        if not path.exists():
            generate_key(path)
            print("generated", path)
        print(pool_address(path))
