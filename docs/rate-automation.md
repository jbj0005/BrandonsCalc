# Lender Rate Automation

This document explains how to automate the weekly lender rate fetching process.

## Recommended: GitHub Actions

**Setup Steps:**

1. **Add GitHub Secrets** (Settings → Secrets → Actions):
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

2. **Workflow is configured** at `.github/workflows/fetch-rates.yml`
   - Runs every Monday at 6 AM UTC (1 AM EST)
   - Can be triggered manually from Actions tab
   - Auto-commits rate JSON files to repo
   - Creates GitHub issue on failure

3. **Test the workflow:**
   - Go to Actions tab on GitHub
   - Select "Fetch Lender Rates"
   - Click "Run workflow"

4. **Monitor:**
   - Check Actions tab for run history
   - View output JSON files in `output/` directory
   - Get notified via GitHub issues if it fails

---

## Alternative 1: Supabase Edge Functions + External Cron

**Pros:**
- Runs in Supabase infrastructure
- No GitHub needed

**Cons:**
- ❌ Cannot use linkedom (DOM parsing library)
- ❌ Limited to Deno runtime (not Node.js)
- ❌ Need external service to trigger cron
- ❌ More complex setup

**Not recommended** for this script due to linkedom dependency.

---

## Alternative 2: Supabase Database Cron (pg_cron)

**Pros:**
- Native PostgreSQL scheduling
- Simple SQL-based

**Cons:**
- ❌ Cannot execute Node.js scripts
- ❌ Would require complete rewrite as PL/pgSQL or database functions
- ❌ Cannot scrape websites directly from PostgreSQL

**Not feasible** for web scraping tasks.

---

## Alternative 3: External Cron Service (Render/Railway/Fly.io)

**Pros:**
- Dedicated server environment
- Full Node.js support

**Cons:**
- 💰 Costs money ($7-10/month minimum)
- More infrastructure to maintain
- Overkill for weekly task

**Setup (if needed):**

1. Deploy service with this `cron.js`:
```javascript
import { execSync } from 'child_process';

// Run every Monday at 6 AM
if (new Date().getDay() === 1 && new Date().getHours() === 6) {
  try {
    execSync('npm run fetch:rates', { stdio: 'inherit' });
  } catch (error) {
    console.error('Rate fetch failed:', error);
  }
}
```

2. Set environment variables on the platform
3. Configure cron schedule

---

## Monitoring & Maintenance

### Check Run Status
```bash
# View recent workflow runs
gh run list --workflow=fetch-rates.yml --limit 10

# View specific run logs
gh run view <run-id> --log
```

### Manual Trigger
```bash
# Trigger from command line
gh workflow run fetch-rates.yml

# Or use npm script locally
npm run fetch:rates
```

### Update Schedule
Edit `.github/workflows/fetch-rates.yml` cron expression:
- `'0 6 * * 1'` = Every Monday at 6 AM UTC
- `'0 6 * * *'` = Every day at 6 AM UTC
- `'0 6 1 * *'` = First day of month at 6 AM UTC

Cron syntax: `minute hour day month weekday`

### Handle Failures

1. **Check GitHub Issues** - Auto-created on failure
2. **Review Actions logs** - Detailed error messages
3. **Test locally** - Run `npm run fetch:rates` to debug
4. **Update parsers** - Lender websites may change HTML structure

---

## Cost Comparison

| Option | Monthly Cost | Setup Time | Maintenance |
|--------|--------------|------------|-------------|
| **GitHub Actions** | **Free** | **5 min** | **Low** |
| Render Cron | $7-10 | 30 min | Medium |
| Railway Cron | $5-8 | 30 min | Medium |
| Fly.io Machines | $2-5 | 45 min | High |
| AWS Lambda + EventBridge | ~$0.50 | 60 min | High |

---

## Recommended Schedule

**Weekly (Recommended):**
- Lender rates don't change frequently
- Reduces scraping load on lender websites
- Balances freshness vs. cost

**Daily:**
- Only if rates are very volatile
- May get IP blocked by some lenders
- Unnecessary for most use cases

**Monthly:**
- Too infrequent for accurate quotes
- Users may get stale rates

---

## Troubleshooting

### "Parser failed for provider X"
- Lender changed their website HTML structure
- Update the parser in `scripts/fetch-rates.mjs`
- Test locally before committing

### "Supabase credentials missing"
- Check GitHub Secrets are set correctly
- Verify secret names match workflow file

### "No rows generated for provider"
- Website may be down
- Check the failure report in `output/` directory
- Investigate the HTML structure

### Workflow not running on schedule
- Check Actions tab is enabled for repository
- Verify cron syntax in workflow file
- Note: First scheduled run may take up to 1 hour after push
