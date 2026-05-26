# Voice Service

Tencent Cloud SCF service for converting COS voice uploads into browser-playable WAV files.

## What It Does

- Listens to COS upload events for the configured source prefix
- Validates bucket and object prefix before processing
- Detects AMR-NB, AMR-WB, and Tencent SILK V3 voice data
- Rejects unsupported format, oversized file, or voice longer than the configured duration
- Writes converted WAV files back to the same bucket under `s5/playable-voice/**`

Example mapping:

```txt
s5/voice/20260513/272/voice.amr
=> s5/playable-voice/20260513/272/voice.wav
```

For existing message voice objects stored under `s5/msg/**`, set
`VOICE_SERVICE_INPUT_PREFIX=s5/msg` and configure the COS trigger for that
prefix. The output remains under `s5/playable-voice/**`.

## Runtime

Recommended Tencent Cloud SCF settings:

```txt
Region: ap-shanghai
Runtime: Node.js 22.21
Handler: index.main_handler
Memory: 1024 MB
Timeout: 60 seconds or higher
```

The normal deployment path should use an SCF execution role. Do not configure permanent Tencent secret keys unless you are doing a temporary manual test.

## Environment Variables

```txt
VOICE_SERVICE_BUCKET=scrm-msg-audit-1304132716
VOICE_SERVICE_INPUT_PREFIX=s5/msg
VOICE_SERVICE_OUTPUT_PREFIX=s5/playable-voice
VOICE_SERVICE_MAX_DURATION_MS=60000
VOICE_SERVICE_MAX_BYTES=10485760
VOICE_SERVICE_SAMPLE_RATE=16000
```

SCF role credentials are read from Tencent runtime variables:

```txt
TENCENTCLOUD_SECRETID
TENCENTCLOUD_SECRETKEY
TENCENTCLOUD_SESSIONTOKEN
```

Manual fallback variables are also supported:

```txt
TENCENT_SECRET_ID
TENCENT_SECRET_KEY
```

## Scripts

Run from the repository root:

```bash
pnpm --filter @chatai/voice-service test
pnpm --filter @chatai/voice-service build
pnpm --filter @chatai/voice-service package:scf
```

The package script creates:

```txt
artifacts/voice-service/voice-service-scf.zip
```

`artifacts/` is ignored by git because the zip is a generated deploy artifact.

## Manual Deployment Check

1. Upload the generated zip to Tencent SCF.
2. Configure handler as `index.main_handler`.
3. Bind an execution role that can read and write `scrm-msg-audit-1304132716`.
4. Configure a COS trigger for uploads under the same prefix as `VOICE_SERVICE_INPUT_PREFIX`.
5. Upload an AMR or SILK voice object to that source prefix.
6. Check SCF logs for the returned `playableKey`.
7. Verify the WAV object exists under `s5/playable-voice/**`.

## Related Docs

Full deployment notes:

```txt
docs/superpowers/specs/2026-05-25-voice-service-scf-deployment.md
```
