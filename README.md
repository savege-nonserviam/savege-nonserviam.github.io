# YouWatch

YouWatch is a synchronized YouTube watch-room app with owner/trusted playback controls, server-authoritative room time, shareable room links, queue and history management, titlebar YouTube search/URL loading, room moderation, and a minimal dark chat overlay.

## Run Locally

```bash
npm install
npm run dev
```

The web app runs through Vite, and the Socket.IO/Express server runs beside it. Open the Vite URL, share the room hash URL, and the first connected viewer becomes the owner.

## YouTube Search

URL playback works without extra setup. Production YouTube search uses the official YouTube Data API from the server, so add a server-side key before using search:

```bash
YOUTUBE_API_KEY=your_key_here
```

You can place that value in `.env` for local development.

## Production

```bash
npm run build
npm start
```

`npm start` serves the built client and the real-time API from the same Node process.

## Checks

```bash
npm run lint
npm test
npm run build
```

The test suite uses Node's built-in test runner for server validation and serialization behavior.

## Empty Rooms

Active sockets, chat messages, ownership timers, and cleanup timers are stored in memory. When the last connected viewer leaves, the in-memory room is deleted immediately and chat is discarded.

By default, the server also persists non-chat room state to `data/rooms.json`: current video, playback position, room settings, queue, and recently played history. This lets a later visit to the same room hash restore the watch plan without storing chat. Disable this behavior with:

```bash
ROOM_PERSISTENCE=0
```

Use `ROOM_PERSISTENCE_FILE=/absolute/path/rooms.json` if the host needs the persistence file outside the project folder.

## Put This In GitHub

Commit the project source and config files:

```text
.env.example
.gitignore
eslint.config.js
index.html
package.json
package-lock.json
README.md
railway.json
tsconfig.app.json
tsconfig.json
tsconfig.node.json
vite.config.ts
public/
server/
src/
```

Do not commit generated or private files:

```text
node_modules/
dist/
data/
.env
*.log
```

The existing `.gitignore` already excludes those generated/private files.

## Deploy On Railway

Use one Railway service for the whole app. The Node server serves both the API/socket server and the built React client from `dist`.

1. Push this folder to a GitHub repository.
2. In Railway, choose **New Project** > **Deploy from GitHub repo**.
3. Select the YouWatch repository.
4. Keep the service root as the repository root, the same folder that contains `package.json`.
5. Railway can read `railway.json`, but the important settings are:

```text
Build command: npm run build
Start command: npm start
Healthcheck path: /api/health
```

6. Add Railway variables:

```text
YOUTUBE_API_KEY=your_youtube_data_api_key
ROOM_PERSISTENCE=1
```

Railway automatically provides `PORT`, so do not set `PORT` in Railway unless you have a special reason. Leave `CORS_ORIGIN` empty when Railway serves the website and server from the same domain. Set `CORS_ORIGIN` only if you host the frontend somewhere else, for example:

```text
CORS_ORIGIN=https://your-frontend-domain.com
```

7. After deploy, open Railway's generated public domain. Check `https://your-railway-domain/api/health`; it should return JSON with `ok: true`.

YouTube URL loading can still fall back to oEmbed without a key, but YouTube search and full video verification need `YOUTUBE_API_KEY` on the server.

## Deploy The Frontend On GitHub Pages

Railway is the easiest place to host the whole app. If you also want `https://savege-nonserviam.github.io/` to show the app, GitHub Pages must deploy the built `dist` folder, not the raw source files. Serving the repository root directly makes the browser request `/src/main.tsx`, which GitHub Pages serves as `application/octet-stream` instead of JavaScript.

This repo includes a GitHub Actions workflow at `.github/workflows/deploy-pages.yml` that builds the Vite app and deploys `dist` to GitHub Pages.

1. In GitHub, open the repository settings.
2. Go to **Pages**.
3. Set **Build and deployment** > **Source** to **GitHub Actions**.
4. Go to **Secrets and variables** > **Actions** > **Variables**.
5. Add this repository variable, using your real Railway public URL:

```text
VITE_SERVER_URL=https://savege-nonserviamgithubio-production.up.railway.app
```

6. The server allows your GitHub Pages origin by default. You can still add the same value in Railway if you want it visible in the host config:

```text
CORS_ORIGIN=https://savege-nonserviam.github.io
```

7. Keep your existing Railway server variable:

```text
YOUTUBE_API_KEY=your_youtube_data_api_key
```

8. Push the workflow and latest source files to GitHub. The **Deploy GitHub Pages** action will run automatically.
9. When the action finishes, open `https://savege-nonserviam.github.io/`.

If GitHub Pages still shows `main.tsx` MIME type errors, the Pages source is still serving the repository root instead of the GitHub Actions artifact. Recheck that Pages source is set to **GitHub Actions**.
