# Deploy handoff — one teammate can do this end to end

Goal: deploy the **whole app** (frontend + backend in one container) to **one**
AWS Lightsail container service. One service = one bill. Delete it after the
demo to stop charges.

This is already built and verified locally. You only need to: build the image,
push it to Lightsail, deploy, verify, and (later) delete.

---

## What you must have

1. **Docker Desktop** installed and running (whale icon steady / "Engine running").
2. **AWS CLI v2** configured for our account via SSO:
   ```powershell
   aws configure sso     # first time
   aws sso login         # each session
   aws sts get-caller-identity   # should print account 221027267933
   ```
3. **The rotated LLM gateway key** (ask the team lead — do NOT use the old one;
   it was leaked and must be rotated). You will paste it into YOUR terminal
   only, never into a file that gets committed, chat, or a screenshot.

---

## Cost guardrails (important — limited AWS credit)

- Use **one** service at **micro** power, **scale 1** (~$10/month, prorated).
- Do NOT create a second service or scale up.
- **Delete the service after the demo** (last command in this doc). Billing
  stops when the service is deleted.

---

## Steps (PowerShell, run from the repo root)

### 0. Set session variables (in YOUR terminal only)

```powershell
$env:AWS_REGION = "ap-southeast-1"
$env:LLM_GATEWAY_API_KEY = "<paste-the-ROTATED-key-here>"
```

### 1. Build the combined image (frontend + backend)

Build from the repo root with the backend Dockerfile. Target linux/amd64 so it
matches Lightsail.

```powershell
docker build --platform linux/amd64 -t multiminds-app -f backend/Dockerfile .
```

Optional local check (proves the container serves the app + API):

```powershell
docker run --rm -d --name mm-app -p 8000:8000 -e AI_PROVIDER=mock multiminds-app
Start-Sleep -Seconds 7
(Invoke-WebRequest http://localhost:8000/api/health -UseBasicParsing).Content   # {"status":"ok"}
docker rm -f mm-app
```

### 2. Create the Lightsail service (this starts billing)

```powershell
aws lightsail create-container-service --service-name multiminds-app --power micro --scale 1 --region $env:AWS_REGION
```

Wait until state is `READY`:

```powershell
aws lightsail get-container-services --service-name multiminds-app --region $env:AWS_REGION --query "containerServices[0].state" --output text
```

### 3. Push the image

```powershell
aws lightsail push-container-image --service-name multiminds-app --label app --image multiminds-app:latest --region $env:AWS_REGION
```

Copy the image ref it prints, e.g. `:multiminds-app.app.1`.

### 4. Render the deployment spec (injects image ref + secret; not committed)

```powershell
$env:IMAGE_REF = ":multiminds-app.app.1"   # use the value from step 3
(Get-Content docs\lightsail\containers.template.json) `
  -replace 'IMAGE_REF_PLACEHOLDER', $env:IMAGE_REF `
  -replace 'SET_AT_DEPLOY_TIME', $env:LLM_GATEWAY_API_KEY |
  Set-Content containers.json
```

`containers.json` is gitignored (it holds the key). Do not commit it.

### 5. Deploy

```powershell
aws lightsail create-container-service-deployment --service-name multiminds-app --containers file://containers.json --public-endpoint file://docs\lightsail\public-endpoint.json --region $env:AWS_REGION
```

Then delete the rendered secret file:

```powershell
Remove-Item containers.json
```

### 6. Verify

```powershell
# Wait until the deployment state is ACTIVE:
aws lightsail get-container-services --service-name multiminds-app --region $env:AWS_REGION --query "containerServices[0].currentDeployment.state" --output text

# Get the public URL:
$url = aws lightsail get-container-services --service-name multiminds-app --region $env:AWS_REGION --query "containerServices[0].url" --output text
$url
# Open $url in a browser (the app) and check $url + "api/health" returns {"status":"ok"}.
```

### 7. AFTER THE DEMO — delete to stop billing

```powershell
aws lightsail delete-container-service --service-name multiminds-app --region $env:AWS_REGION
```

---

## If something fails

- **Build fails on frontend step** — run `npm install` then `npm run build` in
  `frontend/` locally to see the real error.
- **Service stuck / deploy fails** — check logs:
  ```powershell
  aws lightsail get-container-log --service-name multiminds-app --container-name app --region $env:AWS_REGION
  ```
- **App loads but AI calls fail** — the `LLM_GATEWAY_API_KEY` is wrong/expired,
  or `AI_PROVIDER` isn't `hackathon`. Re-render `containers.json` (step 4) with a
  valid key and redeploy (step 5).
- **Health check failing** — confirm the container listens on 8000 and
  `/api/health` returns 200 (it does locally).

## Security rules (do not skip)

- Never commit `containers.json`, `.env`, or any real key.
- Never paste the AWS keys or the LLM key into chat, PRs, or screenshots.
- If a key is exposed, rotate it.

See `docs/DEPLOYMENT_LIGHTSAIL.md` for the longer reference version.
