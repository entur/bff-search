# 🔍 Entur Search 🔎

A backend service to be used by our App and Web clients, for performing all types of travel searches.

## Overview

The reasons for having this backend-for-frontend is to simplify the travel search implementation for our web and app clients, and give us the ability to change the search logic without deploying new client versions.

This backend service provides a simple REST API. Its `POST /transit` endpoint takes a set of simple parameters. The endpoint returns a set of trip patterns and a _cursor_ for pagination. The cursor is a key to get the next search results. If the client is not satisfied with the number of trip patterns returned, it will make a new request against the endpoint, but now with only the cursor as its parameter.

#### From the client's perspective

The cursor is a key to get the next search results. If the client is not satisfied with the number of trip patterns returned, it will make a new request against the endpoint, but now with only the cursor as its parameter. The cursor should be treated by the client as a random string that acts as a key to getting the next search results. The client should not need to know anything about how it's implemented. If a request to this backend does _not_ return a cursor, that means that it is not possible to continue, and the client should give up.

#### From the backend's perspective

The backend is a REST service which we would like to keep _stateless_. That means that we want all requests to be independent of some state living on the server. We therefore generate the cursors by serializing the parameters for the next search (and some metadata) and compress it. This way, it looks like a random string, but in fact everything that is needed for doing the search is encoded in the string.

## 📦 Install

Node.js version 18 is required, so make sure you have that installed.

```
npm install
```

### Redis

You need to have Redis v4 installed on your machine for cache to work locally. Version 4 is the not the latest version, but the one we are using in production.

Mac installation instructions:

```
cd ~
mkdir redis
cd redis
curl -O http://download.redis.io/releases/redis-4.0.14.tar.gz
tar xzf redis-4.0.14.tar.gz
cd redis-4.0.14
make
make test
make install
```

After this, you can start a Redis server with `redis-server`, and use `redis-cli` for management. The default port is 6379.

---

## 🛠 Develop

Run `npm run <env>` to run the server locally.

```
npm run debug dev
npm run debug staging
npm run debug prod
```

The default port is **9000**. You can override it with the `PORT` environment variable.

---

## 🚦 Test

We use **Jest** for together with the `ts-jest` TypeScript preprocessor for testing. To run all tests:

```
npm t
```

---

## 🚢 Deploy

Deploy is done from CircleCI:

https://app.circleci.com/pipelines/github/entur/bff-search

---

## 🛰 Apigee Deploy

Nope, not possible at the moment. Everything apigee related in this
repo works with Apigee Egde, but we're currently using Apigee X. Clickops is the way at the moment.

See targets in client-search-xxxx to see what mappings are needed.

```
npm run apigee // dev is the default
npm run apigee dev
npm run apigee staging
npm run apigee prod
```

This will deploy the app to **Apigee**.

❗Please note that, when deploying to `staging` or `prod`, the script will deploy the version (revision) that is currently running on `dev`. So, if you have made any new changes to the api endpoints **ALWAYS** deploy to `dev` first!

### But I thought we had a separate beta environment as well?

Haha, yeah, you would, wouldn't you? And we do - but Apigee does NOT have a separate beta environment, so we need
to have a separate config for it, and that config is included in all deploys (or so it seems?).

The URL in every case is

```
https://api.<dev.|staging.|''>entur.io/client/search/beta/v1
```

instead of

```
https://api.<dev.|staging.|''>entur.io/client/search/v1
```

The entur-client beta web/app use `api.entur.io/client/search/beta/v1`

### Headers + CORS

New request headers must be whitelisted before they can be used, or the request will
be blocked by the user's browser.

Edit

`api/client-search/apiproxy/policies/assignMessage.addCors.xml`

Add your header to

`<Header name="Access-Control-Allow-Headers">`

PS: CORS checks are only done by the web client, the App does not
attempt to check headers, so use the web client when testing new headers!

### GUI

You can also use the **Apigee GUI** to check revision status across all environments, and to make manual apigee deployments: https://apigee.com/platform/entur/proxies/client-search/overview/4

### More info

-   Entur's Apigee documentation: https://enturas.atlassian.net/wiki/spaces/ESP/pages/486834198/Apigee
