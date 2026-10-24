% CouchDB storage metadata is outside the pinned public StarIntel document schema.
public_storage_metadata(tenant_id, couchdb_timeline_row).
public_validation_boundary(couchdb_timeline_row, shallow_copy_without(tenant_id), pinned_v09_schema).
public_validation_alias_policy(tenant_id, exact_storage_key_only).
public_validation_alias_policy(tenantId, schema_rejected).
public_validation_alias_policy('Tenant_ID', schema_rejected).
public_validation_alias_policy('tenant-id', schema_rejected).
public_validation_alias_policy(tenantid, schema_rejected).
public_validation_alias_policy(tenant_ids, schema_rejected).
public_validation_alias_policy(tenantIds, schema_rejected).
public_validation_alias_policy('tenant-ids', schema_rejected).
public_validation_alias_policy(tenant, schema_rejected).
public_output_boundary(recent_documents, allowlisted_projection).
public_output_boundary(json_response, recursive_tenant_metadata_key_filter).
public_output_boundary(radar_sse, recursive_tenant_metadata_key_filter).
public_output_boundary(json_string_value, redact_whole_string_with_tenant_metadata_token).
public_radar_source_policy(amqp_delivery, routing_key_and_size_only, no_message_body).
public_static_source_policy(main_site, generated_from_tracked_html_and_assets).
