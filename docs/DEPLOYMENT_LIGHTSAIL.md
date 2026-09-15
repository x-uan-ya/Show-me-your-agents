# Deploying the backend to AWS Lightsail Container Service

This guide deploys the FastAPI backend container to AWS Lightsail.

> Security first: the `LLM_GATEWAY_API_KEY` is a secret. It is **never** stored
> in the repo, the image, or committed deployment JSON. It is supplied at deploy
> time. If the key was ever pasted into chat, a PR, or a screenshot, **rotate it**
> before deploying.

## Prerequisites

- Docker installed and running.
- AWS CLI v2 installed and configured (`aws configure`) with permissions for
  Lightsail container services.
- The Lightsail plugin is built into AWS CLI v2 (no extra install needed).

Set a region once for the session (adjust as needed):

```bash
export AWS_REGION=ap-southeast-1
```

## 1. Build the image locally

```bash
docker build -t multiminds-backend ./backend
```

Quick local smoke test (optional; key passed only for this shell):

```bash
docker run --rm -p 8000:8000 \
  -e AI_PROVIDER=mock \
  multiminds-backend
# then: curl http://localhost:8000/api/health  ->  {"status":"ok"}
```

## 2. Create the container service (one time)

```bash
aws lightsail create-container-service \
  --service-name multiminds-backend \
  --power small \
  --scale 1 \
  --region "$AWS_REGION"
```

Wait until it is `READY`:

```bash
aws lightsail get-container-services \
  --service-name multiminds-backend \
  --region "$AWS_REGION" \
  --query "containerServices[0].state"
```

## 3. Push the image to Lightsail

```bash
aws lightsail push-container-image \
  --service-name multiminds-backend \
  --label backend \
  --image multiminds-backend:latest \
  --region "$AWS_REGION"
```

This prints a registered image reference such as:

```
:multiminds-backend.backend.1
```

Copy that exact string; you need it in the next step.

## 4. Build the deployment spec WITH the secret at deploy time

`containers.template.json` (committed, no secret) is turned into a local
`containers.json` (gitignored) that carries the runtime values. Do not commit
`containers.json`.

`docs/lightsail/containers.template.json`:

```json
{
  "backend": {
    "image": "IMAGE_REF_PLACEHOLDER",
    "environment": {
      "AI_PROVIDER": "hackathon",
      "ENVIRONMENT": "production",
      "LLM_GATEWAY_URL": "https://api.softwaresystems.app",
      "LLM_MODEL": "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
      "LLM_GATEWAY_API_KEY": "SET_AT_DEPLOY_TIME",
      "CORS_ORIGINS": "*"
    },
    "ports": { "8000": "HTTP" }
  }
}
```

`docs/lightsail/public-endpoint.json` (committed, no secret):

```json
{
  "containerName": "backend",
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

Generate the real `containers.json` locally, injecting the image ref and the
secret from your shell environment (never hard-coded in a file):

```bash
# Provide these two values in your shell (do NOT commit them):
export IMAGE_REF=':multiminds-backend.backend.1'   # from step 3
export LLM_GATEWAY_API_KEY='<paste-your-ROTATED-key-here>'

# Render the committed template into a local, gitignored containers.json:
sed \
  -e "s#IMAGE_REF_PLACEHOLDER#${IMAGE_REF}#" \
  -e "s#SET_AT_DEPLOY_TIME#${LLM_GATEWAY_API_KEY}#" \
  docs/lightsail/containers.template.json > containers.json
```

PowerShell equivalent (Windows):

```powershell
$env:IMAGE_REF = ':multiminds-backend.backend.1'
$env:LLM_GATEWAY_API_KEY = '<paste-your-ROTATED-key-here>'
(Get-Content docs\lightsail\containers.template.json) `
  -replace 'IMAGE_REF_PLACEHOLDER', $env:IMAGE_REF `
  -replace 'SET_AT_DEPLOY_TIME', $env:LLM_GATEWAY_API_KEY |
  Set-Content containers.json
```

## 5. Deploy

```bash
aws lightsail create-container-service-deployment \
  --service-name multiminds-backend \
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
  --service-name multiminds-backend \
  --region "$AWS_REGION" \
  --query "containerServices[0].url" --output text

# Health check (replace with the URL above):
curl https://<service-url>/api/health   # -> {"status":"ok"}
```

## Notes on CORS and ports

- Public HTTP is exposed on container port `8000` mapped through the Lightsail
  managed endpoint.
- CORS is set to allow all origins via the `CORS_ORIGINS=*` environment variable,
  read by the app config. For a real deployment, prefer listing the exact
  frontend origin(s) instead of `*`, especially since the app enables
  `allow_credentials`. `*` is convenient for a hackathon demo but is broader than
  a production posture should be.

## Secret handling summary

- `LLM_GATEWAY_API_KEY` is passed as a runtime environment variable only.
- The committed templates use placeholders; the rendered `containers.json`
  holding the real value is gitignored and deleted after deploy.
- Rotate the key if it has been exposed anywhere (chat, PR, screenshot, logs).
