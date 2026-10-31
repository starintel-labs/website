% Verified by the feature-figures build and browser acceptance checks.
homepage_feature_catalog('apps/main/src/features.json').
homepage_feature_renderer('apps/main/feature-content.ts', vite_transform_index_html).
homepage_feature_outputs([carousel, capability_cards]).
homepage_figure_assets('apps/main/public/figures', svg).
homepage_carousel_interval_ms(6000).
homepage_carousel_pause_trigger(hover).
homepage_carousel_pause_trigger(focus).
homepage_carousel_pause_trigger(hidden_document).
homepage_reduced_motion(initially_paused, no_transition).
