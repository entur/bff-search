# 🔍 Entur Search 🔎

A backend service to be used by our App and Web clients, for performing all types of travel searches.

## 📦 Install

```
npm install
```

-----

## 🛠 Develop

Run `npm run <env>` to run the server locally.

```
npm run dev
npm run staging
npm run prod
```

The default port is **9000**. You can override it with the `PORT` environment variable.

-----

## 🚦 Test

We use **Jest** for together with the `ts-jest` TypeScript preprocessor for testing. To run all tests:
```
npm t
```

-----

## 🚢 Deploy

```
npm run deploy // dev is the default
npm run deploy dev
npm run deploy staging
npm run deploy prod
```

This will deploy the app to **gcloud**, as well as to **Apigee**.

-----

## 🛰 Apigee Deploy (manually)

❗The steps below are **not necessary** as long as you are running the deploy script above ( `npm run deploy` ). Use these steps for redeploying the same revision, or for debugging.

Apigee has 3 environments (-e): `dev`, `stage` and `prod`.

To deploy to any of these environments, you must first install the **apigeetool**, which can be found here: https://www.npmjs.com/package/apigeetool

### Deploy api on **dev**

```bash
read -s APIGEEPASSWORD && \
apigeetool deployproxy -V -o entur -e dev -n client-search -d api/client-search -u $APIGEEUSER -p $APIGEEPASSWORD
```

Get the username and password from **Lastpass** (under Apigee).

### Upgrade **staging** to **dev** revision

Every time you deploy, the revision number will be bumped to the next revision (+1). So when deploying to staging or prod, we first fetch the latest revision number from dev, and deploy using that number.

- To get the **dev** revision:

```bash
read -s APIGEEPASSWORD && \
apigeetool listdeployments -V -u $APIGEEUSER -p $APIGEEPASSWORD  -o entur -n client-search -j | jq '.deployments[] | select(.environment |contains("dev")) |.revision'
```

- To deploy **dev** revision to **staging** (or for **prod**, change the target to `-e prod`):

```bash
read -s APIGEEPASSWORD && \
revision=$(apigeetool listdeployments -u $APIGEEUSER -p $APIGEEPASSWORD  -o entur -n client-search -j | jq '.deployments[] | select(.environment |contains("dev")) |.revision') && \
apigeetool deployExistingRevision -V -u $APIGEEUSER -p $APIGEEPASSWORD -o entur -e stage  -n client-search -r $revision
```

### GUI

You can also use the **Apigee GUI** to check revision status across all environments, and to make manual apigee deployments: https://apigee.com/platform/entur/proxies/client-search/overview/4

### More info
- Entur's Apigee documentation: https://enturas.atlassian.netwiki/spaces/ESP/pages/486834198/Apigee
