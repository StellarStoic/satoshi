"""Tests for the signer.

Run from the repo root: python3 -m unittest discover -s deploy/opreturn -p 'test_wallet.py' -v
"""
import pathlib
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import wallet

# BIP143's published example, verbatim, so the digest can be checked against its author.
UNSIGNED = ("0100000002fff7f7881a8099afa6940d42d1e7f6362bec38171ea3edf433541db4e4ad969f000000"
            "0000eeffffffef51e1b804cc89d182d279655c3aa89e815b1b309fe287d9b2b55d57b90ec68a0100"
            "000000ffffffff02202cb206000000001976a9148280b37df378db99f66f85c95a783a76ac7a6d59"
            "88ac9093510d000000001976a9143bde42dbee7e4dbe6a21b2d50ce2f0167faa815988ac11000000")


def parse_unsigned(raw_hex):
    raw = bytes.fromhex(raw_hex)
    version = int.from_bytes(raw[0:4], "little")
    cursor = 4
    count = raw[cursor]
    cursor += 1
    inputs = []
    for _ in range(count):
        txid = raw[cursor:cursor + 32][::-1].hex()
        vout = int.from_bytes(raw[cursor + 32:cursor + 36], "little")
        script_len = raw[cursor + 36]
        cursor += 37 + script_len
        sequence = int.from_bytes(raw[cursor:cursor + 4], "little")
        cursor += 4
        inputs.append((txid, vout, b"", sequence))
    out_count = raw[cursor]
    cursor += 1
    outputs = []
    for _ in range(out_count):
        value = int.from_bytes(raw[cursor:cursor + 8], "little")
        cursor += 8
        script_len = raw[cursor]
        cursor += 1
        outputs.append((value, raw[cursor:cursor + script_len]))
        cursor += script_len
    locktime = int.from_bytes(raw[cursor:cursor + 4], "little")
    return version, inputs, outputs, locktime


class Bech32Vector(unittest.TestCase):
    def test_the_bip173_p2wpkh_example(self):
        program = bytes.fromhex("751e76e8199196d454941c45d1b3a323f1433bd6")
        self.assertEqual(wallet.segwit_address("bc", 0, program),
                         "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")

    def test_a_taproot_address_uses_bech32m(self):
        program = bytes.fromhex("79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798")
        self.assertTrue(wallet.segwit_address("bc", 1, program).startswith("bc1p"))


class Addresses(unittest.TestCase):
    def test_the_published_witness_program_decodes(self):
        version, program = wallet.decode_segwit("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4")
        self.assertEqual(version, 0)
        self.assertEqual(program.hex(), "751e76e8199196d454941c45d1b3a323f1433bd6")
        self.assertEqual(wallet.script_for_address("bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4").hex(),
                         "0014751e76e8199196d454941c45d1b3a323f1433bd6")

    def test_taproot_round_trips(self):
        program = bytes.fromhex("79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798")
        address = wallet.segwit_address("bc", 1, program)
        version, decoded = wallet.decode_segwit(address)
        self.assertEqual((version, decoded), (1, program))
        self.assertEqual(wallet.script_for_address(address), b"\x51\x20" + program)

    def test_a_typo_is_refused(self):
        good = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"
        bad = good[:-1] + ("q" if good[-1] != "q" else "p")
        with self.assertRaises(ValueError):
            wallet.decode_segwit(bad)


class Withdrawal(unittest.TestCase):
    def test_a_sweep_pays_the_named_address_and_costs_one_fee(self):
        with tempfile.TemporaryDirectory() as tmp:
            key = pathlib.Path(tmp) / "k.pem"
            pubkey = wallet.generate_key(key)
            destination = wallet.segwit_address("bc", 0, bytes.fromhex("11" * 20))
            utxos = [{"txid": "ab" * 32, "vout": 1, "value": 30000}]
            raw, summary = wallet.build_payment(utxos, destination, key, pubkey, feerate=2.0)
            self.assertEqual(summary["to"], destination)
            self.assertEqual(summary["sent"] + summary["fee"], 30000)
            self.assertIn(wallet.script_for_address(destination).hex(), raw)
            self.assertEqual(len(summary["txid"]), 64)

    def test_a_dust_pool_is_refused_rather_than_sending_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            key = pathlib.Path(tmp) / "k.pem"
            pubkey = wallet.generate_key(key)
            destination = wallet.segwit_address("bc", 0, bytes.fromhex("22" * 20))
            with self.assertRaises(ValueError):
                wallet.build_payment([{"txid": "cd" * 32, "vout": 0, "value": 300}],
                                     destination, key, pubkey, feerate=2.0)


class Bip143Vector(unittest.TestCase):
    """If the digest matches BIP143's own number, the signer is correct."""

    def setUp(self):
        self.version, self.inputs, self.outputs, self.locktime = parse_unsigned(UNSIGNED)

    def test_the_example_transaction_parses_as_published(self):
        self.assertEqual(self.version, 1)
        self.assertEqual(self.locktime, 17)
        self.assertEqual(len(self.inputs), 2)
        self.assertEqual(self.outputs[0][0], 112340000)
        self.assertEqual(self.outputs[1][0], 223450000)
        self.assertEqual(self.inputs[0][3], 0xffffffee)

    def test_hash_prevouts_sequence_outputs_match(self):
        prevouts = wallet.sha256d(b"".join(bytes.fromhex(t)[::-1] + v.to_bytes(4, "little")
                                          for t, v, _, _ in self.inputs))
        sequence = wallet.sha256d(b"".join(s.to_bytes(4, "little") for _, _, _, s in self.inputs))
        outputs = wallet.sha256d(b"".join(wallet.serialize_output(v, sc) for v, sc in self.outputs))
        self.assertEqual(prevouts.hex(), "96b827c8483d4e9b96712b6713a7b68d6e8003a781feba36c31143470b4efd37")
        self.assertEqual(sequence.hex(), "52b0a642eea2fb7ae638c36f6252b6750293dbe574a806984b8e4d8548339a3b")
        self.assertEqual(outputs.hex(), "863ef3e1a92afbfdb97f31ad0fc7683ee943e9abcf2501590ff8f6551f47e5e5")

    def test_native_p2wpkh_sighash(self):
        digest, preimage = wallet.sighash_p2wpkh(
            version=self.version, inputs=self.inputs, outputs=self.outputs,
            locktime=self.locktime, index=1, amount=600000000,
            pubkey_hash=bytes.fromhex("1d0f172a0ecb48aee1be1f2687d2963ae33f71a1"),
            sighash=wallet.SIGHASH_ALL)
        self.assertEqual(digest.hex(),
                         "c37af31116d1b27caf68aae9e3ac82f1477929014d5b917657d0eb49478cb670")


class Signing(unittest.TestCase):
    def test_a_signature_verifies_against_its_own_digest(self):
        with tempfile.TemporaryDirectory() as tmp:
            key = pathlib.Path(tmp) / "k.pem"
            pubkey = wallet.generate_key(key)
            self.assertEqual(len(pubkey), 33)
            self.assertIn(pubkey[0], (2, 3))
            pub = pathlib.Path(tmp) / "k.pub"
            subprocess.run(["openssl", "ec", "-in", str(key), "-pubout", "-out", str(pub)],
                           check=True, capture_output=True)
            digest = wallet.sha256(b"a message worth signing")
            sig_file = pathlib.Path(tmp) / "sig.der"
            sig_file.write_bytes(wallet.sign_hash(key, digest))
            check = subprocess.run(["openssl", "dgst", "-sha256", "-verify", str(pub),
                                    "-signature", str(sig_file)], input=digest, capture_output=True)
            self.assertEqual(check.returncode, 0, (check.stdout + check.stderr).decode(errors="replace"))

    def test_signatures_are_low_s(self):
        with tempfile.TemporaryDirectory() as tmp:
            key = pathlib.Path(tmp) / "k.pem"
            wallet.generate_key(key)
            order = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
            for _ in range(4):
                r, s = wallet._parse_der(wallet.sign_hash(key, wallet.sha256(b"x")))
                self.assertLessEqual(s, order // 2)


class Transactions(unittest.TestCase):
    def test_op_return_script_uses_the_right_push(self):
        self.assertEqual(wallet.op_return_script("hi").hex(), "6a026869")
        self.assertTrue(wallet.op_return_script("x" * 80).hex().startswith("6a4c50"))
        with self.assertRaises(ValueError):
            wallet.op_return_script("x" * 81)

    def test_a_signed_transaction_is_well_formed(self):
        with tempfile.TemporaryDirectory() as tmp:
            key = pathlib.Path(tmp) / "k.pem"
            pubkey = wallet.generate_key(key)
            program = wallet.hash160(pubkey)
            utxo = {"txid": "aa" * 32, "vout": 0, "value": 50000}
            raw, summary = wallet.build_and_sign("hello chain", [utxo], program, key, pubkey, feerate=2.0)
            self.assertEqual(raw[8:12], "0001", "segwit marker and flag follow the version")
            self.assertEqual(summary["inputs"], 1)
            self.assertEqual(summary["messageBytes"], 11)
            self.assertGreater(summary["fee"], 0)
            self.assertEqual(summary["change"] + summary["fee"], 50000)
            self.assertEqual(len(summary["txid"]), 64)
            self.assertIn(wallet.op_return_script("hello chain").hex(), raw)
            # the change output pays back to the same program
            self.assertIn(("0014" + program.hex()), raw)

    def test_no_coins_is_an_error_not_an_empty_transaction(self):
        with self.assertRaises(ValueError):
            wallet.build_and_sign("x", [], b"\x00" * 20, pathlib.Path("/nonexistent"), b"\x02" + b"\x00" * 32)


if __name__ == "__main__":
    unittest.main()
