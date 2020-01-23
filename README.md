# Entur Search

A backend for our frontend that does travel search.

## Install

```
npm install
```

## Develop

Run `npm run <env>` to run the server locally.

```
npm run dev
npm run staging
npm run prod
```

The default port is 9000. You can override it with the `PORT` environment variable.

## Deploy

```
npm run deploy // dev is the default
npm run deploy dev
npm run deploy staging
npm run deploy prod
```

## Apigee Deploy

Apigee has 3 environments (-e): `dev`, `stage` and `prod`.

### Deploy api on dev

```bash
read -s APIGEEPASSWORD && \
apigeetool deployproxy -V -o entur -e dev -n client-search -d api/client-search -u $APIGEEUSER -p $APIGEEPASSWORD
```

### Upgrade staging to dev revision

- To get dev revision:

```bash
read -s APIGEEPASSWORD && \
apigeetool listdeployments -V -u $APIGEEUSER -p $APIGEEPASSWORD  -o entur -n client-search -j | jq '.deployments[] | select(.environment |contains("dev")) |.revision'
```

- To deploy dev revision to staging (or prod change the target `-e prod`):

```bash
read -s APIGEEPASSWORD && \
revision=$(apigeetool listdeployments -u $APIGEEUSER -p $APIGEEPASSWORD  -o entur -n client-search -j | jq '.deployments[] | select(.environment |contains("dev")) |.revision') && \
apigeetool deployExistingRevision -V -u $APIGEEUSER -p $APIGEEPASSWORD -o entur -e stage  -n client-search -r $revision
```
