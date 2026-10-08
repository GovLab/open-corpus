# GovLab Open Corpus skill

A skill for AI assistants that answers questions about AI, democracy, public-sector innovation, data and collective intelligence from what The GovLab, Reboot Democracy (rebootdemocracy.ai) and InnovateUS (innovate-us.org) have published, and cites the original pages.

**Download:** [govlab-open-corpus.zip](https://github.com/GovLab/open-corpus/raw/main/govlab-open-corpus.zip)

## Add it to your assistant

- **Claude** (all plans): turn on *Code execution and file creation* under Settings → Capabilities, then upload the zip under Customize → Skills.
- **ChatGPT** (Business, Enterprise, Edu): Skills → Create → Upload from your computer. On Plus or Pro, create a GPT instead: paste `SKILL.md` into its instructions and add the files in `references/` as knowledge.
- **Gemini** (Skills are rolling out from October 13, 2026): create a skill from `SKILL.md` and add the files in `references/`.
- **GitHub Copilot** (coding agent, CLI, VS Code agent mode): copy the `govlab-open-corpus` folder into `.github/skills/` in a repository or into `~/.copilot/skills/`.

## What it knows

| Source | Entries | Dates | File |
|---|---:|---|---|
| Reboot Democracy blog posts | 357 | 2023-06 – 2026-10 | [blog-posts.md](govlab-open-corpus/references/blog-posts.md) |
| Reboot Democracy weekly news digests | 116 | 2024-01 – 2026-10 | [news-digests.md](govlab-open-corpus/references/news-digests.md) |
| InnovateUS workshops | 370 (288 with recordings) | 2021-12 – 2026-12 | [workshops.md](govlab-open-corpus/references/workshops.md) |
| InnovateUS courses | 10 |  | [courses.md](govlab-open-corpus/references/courses.md) |
| InnovateUS news, research and resources | 55 | 2023-06 – 2026-09 | [innovateus-articles.md](govlab-open-corpus/references/innovateus-articles.md) |
| GovLab case studies | 346 | 2016-01 – 2022-11 | [govlab-case-studies.md](govlab-open-corpus/references/govlab-case-studies.md) |
| GovLab publications and reports | 89 | 2012-12 – 2026-04 | [govlab-publications.md](govlab-open-corpus/references/govlab-publications.md) |
| GovLab and Burnes Center projects and initiatives | 176 |  | [govlab-projects.md](govlab-open-corpus/references/govlab-projects.md) |
| GovLab Smarter Crowdsourcing and City Challenges | 53 | 2016-08 – 2023-08 | [govlab-crowdsourcing.md](govlab-open-corpus/references/govlab-crowdsourcing.md) |
| GovLab courses, lectures, worksheets and tools | 161 (63 with recordings) | 2017-10 – 2020-06 | [govlab-courses-and-tools.md](govlab-open-corpus/references/govlab-courses-and-tools.md) |
| GovLab and Burnes Center lectures and interviews | 170 (134 with recordings) | 2018-09 – 2026-08 | [govlab-videos.md](govlab-open-corpus/references/govlab-videos.md) |
| GovLab blog posts, 2019 onwards | 243 | 2019-01 – 2026-09 | [govlab-blog-2019-onwards.md](govlab-open-corpus/references/govlab-blog-2019-onwards.md) |
| GovLab blog posts, 2015 to 2018 | 386 | 2015-01 – 2018-12 | [govlab-blog-2015-2018.md](govlab-open-corpus/references/govlab-blog-2015-2018.md) |
| GovLab blog posts, 2012 to 2014 | 519 | 2012-09 – 2014-12 | [govlab-blog-2012-2014.md](govlab-open-corpus/references/govlab-blog-2012-2014.md) |

Every entry links to its page and carries a short teaser, usually the one shown on that page. Reboot Democracy and InnovateUS entries update automatically, within the hour, when new articles, workshops and courses are published.
