import {ux} from '@oclif/core'

import type {ApplyFlags} from './apply-flags.js'

import checkTemplate from '../utils/check-template.js'
import {logger} from '../utils/logger.js'
import loadAccess from './load-access.js'
import loadCollections from './load-collections.js'
import loadDashboards from './load-dashboards.js'
import loadData from './load-data.js'
import loadExtensions from './load-extensions.js'
import loadFiles from './load-files.js'
import loadFlows from './load-flows.js'
import loadFolders from './load-folders.js'
import loadPermissions from './load-permissions.js'
import loadPolicies from './load-policies.js'
import loadPresets from './load-presets.js'
import loadRelations from './load-relations.js'
import loadRoles from './load-roles.js'
import loadSettings from './load-settings.js'
import loadTranslations from './load-translations.js'
import loadUsers from './load-users.js'
import updateRequiredFields from './update-required-fields.js'

export default async function apply(dir: string, flags: ApplyFlags) {
  const source = `${dir}/src`
  logger.log('info', 'Starting apply operation', {flags, source})

  const isTemplateOk = await checkTemplate(source)
  if (!isTemplateOk) {
    ux.error('The template is missing the collections, fields, or relations files. Older templates are not supported in v0.4 of directus-template-cli. Try using v0.3 to load older templates npx directus-template-cli@0.3 apply or extract the template using latest version before applying. Exiting...')
  }

  if (flags.schema) {
    logger.log('info', 'Loading schema', {step: 'schema'})
    await loadCollections(source)
    await loadRelations(source)
  }

  if (flags.permissions || flags.users) {
    logger.log('info', 'Loading permissions and users', {includeUsers: flags.users, step: 'permissions'})
    await loadRoles(source)
    await loadPolicies(source)
    await loadPermissions(source)

    if (flags.users) {
      await loadUsers(source)
    }

    await loadAccess(source)
  }

  if (flags.files) {
    logger.log('info', 'Loading files', {step: 'files'})
    await loadFolders(source)
    await loadFiles(source)
  }

  if (flags.content) {
    logger.log('info', 'Loading content data', {step: 'content'})
    await loadData(source)
  }

  if (flags.schema) {
    logger.log('info', 'Updating required fields', {step: 'updateRequiredFields'})
    await updateRequiredFields(source)
  }

  if (flags.dashboards) {
    logger.log('info', 'Loading dashboards', {step: 'dashboards'})
    await loadDashboards(source)
  }

  if (flags.flows) {
    logger.log('info', 'Loading flows', {step: 'flows'})
    await loadFlows(source)
  }

  if (flags.settings) {
    logger.log('info', 'Loading settings', {step: 'settings'})
    await loadSettings(source)
    await loadTranslations(source)
    await loadPresets(source)
  }

  if (flags.extensions) {
    logger.log('info', 'Loading extensions', {step: 'extensions'})
    await loadExtensions(source)
  }

  logger.log('info', 'Apply operation completed', {source})
  return {}
}
