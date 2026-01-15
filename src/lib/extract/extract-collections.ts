import {readCollections} from '@directus/sdk'
import {ux} from '@oclif/core'

import {DIRECTUS_PINK} from '../constants.js'
import {api} from '../sdk.js'
import catchError from '../utils/catch-error.js'
import writeToFile from '../utils/write-to-file.js'

export interface ExtractCollectionsOptions {
  excludeExtensionCollections?: boolean;
}

/**
 * Extract collections from the Directus instance
 * @param dir - The directory to write the collections to
 * @param options - Options for filtering collections
 */
export default async function extractCollections(dir: string, options: ExtractCollectionsOptions = {}) {
  ux.action.start(ux.colorize(DIRECTUS_PINK, 'Extracting collections'))
  try {
    const response = await api.client.request(readCollections())
    let collections = response
    .filter(collection => !collection.collection.startsWith('directus_'))
    .filter(collection => collection.meta?.group !== '_extensions')

    if (options.excludeExtensionCollections) {
      collections = collections.filter(collection => collection.meta?.group !== '_extensions')
    }

    await writeToFile('collections', collections, dir)
  } catch (error) {
    catchError(error, {
      context: {operation: 'extractCollections'},
      fatal: true,
    })
  }

  ux.action.stop()
}
