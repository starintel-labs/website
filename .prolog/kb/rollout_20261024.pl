% Public route observations from the 2026-10-24 website rollout.
rollout_pr_merged(website, 6, '05e3628143492b7d557bd9ad995151108cbe6754', '0d448f211397b616069ffaae7a9b964d7f5327e1').
rollout_ci_context(website, '05e3628143492b7d557bd9ad995151108cbe6754', push, success).
rollout_ci_context(website, '05e3628143492b7d557bd9ad995151108cbe6754', pull_request, success).
rollout_route_observed('2026-10-24', 'https://starintel.actor/radar', 200, html).
rollout_route_observed('2026-10-24', 'https://starintel.actor/radar/stream', 200, sse_heartbeat).
rollout_radar_event_observed('2026-10-24', 'actors.radar-probe', actor, 'radar-probe', s, 1).
rollout_asset_observed('2026-10-24', '/assets/radar-niN3TKhE.js', 200, javascript).
rollout_asset_observed('2026-10-24', '/assets/layout-CRY8REPy.js', 200, javascript).
rollout_asset_observed('2026-10-24', '/assets/layout-DMfUK7yY.css', 200, css).
rollout_gap('2026-10-24', deployed_website_revision_unconfirmed).
timeline_query_requires(reduce_false, include_docs_true).
validator_runtime_import(ajv_formats, commonjs_default_plugin).
timeline_invalid_document_policy(skip_after_validation_failure, never_project).
rollout_gap('2026-10-24', public_recent_feed_empty_in_live_sample).
live_timeline_sample('2026-10-24', 300, schema_valid(14), schema_rejected(286), public_eligible(0)).
live_timeline_rejection('2026-10-24', tenant_id_additional_property, 286).
live_recent_service_result('2026-10-24', completed, returned_documents(0)).
public_eligibility_requires(visibility_public, pii_false, sensitive_false, no_restrictive_classification, no_embargo).
