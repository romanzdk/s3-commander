# S3 Dual-Pane Browser

Total Commander-style two-pane S3 file browser. Both panes display S3 folders; move/copy operations use server-side S3 APIs (no download/upload).

## Requirements

- Python 3.10+
- AWS credentials (env vars `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` or IAM role)

## Run

```bash
poetry install
poetry run uvicorn s3_browser.main:app --reload
```

Open http://127.0.0.1:8000

## Usage

1. Enter path in each pane: `s3://bucket/prefix/` and press Go
2. Click a folder or `..` to navigate
3. Select items with checkboxes
4. **Copy (F5)**: copy selected items to the other pane
5. **Move (F6)**: move selected items to the other pane (server-side)
6. **Delete (F8)**: delete selected items
