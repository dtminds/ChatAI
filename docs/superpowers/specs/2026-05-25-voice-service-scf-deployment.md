# Voice Service SCF Deployment Guide

**Goal:** package and deploy a Tencent Cloud SCF voice conversion service that turns uploaded `.amr` voice objects under the configured source prefix into playable `.wav` objects under `s5/playable-voice/`.

**Architecture:** COS uploads trigger a Node.js 22 SCF handler. The handler validates the bucket and key prefix, downloads the source object from COS, detects the voice format, converts supported SILK/AMR input into PCM WAV, and writes the result back to the same bucket under the playable prefix. The first manual validation step is COS upload -> SCF trigger -> `HEAD` the generated WAV object.

**Tech Stack:** Node.js 22 SCF, TypeScript, `silk-wasm`, `cos-nodejs-sdk-v5`, COS trigger, WAV output.

---

## Files

- Create: `apps/voice-service/src/index.ts`
- Create: `apps/voice-service/src/functions/transcode-on-cos-event.ts`
- Create: `apps/voice-service/src/shared/config.ts`
- Create: `apps/voice-service/src/shared/cos.ts`
- Create: `apps/voice-service/src/shared/media-sniff.ts`
- Create: `apps/voice-service/src/shared/transcode.ts`
- Create: `apps/voice-service/src/shared/wav.ts`
- Create: `apps/voice-service/scripts/package-scf.mjs`
- Create: `artifacts/voice-service/voice-service-scf.zip`
- Create: `docs/superpowers/specs/2026-05-25-voice-service-scf-deployment.md`

## Deployment Values

Use these values for the first manual SCF validation:

```txt
Region: ap-shanghai
Bucket: scrm-msg-audit-1304132716
Input prefix: s5/msg
Output prefix: s5/playable-voice
Output format: wav
Runtime: Node.js 22.21
Handler: index.main_handler
Memory: 1024 MB
Timeout: 60 seconds or higher
```

Environment variables:

```txt
VOICE_SERVICE_BUCKET=scrm-msg-audit-1304132716
VOICE_SERVICE_INPUT_PREFIX=s5/msg
VOICE_SERVICE_OUTPUT_PREFIX=s5/playable-voice
VOICE_SERVICE_MAX_DURATION_MS=60000
VOICE_SERVICE_MAX_BYTES=10485760
VOICE_SERVICE_SAMPLE_RATE=16000
```

Do not configure permanent Tencent secret keys for normal deployment. Bind an SCF execution role with read/write permission to `scrm-msg-audit-1304132716`; SCF injects temporary credentials into `TENCENTCLOUD_SECRETID`, `TENCENTCLOUD_SECRETKEY`, and `TENCENTCLOUD_SESSIONTOKEN` at runtime. The code still supports `TENCENT_SECRET_ID` and `TENCENT_SECRET_KEY` only as a manual fallback.

The function package is generated at:

```txt
artifacts/voice-service/voice-service-scf.zip
```

If SCF logs only show `0 code exit unexpected` with `Duration: 0ms` and no application log, the function usually failed while loading the entry file. Rebuild and upload the latest zip from this repo. The package script now emits a CommonJS root `index.js` and hoisted `node_modules`, so Tencent SCF can resolve `index.main_handler` and package dependencies after unzip.

## Task 1: Build the voice codec core

**Files:**
- Create: `apps/voice-service/src/shared/media-sniff.ts`
- Create: `apps/voice-service/src/shared/transcode.ts`
- Create: `apps/voice-service/src/shared/wav.ts`
- Test: `apps/voice-service/test/media-sniff.test.ts`
- Test: `apps/voice-service/test/wav.test.ts`
- Test: `apps/voice-service/test/transcode.test.ts`

- [x] **Step 1: Write the failing tests**

The tests assert that:

```ts
detectVoiceFormat(new Uint8Array([0x02, ...ascii("#!SILK_V3"), 0x14, 0x00]))
// => { format: "silk-v3", headerOffset: 1 }

buildPlayableObjectKey("s5/voice/20260513/272/a.amr")
// => "s5/playable-voice/20260513/272/a.wav"

buildPlayableObjectKey("s5/msg/20260513/272/a.amr", "s5/msg", "s5/playable-voice")
// => "s5/playable-voice/20260513/272/a.wav"

createPcm16MonoWav(new Uint8Array([0x00, 0x00, 0xff, 0x7f]), 16000)
// => RIFF/WAVE header with a mono PCM16 data chunk

transcodeVoiceToWav(sampleSilk, { maxBytes: 1_048_576, maxDurationMs: 60_000, sampleRate: 16000 })
// => wav output, `contentType: "audio/wav"`
```

- [x] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @chatai/voice-service test -- test/media-sniff.test.ts test/wav.test.ts test/transcode.test.ts
```

Expected: fail until the helper functions exist.

- [x] **Step 3: Write minimal implementation**

Implement the helpers in `apps/voice-service/src/shared/*` and keep the surface small:

```ts
export function detectVoiceFormat(data: Uint8Array): DetectedVoiceFormat
export function buildPlayableObjectKey(sourceKey: string): string
export function createPcm16MonoWav(pcm: Uint8Array, sampleRate: number): Uint8Array
export async function transcodeVoiceToWav(input: Uint8Array, options: TranscodeOptions): Promise<TranscodeResult>
```

The transcode core should accept the SILK sample you already verified and reject oversized or unsupported files.

- [x] **Step 4: Run tests to verify they pass**

Run:

```bash
pnpm --filter @chatai/voice-service test
```

Expected: all voice-service tests pass.

## Task 2: Add the SCF handler

**Files:**
- Create: `apps/voice-service/src/index.ts`
- Create: `apps/voice-service/src/functions/transcode-on-cos-event.ts`
- Create: `apps/voice-service/src/shared/config.ts`
- Create: `apps/voice-service/src/shared/cos.ts`
- Test: `apps/voice-service/test/transcode-handler.test.ts`

- [x] **Step 1: Write the failing test**

The handler test should assert that an event like this:

```ts
{
  Records: [
    {
      cos: {
        cosBucket: { name: "scrm-msg-audit-1304132716" },
        cosObject: { key: encodeURIComponent("s5/msg/20260513/272/voice.amr") },
        cosRegion: { region: "ap-shanghai" }
      }
    }
  ]
}
```

is transformed into a COS `getObject` call for `s5/msg/.../voice.amr`, a `putObject` call for `s5/playable-voice/.../voice.wav`, and a successful return payload.

- [x] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter @chatai/voice-service test -- test/transcode-handler.test.ts
```

Expected: fail until the handler exists.

- [x] **Step 3: Write minimal implementation**

Use `cos-nodejs-sdk-v5` for:

```ts
client.getObject({ Bucket, Region, Key })
client.putObject({ Bucket, Region, Key, Body, ContentType: "audio/wav" })
```

The handler should:

```ts
1. read config
2. validate bucket == scrm-msg-audit-1304132716
3. validate source key starts with the configured input prefix
4. download the object
5. transcode it
6. write the wav to s5/playable-voice/.../*.wav
```

- [x] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm --filter @chatai/voice-service test
```

Expected: all tests pass.

## Task 3: Produce a deployable zip

**Files:**
- Create: `apps/voice-service/scripts/package-scf.mjs`
- Create: `apps/voice-service/index.js`
- Update: `apps/voice-service/package.json`

- [x] **Step 1: Write the packaging script**

The packaging script should:

```ts
1. run the TypeScript build
2. bundle src/index.ts into a CommonJS root index.js
3. install production dependencies with a hoisted node_modules layout
4. zip the temp directory to artifacts/voice-service/voice-service-scf.zip
5. delete the temp directory
```

Entry file:

```js
exports.main_handler = ...
```

package.json script:

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "package:scf": "node scripts/package-scf.mjs",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

- [x] **Step 2: Run the packaging script**

Run:

```bash
pnpm --filter @chatai/voice-service package:scf
```

Expected:

```bash
/Users/.../artifacts/voice-service/voice-service-scf.zip
```

- [x] **Step 3: Inspect the zip**

Verify the archive contains:

```txt
index.js
package.json
node_modules/audio-decode/package.json
node_modules/silk-wasm/lib/silk.wasm
node_modules/cos-nodejs-sdk-v5/index.js
```

## Task 4: Document the deployment flow

**Files:**
- Create: `docs/superpowers/specs/2026-05-25-voice-service-scf-deployment.md`

- [x] **Step 1: Document the upload and trigger configuration**

Document these runtime values:

```txt
Region: ap-shanghai
Bucket: scrm-msg-audit-1304132716
Input prefix: s5/msg
Output prefix: s5/playable-voice
Output format: wav
Runtime: Node.js 22.21
Entry: index.main_handler
```

- [x] **Step 2: Document the manual verification flow**

Document the exact manual check:

```txt
1. upload an .amr object to COS under the configured input prefix
2. let COS trigger SCF
3. wait for the function to finish
4. HEAD the generated s5/playable-voice/.../*.wav object
5. confirm the object exists and is playable
```

- [x] **Step 3: Document the first test scope**

Call out that this first phase is only for the SCF upload -> wav generation loop. Backend and frontend changes stay out of scope until this loop is verified on real COS data.

## Validation Checklist

- `pnpm --filter @chatai/voice-service test`
- `pnpm --filter @chatai/voice-service build`
- `pnpm --filter @chatai/voice-service package:scf`
- inspect `artifacts/voice-service/voice-service-scf.zip`
- `git diff --check`
