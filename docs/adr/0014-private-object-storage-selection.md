# ADR 0014: Private object storage selection for APKG media

- Status: Accepted
- Date: 2026-07-21
- Extends: ADR 0010 and ADR 0013

## Context

SayDeck stores expression data and audio/export metadata in Neon/Postgres. The
actual US-English audio and generated APKG files are binary artifacts with a
different lifecycle from relational data. They must be downloadable only by
the owner, but must not be stored on a Vercel Function filesystem in
Production.

The initial scale is up to roughly 5,000 selected expressions. Each expression
has a key-expression audio file and an example-sentence audio file. The current
xAI TTS implementation requests 24 kHz WAV, so 5,000 pairs are estimated at
roughly 1.2 to 1.7 GB depending on speech duration. This is an estimate, not a
capacity commitment.

The storage choice affects private delivery, secrets, operating limits, cost
visibility, and a potential future migration.

## Decision

1. Use private Vercel Blob as the Production object store for audio binaries
   and APKG artifacts.
2. Keep Postgres as the source of truth for text, ownership, hashes, media
   metadata, and export records. Store only an opaque blob path in Postgres;
   do not store binary payloads there.
3. Keep local filesystem storage only as a non-Production development fallback.
4. Deliver private objects through owner-authenticated application routes; do
   not expose permanent public media URLs.
5. Keep object-storage access behind `src/lib/binary-store.ts` so an S3- or
   Google Cloud Storage-backed adapter can replace Vercel Blob without changing
   the expression or APKG domain contracts.
6. Treat generated APKG retention, cost preflight, confirmation UX, and batch
   behavior as a follow-up product/operations decision. This ADR does not
   approve indefinite APKG artifact retention.

## Options Considered

### Option A: Private Vercel Blob

- Advantages: Integrates with the existing Vercel deployment, supports private
  access, uses a single server-side token, and does not add a second cloud
  account, IAM model, or cross-cloud delivery path.
- Costs and limits: Vercel measures average GB-month storage, writes as
  Advanced Operations, and downloads as data transfer. At the checked pricing
  date, the on-demand storage rate is USD 0.023 per GB-month. Hobby includes
  only 2,000 Advanced Operations and blocks Blob access when its limits are
  exceeded, so a one-time 10,000-object upload is not compatible with Hobby.
- Decision: Adopt for the current Production architecture. Select a paid plan
  or a different store before bulk generation beyond the Hobby limits.

### Option B: Amazon S3

- Advantages: Mature object storage, broad lifecycle policies, and an
  established migration path for higher scale.
- Costs: Standard storage is broadly comparable to Vercel Blob at this scale;
  the primary difference is independent request, egress, IAM, and operational
  management rather than materially lower storage cost for 1 to 2 GB.
- Deferred because: The current single-owner application does not justify a
  separate AWS account boundary, credentials, bucket policy, and authenticated
  delivery implementation.

### Option C: Google Cloud Storage

- Advantages: Suitable when the application already operates on GCP and needs
  GCP-native IAM, lifecycle rules, or data locality.
- Costs: Standard storage and operation costs are usage-based and region
  dependent. Cross-cloud reads from Vercel add a delivery path to operate and
  monitor.
- Deferred because: There is no existing GCP runtime or IAM boundary for this
  application.

### Option D: Store binary payloads in Postgres or the Production filesystem

- Rejected: Postgres is the relational source of truth, not a binary media
  delivery service. Vercel Function filesystems are not durable Production
  storage.

## Consequences

- Production requires `BLOB_READ_WRITE_TOKEN` (or an equivalent Vercel Blob
  identity configuration).
- Audio and APKG download failures must distinguish object storage from TTS,
  database, and package-generation failures.
- Bulk initial generation must be planned against Blob operation limits and
  xAI TTS character-based charges.
- Repeated export already reuses ready audio when its text hash and synthesis
  configuration match. It still creates an APKG artifact per export request.
- A storage-provider migration requires data copy, metadata path migration,
  access-policy verification, and download regression tests.

## Security / Privacy

- Keep `BLOB_READ_WRITE_TOKEN`, cloud credentials, and signed URLs out of the
  repository, client bundle, logs, and Issues.
- Media and APKG paths include no user-provided raw text.
- Owner authentication remains the authorization boundary for export download.

## Operations

- Review Blob storage size, Advanced Operations, and download transfer before
  starting a bulk generation run.
- Configure spend/usage notifications on the selected paid plan.
- Do not use the Vercel Blob dashboard file browser as a bulk-management tool
  on Hobby because listing counts as an Advanced Operation.
- Delete expired APKG artifacts once a retention policy is implemented. Audio
  deletion requires a separate data-retention decision because it affects
  incremental export reuse.

## Revisit Conditions

- A bulk generation or normal monthly operation count exceeds the selected
  Vercel plan's limit.
- Export download traffic or storage retention becomes a material recurring
  cost.
- Multiple users, public distribution, regulatory data-location requirements,
  or an existing AWS/GCP operational boundary are introduced.
- APKG generation requires asynchronous jobs beyond Vercel Function limits.

## References

- `src/lib/binary-store.ts`
- `docs/specifications/anki-export.md`
- `docs/adr/0010-expression-capture-and-anki-export.md`
- `docs/adr/0013-expression-production-and-apkg-only.md`
- [Vercel Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing) (checked 2026-07-21)
- [Amazon S3 pricing](https://aws.amazon.com/s3/pricing/) (checked 2026-07-21)
- [Google Cloud Storage pricing](https://cloud.google.com/storage/pricing) (checked 2026-07-21)
