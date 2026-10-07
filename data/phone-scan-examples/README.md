# Phone scan examples

Place original phone PNGs in this directory. Name each image after the expected English card name, followed by a shot number, for example `Chishiro, the Shattered Blade__001.png`. Use multiple shots for different lighting, angles, sleeves, glare and backgrounds. Keep the original image rather than cropping or correcting it first.

Images and local annotations are ignored by Git. This README keeps the directory available in fresh checkouts. Do not put API keys or account details in image names or annotations.

An optional local `manifest.json` can record ground truth separately from the filename:

```json
{
  "images": [
    {
      "file": "Chishiro, the Shattered Blade__001.png",
      "expectedCardName": "Chishiro, the Shattered Blade",
      "expectedPrintingId": null,
      "conditions": ["sleeved", "glare", "angled"]
    }
  ]
}
```

Use `expectedPrintingId` only when the exact printing is known. For card names containing a slash, use a safe filename and put the full name in `expectedCardName`. The example does not refer to an included image. Recognition and accuracy evaluation are deferred; uploading a file here does not add it to Inventory or submit it to a provider. [Mobile and scan](../../docs/architecture/mobile-and-scan.md) owns the future integration.
