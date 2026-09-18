# Team Git Workflow for the Hackathon

This is the shared workflow for making changes safely while keeping the demo on **main** usable.

## The rules that prevent most problems

1. Treat **main** as the shared, demo-ready branch.
2. Do not develop directly on **main**.
3. Use one branch per task and one owner per branch.
4. Push your branch to GitHub and open a pull request into **main**.
5. Pull the latest **main** before starting work and before asking for a merge.
6. Do not force-push or rewrite a branch that someone else is using.
7. Keep changes focused. Avoid unrelated formatting, refactors, or dependency changes in the same pull request.

## Start a new task

From the project directory:

```bash
git status
git switch main
git pull --ff-only origin main
git switch -c feature/<short-task-name>
```

Use a clear, unique branch name, for example:

```text
feature/usage-cards
feature/login-form
fix/mobile-overflow
```

If the team already uses a prefix such as **codex/**, keep using that convention:

```bash
git switch -c codex/new-cards
```

The **--ff-only** option prevents Git from silently creating an unexpected merge commit while updating **main**.

## Work and commit regularly

Run the app locally with:

```bash
npm install       # first setup only, or after dependency changes
npm run dev
```

Make small, coherent commits. Before committing, check what will be included:

```bash
git status
git diff
```

Then commit only the relevant files:

```bash
git add src/components/usage-overview.jsx src/index.css
git commit -m "Make usage metric cards reusable"
```

Push the branch so it is backed up and available to the team:

```bash
git push -u origin feature/<short-task-name>
```

For later commits on the same branch, **git push** is enough.

## Open and update a pull request

After the task works locally:

```bash
npm run build
git status
git push
```

On GitHub, open a pull request with:

- **Base:** **main**
- **Compare:** your task branch
- a short summary of what changed
- how it was tested
- a reviewer, if another teammate should check it

The pull request is the review and merge point. A pull request marked **Open** is not in **main** yet. **Able to merge** means GitHub currently sees no merge conflict; it does not mean the change has been approved or merged.

If you add more commits after opening the pull request, push them to the same branch. GitHub updates the existing pull request automatically; do not create a second pull request.

After review, merge the pull request using the repository's agreed merge button. Do not merge directly to **main** from a local copy unless the team explicitly agrees.

## Retrieve a teammate's branch

A branch created on a teammate's computer becomes available to you only after they push it to the shared remote.

Use the exact remote branch name:

```bash
git fetch origin
git switch --track origin/<teammate-branch>
```

For example:

```bash
git fetch origin
git switch --track origin/codex/new-cards
```

If you already have a local copy of the branch:

```bash
git switch <teammate-branch>
git pull --ff-only
```

GitHub actions do not automatically change your local files or **localhost**. Your local app shows whichever branch is checked out. Switch to the teammate's branch and refresh or restart the dev server to preview it.

## Keep a branch up to date before merging

Before opening or merging a pull request, bring the latest **main** into your task branch:

```bash
git switch main
git pull --ff-only origin main
git switch feature/<short-task-name>
git merge main
```

If the merge completes without conflicts, run the relevant checks and push:

```bash
npm run build
git push
```

For this hackathon workflow, prefer merging **main** into your own task branch rather than rebasing a branch that has already been pushed. This avoids rewriting a branch that teammates or an open pull request may already reference.

## Resolve a merge conflict safely

If Git reports conflicts:

1. Check which files need attention:

   ```bash
   git status
   ```

2. Open each conflicted file and resolve the sections between:

   ```text
   <<<<<<<
   your branch's version
   =======
   main's version
   >>>>>>>
   ```

   Keep the correct code, or combine both versions intentionally. Remove all conflict markers.

3. Check for remaining markers and inspect the result:

   ```bash
   rg '<<<<<<<|=======|>>>>>>>' src
   git diff
   ```

4. Mark the resolved files, commit, and push:

   ```bash
   git add <resolved-file>...
   git commit -m "Resolve merge conflicts with main"
   npm run build
   git push
   ```

   The existing pull request will update.

If the conflict is confusing and you have not committed the merge resolution, cancel it with:

```bash
git merge --abort
```

Then ask the teammate who owns the conflicting feature to resolve it with you. Do not delete files or use a destructive reset as a shortcut.

## Practices that reduce conflicts during a fast hackathon

- Agree in chat who owns each screen, component, or integration before editing it.
- Split work by files or clear feature boundaries where possible.
- If two people must touch the same file, coordinate the order and pull frequently.
- Keep shared component changes small and explain them in the pull request.
- Coordinate dependency updates; commit **package.json** and **package-lock.json** together.
- Pull **main** before starting a new task and before opening a pull request.
- Push work-in-progress branches so a teammate can recover or review them.
- Leave **main** in a runnable state after every merge.
- If a merge breaks the demo, tell the team immediately and fix or revert the specific change.

## Common situations

### “The branch is not available”

The teammate may not have pushed it, or the name may be different. Ask for the exact branch name and have them run:

```bash
git switch <branch-name>
git push -u origin <branch-name>
```

Branch names are exact and case-sensitive. **new-card**, **new-cards**, and **codex/new-cards** are different names.

### “Changes shows +0 -0”

That means the current working tree is clean. It does not mean a branch has no committed changes. Use the branch comparison or pull request to inspect committed differences.

### “My local app still looks unchanged”

Check the current branch:

```bash
git branch --show-current
```

Switch to the intended branch, then refresh the browser or restart **npm run dev**.

### “I have uncommitted changes and need to switch branches”

Do not switch blindly. Either commit the work on the correct task branch or temporarily stash it:

```bash
git stash push -m "work in progress"
git switch <other-branch>
```

Restore it later with **git stash pop** after checking that the target branch is correct.

## Quick copy-paste workflow

```bash
# Start a task
git switch main
git pull --ff-only origin main
git switch -c feature/my-task

# Work, test, commit, and share
git status
npm run build
git add <relevant-files>
git commit -m "Describe the user-visible change"
git push -u origin feature/my-task

# Later, update the task branch with main
git switch main
git pull --ff-only origin main
git switch feature/my-task
git merge main
npm run build
git push
```
