import json
import threading
import unittest
from urllib.request import urlopen
from urllib.error import HTTPError
from unittest.mock import patch
from bridge import Capture, make_server, parse_measurement


class ProtocolTests(unittest.TestCase):
    def test_uint8(self):
        self.assertEqual(parse_measurement(bytes([0, 72]))['bpm'], 72)

    def test_uint16(self):
        self.assertEqual(parse_measurement(bytes([1, 44, 1]))['bpm'], 300)

    def test_optional_fields(self):
        value = parse_measurement(bytes([30, 72, 12, 0, 0, 4, 0, 2]))
        self.assertEqual(value['rrMs'], [1000, 500])
        self.assertEqual(value['energyKj'], 12)
        self.assertTrue(value['contact'])

    def test_contact_unknown_and_absent(self):
        self.assertIsNone(parse_measurement(bytes([0, 72]))['contact'])
        self.assertEqual(parse_measurement(bytes([4, 72]))['quality'], 'NO_CONTACT')

    def test_invalid_packets(self):
        for packet in [b'', b'\x00', b'\x01\x48', b'\x08\x48', b'\x10\x48', b'\x10\x48\x01', b'\x00\x48\x00', b'\xe0\x48']:
            with self.subTest(packet=packet), self.assertRaises(ValueError):
                parse_measurement(packet)

    def test_zero_not_live(self):
        capture = Capture('BLE')
        capture.set_status('CONNECTED')
        capture.receive(b'\x00\x00')
        self.assertIsNone(capture.snapshot()['liveBpm'])

    def test_replay_not_hardware_evidence(self):
        capture = Capture('REPLAY')
        capture.receive(b'\x00\x48')
        self.assertFalse(capture.snapshot()['blePacketsObserved'])

    def test_stale_and_disconnect(self):
        capture = Capture('BLE')
        capture.set_status('CONNECTED')
        with patch('bridge.time.monotonic', return_value=10):
            capture.receive(b'\x00\x48')
            self.assertEqual(capture.snapshot()['liveBpm'], 72)
        with patch('bridge.time.monotonic', return_value=21):
            self.assertIsNone(capture.snapshot()['liveBpm'])
        capture.set_status('DISCONNECTED')
        self.assertIsNone(capture.snapshot()['liveBpm'])

    def test_retention_and_invalid_count(self):
        capture = Capture('REPLAY')
        for _ in range(610):
            capture.receive(b'\x00\x48')
        capture.receive(b'')
        state = capture.snapshot()
        self.assertEqual(len(state['samples']), 600)
        self.assertEqual(state['packetCount'], 610)
        self.assertEqual(state['invalidPackets'], 1)

    def test_http_capability_and_report(self):
        server = make_server(Capture('REPLAY'), 0, 'test-secret')
        thread = threading.Thread(target=server.serve_forever)
        thread.start()
        try:
            base = f'http://127.0.0.1:{server.server_port}'
            with self.assertRaises(HTTPError) as error:
                urlopen(base + '/state')
            self.assertEqual(error.exception.code, 403)
            error.exception.close()
            with urlopen(base + '/report?token=test-secret') as response:
                self.assertEqual(json.load(response)['source'], 'REPLAY')
                self.assertEqual(response.headers['Cache-Control'], 'no-store')
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == '__main__':
    unittest.main()
