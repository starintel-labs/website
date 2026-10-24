% Verified against apps/main/server/{config,radar-feed,projector}.ts and its tests.
radar_exchange(documents).
radar_binding('documents.new.#').
radar_binding('documents.ingest.#').
radar_binding('documents.updated.#').
radar_binding('actors.#').
radar_public_projection(routing_key_and_payload_size_only).
radar_public_source_scope(shared_public_tenant, explicit_public_handling).
