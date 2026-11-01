# Hisaab.Guru promotional website

Static mobile-product showcase with current versus planned capability labels, illustrative phone screens, responsive navigation and optional motion.

The current-workflow description is inherited from product-status correction `9da5879`; this repository does not independently verify app/backend readiness. Store badges and QR dialog remain intentional placeholders. Numeric pricing remains unannounced and payments are not active.

## Local preview

```sh
node server.cjs
# Open http://127.0.0.1:8767
```

No build or lint scripts are configured. Styling/fonts and optional GSAP motion load from external CDNs. The page remains readable and interactive without GSAP or browser storage.

The information pages cover website privacy, prerelease terms, pricing status and contact. They use local CSS and system fonts without additional third-party requests. The operator and support address are owner-approved; inbox delivery has not been tested. The privacy notice is limited to the promotional website, not the mobile app. Hosting/log retention and app-policy questions are recorded in the draft PR description, not in a served draft file. No deployment is part of this change.
