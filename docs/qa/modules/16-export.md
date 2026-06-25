# 16 · Export & Download — Deep Test Cases

## Surfaces
- Dataset → CSV, XLSX, JSON, Parquet
- Visual → PNG, SVG, CSV
- Analysis → PDF, PPTX
- Dashboard → PDF, PNG (whole), XLSX (multi-sheet)

## Dataset
- **EXP-CSV-H-01** · 100-row dataset → 200, valid CSV. P0
- **EXP-CSV-H-02** · 1M-row dataset → streamed, no OOM. P1 ⚡
- **EXP-CSV-E-01** · Cells containing commas / quotes escaped. P1
- **EXP-CSV-E-02** · Unicode preserved. P1
- **EXP-XLSX-H-01** · XLSX downloads with correct types per column. P1
- **EXP-JSON-H-01** · JSON streaming for large datasets. P1
- **EXP-PARQ-H-01** · Parquet round-trips with right schema. P2

## Visual
- **EXP-PNG-H-01** · Visual PNG matches on-screen render at 2× pixel ratio. P0
- **EXP-PNG-N-01** · Visual with error → placeholder image. P1
- **EXP-SVG-H-01** · SVG rendered for printable charts. P1

## Analysis / Dashboard
- **EXP-PDF-H-01** · Dashboard PDF non-zero bytes. P0
- **EXP-PDF-H-02** · PDF watermark applied. P1
- **EXP-PDF-H-03** · PDF password-protected. P1
- **EXP-PPTX-H-01** · PPTX one slide per visual. P1
- **EXP-MD-H-01** · Markdown export of analysis. P2

## Async + signed URL
- **EXP-ASYNC-H-01** · Large export → emailed download link. P1
- **EXP-ASYNC-N-01** · Expired signed URL → 410. P1
- **EXP-IDEMP-H-01** · Same idempotency key returns same job. P1

## Rate limit + audit
- **EXP-RL-N-01** · 11th export in 10 min → 429. P1
- **EXP-AUD-H-01** · Audit row per export with rows + bytes. P0

## Security
- **EXP-S-01** · Path traversal in filename sanitised. P0 🟣
- **EXP-S-02** · Cross-org export attempt → 404. P0 🟣

## Performance
- **EXP-P-01** · PDF generation < 30s for 20-visual dashboard. P1 ⚡

## Regression buckets
- PDF pipeline → EXP-PDF-*
- Streaming CSV → EXP-CSV-H-02
