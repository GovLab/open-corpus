# GovLab Open Corpus skill

A skill for AI assistants that answers questions about AI, democracy and public-sector innovation from what Reboot Democracy (rebootdemocracy.ai) and InnovateUS (innovate-us.org) have published, and cites the original pages.

**Download:** [govlab-open-corpus.zip](govlab-open-corpus.zip)

## Add it to your assistant

- **Claude** (all plans): turn on *Code execution and file creation* under Settings → Capabilities, then upload the zip under Customize → Skills.
- **ChatGPT** (Business, Enterprise, Edu): Skills → Create → Upload from your computer. On Plus or Pro, create a GPT instead: paste `SKILL.md` into its instructions and add the files in `references/` as knowledge.
- **Gemini** (Skills are rolling out from October 13, 2026): create a skill from `SKILL.md` and add the files in `references/`.
- **GitHub Copilot** (coding agent, CLI, VS Code agent mode): copy the `govlab-open-corpus` folder into `.github/skills/` in a repository or into `~/.copilot/skills/`.

## What it knows

| Source | Entries | Dates | File |
|---|---:|---|---|
| Reboot Democracy blog posts | 347 | 2023-06 – 2026-10 | [blog-posts.md](govlab-open-corpus/references/blog-posts.md) |
| Reboot Democracy weekly news digests | 115 | 2025-04 – 2026-09 | [news-digests.md](govlab-open-corpus/references/news-digests.md) |
| InnovateUS workshops | 368 (287 with recordings) | 2021-12 – 2026-12 | [workshops.md](govlab-open-corpus/references/workshops.md) |
| InnovateUS courses | 8 |  | [courses.md](govlab-open-corpus/references/courses.md) |

Every entry links to its page and carries the teaser shown on that page; links are checked before each update.
