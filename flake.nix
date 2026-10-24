{
  description = "StarIntel website: starintel.actor applications and public web properties";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
    flake-parts.url = "github:hercules-ci/flake-parts";
    flake-parts.inputs.nixpkgs-lib.follows = "nixpkgs";
  };

  outputs =
    inputs@{ self, nixpkgs, flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [ "x86_64-linux" ];

      perSystem =
        {
          pkgs,
          system,
          ...
        }:
        let
          pname = "starintel-website";
          version = "0.1.0";

          pnpmDeps = pkgs.fetchPnpmDeps {
            inherit pname version;
            src = ./.;
            fetcherVersion = 3;
            hash = "sha256-Qgj11YjH+F9kYgKE+dwjVbt67ZK6uYG18sIUZPEEtfY=";
          };

          # The @starintel/main runtime: the built static site (dist/) plus the
          # node server (server/*.ts, run with node --experimental-strip-types)
          # and a production node_modules tree preserving the pnpm workspace
          # layout. The server resolves workspace packages as TS source via the
          # same relative symlinks as a development checkout.
          main-site = pkgs.stdenv.mkDerivation {
            inherit pname version;
            src = ./.;

            nativeBuildInputs = with pkgs; [
              nodejs
              pnpm
              pnpmConfigHook
            ];

            inherit pnpmDeps;

            env.NODE_ENV = "production";

            buildPhase = ''
              runHook preBuild
              pnpm install --offline --frozen-lockfile --ignore-scripts
              pnpm --filter @starintel/main build
              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall
              mkdir -p "$out/share/starintel-website"
              cp -r . "$out/share/starintel-website/"
              cd "$out/share/starintel-website"
              rm -rf .git .github .forgejo .prolog result result-* node_modules/.pnpm-lock.yaml
              # dev-only workspace artifacts are not part of the runtime
              rm -rf apps/blog apps/nsaspy apps/admin apps/symbolics node_modules/.cache
              runHook postInstall
            '';

            # The runtime tree is self-contained: pnpm workspace symlinks point
            # into the same tree, and the dist assets are prebuilt.
            dontFixup = true;

            passthru = {
              inherit pnpmDeps;
              serverMain = "share/starintel-website/apps/main/server/main.ts";
            };

            meta = with pkgs.lib; {
              description = "starintel.actor main website server and static assets";
              platforms = [ "x86_64-linux" ];
            };
          };
        in
        {
          packages = {
            inherit main-site;
            default = main-site;
          };

          checks = {
            main-site-build = main-site;
            main-site-smoke = pkgs.runCommand "starintel-main-site-smoke" { } ''
              set -euo pipefail
              export PORT=8799
              export HOST=127.0.0.1
              export STATIC_DIR=dist
              export COUCHDB_URL=http://127.0.0.1:1
              export RABBIT_URL=
              export HOME=$TMPDIR
              ${pkgs.nodejs}/bin/node --experimental-strip-types \
                ${main-site}/share/starintel-website/apps/main/server/main.ts &
              pid=$!
              for i in $(seq 1 50); do
                if ${pkgs.curl}/bin/curl -fsS http://127.0.0.1:8799/healthz | ${pkgs.gnugrep}/bin/grep -q '"ok":true'; then
                  break
                fi
                sleep 0.2
              done
              ${pkgs.curl}/bin/curl -fsS http://127.0.0.1:8799/healthz | ${pkgs.gnugrep}/bin/grep -q '"ok":true'
              kill $pid
              touch "$out"
            '';
          };
        };
    };
}
