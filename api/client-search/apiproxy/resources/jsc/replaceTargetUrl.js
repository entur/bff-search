var oldTargetUrl = context.getVariable("target.url");
var namespace = context.getVariable("config.namespace");
var queryString = context.getVariable("request.querystring");
var pathSuffix = context.getVariable("proxy.pathsuffix");

if (namespace == "production") {
  namespace = "";
}

var oldTargetUrl = oldTargetUrl.replace("ENVIRONMENT", namespace);
var targetUrl = oldTargetUrl + pathSuffix;

if (queryString !== '') {
  var targetUrl = targetUrl + '?' + queryString;
}

context.setVariable("target.url", targetUrl);
