# Hisaab.Guru promotional website

Static mobile-product showcase with current versus planned capability labels, illustrative phone screens, responsive navigation and optional motion.

The current-workflow description is inherited from product-status correction `9da5879`; this repository does not independently verify app/backend readiness. Store badges and QR dialog remain intentional placeholders. Pricing and public support/policies are not yet published.

## Local preview

```sh
node server.cjs
# Open http://127.0.0.1:8767
```

No build or lint scripts are configured. Styling/fonts and optional GSAP motion load from external CDNs. The page remains readable and interactive without GSAP or browser storage.

Owner-only editorial questions are in `.github/LAUNCH-CONTENT-DRAFT.md`; that file is not a legal policy and must be excluded from the published site. Deploy only `index.html` and `assets/`. No deployment is part of this change.
