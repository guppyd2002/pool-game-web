# Deployment gate options (for CEO decision)

**Context:** Production currently auto-deploys from `master` (verified 2026-08-08: live site served `11638b7` via Git integration). “Freeze hash” communication is meaningless without a real gate.

**Constraints for this doc:** advisory only — **no Vercel settings changed**, no deploy, no rollback.

---

## Option A — Production branch = `release` (recommended leaning)

### What changes
| Where | Change |
|-------|--------|
| Vercel → Project → Settings → **Git** | **Production Branch** = `release` (today effectively `master`) |
| Repo | Create long-lived `release` branch; only promote via PR/merge when intentional |
| `master` pushes | Become **Preview** deployments (or no Production alias) |

### Daily workflow
1. Dev work on `master` / feature branches → push → **Preview URLs only**  
2. QA/gate signs a freeze SHA on master (or feature)  
3. **Promote:** merge that SHA into `release` (PR preferred) → Production auto-build  
4. CEO-facing prod URL (`pool-game-web.vercel.app`) only moves on `release` updates  

### Who can ship
- Anyone who can merge to `release` (protect branch: required review / CODEOWNERS)  
- Not every `git push origin master`

### Rollback
- `git revert` on `release` + push, or Vercel **Promote** previous Production deployment  
- Minutes if previous deployment still listed  

### CI impact
- GitHub Actions / Vitest on PRs unchanged  
- Optional: require CI green before merge to `release`  

### Pros
- Keeps auto-preview convenience for master  
- “Ship” becomes an intentional merge  
- Matches “freeze hash then promote” mental model  

### Cons / opposition
- **Two long-lived branches** to maintain (merge drift if release lags)  
- Must remember never to force-push `release`  
- First setup: one-time point `release` at current prod SHA so nothing jumps  

### Against (dev opinion)
- If the team is tiny and often forgets to promote, prod goes stale and people “just push master” pressure returns. Needs discipline or a bot reminder.

---

## Option B — Disable auto-deploy; manual `vercel --prod`

### What changes
| Where | Change |
|-------|--------|
| Vercel → Git | **Disconnect** production auto-deploy, or disable production deployments for the repo |
| Ops | Explicit `vercel --prod` from a clean checkout of a known SHA |

### Daily workflow
1. Push master/features freely → previews only (if preview still enabled)  
2. To ship: `git checkout <freeze-sha> && vercel --prod` (who has Vercel token)  

### Who can ship
- Whoever holds Vercel deploy credentials (narrower, or broader if token in CI)  

### Rollback
- `vercel rollback` / promote previous deployment in dashboard  
- Or redeploy older SHA with `--prod`  

### CI impact
- Can add a manual workflow_dispatch job that deploys only on approval  

### Pros
- Maximum control; no surprise prod from merge  

### Cons / opposition
- **Easy to forget** and ship wrong dirty tree if someone runs `--prod` from laptop with local changes  
- Needs strict “always deploy from clean SHA” script  
- Slower CEO/demo iterations  

### Against (dev opinion)
- Human error risk higher than protected `release` branch for this team’s speed. Prefer A unless CEO wants absolute manual control.

---

## Option C — Production only from GitHub Release / tagged workflow

### What changes
| Where | Change |
|-------|--------|
| GitHub Actions | On `release: published` or tag `v*`, run `vercel deploy --prod --token=…` |
| Vercel Git | Production auto-deploy **off** for branch pushes |
| Repo | Tags mark ship points |

### Daily workflow
1. Develop on master  
2. Create GitHub Release on freeze SHA → CI deploys that SHA to prod  

### Who can ship
- Who can create releases (GitHub permission)  

### Rollback
- Publish previous release / re-run workflow on older tag  
- Or Vercel promote previous deployment  

### CI impact
- New workflow; existing unit/e2e jobs unchanged  

### Pros
- Audit trail (release notes + tag = ship record)  
- Aligns with “no hash → rumor” culture  

### Cons / opposition
- More ceremony for tiny hotfixes  
- Needs secrets management for Vercel token in GH  

### Against (dev opinion)
- Best long-term; slightly heavier for “CEO said 撤 in 5 minutes.” Pair with **A** for day-to-day and use tags for public milestones if needed.

---

## Dev technical recommendation

**Prefer A (`release` production branch)** as the default gate:
- Matches how the team already uses master for continuous work  
- Makes “push master ≠ ship” true again  
- Rollback and preview stay simple  

**Also do immediately (ops, when CEO approves gate work):**
1. Document freeze SHA in release PR description  
2. Protect `release` (no direct push, required check)  
3. Optional: status check that blocks `release` merge if HS / typecheck fail  

**Do not rely on “don’t push master” human discipline alone** — that failed once under wrong assumptions.

---

## Time estimates (when CEO says go)

| Action | Est. time to prod |
|--------|-------------------|
| Merge prep branch → master (if clock-off approved) + wait auto-deploy | **3–8 min** (if master still = prod) |
| With gate A already in place: merge freeze → `release` | **5–15 min** (PR + build) |
| Manual B: checkout SHA + `vercel --prod` | **2–5 min** if token ready |
| Emergency: Vercel Promote previous deployment | **1–3 min** (no git) |

**Shot-clock off path (this prep branch):** flip is one constant; merge + deploy is the long pole, not coding.
