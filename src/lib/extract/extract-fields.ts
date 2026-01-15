import {readCollections, readFields} from '@directus/sdk'
import {ux} from '@oclif/core'

import {DIRECTUS_PINK} from '../constants.js'
import {api} from '../sdk.js'
import catchError from '../utils/catch-error.js'
import writeToFile from '../utils/write-to-file.js'

/**
 * Extract fields from the Directus instance
 */

export default async function extractFields(dir: string) {
  ux.action.start(ux.colorize(DIRECTUS_PINK, 'Extracting fields'))
  try {
    // Get collections in the _extensions group to exclude their fields
    const collections = await api.client.request(readCollections())
    const extensionsCollections = new Set(
      collections
      .filter(c => c.meta?.group === '_extensions')
      .map(c => c.collection),
    )

    const response = await api.client.request(readFields())

    if (!Array.isArray(response)) {
      throw new TypeError('Unexpected response format')
    }

    const fields = response
    .filter(
      (i: { collection: string; meta?: { system?: boolean } }) => i.meta && !i.meta.system,
    )
    .filter(
      (i: { collection: string }) => !extensionsCollections.has(i.collection),
    )
    .map(i => {
      if (i.meta) {
        delete i.meta.id
      }

      return i
    })

    await writeToFile('fields', fields, dir)
  } catch (error) {
    catchError(error, {
      context: {operation: 'extractFields'},
      fatal: true,
    })
  }

  ux.action.stop()
}
