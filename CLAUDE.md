# Katei agent guidance (token-efficient)

## Primary workflow

Use this order by default:

1. **Graphify first**: traverse graph relationships to locate the smallest relevant surface.
2. **Targeted reads**: open only the minimum files needed for the current change.
3. **Implement**: make focused edits.
4. **Validate**: run only the relevant existing tests/build steps.

Avoid repository-wide scans and repeated full-file reads when the required context is already known.

## Knowledge layer separation

- **Graphify** = development intelligence about code structure and dependencies.
- **Graphiti** = runtime intelligence about app entities/events/history.
- Do not duplicate source-of-truth data in Graphiti.

## Runtime Graphiti rules

- Graphiti is optional and additive.
- Ingest only events that benefit from temporal/relational retrieval.
- Retrieve only targeted, bounded results for current investigations.
- Never dump the entire graph into AI context.

## Brand and UI system

- Follow `/home/runner/work/Katei/Katei/BRAND.md` for all UI decisions.
- Keep motion restrained and purposeful.
- Keep microcopy concise and action-oriented.

## i18n

Frontend UI strings must be updated in:
`frontend/src/locales/{en,de,fr,es,it,nl}.json`.

## Security and quality

- Preserve current auth/privacy boundaries.
- Do not log or expose secrets.
- Prefer smaller, incremental changes over broad refactors.
