import path from 'path'

export async function runWithLimit(items, limit, worker) {
	const results = new Array(items.length)
	let index = 0

	const runners = Array.from({ length: Math.max(1, limit) }, async () => {
		while (true) {
			const i = index++
			if (i >= items.length) break
			results[i] = await worker(items[i], i)
		}
	})

	return Promise.all(runners).then(() => results)
}

export function getCacheKey(projectRoot, filePath) {
	return path.relative(projectRoot, filePath).split(path.sep).join('/')
}

export function getDerivedKey(sourceHash, targetExt) {
	return `${sourceHash}|${targetExt}`
}

export function normalizeRepoPath(input) {
	if (typeof input !== 'string' || !input) return ''

	const withoutPrefix = input.startsWith('./') ? input.slice(2) : input
	const normalized = path.posix.normalize(withoutPrefix)
	if (!normalized || normalized === '.' || normalized.startsWith('../'))
		return ''
	return normalized
}

// Limit changed-file processing to the public directory.
export function isPathInsidePublic(relPath) {
	return relPath === 'public' || relPath.startsWith('public/')
}

export function safeJsonParse(text) {
	try {
		return JSON.parse(text)
	} catch {
		return null
	}
}

export function sortObjectByKeys(obj) {
	return Object.fromEntries(
		Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)),
	)
}

// Replace a file extension without changing the directory or basename.
export function replaceExtension(filePath, newExt) {
	const dir = path.dirname(filePath)
	const base = path.basename(filePath, path.extname(filePath))
	return path.join(dir, `${base}${newExt}`)
}
