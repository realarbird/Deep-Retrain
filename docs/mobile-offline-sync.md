# Mobile offline sync protocol v1

Implement on Android and the web backend together. The existing `/api/sync` metadata route is unchanged.

## Pull

`GET /api/mobile-sync?collection=cards|decks|reviews|artifacts&after=<id>&limit=200&expectedAccountId=<optional>` returns:

```json
{"protocolVersion":1,"accountId":"server-derived Auth0 sub","serverTime":"ISO8601","collection":"cards","records":[{"id":"24hex","revision":"opaque server revision","data":{}}],"nextCursor":null,"settings":{},"draft":{"title":"","text":""}}
```

- First `cards` page includes settings and draft. Every record `data` includes normalized `id` plus the full whitelisted study document. Cards include deck title, facts, key points, question, practice including private answer keys, box/tier/count/date/latency history, suspension, and creation/update dates. Exclude vector embeddings and all authentication/API-key secrets. Decks retain future source notes as `rawText`. Reviews retain raw answers and grading history. Artifacts retain locally produced analogy/follow-up output.
- Pagination orders by stable `_id` and uses `after`, never caps the full inventory silently. A client pulls every page of every collection. Only after complete success may it remove absent previously synced clean records. Protect pending local rows and any row ACKed or modified after the pull began. An interrupted pull never deletes data. Repeating full snapshots handles remote deletions without adding tombstones to every existing web route; foreground polling and resume/reconnect pulls fetch new remote data.
- `accountId` always comes from the authenticated server identity. If an expected account is provided and differs, reject409 before reading/writing. This prevents requests racing account switches from acting on a different user's records.

## Push

`POST /api/mobile-sync` body:

```json
{"protocolVersion":1,"expectedAccountId":"...","operations":[{"id":"UUID","type":"createDeck|review|reveal|draft|artifact","occurredAt":"ISO8601","baseRevision":null,"baseOperationId":null,"payload":{}}]}
```

Response:

```json
{"protocolVersion":1,"accountId":"...","results":[{"operationId":"UUID","status":"applied|duplicate|conflict|rejected","message":null,"records":[{"collection":"cards","id":"...","revision":"...","data":{}}]}]}
```

- Server scopes identity itself and verifies expectedAccountId first. Persist a unique `(accountId, operationId)` receipt and all effects in one Mongo transaction. Replay returns the original result. Validate batches (max10), strings, scores, timestamps, body size, ownership, ids and allowed model provenance. No cloud model calls to process offline sync.
- Android-created deck/card ids are secure random 24-character hex Mongo-compatible ids. Server checks collisions/ownership, never reassigns ids. This avoids losing later queued references.
- `createDeck` payload: `{deckId, deckTitle, rawText, cards:[{id, conceptTitle, coreFact, expectedKeyPoints, question}]}`. Retain source notes. New cards begin box1, recall tier and due immediately. Do not trust client box/dates.
- `review` payload: `{cardId, reviewLogId, mode, practiceVersion, answer:{...}, latencyMs, thinkMs, sessionId, attemptId, score, feedback, coveredKeyPoints, missingKeyPoints, followUpQuestion, analogy, nextQuestion, modelId, modelSha256, tzOffsetMinutes, tzName, selfRating?}`. Answer mirrors current review submission (`answer` string for typed/cloze, `selectedOption` for choice, `statementId`/`value` for truefalse, `selfRating` for flip). Model provenance is the exact approved model ID and weight digest; Android uses Gemma4E2B LiteRT, Mac can use pinned Ollama Gemma4 E4B. Both provenance fields may be null only for keyed/self-rated modes; record local provenance explicitly as `on-device` and do not claim server/cloud verification. Server derives outcome, box, review count, next date, difficulty, exam adjustment and daily cap from validated mode/score/latency and original event day, never client schedule fields. Keyed modes should validate against stored practice keys where available; self-rating follows existing rules. Atomic receipt prevents double grading.
- Compare baseRevision against the current card. baseOperationId may identify the previous queued operation whose returned card revision is the base for this one, supporting a chain of offline reviews. Conflicting remote edits/deletions retain the attempt as conflict history, do not resurrect deleted cards or silently overwrite newer progress. Return explicit conflict status; client retains it for inspection until resolved.
- `reveal`: `{cardId}`; record original event and receipt, no grading/cap mutation. A revealed local attempt can only be self-rated, enforced in client state.
- `draft`: `{title,text}`; use baseRevision/updatedAt to prevent overwriting newer remote drafts. Preserve rejected/conflicting local draft in the outbox.
- `artifact`: `{cardId?,reviewLogId?,kind:"analogy|followUp",input?,output,modelId,modelSha256}`; store user-owned text in sync-visible artifacts. Never discard pending outputs silently.

## Android ownership and lifecycle

- Room canonical library, history and outbox are account-scoped. Schema v1→v2 migration creates new durable tables without destructive fallback or guessing owners for old unscoped cache rows.
- Commit local material/review updates and their outbox event atomically. Preserve unsynced work across crashes, 401s and sign-out. 401 pauses upload and requests reauthentication while keeping offline access for the remembered account. Explicit sign-out clears active session and hides old account content; pending account work is retained for that same account.
- Verify server account before uploads and responses before applying. Reconnect schedules immediate in-process sync plus network-constrained WorkManager retries; foreground poll30s, resume refresh, periodic background work15min. Background start timing is controlled by Android.
- Local installed/verified/eligible model takes precedence over cloud. Keep all local data durable regardless of transient inference or sync errors. Offline with no ready model still permits reading synced materials; show the reason study AI is unavailable.


Provenance allow-list (protocol v1):
- `gemma-4-E2B-it-litert-lm`: `181938105e0eefd105961417e8da75903eacda102c4fce9ce90f50b97139a63c`.
- `ollama:gemma4:e4b`: `370c2879f17648d337b0ab4e208fdce348e24d1060064e93d7645daafd56d39c` (current registry model layer, independently read from the official Ollama registry manifest), or `4c27e0f5b5adf02ac956c7322bd2ee7636fe3f45a8512c9aba5385242cb6e09a` (installed Ollama manifest's model layer). Tags alone are insufficient.
- `createDeck` accepts `modelId`/`modelSha256`; clients should send them explicitly. Existing Android-shaped requests default to the pinned E2B artifact.
- `review` also accepts optional integer `confidence` (1–3). The server stores it without changing grading.
