# Art bridge

A ~60-line Cloudflare Worker that gives the browser a CORS-clean way to
generate event artwork with Workers AI (`flux-1-schnell`). The model
call happens server-side; the browser talks only to this worker, so no
Cloudflare API token is needed in the app — just the worker URL and a
shared secret.

Current deployment: https://chrono-art-bridge.amanuelgetachew554.workers.dev
(the secret lives in the worker's bindings on the account, never in git).

## Deploy

1. Authenticate once (browser OAuth):
   ```
   npx wrangler login
   ```
   or create an API token with **Workers Scripts: Edit** and export
   `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`.

2. Deploy and set the shared secret (kept out of git):
   ```
   cd bridge
   curl -fsSL ... # not needed; wrangler reads wrangler.toml below
   npx wrangler deploy
   echo "<random-hex>" | npx wrangler secret put ART_SECRET
   ```

3. In the app's CONFIG screen, paste the printed
   `https://chrono-art-bridge.<subdomain>.workers.dev` URL and the same
   secret as the shared secret.

## Contract

- `POST /` with `{prompt: string, steps?: number}` and the secret as the
  `x-art-secret` header.
- `200 {success: true, image: "<base64 jpeg>"}` or
  `{error: "<reason>"}` with a 4xx/5xx status.
- OPTIONS preflight is answered so browsers can call it from any origin.
