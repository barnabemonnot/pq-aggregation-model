# PQ aggregation model

Interactive model of post-quantum signature aggregation for Ethereum finality: aggregation-tree shape, redundancy per level, finality time under gossip vs directed networks, and the extra work ("AWU") and cost each node takes on, with work sampled by stake.

- `/` — Model v1
- `/v2/` — Model v2 (signature dissemination modelled as a bandwidth queue over subnet relays)

Each version is a static page: `index.html`, `model.js` (the model), `app.js` (UI). Open `index.html` through any static server, e.g. `npx serve .`, and select the version from the dropdown at the top right.

Live preview: https://cpv-pq-aggregation-model-ef07c8ce.pages.dev

Built iteratively in Slack with Centaur. Leaf proving and merge timings are calibrated against [leanVM benchmarks](https://leanethereum.github.io/leanVM/).
