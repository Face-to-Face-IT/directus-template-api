import {readCollections, readItems} from '@directus/sdk'
import {ux} from '@oclif/core'

import {DIRECTUS_PINK} from '../constants.js'
import {api} from '../sdk.js'
import catchError from '../utils/catch-error.js'
import writeToFile from '../utils/write-to-file.js'

export interface ExtractContentOptions {
  excludeExtensionCollections?: boolean;
}

async function getCollections(options: ExtractContentOptions = {}) {
  const response = await api.client.request(readCollections())
  let collections = response
  .filter(item => !item.collection.startsWith('directus_', 0))
  .filter(item => item.schema !== null)
  .filter(item => item.meta?.group !== '_extensions')

  if (options.excludeExtensionCollections) {
    collections = collections.filter(item => item.meta?.group !== '_extensions')
  }

  return collections.map(i => i.collection)
}

async function getDataFromCollection(collection: string, dir: string) {
  try {
    const response = await api.client.request(readItems(collection as never, {limit: -1}))
    await writeToFile(`${collection}`, response, `${dir}/content/`)
  } catch (error) {
    catchError(error, {
      context: {collection, operation: 'getDataFromCollection'},
      fatal: true,
    })
  }
}

export async function extractContent(dir: string, options: ExtractContentOptions = {}) {
  ux.action.start(ux.colorize(DIRECTUS_PINK, 'Extracting content'))
  try {
    const collections = await getCollections(options)
    await Promise.all(collections.map(collection => getDataFromCollection(collection, dir)))
  } catch (error) {
    catchError(error, {
      context: {operation: 'extractContent'},
      fatal: true,
    })
  }

  ux.action.stop()
}
