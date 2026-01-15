import {ux} from '@oclif/core'
import fs from 'node:fs'

import type {ExtractOptions} from './extract-flags.js'

import {logger} from '../utils/logger.js'
import extractAccess from './extract-access.js'
import {downloadAllFiles} from './extract-assets.js'
import extractCollections from './extract-collections.js'
import {extractContent} from './extract-content.js'
import {extractDashboards, extractPanels} from './extract-dashboards.js'
import extractExtensions from './extract-extensions.js'
import extractFields from './extract-fields.js'
import extractFiles from './extract-files.js'
import {extractFlows, extractOperations} from './extract-flows.js'
import extractFolders from './extract-folders.js'
import extractPermissions from './extract-permissions.js'
import extractPolicies from './extract-policies.js'
import extractPresets from './extract-presets.js'
import extractRelations from './extract-relations.js'
import extractRoles from './extract-roles.js'
import extractSchema from './extract-schema.js'
import extractSettings from './extract-settings.js'
import extractTranslations from './extract-translations.js'
import extractUsers from './extract-users.js'

export default async function extract(dir: string, flags: ExtractOptions) {
  // Get the destination directory for the actual files
  const destination = `${dir}/src`
  logger.log('info', 'Starting extract operation', {destination, flags})

  // Check if directory exists, if not, then create it.
  if (!fs.existsSync(destination)) {
    ux.stdout(`Attempting to create directory at: ${destination}`)
    fs.mkdirSync(destination, {recursive: true})
  }

  if (flags.schema) {
    logger.log('info', 'Extracting schema', {step: 'schema'})
    await extractSchema(destination)
    await extractCollections(destination, {excludeExtensionCollections: flags.excludeExtensionCollections})
    await extractFields(destination, {excludeExtensionCollections: flags.excludeExtensionCollections})
    await extractRelations(destination, {excludeExtensionCollections: flags.excludeExtensionCollections})
  }

  if (flags.files) {
    logger.log('info', 'Extracting files metadata', {step: 'files'})
    await extractFolders(destination)
    await extractFiles(destination)
  }

  if (flags.permissions || flags.users) {
    logger.log('info', 'Extracting permissions and users', {includeUsers: flags.users, step: 'permissions'})
    await extractRoles(destination)
    await extractPermissions(destination)
    await extractPolicies(destination)
    await extractAccess(destination)

    if (flags.users) {
      await extractUsers(destination)
    }
  }

  if (flags.settings) {
    logger.log('info', 'Extracting settings', {step: 'settings'})
    await extractPresets(destination)
    await extractTranslations(destination)
    await extractSettings(destination)
  }

  if (flags.flows) {
    logger.log('info', 'Extracting flows', {step: 'flows'})
    await extractFlows(destination)
    await extractOperations(destination)
  }

  if (flags.dashboards) {
    logger.log('info', 'Extracting dashboards', {step: 'dashboards'})
    await extractDashboards(destination)
    await extractPanels(destination)
  }

  if (flags.extensions) {
    logger.log('info', 'Extracting extensions', {step: 'extensions'})
    await extractExtensions(destination)
  }

  if (flags.content) {
    logger.log('info', 'Extracting content data', {step: 'content'})
    await extractContent(destination, {excludeExtensionCollections: flags.excludeExtensionCollections})
  }

  if (flags.files) {
    logger.log('info', 'Downloading file assets', {step: 'downloadFiles'})
    await downloadAllFiles(destination)
  }

  logger.log('info', 'Extract operation completed', {destination})
  return {}
}
