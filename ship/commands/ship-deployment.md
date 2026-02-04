# Phases 7-10: Deploy & Validate - Reference

This file contains platform-specific deployment and validation for `/ship`.

**Parent document**: `ship.md`

**Note**: Skip all phases if `WORKFLOW="single-branch"`.

## Phase 7: Deploy to Development

### Railway

```bash
if [ "$DEPLOYMENT" = "railway" ]; then
  echo "Waiting for Railway development deployment..."

  SERVICE_NAME=$(railway service list --json | jq -r '.[0].name')
  DEPLOY_ID=$(railway deployment list --service $SERVICE_NAME --json | jq -r '.[0].id')

  while true; do
    STATUS=$(railway deployment get $DEPLOY_ID --json | jq -r '.status')

    if [ "$STATUS" = "SUCCESS" ]; then
      DEV_URL=$(railway domain list --service $SERVICE_NAME --json | jq -r '.[0].domain')
      echo "[OK] Deployed to development: https://$DEV_URL"
      break
    elif [ "$STATUS" = "FAILED" ]; then
      echo "[ERROR] Development deployment failed"
      railway logs --deployment $DEPLOY_ID
      exit 1
    fi

    sleep 10
  done
fi
```

### Vercel

```bash
if [ "$DEPLOYMENT" = "vercel" ]; then
  echo "Waiting for Vercel development deployment..."

  DEPLOY_URL=$(vercel ls --json | jq -r '.[0].url')

  while true; do
    STATUS=$(vercel inspect $DEPLOY_URL --json | jq -r '.readyState')

    if [ "$STATUS" = "READY" ]; then
      echo "[OK] Deployed to development: https://$DEPLOY_URL"
      DEV_URL="https://$DEPLOY_URL"
      break
    elif [ "$STATUS" = "ERROR" ]; then
      echo "[ERROR] Development deployment failed"
      vercel logs $DEPLOY_URL
      exit 1
    fi

    sleep 10
  done
fi
```

### Netlify

```bash
if [ "$DEPLOYMENT" = "netlify" ]; then
  echo "Waiting for Netlify development deployment..."

  SITE_ID=$(netlify status --json | jq -r '.site_id')
  DEPLOY_ID=$(netlify api listSiteDeploys --data "{ \"site_id\": \"$SITE_ID\" }" | jq -r '.[0].id')

  while true; do
    STATUS=$(netlify api getDeploy --data "{ \"deploy_id\": \"$DEPLOY_ID\" }" | jq -r '.state')

    if [ "$STATUS" = "ready" ]; then
      DEV_URL=$(netlify api getDeploy --data "{ \"deploy_id\": \"$DEPLOY_ID\" }" | jq -r '.deploy_ssl_url')
      echo "[OK] Deployed to development: $DEV_URL"
      break
    elif [ "$STATUS" = "error" ]; then
      echo "[ERROR] Development deployment failed"
      exit 1
    fi

    sleep 10
  done
fi
```

### Generic / Unknown

```bash
if [ -z "$DEPLOYMENT" ] || [ "$DEPLOYMENT" = "null" ]; then
  echo "No deployment platform detected"
  echo "Assuming merge to $MAIN_BRANCH means deployment"
  DEV_URL="N/A"
fi
```

## Phase 8: Validate Development

### Health Check

```bash
echo "Running smoke tests on development..."

# Wait for deployment to stabilize
sleep 30

# Basic health check
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" $DEV_URL/health || echo "000")

if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "301" ] || [ "$HTTP_STATUS" = "302" ]; then
  echo "[OK] Health check passed: $HTTP_STATUS"
else
  echo "[ERROR] Health check failed: $HTTP_STATUS"
  echo "Investigate deployment issues before proceeding to production"
  exit 1
fi
```

### Error Log Monitoring

```bash
echo "Checking logs for errors..."

if [ "$DEPLOYMENT" = "railway" ]; then
  ERROR_COUNT=$(railway logs --tail 100 | grep -iE "(error|exception|fatal)" | wc -l)
elif [ "$DEPLOYMENT" = "vercel" ]; then
  ERROR_COUNT=$(vercel logs $DEV_URL --since 5m | grep -iE "(error|exception|fatal)" | wc -l)
elif [ "$DEPLOYMENT" = "netlify" ]; then
  ERROR_COUNT=$(netlify logs --since 5m | grep -iE "(error|exception|fatal)" | wc -l)
else
  ERROR_COUNT=0
fi

if [ "$ERROR_COUNT" -gt 10 ]; then
  echo "[ERROR] High error rate detected: $ERROR_COUNT errors in last 5 minutes"
  echo "Review logs before proceeding to production"
  exit 1
else
  echo "[OK] Error rate acceptable: $ERROR_COUNT errors"
fi
```

### Project Smoke Tests

```bash
if jq -e '.scripts["smoke-test"]' package.json > /dev/null 2>&1; then
  echo "Running project smoke tests..."

  export SMOKE_TEST_URL=$DEV_URL
  $PACKAGE_MGR run smoke-test

  if [ $? -eq 0 ]; then
    echo "[OK] Smoke tests passed"
  else
    echo "[ERROR] Smoke tests failed"
    exit 1
  fi
fi
```

### Validation Summary

```markdown
## Development Validation [OK]

**URL**: ${DEV_URL}
**Health Check**: [OK] ${HTTP_STATUS}
**Error Rate**: [OK] ${ERROR_COUNT} errors
**Smoke Tests**: [OK] Passed

Proceeding to production...
```

## Phase 9: Deploy to Production

### Merge to Production Branch

```bash
echo "Merging $MAIN_BRANCH → $PROD_BRANCH..."

git checkout $PROD_BRANCH
git pull origin $PROD_BRANCH

git merge $MAIN_BRANCH --no-edit

if [ $? -ne 0 ]; then
  echo "[ERROR] Merge to production failed (conflicts)"
  git merge --abort
  exit 1
fi

git push origin $PROD_BRANCH

if [ $? -eq 0 ]; then
  PROD_SHA=$(git rev-parse HEAD)
  echo "[OK] Production branch at: $PROD_SHA"
else
  echo "[ERROR] Push to production failed"
  exit 1
fi
```

### Wait for Production Deployment

Same platform-specific logic as Phase 7, but targeting production environment.

```bash
echo "Waiting for production deployment..."

# Platform-specific deployment monitoring
# (Similar to Phase 7)

echo "[OK] Deployed to production: $PROD_URL"
```

## Phase 10: Validate Production

### Conservative Validation

```bash
echo "Validating production deployment..."

# Wait longer for production to stabilize
sleep 60

# Health check
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" $PROD_URL/health || echo "000")

if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "301" ] || [ "$HTTP_STATUS" = "302" ]; then
  echo "[OK] Production health check: $HTTP_STATUS"
else
  echo "[ERROR] Production health check failed: $HTTP_STATUS"
  rollback_production
fi
```

### Production Error Monitoring

```bash
echo "Monitoring production logs..."

if [ "$DEPLOYMENT" = "railway" ]; then
  ERROR_COUNT=$(railway logs --tail 100 | grep -iE "(error|exception|fatal)" | wc -l)
elif [ "$DEPLOYMENT" = "vercel" ]; then
  ERROR_COUNT=$(vercel logs $PROD_URL --since 5m | grep -iE "(error|exception|fatal)" | wc -l)
fi

if [ "$ERROR_COUNT" -gt 20 ]; then
  echo "[ERROR] CRITICAL: High error rate in production: $ERROR_COUNT errors"
  rollback_production
else
  echo "[OK] Production error rate acceptable: $ERROR_COUNT errors"
fi
```

### Production Smoke Tests

```bash
if jq -e '.scripts["smoke-test:prod"]' package.json > /dev/null 2>&1; then
  echo "Running production smoke tests..."

  export SMOKE_TEST_URL=$PROD_URL
  $PACKAGE_MGR run smoke-test:prod

  if [ $? -ne 0 ]; then
    echo "[ERROR] Production smoke tests failed"
    rollback_production
  fi
fi
```

## Rollback Mechanism

**Triggered automatically on any production validation failure.**

```bash
rollback_production() {
  echo "========================================"
  echo "ROLLBACK INITIATED"
  echo "========================================"
  echo "WARNING: Force pushing to $PROD_BRANCH to revert"

  git checkout $PROD_BRANCH
  git reset --hard HEAD~1

  # Use --force-with-lease for safety
  if ! git push --force-with-lease origin $PROD_BRANCH; then
    echo "[ERROR] Force push failed - remote may have unexpected changes"
    echo "Manual intervention required"
    exit 1
  fi

  echo "[OK] Rolled back production to previous deployment"
  echo "Previous version will redeploy automatically"

  # Wait for rollback deployment
  sleep 30

  # Verify rollback succeeded
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" $PROD_URL/health || echo "000")
  if [ "$HTTP_STATUS" = "200" ]; then
    echo "[OK] Rollback successful, production is healthy"
  else
    echo "[WARN] Rollback deployed but health check unclear"
    echo "Manual investigation required"
  fi

  exit 1
}
```

## Platform Detection Reference

The `detect-platform.js` script returns:

```json
{
  "ci": "github-actions|gitlab-ci|circleci|jenkins|travis|null",
  "deployment": "railway|vercel|netlify|heroku|null",
  "branchStrategy": "single-branch|multi-branch",
  "mainBranch": "main|master",
  "projectType": "nodejs|python|rust|go",
  "packageManager": "npm|yarn|pnpm|pip|cargo"
}
```

Use these values to adapt deployment monitoring to your specific platform.
