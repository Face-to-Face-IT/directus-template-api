/**
 * API handlers that wrap the existing CLI logic
 */

import type {Request, Response} from 'express'

import fs, {createReadStream, createWriteStream} from 'node:fs'
import os from 'node:os'
import {pipeline} from 'node:stream/promises'
import {createGzip} from 'node:zlib'
import path from 'pathe'

import type {ExtractOptions} from '../lib/extract/extract-flags.js'
import type {
  ApiResponse, ApplyTemplateRequest, ExtractTemplateRequest, HealthResponse,
} from './types.js'

import extract from '../lib/extract/index.js'
import {validateProgrammaticFlags as validateApplyFlags} from '../lib/load/apply-flags.js'
import apply from '../lib/load/index.js'
import {initializeDirectusApi} from '../lib/utils/auth.js'
import {getCommunityTemplates, getGithubTemplate, getLocalTemplate} from '../lib/utils/get-template.js'
import {logger} from '../lib/utils/logger.js'
import {generatePackageJsonContent, generateReadmeContent} from '../lib/utils/template-defaults.js'
import {VERSION} from './constants.js'

/**
 * Create a tar archive from a directory
 */
async function createTarArchive(sourceDir: string, outputPath: string): Promise<void> {
  const {exec} = await import('node:child_process')
  const {promisify} = await import('node:util')
  const execAsync = promisify(exec)

  // Use tar command to create archive
  await execAsync(`tar -cf "${outputPath}" -C "${path.dirname(sourceDir)}" "${path.basename(sourceDir)}"`)
}

/**
 * Create a gzipped tar archive from a directory
 */
async function createTarGzArchive(sourceDir: string, outputPath: string): Promise<void> {
  const tarPath = outputPath.replace(/\.gz$/, '')

  // Create tar archive first
  await createTarArchive(sourceDir, tarPath)

  // Then gzip it
  const gzip = createGzip()
  const source = createReadStream(tarPath)
  const destination = createWriteStream(outputPath)

  await pipeline(source, gzip, destination)

  // Clean up the intermediate tar file
  fs.unlinkSync(tarPath)
}

/**
 * Recursively remove a directory
 */
function removeDirectory(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, {force: true, recursive: true})
  }
}

/**
 * Helper function to build boolean defaults for flags
 * Returns an object where each field defaults to true unless explicitly set to false
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic body type for flexibility
function buildBooleanDefaults(body: any, fields: string[]): Record<string, boolean> {
  const result: Record<string, boolean> = {}
  for (const field of fields) {
    result[field] = body[field] !== false
  }

  return result
}

/**
 * Health check endpoint
 */
export async function healthCheck(req: Request, res: Response<HealthResponse>) {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: VERSION,
  })
}

/**
 * Apply template endpoint
 */
export async function applyTemplate(req: Request, res: Response<ApiResponse>) {
  const body = req.body as ApplyTemplateRequest

  try {
    // Validate required fields
    if (!body.directusUrl) {
      return res.status(400).json({
        error: 'directusUrl is required',
        success: false,
      })
    }

    if (!body.directusToken && (!body.userEmail || !body.userPassword)) {
      return res.status(400).json({
        error: 'Either directusToken or both userEmail and userPassword are required',
        success: false,
      })
    }

    if (!body.templateLocation) {
      return res.status(400).json({
        error: 'templateLocation is required',
        success: false,
      })
    }

    // Initialize Directus API
    await initializeDirectusApi({
      directusToken: body.directusToken,
      directusUrl: body.directusUrl,
      userEmail: body.userEmail,
      userPassword: body.userPassword,
    })

    // Get template based on type
    let templateDir: string
    const templateType = body.templateType || 'local'

    switch (templateType) {
    case 'local': {
      const template = await getLocalTemplate(body.templateLocation)
      templateDir = template.directoryPath

      break
    }

    case 'community': {
      const templates = await getCommunityTemplates()
      const template = templates.find(t => t.templateName === body.templateLocation)
      if (!template) {
        return res.status(404).json({
          error: `Template '${body.templateLocation}' not found in community templates`,
          success: false,
        })
      }

      templateDir = template.directoryPath

      break
    }

    case 'github': {
      const template = await getGithubTemplate(body.templateLocation)
      templateDir = template.directoryPath

      break
    }

    default: {
      return res.status(400).json({
        error: 'Invalid templateType. Must be "local", "community", or "github"',
        success: false,
      })
    }
    }

    // Build flags object with defaults (all true unless explicitly set to false)
    const booleanFlags = buildBooleanDefaults(body, ['content', 'dashboards', 'extensions', 'files', 'flows', 'permissions', 'schema', 'settings', 'users'])
    const flags = {
      content: booleanFlags.content,
      dashboards: booleanFlags.dashboards,
      directusToken: body.directusToken || '',
      directusUrl: body.directusUrl,
      extensions: booleanFlags.extensions,
      files: booleanFlags.files,
      flows: booleanFlags.flows,
      partial: body.partial || false,
      permissions: booleanFlags.permissions,
      programmatic: true,
      schema: booleanFlags.schema,
      settings: booleanFlags.settings,
      templateLocation: body.templateLocation,
      templateType,
      userEmail: body.userEmail || '',
      userPassword: body.userPassword || '',
      users: booleanFlags.users,
    }

    // Validate flags using existing validation
    const validatedFlags = await validateApplyFlags(flags)

    // Apply the template
    await apply(templateDir, validatedFlags)

    res.json({
      data: {
        templateLocation: body.templateLocation,
        templateType,
      },
      message: 'Template applied successfully',
      success: true,
    })
  } catch (error) {
    logger.log('error', 'Error applying template', {error: error instanceof Error ? error.message : String(error)})
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      success: false,
    })
  }
}

/**
 * Extract template endpoint
 *
 * Supports two modes:
 * 1. Save to disk: Provide templateLocation to save the extracted template to a directory
 * 2. Return archive: Set returnArchive=true to get a gzipped tar archive as the response
 */
export async function extractTemplate(req: Request, res: Response) {
  const body = req.body as ExtractTemplateRequest
  let tempDir: null | string = null

  try {
    // Validate required fields
    if (!body.directusUrl) {
      return res.status(400).json({
        error: 'directusUrl is required',
        success: false,
      })
    }

    if (!body.directusToken && (!body.userEmail || !body.userPassword)) {
      return res.status(400).json({
        error: 'Either directusToken or both userEmail and userPassword are required',
        success: false,
      })
    }

    if (!body.templateName) {
      return res.status(400).json({
        error: 'templateName is required',
        success: false,
      })
    }

    // If not returning archive, templateLocation is required
    if (!body.returnArchive && !body.templateLocation) {
      return res.status(400).json({
        error: 'templateLocation is required when returnArchive is not set',
        success: false,
      })
    }

    // Initialize Directus API
    await initializeDirectusApi({
      directusToken: body.directusToken,
      directusUrl: body.directusUrl,
      userEmail: body.userEmail,
      userPassword: body.userPassword,
    })

    // Determine the directory to use
    let directory: string

    if (body.returnArchive) {
      // Create a temporary directory for extraction
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'directus-template-'))
      directory = path.join(tempDir, body.templateName)
      fs.mkdirSync(directory, {recursive: true})
    } else {
      directory = path.resolve(body.templateLocation!)
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, {recursive: true})
      }
    }

    // Generate package.json and README
    const packageJSONContent = generatePackageJsonContent(body.templateName)
    const readmeContent = generateReadmeContent(body.templateName)

    const packageJSONPath = path.join(directory, 'package.json')
    const readmePath = path.join(directory, 'README.md')

    fs.writeFileSync(packageJSONPath, packageJSONContent)
    fs.writeFileSync(readmePath, readmeContent)

    // Build extract flags with defaults (all true unless explicitly set to false)
    const extractBooleanFlags = buildBooleanDefaults(body, ['content', 'dashboards', 'extensions', 'files', 'flows', 'permissions', 'schema', 'settings', 'users']) as unknown as ExtractOptions

    // Extract the template
    await extract(directory, extractBooleanFlags)

    // If returning archive, create gzip and send it
    if (body.returnArchive) {
      const archivePath = path.join(tempDir!, `${body.templateName}.tar.gz`)

      await createTarGzArchive(directory, archivePath)

      const archiveBuffer = fs.readFileSync(archivePath)

      if (body.archiveFormat === 'base64') {
        // Return as JSON with base64-encoded archive
        res.json({
          data: {
            archive: archiveBuffer.toString('base64'),
            contentType: 'application/gzip',
            filename: `${body.templateName}.tar.gz`,
            size: archiveBuffer.length,
            templateName: body.templateName,
          },
          message: 'Template extracted successfully',
          success: true,
        })
      } else {
        // Return as binary download (default)
        res.setHeader('Content-Type', 'application/gzip')
        res.setHeader('Content-Disposition', `attachment; filename="${body.templateName}.tar.gz"`)
        res.setHeader('Content-Length', archiveBuffer.length)
        res.send(archiveBuffer)
      }

      // Clean up temp directory
      removeDirectory(tempDir!)
      return
    }

    // Standard response for disk save mode
    res.json({
      data: {
        templateLocation: body.templateLocation,
        templateName: body.templateName,
      },
      message: 'Template extracted successfully',
      success: true,
    })
  } catch (error) {
    // Clean up temp directory on error
    if (tempDir) {
      removeDirectory(tempDir)
    }

    logger.log('error', 'Error extracting template', {error: error instanceof Error ? error.message : String(error)})
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      success: false,
    })
  }
}
