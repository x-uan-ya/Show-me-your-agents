# Deploying the application to AWS Lightsail Container Service

This guide deploys the built frontend and FastAPI backend in one container.

> Security first: `AUTH_SECRET`, `SMTP_PASSWORD`, and `LLM_GATEWAY_API_KEY` are
> secrets. They are **never** stored in the repo, image, or committed deployment
> JSON. Supply them at deploy time. If one was pasted into chat, a PR, logs, or a
> screenshot, **rotate it** before deploying.

## Prerequisites

- Docker installed and running.
- `jq` installed for safely rendering JSON without shell string substitution.
- AWS CLI v2 installed and configured (`aws configure`) with permissions for
  Lightsail container services.
- The Lightsail plugin is built into AWS CLI v2 (no extra install needed).

Set a region once for the session (adjust as needed):

```bash
export AWS_REGION=ap-southeast-1
```

## 1. Build the image locally

```bash
docker build -t multiminds-app -f backend/Dockerfile .
```

Quick local smoke test (optional; key passed only for this shell):

```bash
docker run --rm -p 8000:8000 \
  -e AI_PROVIDER=mock \
  multiminds-app
# then: curl http://localhost:8000/api/health  ->  {"status":"ok"}
```

## 2. Create the container service (one time)

```bash
aws lightsail create-container-service \
  --service-name multiminds-app \
  --power small \
  --scale 1 \
  --region "$AWS_REGION"
```

Wait until it is `READY`:

```bash
aws lightsail get-container-services \
  --service-name multiminds-app \
  --region "$AWS_REGION" \
  --query "containerServices[0].state"
```

## 3. Push the image to Lightsail

```bash
aws lightsail push-container-image \
  --service-name multiminds-app \
  --label app \
  --image multiminds-app:latest \
  --region "$AWS_REGION"
```

This prints a registered image reference such as:

```
:multiminds-app.app.1
```

Copy that exact string; you need it in the next step.

## 4. Build the deployment spec with runtime settings

`containers.template.json` (committed, placeholders only) is turned into a local
`containers.json` (gitignored) that carries the runtime values. Production
startup rejects every unresolved placeholder. Do not commit `containers.json`.

`docs/lightsail/public-endpoint.json` (committed, no secret):

```json
{
  "containerName": "app",
  "containerPort": 8000,
  "healthCheck": {
    "path": "/api/health",
    "successCodes": "200",
    "intervalSeconds": 10,
    "timeoutSeconds": 5,
    "healthyThreshold": 2,
    "unhealthyThreshold": 3
  }
}
```

Set every required value in the current shell. `AUTH_SECRET` must contain at
least 32 random characters. `CORS_ORIGINS` must contain the exact HTTPS frontend
origin, never `*`. SMTP credentials must belong to the verified sending account.

```bash
# Do not commit, paste into chat, or include these values in screenshots.
export IMAGE_REF=':multiminds-app.app.1'   # from step 3
export LLM_GATEWAY_API_KEY='<paste-your-ROTATED-key-here>'
export AUTH_SECRET="$(openssl rand -base64 48)"
export CORS_ORIGINS='CORS_ORIGINS_PLACEHOLDER' # replace with exact HTTPS origin
export SMTP_HOST='SMTP_HOST_PLACEHOLDER'
export SMTP_PORT='587'
export SMTP_USERNAME='SMTP_USERNAME_PLACEHOLDER'
export SMTP_PASSWORD='SMTP_PASSWORD_PLACEHOLDER'
export SMTP_FROM_EMAIL='SMTP_FROM_EMAIL_PLACEHOLDER'

# Render JSON structurally so special characters in secrets are preserved.
jq \
  --arg image "$IMAGE_REF" \
  --arg llm_key "$LLM_GATEWAY_API_KEY" \
  --arg auth_secret "$AUTH_SECRET" \
  --arg cors_origins "$CORS_ORIGINS" \
  --arg smtp_host "$SMTP_HOST" \
  --arg smtp_port "$SMTP_PORT" \
  --arg smtp_username "$SMTP_USERNAME" \
  --arg smtp_password "$SMTP_PASSWORD" \
  --arg smtp_from_email "$SMTP_FROM_EMAIL" \
  '.app.image = $image
   | .app.environment.LLM_GATEWAY_API_KEY = $llm_key
   | .app.environment.AUTH_SECRET = $auth_secret
   | .app.environment.CORS_ORIGINS = $cors_origins
   | .app.environment.SMTP_HOST = $smtp_host
   | .app.environment.SMTP_PORT = $smtp_port
   | .app.environment.SMTP_USERNAME = $smtp_username
   | .app.environment.SMTP_PASSWORD = $smtp_password
   | .app.environment.SMTP_FROM_EMAIL = $smtp_from_email' \
  docs/lightsail/containers.template.json > containers.json
```

PowerShell equivalent (Windows):

```powershell
$env:IMAGE_REF = ':multiminds-app.app.1'
$env:LLM_GATEWAY_API_KEY = '<paste-your-ROTATED-key-here>'
$env:AUTH_SECRET = 'AUTH_SECRET_PLACEHOLDER'
$env:CORS_ORIGINS = 'CORS_ORIGINS_PLACEHOLDER' # replace with exact HTTPS origin
$env:SMTP_HOST = 'SMTP_HOST_PLACEHOLDER'
$env:SMTP_PORT = '587'
$env:SMTP_USERNAME = 'SMTP_USERNAME_PLACEHOLDER'
$env:SMTP_PASSWORD = 'SMTP_PASSWORD_PLACEHOLDER'
$env:SMTP_FROM_EMAIL = 'SMTP_FROM_EMAIL_PLACEHOLDER'

$spec = Get-Content docs\lightsail\containers.template.json -Raw | ConvertFrom-Json
$spec.app.image = $env:IMAGE_REF
$containerEnv = $spec.app.environment
$containerEnv.LLM_GATEWAY_API_KEY = $env:LLM_GATEWAY_API_KEY
$containerEnv.AUTH_SECRET = $env:AUTH_SECRET
$containerEnv.CORS_ORIGINS = $env:CORS_ORIGINS
$containerEnv.SMTP_HOST = $env:SMTP_HOST
$containerEnv.SMTP_PORT = $env:SMTP_PORT
$containerEnv.SMTP_USERNAME = $env:SMTP_USERNAME
$containerEnv.SMTP_PASSWORD = $env:SMTP_PASSWORD
$containerEnv.SMTP_FROM_EMAIL = $env:SMTP_FROM_EMAIL
$spec | ConvertTo-Json -Depth 10 | Set-Content -Encoding utf8 containers.json
```

## 5. Deploy

```bash
aws lightsail create-container-service-deployment \
  --service-name multiminds-app \
  --containers file://containers.json \
  --public-endpoint file://docs/lightsail/public-endpoint.json \
  --region "$AWS_REGION"
```

Then delete the rendered secret file so it does not linger:

```bash
rm -f containers.json          # PowerShell: Remove-Item containers.json
```

## 6. Verify

```bash
# Get the public URL:
aws lightsail get-container-services \
  --service-name multiminds-app \
  --region "$AWS_REGION" \
  --query "containerServices[0].url" --output text

# Health check (replace with the URL above):
curl https://<service-url>/api/health   # -> {"status":"ok"}
```

## Notes on CORS and ports

- Public HTTP is exposed on container port `8000` mapped through the Lightsail
  managed endpoint.
- Production requires an explicit `CORS_ORIGINS` allowlist. Because credentialed
  requests are enabled, startup rejects an empty value or any value containing
  `*`.

## Secret handling summary

- `AUTH_SECRET`, `SMTP_PASSWORD`, and `LLM_GATEWAY_API_KEY` are passed as runtime
  environment values only and are never logged by the application.
- The committed templates use placeholders; the rendered `containers.json`
  holding the real value is gitignored and deleted after deploy.
- Rotate the key if it has been exposed anywhere (chat, PR, screenshot, logs).

## Production startup requirements

The container exits before database initialisation if any requirement is unmet:

- `AUTH_SECRET`: explicitly supplied, at least 32 random characters, and not a
  development value or placeholder.
- `AUTH_COOKIE_SECURE=true`.
- `CORS_ORIGINS`: explicit comma-separated origin allowlist without `*` (use the
  public HTTPS application origin for Lightsail).
- `EMAIL_DELIVERY=smtp`.
- `SMTP_HOST`, `SMTP_USERNAME`, `SMTP_PASSWORD`, and a non-local
  `SMTP_FROM_EMAIL`.
- At least one of `SMTP_USE_TLS=true` or `SMTP_USE_SSL=true`.
- `RATE_LIMIT_ENABLED=true`.

## Rate limits and proxy identity

The committed deployment template uses these process-local sliding-window
limits:

- Login: 10 attempts/IP/minute; 5 failed attempts/normalized email/10 minutes.
- Registration: 5 attempts/IP/hour and 3 attempts/email/hour.
- OTP send/request: 5/email/hour and 10/IP/hour, in addition to the existing
  60-second per-email resend cooldown.
- OTP verification: 10/email/10 minutes and 30/IP/10 minutes.
- Provider-backed AI actions: 10/user/hour and 30/Workspace/hour.

Keep the service at `scale 1`. Counters live in the backend process and reset on
restart; deploying multiple nodes requires a shared atomic limiter such as
Redis before increasing scale.

The Docker command disables Uvicorn's automatic proxy-header rewriting. By
default the limiter uses the direct socket peer and ignores arbitrary
`X-Forwarded-For` values. `RATE_LIMIT_TRUSTED_PROXY_CIDRS` may contain a
comma-separated proxy allowlist only after those source networks and their
header-appending behaviour have been verified. Never use `0.0.0.0/0` or `::/0`.
