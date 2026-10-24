% Recompute fetchPnpmDeps when the workspace lockfile changes.
nix_package_dependency_source(main_site, 'pnpm-lock.yaml').
nix_package_failure('2026-10-24', main_site, missing_offline_tarball).
nix_package_fix('2026-10-24', main_site, refreshed_fetch_pnpm_deps_hash).
nix_package_check(main_site, 'nix build .#main-site --no-link').
