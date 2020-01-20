#!/bin/bash

set -e

function deploy {
    ENV="${1:-dev}"

    echo "Deploying to $ENV"

    npm run lint

    if [[ "$1" == "dev" ]]; then
        npm run build:dev && gcloud app deploy --project=entur-dev --quiet
    elif [[ "$1" == "staging" ]]; then
        npm run build:staging && gcloud app deploy --project=entur-staging --quiet
    elif [[ "$1" == "prod" ]]; then
        npm run build:prod && gcloud app deploy --project=entur-prod --quiet
    fi

    BRANCH="$(git symbolic-ref HEAD 2>/dev/null)" ||
    BRANCH="(unnamed branch)"
    BRANCH=${BRANCH##refs/heads/}

    COMMIT="$(git rev-parse --short HEAD)"

    curl -X POST \
        --data-urlencode "payload={\"channel\": \"#team-app-build\", \"username\": \"BFF Search deployed to $ENV\", \"text\": \"\`$USER\` deployed BFF Search to :$ENV: from branch \`$BRANCH\` (\`$COMMIT\`): $URL\", \"icon_emoji\": \":mag:\"}" \
        https://hooks.slack.com/services/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
}

ENV_ARGS="${@:-dev}"
for ENV_ARG in $ENV_ARGS
do
    deploy "$ENV_ARG"
done
