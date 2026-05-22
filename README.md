# Cello Board Demo

Astro prototype for the board-facing Cello acquisition story: Cello remains network-first while adding subtle digital resilience capability.

## Routes

- `/` - Cello-first home page
- `/solutions/smartwan` - representative network solution
- `/digital-resilience` - subtle resilience capability page
- `/contact` - local contact path
- `/welcome` - hidden transition page for the future `gkc.co` redirect

## Commands

Run from this directory:

```sh
npm run dev
npm run build
npm run preview
npm start
```

## Publishing Note

`npm run dev` does not use a password. `npm start` serves the built `dist/` site with the preview password from `SITE_PASSWORD`, defaulting to `GKCelllo`.

The Google Cloud Run deployment uses the same password-protected server.
