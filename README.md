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

This will deploy the app to **gcloud**.

-----

## 🛰 Apigee Deploy

```
npm run apigee // dev is the default
npm run apigee dev
npm run apigee staging
npm run apigee prod
```

This will deploy the app to **Apigee**.

❗Please note that, when deploying to `staging` or `prod`, the script will deploy the version (revision) that is currently running on `dev`. So, if you have made any new changes to the api endpoints **ALWAYS** deploy to `dev` first!

### GUI

You can also use the **Apigee GUI** to check revision status across all environments, and to make manual apigee deployments: https://apigee.com/platform/entur/proxies/client-search/overview/4

### More info
- Entur's Apigee documentation: https://enturas.atlassian.net/wiki/spaces/ESP/pages/486834198/Apigee
