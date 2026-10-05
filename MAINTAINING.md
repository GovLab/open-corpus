# Maintaining the catalog

`README.md`, `llms.txt`, `data/` and `lists/` are generated. Edit `catalog.config.json` (title, intro,
programs, allowed link hosts) or the scripts, never the generated files.

## Scope

Only Reboot Democracy and InnovateUS content. Every link must point to rebootdemocracy.ai or
innovate-us.org; workshop recordings point to InnovateUS videos on youtube.com. The export leaves out
unpublished posts and courses, workshops flagged not open to the public (and their recordings), Zoom
recording links and the third-party articles linked from the weekly news digests.
`npm run build` refuses to run if any link falls outside `allowed_hosts` or matches the URL denylist.

## Refresh by hand

```sh
npm ci
WEAVIATE_URL=… WEAVIATE_API_KEY=… npm run export   # read-only; writes data/sources.json
npm run build                                       # README.md, llms.txt, data/sources.csv, lists/
npm test                                            # offline checks of the public filters
```

The export reads metadata fields only (`FIELDS` in `scripts/lib/sources.mjs`) and one aggregate per
workshop recording; it never reads full text or transcripts.

## Daily refresh

`.github/workflows/update-catalog.yml` runs every day at 06:17 UTC (and on demand). Add the repository
secrets `WEAVIATE_URL` and `WEAVIATE_API_KEY` (a read-only key is enough) to switch it on; without them
the job skips itself. It commits only when the catalog changed.
