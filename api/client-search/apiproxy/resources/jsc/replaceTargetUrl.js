var queryString = context.getVariable('request.querystring')
var pathSuffix = context.getVariable('proxy.pathsuffix')
var namespace = context
    .getVariable('config.namespace')
    .replace('production', 'prod')
var oldTargetUrl = context
    .getVariable('target.url')
    .replace('ENVIRONMENT', namespace)

var targetUrl = oldTargetUrl + pathSuffix

if (queryString !== '') {
    var targetUrl = targetUrl + '?' + queryString
}

context.setVariable('target.url', targetUrl)
