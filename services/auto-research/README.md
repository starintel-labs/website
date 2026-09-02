# StarIntel Auto Research service

First migration slice for Auto Research on StarIntel's own platform.

## What this slice does

- authenticated FastAPI control surface;
- durable per-run state under `AUTO_RESEARCH_RUN_ROOT`;
- creates one Forgejo issue for every project in a research request before model execution;
- launches Prolog-RLM in **direct native-tool mode** only;
- exposes capability-gated `project_list`, `project_read`, `project_write`, and `project_append` native tools to the model;
- confines model file access to the run's `workspace/` directory;
- uses Prolog-RLM authority/effect journaling for write tools;
- leaves symbolic/typed-plan execution disabled for this slice.

The HTTP process owns API and Forgejo credentials. The model never receives either token.

## Runtime requirements

- Python 3.11+
- SWI-Prolog 9+
- a local checkout of `lost-rob0t/prolog-rlm`
- an OpenRouter API key
- a Forgejo API token able to create issues in the requested repositories

Copy `.env.example` into your service configuration and set a GLM model in `AUTO_RESEARCH_MODEL`. The model name is deliberately configuration, not a hard-coded provider assumption.

## Run locally

```sh
cd services/auto-research
python3 -m venv .venv
. .venv/bin/activate
pip install -e '.[dev]'
export AUTO_RESEARCH_API_TOKEN='...'
export FORGEJO_BASE_URL='https://forgejo.example'
export FORGEJO_TOKEN='...'
export PROLOG_RLM_ROOT="$HOME/Documents/Projects/prolog-rlm"
export AUTO_RESEARCH_MODEL='z-ai/your-glm-model'
export OPENROUTER_API_KEY='...'
auto-research-api
```

Health is public at `GET /healthz`. Run APIs require `Authorization: Bearer <AUTO_RESEARCH_API_TOKEN>`.

## Create a run

```sh
curl -sS http://127.0.0.1:8097/v1/runs \
  -H "Authorization: Bearer $AUTO_RESEARCH_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Auto Research migration",
    "objective": "Produce an implementation/research slice for the platform migration.",
    "projects": [
      {"name": "website", "repo": "starintel-labs/website", "brief": "HTTP and operator surface"},
      {"name": "prolog-rlm", "repo": "lost-rob0t/prolog-rlm", "brief": "direct native-tool harness"}
    ]
  }'
```

The service creates both Forgejo issues first, writes their references into `request.json`, then starts the Prolog-RLM worker. The final provider response is stored in `result.json`; model-authored artifacts live beneath `workspace/`.

## Security boundary

Bearer comparison uses constant-time comparison. Protected routes fail closed if the API token is missing. Forgejo tokens stay in the Python process. Prolog receives only the run request, workspace path, model name, and the capability-gated native tool registry. There is no shell/process tool and no unrestricted filesystem tool.

The current service runner is intentionally simple and process-local. A later StarIntel actor slice should replace the in-process task launcher with the durable actor/queue lifecycle without changing the HTTP or Prolog-RLM contracts.
