# Troubleshooting Guide

## Common Issues and Solutions

### 1. Content Security Policy (CSP) Warning

**Issue**: Console shows warning about `unsafe-eval` in Content-Security-Policy

**Solution**: ✅ Fixed! Removed `unsafe-eval` from CSP in [index.html](../index.html#L5)

The CSP now only allows:
- Scripts from same origin with inline support (no eval)
- Styles from same origin with inline support
- Images from HTTPS sources
- Network connections to GitHub API and Convex

---

### 2. GitHub 404 Errors

**Issue**: Console shows 404 errors when fetching pull requests from GitHub organizations

**Causes**:
1. **Private Organization**: The org exists but your GitHub account doesn't have access
2. **Typo in Org Name**: The organization name is misspelled in configuration
3. **Organization Doesn't Exist**: The org was deleted or renamed
4. **Token Permissions**: GitHub CLI token lacks required scopes

**Solutions**:

#### Check GitHub Authentication
```powershell
gh auth status
```

Make sure you're logged in with the correct accounts:
```powershell
# Login with a specific account
gh auth login -h github.com

# Switch between accounts
gh auth switch
```

#### Validate Org Access
Run the validation script to check all configured orgs:
```powershell
.\scripts\validate-github-orgs.ps1
```

#### Update Token Scopes
If the token lacks permissions:
```powershell
# Re-authenticate with full scopes
gh auth refresh -s read:org,repo
```

#### Fix Configuration
Check your Convex database for GitHub account configurations:
1. Open Convex dashboard: http://127.0.0.1:6790/
2. Navigate to **Data** → **githubAccounts**
3. Verify organization names are correct
4. Remove any accounts you don't have access to

---

### 3. Convex Connection Issues

**Issue**: Console shows reconnection attempts or connection errors

**Causes**:
1. **Convex Dev Server Not Running**: The local Convex server isn't started
2. **Network Issues**: Firewall or network blocking WebSocket connections
3. **Incorrect Convex URL**: Environment variable pointing to wrong deployment

**Solutions**:

#### Start Convex Dev Server
```powershell
# Terminal 1: Start Convex backend
.\runServer.ps1

# Terminal 2: Start Electron app
.\runApp.ps1
```

#### Check Convex Dashboard
Visit http://127.0.0.1:6790/ to verify the server is running

#### Verify Environment
Check your Convex URL:
```powershell
# Should be set in .env.local or default to dev URL
echo $env:VITE_CONVEX_URL
```

#### Reduce Verbose Logging
✅ Fixed! Convex client now has reduced logging by default

---

### 4. "No authenticated accounts" Error

**Issue**: App shows error: "GitHub CLI authentication not available for any configured account"

**Solution**:
```powershell
# Login with GitHub CLI
gh auth login

# Verify authentication
gh auth status

# Test API access
gh api user
```

---

### 5. Empty Pull Request List

**Issue**: PR viewer shows no pull requests despite having PRs in GitHub

**Causes**:
1. **Wrong Organization**: Configured org doesn't match your PRs
2. **Filters Too Restrictive**: View mode filtering out your PRs
3. **Authentication Issue**: Token doesn't have access to repos

**Solutions**:

#### Check Organization Configuration
Ensure you're querying the right organizations in Convex settings

#### Try Different Views
- **Pull Requests**: Shows PRs you authored
- **Needs Review**: Shows PRs where you're requested as reviewer
- **Recently Merged**: Shows recently merged PRs (last 7 days)

#### Verify GitHub Access
```powershell
# Check your accessible orgs
gh api user/orgs

# Check PRs in a specific org
gh search prs --owner=YourOrg --author=@me --state=open
```

---

### 6. Rate Limiting

**Issue**: Console shows "Rate limit hit" errors

**Solution**: The app has built-in retry logic with exponential backoff. Rate limits will automatically recover. If you're hitting limits frequently:

1. **Use fewer accounts**: Reduce the number of GitHub accounts configured
2. **Increase refresh interval**: Don't refresh data too frequently
3. **Check token**: Authenticated tokens have higher rate limits (5000/hr vs 60/hr)

---

## Debug Mode

Enable verbose logging for troubleshooting:

1. Open Developer Tools (Ctrl+Shift+I)
2. Go to Console tab
3. Look for debug messages prefixed with:
   - `[GitHub]` - GitHub API calls
   - `[Convex]` - Backend operations
   - `[Config]` - Configuration changes

---

## Getting Help

If you're still experiencing issues:

1. **Check Logs**: Look at the console output in Developer Tools
2. **Validate Setup**: Run `.\scripts\validate-github-orgs.ps1`
3. **Check GitHub Status**: Visit https://www.githubstatus.com/
4. **Review AGENTS.md**: See [AGENTS.md](../AGENTS.md) for architecture details

---

## Quick Reference

### Essential Commands
```powershell
# GitHub CLI
gh auth status              # Check authentication
gh auth login              # Login to GitHub
gh auth refresh            # Refresh token
gh api user/orgs          # List accessible orgs

# Convex
bun run convex:dev        # Start dev server
bun run convex:codegen    # Generate types

# App
.\runServer.ps1           # Start Convex backend
.\runApp.ps1              # Start Electron app
```

### Important Files
- `convex/githubAccounts.ts` - GitHub account queries
- `src/api/github.ts` - GitHub API client
- `electron/config.ts` - Configuration manager
- `index.html` - Content Security Policy
