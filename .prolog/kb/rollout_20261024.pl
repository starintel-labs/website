% Public route observations from the 2026-10-24 website rollout.
rollout_pr_merged(website, 6, '05e3628143492b7d557bd9ad995151108cbe6754', '0d448f211397b616069ffaae7a9b964d7f5327e1').
rollout_ci_context(website, '05e3628143492b7d557bd9ad995151108cbe6754', push, success).
rollout_ci_context(website, '05e3628143492b7d557bd9ad995151108cbe6754', pull_request, success).
rollout_route_observed('2026-10-24', 'https://starintel.actor/radar', 200, html).
rollout_route_observed('2026-10-24', 'https://starintel.actor/radar/stream', 200, sse_heartbeat).
rollout_asset_observed('2026-10-24', '/assets/radar-niN3TKhE.js', 200, javascript).
rollout_asset_observed('2026-10-24', '/assets/layout-CRY8REPy.js', 200, javascript).
rollout_asset_observed('2026-10-24', '/assets/layout-DMfUK7yY.css', 200, css).
rollout_gap('2026-10-24', deployed_website_revision_unconfirmed).
rollout_gap('2026-10-24', radar_broker_event_unobserved).
