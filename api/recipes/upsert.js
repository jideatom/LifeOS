const NOTION_VERSION = '2022-06-28'
const RECIPE_KEY_PROPERTY = process.env.NOTION_RECIPE_KEY_PROPERTY || 'LifeOS Key'
const DEFAULT_ALLOWED_ORIGINS = [
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://localhost:5173',
  'http://localhost:5174',
  'https://misimisys.github.io',
  'https://jideatom.github.io',
]
const databaseSchemaCache = new Map()

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json')
  response.end(JSON.stringify(payload))
}

function allowedOrigins() {
  const configured = process.env.LIFEOS_ALLOWED_ORIGIN
  if (!configured) return DEFAULT_ALLOWED_ORIGINS

  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function setCors(request, response) {
  const requestOrigin = request.headers.origin
  const allowed = allowedOrigins()
  const responseOrigin =
    requestOrigin && allowed.includes(requestOrigin)
      ? requestOrigin
      : allowed[0] || '*'

  response.setHeader('Access-Control-Allow-Origin', responseOrigin)
  response.setHeader('Vary', 'Origin')
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

function parseBody(request) {
  if (request.body && typeof request.body === 'object') return request.body
  if (typeof request.body === 'string') return JSON.parse(request.body)
  return {}
}

function textProperty(value) {
  return {
    rich_text: [
      {
        text: {
          content: String(value || '').slice(0, 2000),
        },
      },
    ],
  }
}

function titleProperty(value) {
  return {
    title: [
      {
        text: {
          content: String(value || 'Untitled recipe').slice(0, 2000),
        },
      },
    ],
  }
}

function recipeProperties(recipe, hasRecipeKeyProperty) {
  const properties = {
    Name: titleProperty(recipe.title),
    Type: textProperty(recipe.tag),
    'Carb Signal': textProperty(recipe.carbSignal),
    Base: textProperty(recipe.base),
    Protein: textProperty(recipe.protein),
    'Vehicle / Note': textProperty(recipe.vehicle),
    Source: textProperty(recipe.source),
  }

  if (hasRecipeKeyProperty) {
    properties[RECIPE_KEY_PROPERTY] = textProperty(recipe.id)
  }

  return properties
}

async function notionRequest(path, init = {}) {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION,
      ...init.headers,
    },
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload.message || `Notion request failed: ${response.status}`)
  }

  return payload
}

async function getDatabaseSchema(databaseId) {
  if (databaseSchemaCache.has(databaseId)) {
    return databaseSchemaCache.get(databaseId)
  }

  const payload = await notionRequest(`/databases/${databaseId}`)
  const properties = payload.properties || {}
  databaseSchemaCache.set(databaseId, properties)
  return properties
}

async function findRecipePage(databaseId, recipe, hasRecipeKeyProperty) {
  const payload = await notionRequest(`/databases/${databaseId}/query`, {
    method: 'POST',
    body: JSON.stringify({
      filter: hasRecipeKeyProperty
        ? {
            property: RECIPE_KEY_PROPERTY,
            rich_text: {
              equals: recipe.id,
            },
          }
        : {
            property: 'Name',
            title: {
              equals: recipe.title,
            },
          },
      page_size: 1,
    }),
  })

  return payload.results?.[0]
}

async function upsertRecipe(databaseId, recipe) {
  const schema = await getDatabaseSchema(databaseId)
  const hasRecipeKeyProperty = Boolean(schema[RECIPE_KEY_PROPERTY])
  const existingPage = await findRecipePage(databaseId, recipe, hasRecipeKeyProperty)
  const properties = recipeProperties(recipe, hasRecipeKeyProperty)

  if (existingPage?.id) {
    await notionRequest(`/pages/${existingPage.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties }),
    })
    return { id: recipe.id, action: 'updated' }
  }

  const createdPage = await notionRequest('/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: {
        database_id: databaseId,
      },
      properties,
    }),
  })

  return { id: recipe.id, action: 'created', pageId: createdPage.id }
}

export default async function handler(request, response) {
  setCors(request, response)

  if (request.method === 'OPTIONS') {
    response.statusCode = 204
    response.end()
    return
  }

  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'Method not allowed' })
    return
  }

  if (!process.env.NOTION_TOKEN || !process.env.NOTION_RECIPES_DATABASE_ID) {
    sendJson(response, 503, {
      error: 'Notion bridge is not configured',
      requiredEnv: ['NOTION_TOKEN', 'NOTION_RECIPES_DATABASE_ID'],
    })
    return
  }

  try {
    const body = parseBody(request)
    const recipes = Array.isArray(body.recipes) ? body.recipes : []

    if (recipes.length === 0) {
      sendJson(response, 400, { error: 'No recipes supplied' })
      return
    }

    const results = []

    for (const recipe of recipes) {
      if (!recipe.id || !recipe.title) continue
      results.push(await upsertRecipe(process.env.NOTION_RECIPES_DATABASE_ID, recipe))
    }

    sendJson(response, 200, {
      ok: true,
      synced: results.length,
      results,
    })
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'Recipe sync failed',
    })
  }
}
