#!/bin/bash

set -e

function deploy {
    ENV="${1:-dev}"

    if ! [[ "$ENV" =~ ^(dev|staging|prod)$ ]]; then
        echo -e "🙈 Invalid ENV: $ENV\n"
        exit 1
    fi

    echo " 🧵  Linting ..."
    npm run lint

    echo " 🚢 Deploying BFF Search to $ENV ..."
    npm run build:$ENV && gcloud app deploy --project=entur-$ENV --quiet

    echo " 💬 Posting message to Slack ..."
    slack_message $ENV
}

function slack_message {
    ENV=$1
    BRANCH="$(git symbolic-ref HEAD 2>/dev/null)" ||
    BRANCH="(unnamed branch)"
    BRANCH=${BRANCH##refs/heads/}

    COMMIT="$(git rev-parse --short HEAD)"

    curl -X POST \
        --data-urlencode "payload={\"channel\": \"#team-app-build\", \"username\": \"BFF Search deployed to $ENV\", \"text\": \"\`$USER\` deployed *BFF Search* to :$ENV: from branch \`$BRANCH\` (\`$COMMIT\`)\", \"icon_emoji\": \":mag:\"}" \
        https://hooks.slack.com/services/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
}

ENV_ARGS="${@:-dev}"
for ENV_ARG in $ENV_ARGS
do
    deploy "$ENV_ARG"
done
