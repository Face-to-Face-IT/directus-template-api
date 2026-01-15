/* eslint-disable @typescript-eslint/no-explicit-any -- Directus SDK types are dynamic */
import {
  createItems, readCollections, readItems, updateItemsBatch, updateSingleton,
} from '@directus/sdk'
import {ux} from '@oclif/core'
import path from 'pathe'

import {DIRECTUS_PINK} from '../constants.js'
import {api} from '../sdk.js'
import catchError from '../utils/catch-error.js'
import {chunkArray} from '../utils/chunk-array.js'
import readFile from '../utils/read-file.js'
const BATCH_SIZE = 50

/**
 * Get the set of collection names that exist in the target Directus instance.
 */
async function getTargetCollectionNames(): Promise<Set<string>> {
  const collections = await api.client.request(readCollections())
  return new Set(collections.map(c => c.collection))
}

export default async function loadData(dir:string) {
  const collections = readFile('collections', dir) ?? []
  ux.action.start(ux.colorize(DIRECTUS_PINK, `Loading data for ${collections.length} collections`))

  // Fetch target collections once to avoid multiple API calls
  const targetCollections = await getTargetCollectionNames()

  await loadSkeletonRecords(dir, targetCollections)
  await loadFullData(dir, targetCollections)
  await loadSingletons(dir, targetCollections)

  ux.action.stop()
}

async function loadSkeletonRecords(dir: string, targetCollections: Set<string>) {
  ux.action.status = 'Loading skeleton records'
  const collections = readFile('collections', dir) ?? []
  const primaryKeyMap = await getCollectionPrimaryKeys(dir)
  const userCollections = collections
  .filter(item => !item.collection.startsWith('directus_', 0))
  .filter(item => item.schema !== null)
  .filter(item => !item.meta.singleton)
  // Skip collections that don't exist in target (e.g., extension-managed collections)
  .filter(item => targetCollections.has(item.collection))

  await Promise.all(userCollections.map(async collection => {
    const name = collection.collection
    const sourceDir = path.resolve(dir, 'content')
    const data = readFile(name, sourceDir, {allowMissing: true})

    // Skip collections without content files (e.g., extension-managed collections)
    if (data === null) {
      return
    }

    const primaryKeyField = getPrimaryKey(primaryKeyMap, name)

    // Fetch existing primary keys
    const existingPrimaryKeys = await getExistingPrimaryKeys(name, primaryKeyField)

    // Filter out existing records
    const newData = data.filter(entry => !existingPrimaryKeys.has(entry[primaryKeyField]))

    if (newData.length === 0) {
      return
    }

    const batches = chunkArray(newData, BATCH_SIZE).map(batch =>
      batch.map(entry => ({[primaryKeyField]: entry[primaryKeyField]})),
    )

    await Promise.all(batches.map((batch, index) => uploadBatch(name, batch, createItems, index)))
  }))

  ux.action.status = 'Loaded skeleton records'
}

async function getExistingPrimaryKeys(collection: string, primaryKeyField: string): Promise<Set<any>> {
  const existingKeys = new Set()
  let page = 1
  const limit = 1000 // Adjust based on your needs and API limits

  // eslint-disable-next-line no-constant-condition -- Paginating until exhausted
  while (true) {
    try {
      // eslint-disable-next-line no-await-in-loop -- Sequential pagination required
      const response = await api.client.request(readItems(collection, {
        fields: [primaryKeyField],
        limit,
        page,
      }))

      if (response.length === 0) break

      for (const item of response) existingKeys.add(item[primaryKeyField])

      if (response.length < limit) break
      page++
    } catch (error) {
      catchError(error, {
        context: {
          collection,
          operation: 'getExistingPrimaryKeys',
          page,
          primaryKeyField,
        },
        fatal: true,
      })
      break
    }
  }

  return existingKeys
}

async function uploadBatch(collection: string, batch: any[], method: (collection: string, items: any[]) => any, batchIndex?: number) {
  try {
    await api.client.request(method(collection, batch))
  } catch (error) {
    catchError(error, {
      context: {
        batchIndex,
        batchSize: batch.length,
        collection,
        operation: 'uploadBatch',
      },
      fatal: true,
    })
  }
}

async function loadFullData(dir: string, targetCollections: Set<string>) {
  ux.action.status = 'Updating records with full data'
  const collections = readFile('collections', dir) ?? []
  const userCollections = collections
  .filter(item => !item.collection.startsWith('directus_', 0))
  .filter(item => item.schema !== null)
  .filter(item => !item.meta.singleton)
  // Skip collections that don't exist in target (e.g., extension-managed collections)
  .filter(item => targetCollections.has(item.collection))

  await Promise.all(userCollections.map(async collection => {
    const name = collection.collection
    const sourceDir = path.resolve(dir, 'content')
    const data = readFile(name, sourceDir, {allowMissing: true})

    // Skip collections without content files (e.g., extension-managed collections)
    if (data === null) {
      return
    }

    const batches = chunkArray(data, BATCH_SIZE).map(batch =>
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Removing user fields from data
      batch.map(({user_created, user_updated, ...cleanedRow}) => cleanedRow),
    )

    await Promise.all(batches.map((batch, index) => uploadBatch(name, batch, updateItemsBatch, index)))
  }))

  ux.action.status = 'Updated records with full data'
}

async function loadSingletons(dir: string, targetCollections: Set<string>) {
  ux.action.status = 'Loading data for singleton collections'
  const collections = readFile('collections', dir) ?? []
  const singletonCollections = collections
  .filter(item => !item.collection.startsWith('directus_', 0))
  .filter(item => item.meta.singleton)
  // Skip collections that don't exist in target (e.g., extension-managed collections)
  .filter(item => targetCollections.has(item.collection))

  await Promise.all(singletonCollections.map(async collection => {
    const name = collection.collection
    const sourceDir = path.resolve(dir, 'content')
    const data = readFile(name, sourceDir, {allowMissing: true})

    // Skip singletons without content files (e.g., extension-managed collections)
    if (data === null) {
      return
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Removing user fields from data
      const {user_created, user_updated, ...cleanedData} = data as any

      await api.client.request(updateSingleton(name, cleanedData))
    } catch (error) {
      catchError(error, {
        context: {
          collection: name,
          operation: 'loadSingletons',
        },
        fatal: true,
      })
    }
  }))

  ux.action.status = 'Loaded data for singleton collections'
}

async function getCollectionPrimaryKeys(dir: string) {
  const fields = readFile('fields', dir) ?? []
  const primaryKeys = {}
  for (const field of fields) {
    if (field.schema && field.schema?.is_primary_key) {
      primaryKeys[field.collection] = field.field
    }
  }

  return primaryKeys
}

function getPrimaryKey(collectionsMap: any, collection: string) {
  if (!collectionsMap[collection]) {
    catchError(`Collection ${collection} not found in collections map`, {
      context: {
        availableCollections: Object.keys(collectionsMap),
        collection,
        operation: 'getPrimaryKey',
      },
      fatal: true,
    })
  }

  return collectionsMap[collection]
}
