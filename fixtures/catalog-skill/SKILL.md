---
name: image-toolkit
description: Recipes for common image manipulation tasks — resize, convert, strip metadata, generate thumbnails.
---

# Image Toolkit

A catalogue of independent recipes. Pick the one matching the task at hand;
they are alternatives, not stages of a pipeline.

## Overview

Each section below stands on its own. If the user asks for a thumbnail, use
the thumbnail recipe; nothing else needs to run first.

## Resize an image

Run `scripts/resize.py` with the target width. When the source is smaller
than the target, upscaling is skipped rather than producing a blurry result.

## Convert between formats

Run `scripts/convert.py`. Supported inputs are `.png`, `.jpg` and `.webp`.
The format table lives in `references/formats.json` if you need the details.

## Strip metadata

Run `scripts/strip_exif.py`. If the file carries no EXIF block, the script
exits without writing, so it is safe to call unconditionally.

## Generate a thumbnail

Run `scripts/thumbnail.py`. See `references/sizes.md` for the standard
thumbnail dimensions used across the project.

## Notes on failure

If any script reports an unreadable file, report the error to the user
rather than attempting a repair — this toolkit never rewrites source images.
