/* eslint-disable no-undef */
/* eslint-disable prefer-template */
var queryString = context.getVariable('request.querystring')
var pathSuffix = context.getVariable('proxy.pathsuffix')

/**
 Apigee has three namespaces - production, dev and staging. We map them to the
 appropriate gcp project names.

 PS: This does not work for beta as Apigee has no beta environment, so beta has separate config
 files (client-search-beta-xxxxx)
 */

var project = context
    .getVariable('config.namespace')
    .replace('production', 'entur-prod')
    .replace('dev', 'ent-enturapp-dev')
    .replace('staging', 'ent-enturapp-tst')

var oldTargetUrl = context.getVariable('target.url').replace('PROJECT', project)

var targetUrl = oldTargetUrl + pathSuffix

if (queryString !== '') {
    targetUrl = targetUrl + '?' + queryString
}

context.setVariable('target.url', targetUrl)
