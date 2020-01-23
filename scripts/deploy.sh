#!/bin/bash

set -e

function deploy {
    ENV="${1:-dev}"

    if ! [[ "$ENV" =~ ^(dev|staging|prod)$ ]]; then
        echo -e "🙈 Invalid ENV: $ENV\n"
        exit 1
    fi

    npm run lint

    echo "🚢 Deploying BFF Search to $ENV ..."
    npm run build:$ENV && gcloud app deploy --project=entur-$ENV --quiet

    deploy_to_apigee $ENV

    slack_message $ENV
}

function deploy_to_apigee {
    ENV=$1
    APIGEEUSER="tor.magnus.castberg@entur.org"
    read -sp "🔑 Apigee password: " APIGEEPASSWORD
    echo

    if ! command_exists jq; then
        brew install jq
    fi

    if [[ "$ENV" == "dev" ]]; then
        echo "📝 Deploying new revision to Apigee dev ..."
        apigeetool deployproxy -V -o entur -e dev -n client-search -d api/client-search -u $APIGEEUSER -p $APIGEEPASSWORD
    fi

    APIGEEREVISION=$(apigeetool listdeployments -u $APIGEEUSER -p $APIGEEPASSWORD -o entur -n client-search -j | jq '.deployments[] | select(.environment |contains("dev")) |.revision')

    if [[ "$ENV" == "staging" ]]; then
        echo "🚢 Deploying revision $APIGEEREVISION to Apigee stage ..."
        apigeetool deployExistingRevision -V -u $APIGEEUSER -p $APIGEEPASSWORD -o entur -e stage -n client-search -r $APIGEEREVISION
    elif [[ "$ENV" == "prod" ]]; then
        echo "🚢 Deploying revision $APIGEEREVISION to Apigee prod ..."
        apigeetool deployExistingRevision -V -u $APIGEEUSER -p $APIGEEPASSWORD -o entur -e prod -n client-search -r $APIGEEREVISION
    fi

    echo -e "\n🎉 Revision $APIGEEREVISION successfully deployed to $ENV!"
    echo -e "\n📋 Status: https://apigee.com/platform/entur/proxies/client-search/overview/$APIGEEREVISION"
}

function command_exists {
    command -v $1 >/dev/null 2>&1;
}

function slack_message {
    ENV=$1
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
