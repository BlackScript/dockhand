import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { authorize } from '$lib/server/authorize';

const dataDir = process.env.DATA_DIR || '/app/data';
const allowedBase = join(dataDir, 'stacks');

/**
 * GET /api/system/files/content
 * Read file content from Dockhand's local filesystem
 *
 * Query params:
 * - path: File path to read
 */
export const GET: RequestHandler = async ({ url, cookies }) => {
	const auth = await authorize(cookies);

	if (auth.authEnabled && !await auth.can('stacks', 'edit')) {
		return json({ error: 'Permission denied' }, { status: 403 });
	}

	const requestedPath = url.searchParams.get('path');

	if (!requestedPath) {
		return json({ error: 'Path is required' }, { status: 400 });
	}

	const path = resolve(requestedPath);

	if (!path.startsWith(allowedBase)) {
		return json({ error: 'Zugriff verweigert' }, { status: 403 });
	}

	try {
		if (!existsSync(path)) {
			return json({ error: `File not found: ${path}` }, { status: 404 });
		}

		const stat = statSync(path);
		if (stat.isDirectory()) {
			return json({ error: `Cannot read directory as file: ${path}` }, { status: 400 });
		}

		// Limit file size to 10MB
		const maxSize = 10 * 1024 * 1024;
		if (stat.size > maxSize) {
			return json({ error: `File too large (max ${maxSize / 1024 / 1024}MB)` }, { status: 400 });
		}

		const content = readFileSync(path, 'utf-8');

		return json({
			path,
			content,
			size: stat.size,
			mtime: stat.mtime.toISOString()
		});
	} catch (error) {
		console.error('Error reading file:', error);
		const message = error instanceof Error ? error.message : 'Unknown error';
		return json({ error: `Failed to read file: ${message}` }, { status: 500 });
	}
};
