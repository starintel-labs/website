% Verified against apps/main/server/{config,radar-feed,projector}.ts and its tests.
radar_exchange(documents).
radar_binding('documents.new.#').
radar_binding('documents.ingest.#').
radar_binding('documents.updated.#').
radar_binding('actors.#').
radar_public_projection(routing_metadata_and_allowlisted_public_document_presentation).
radar_public_source_scope(shared_public_tenant, absent_handling_legacy_or_explicit_public_handling).
radar_traffic_scope(public, public_activity_only).
radar_traffic_scope(aggregate, all_subscribed_deliveries_fixed_categories_only).
radar_legacy_fallback(radar_only, exact_public_tenant, handling_absent).
radar_explicit_handling_policy(explicit_public_safety_flags).
radar_current_wire_metadata('0.10.1', flat_visibility_sensitivity_deleted_accessControl,
                            canonical('lost-rob0t/star-lang', '010873f8e4462b5c705a21206d8cee55e5c5b2e0')).
radar_validation_scope(disclosure_metadata_and_display_allowlist, no_raw_document_egress).
radar_current_restriction(private_visibility_or_nonpublic_sensitivity_or_deletion_or_accessControl).
radar_aggregate_omits([dtype, identifiers, tenant_metadata, arbitrary_routing_values, message_body]).
radar_idle_policy(periodic_rate_frames, ten_second_rolling_window).
radar_document_frames(public_scope_only, named_sse(documents), maximum_batch(32)).
radar_document_window(server_default(100), browser(100), server_maximum(100)).
radar_document_reader(text_content_only, no_html_interpretation).
radar_revocation(known_public_id, immediate_removal_and_snapshot_revision_guard).
radar_redesign(master_detail_public_document_feed, anonymous_telemetry_secondary).
radar_connection_status(named_sse(status), actual_upstream_state_not_just_open_browser_transport).
