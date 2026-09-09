# GitHub Pages fallback

GitHub Pages is the static fallback dashboard. It does not run the monitor or notifications; it only reads the public `monitor-state/status.json` projection and converts UTC event times in the browser.

## Repository settings

Open **Settings → Pages** and set:

```text
Build and deployment
Source: GitHub Actions
```

Do not select `Deploy from a branch`. No branch/folder publishing source is needed because `.github/workflows/pages.yml` uploads the dedicated `pages/` artifact.

A custom domain is optional. HTTPS should remain enabled.

## Deploy

After Pages is enabled, either:

1. merge a change touching `pages/**` or `.github/workflows/pages.yml` into `main`; or
2. open **Actions → Deploy GitHub Pages → Run workflow**.

The workflow uses GitHub's official Pages actions and uploads only the `pages/` directory.

For this repository, the default project-site URL is:

```text
https://allenxiao95.github.io/codex-reset-signal/
```

## Runtime data

The static page does not embed a build-time status snapshot. Every minute it reads:

```text
https://raw.githubusercontent.com/<owner>/<repo>/monitor-state/status.json
```

On a normal `*.github.io/<repo>/` project site, `<owner>` and `<repo>` are inferred from the Pages hostname and path. This makes ordinary forks work without editing the static page as long as they use the standard GitHub Pages project URL.

Run **Monitor X for reset** at least once after enabling the new monitor-state architecture. Until then, the dashboard correctly shows `Waiting` and no latest reset.

## Timezone behavior

The page defaults to:

```js
Intl.DateTimeFormat().resolvedOptions().timeZone
```

The user can manually select another IANA timezone. The choice is stored only in browser `localStorage`; canonical event timestamps remain UTC in `status.json`.

## Health behavior

The browser derives status from `lastRunStatus` and `lastCheckedAt`:

```text
<= 15 minutes   Healthy
15–30 minutes   Delayed
> 30 minutes    Stale
failed-*         Degraded
no checkpoint    Waiting
```

## Cloudflare vs Pages

Cloudflare Workers remains the primary dashboard deployment because it can expose `/api/status` and support future server-side behavior. GitHub Pages intentionally stays static and has no KV, D1, cron, API route, or duplicate monitor implementation.

If a fork uses a custom Pages domain instead of the standard `*.github.io/<repo>/` URL, verify that the static page resolves the intended repository before relying on it. The standard project-site URL is the zero-configuration path.
