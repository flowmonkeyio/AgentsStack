---
description: Commit and push all code changes (excluding .md files) with a descriptive commit message
allowed-tools: Bash, Read, Grep
---

Commit and push all staged and unstaged code changes, excluding markdown (.md) files.

Follow these steps:

1. First, run `git status` to see all changes
2. Run `git diff` to understand what was changed (both staged and unstaged)
3. Stage all changes EXCEPT .md files using:
   ```
   git add -A
   git reset -- '*.md' '**/*.md'
   ```
4. Analyze the staged changes and write a clear, descriptive commit message that:
   - Starts with a type prefix (feat:, fix:, refactor:, chore:, etc.)
   - Summarizes the main change in the first line (max 72 chars)
   - Includes bullet points for multiple changes if needed
5. Create the commit with the generated message
6. Push to the current branch

Important:

- Do NOT commit any .md files
- Do NOT modify any files, only commit what's already changed
- Use conventional commit format
- If there are no changes to commit (after excluding .md files), inform the user
