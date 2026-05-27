# Voice Fixtures

These small binary fixtures cover real decoder behavior that is difficult to
verify with synthetic byte arrays.

- `tencent-silk.amr`: Tencent SILK_V3 payload with a leading metadata byte before
  the `#!SILK_V3` marker. This fixture intentionally verifies that
  `silk-wasm` receives the full object body; slicing at the detected marker
  offset breaks decoding for this sample.
- `amr-nb.amr`: AMR-NB sample used to verify the browser-playable WAV transcode
  path for standard AMR input.

Keep fixtures minimal. Add new binary fixtures only when a real decoder or
format edge case cannot be represented by a small synthetic test input, and keep
individual files below 200 KB unless the test explains why a larger sample is
required.
