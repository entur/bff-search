# 🔍 Entur Search 🔎

A backend service to be used by our App and Web clients, for performing all types of travel searches.

## Overview
The reasons for having this backend-for-frontend is to simplify the travel search implementation for our web and app clients, and give us the ability to change the search logic without deploying new client versions.

This backend service provides a simple REST API. Its `POST /transit` endpoint takes a set of simple parameters, which closely resembles the parameters of our [SDK's getTripPatterns](https://sdk.entur.org/travel/getTripPatterns) method. The endpoint returns a set of trip patterns and a _cursor_. The cursor is a key to get the next search results. If the client is not satisfied with the number of trip patterns returned, it will make a new request against the endpoint, but now with only the cursor as its parameter.

### Background and Goals
The core feature of the Entur clients (the mobile app and https://entur.no) is travel search. The goal is to present to the user the 5 (or more) best transit results for any given search. While the [JourneyPlanner API](https://developer.entur.org/pages-journeyplanner-journeyplanner) has a `numTripPatterns` parameter, this only limits the _maximum_ number of results returned. If there are few available transit options, JourneyPlanner might return fewer than this number. And sometimes none at all! Therefore, we need our own logic for doing additional searches into the future to reach our goal of five trip patterns. And it is important to make clear that if we receive some trip patterns, we want to display these to the user as soon as we get them, even if we continue to search forward in time.

On a more technical note, a goal is that the backend should be fully responsible for how the search logic is implemented, so that we can do even drastic changes in how it works (like going from JourneyPlanner v2 to v3) with little or no changes in the client code.

### Searching Ahead
In this section we will explain our logic for doing continued travel searches in order to get at least 5 travel results. Note that this applies only for JourneyPlanner v2. JourneyPlanner v3, which is under development, will work differently.

#### If no results at all
If the JourneyPlanner service returns no results at all, we can continue to make new searches forward in time on this backend without returning anything to the client. In these cases we make new searches at the following offsets forward in time: 2 hours, 6 hours, 18 hours. If none of these searches return any results, we make a final search at 00:01 the following day, in order to use the next "service date" as well. If any of the offset searches pass midnight, we make the 00:01 search instead.

Pseudo code:
```
if (no search results):
  offsetUsed = currentSearchDone.searchDate - originalSearchDate
  newOffset = 2
  if (offsetUsed > 0):
    newOffset = offsetUsed * 3 // 2 hours, 6 hours, 18 hours, ...

  newSearchDate = originalSearchDate + newOffset
  if (newSearchDate is not same date originalSearchDate):
    newSearchDate = nextDay at 00:01
```

If the last search at 00:01 returns no results, we give up.

#### If less than five results
If some results are returned, but not as many as we want, we also need to continue the search. But we can be smarter in picking new search times by using the results we got. We use the start time of the lastest trip pattern received, with 1 minute added.

Pseudo code:
```
if (number of search results < 5):
  resultsSortedByStart = sortDescending(searchResults, "startDate")
  latestSearchResult = resultsSortedByStart[0]
  newSearchDate = latestSearchResult.startTime + 1 minute
```

We continue like this until we have 5 results.

### The Cursor Approach
When a user of our clients initiates a travel search, a POST request is done to this backend service with a set of parameters. These parameters closely resembles the parameters of our [SDK's getTripPatterns](https://sdk.entur.org/travel/getTripPatterns). The request will return a set of trip patterns and a _cursor_.

```
{
    tripPatterns: [],
    nextCursor: 'sdfkjsc90234902'
}
```

#### From the client's perspective
The cursor is a key to get the next search results. If the client is not satisfied with the number of trip patterns returned, it will make a new request against the endpoint, but now with only the cursor as its parameter. The cursor should be treated by the client as a random string that acts as a key to getting the next search results. The client should not need to know anything about how it's implemented. If a request to this backend does _not_ return a cursor, that means that it is not possible to continue, and the client should give up.

#### From the backend's perspective
The backend is a REST service which we would like to keep _stateless_. That means that we want all requests to be independent of some state living on the server. We therefore generate the cursors by serializing the parameters for the next search (and some metadata) and compress it. This way, it looks like a random string, but in fact everything that is needed for doing the search is encoded in the string.

## 📦 Install

```
npm install
```

### Redis

You need to have Redis v4 installed on your machine for cache to work locally. Version 4 is the not the latest version, but the one we are using in production.

Mac installation instructions:

```
cd ~
mdkir redis
cd redis
curl -O http://download.redis.io/releases/redis-4.0.14.tar.gz
tar xzf redis-4.0.14.tar.gz
cd redis-4.0.14
make
make test
make install
```

After this, you can start a Redis server with `redis-server`, and use `redis-cli` for management. The default port is 6379.

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
