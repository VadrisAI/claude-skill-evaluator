---
name: pdf-report-pipeline
description: Extracts data from an input PDF, validates it, renders a formatted report, and retries extraction on failure.
allowed-tools: Read, Bash
---

# PDF Report Pipeline

Turn a raw PDF export into a validated, formatted summary report.

## Inputs

- A source PDF file path.
- An optional `strict` flag that, when set, rejects rows with missing fields instead of dropping them.

## Outputs

- `report.md`: the rendered summary report.
- `report.json`: the same data as structured JSON for downstream tooling.

## Workflow

1. Run `scripts/extract.py` on the source PDF to pull out raw table rows.
2. If `scripts/extract.py` fails or returns zero rows, retry up to 3 times before giving up.
3. Validate the extracted rows against `references/schema.json`. If a row is missing a required field, drop it, unless the `strict` flag is set, in which case abort with an error.
4. Depending on the row count from step 1, choose a report template: use `references/short-template.md` when there are fewer than 10 rows, otherwise use `references/long-template.md`.
5. Render the report with `scripts/render.py`, using the template chosen in step 4 and the validated rows from step 3.
6. Loop back to step 3 if `scripts/render.py` reports a formatting error, until the report renders cleanly or 3 attempts are exhausted.
7. Write `report.md` and `report.json` to the output directory.

## Failure Handling

If extraction repeatedly fails after all retries, stop the pipeline and report which step failed and why, instead of producing a partial report.
