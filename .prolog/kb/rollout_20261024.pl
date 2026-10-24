% Public route observations from the 2026-10-24 website rollout.
rollout_pr_merged(website, 6, '05e3628143492b7d557bd9ad995151108cbe6754', '0d448f211397b616069ffaae7a9b964d7f5327e1').
rollout_ci_context(website, '05e3628143492b7d557bd9ad995151108cbe6754', push, success).
rollout_ci_context(website, '05e3628143492b7d557bd9ad995151108cbe6754', pull_request, success).
rollout_route_observed('2026-10-24', 'https://starintel.actor/radar', 200, html).
rollout_route_observed('2026-10-24', 'https://starintel.actor/radar/stream', 200, sse_heartbeat).
rollout_radar_event_observed('2026-10-24', predeploy, ct114_actor_container, public_sse, 'actors.radar-probe', actor, 'radar-probe', s, 1, rate_total(2)).
rollout_radar_event_observed('2026-10-24', postdeploy, ct114_actor_container, public_sse, 'actors.radar-probe', actor, 'radar-probe', s, 1, rate_total(1)).
rollout_asset_observed('2026-10-24', '/assets/radar-niN3TKhE.js', 200, javascript).
rollout_asset_observed('2026-10-24', '/assets/layout-CRY8REPy.js', 200, javascript).
rollout_asset_observed('2026-10-24', '/assets/layout-DMfUK7yY.css', 200, css).
rollout_deployed_source('2026-10-24', ct100_web, '9de38b7b774d2e83333d2ff0d030977879ed89e4').
rollout_deployed_package('2026-10-24', ct100_web, '/nix/store/a3d84qxvcf1xsf8r7vf3agp9dn5la9dh-starintel-website-0.1.0').
rollout_host_system('2026-10-24', ct100_web, '/nix/store/3dmj9zl6czrb5yspc7qmd5759kq31655-nixos-system-web-lxc-proxmox-26.05.20260819.b18a4b9').
rollout_asset_digest_match('2026-10-24', operator_workstation, '/assets/index-79rStgTQ.js', 'a24dbc71b4b079a3983fba60add8498cd7c61295962b81bb65f04061f49f2b95').
rollout_asset_digest_match('2026-10-24', operator_workstation, '/assets/motion-BIpGawIh.css', '4c993a1a424d8c7f46f33cc9d3f536ea39f812b91e29bdd33b7f8107eeea78bd').
rollout_readiness_observed('2026-10-24', operator_workstation, ready, radar_live, recent_ok).
rollout_recent_observed('2026-10-24', operator_workstation, http_200, documents(0), window(0), eligible(0)).
timeline_query_requires(reduce_false, include_docs_true).
validator_runtime_import(ajv_formats, commonjs_default_plugin).
timeline_invalid_document_policy(skip_after_validation_failure, never_project).
rollout_gap('2026-10-24', public_recent_feed_empty_in_live_sample).
live_timeline_sample('2026-10-24', 300, schema_valid(14), schema_rejected(286), public_eligible(0)).
live_timeline_rejection('2026-10-24', tenant_id_additional_property, 286).
live_recent_service_result('2026-10-24', completed, returned_documents(0)).
public_eligibility_requires(visibility_public, pii_false, sensitive_false, no_restrictive_classification, no_embargo).
