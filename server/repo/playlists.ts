import { asc, count, eq } from 'drizzle-orm'
import type { MusicCollectionKind, SavedPlaylist } from '../../src/shared/types'
import { db, uniqueViolation } from '../db/client'
import { accounts, savedPlaylists } from '../db/schema'
import { DuplicateError, isUuid } from './util'

const columns = {
  id: savedPlaylists.id,
  name: savedPlaylists.name,
  url: savedPlaylists.url,
  kind: savedPlaylists.kind,
  savedById: savedPlaylists.savedBy,
  savedByName: accounts.name,
  createdAt: savedPlaylists.createdAt
}

type Row = { [K in keyof typeof columns]: (typeof columns)[K]['_']['data'] }

const toPlaylist = (row: Row): SavedPlaylist => ({
  id: row.id,
  name: row.name,
  url: row.url,
  kind: row.kind as MusicCollectionKind,
  savedBy: { accountId: row.savedById, name: row.savedByName },
  createdAt: row.createdAt.toISOString()
})

const selectPlaylists = () => db().select(columns).from(savedPlaylists).innerJoin(accounts, eq(accounts.id, savedPlaylists.savedBy))

export interface NewSavedPlaylist {
  id: string
  name: string
  url: string
  kind: MusicCollectionKind
  savedBy: string
}

export async function insertSavedPlaylist(playlist: NewSavedPlaylist): Promise<SavedPlaylist> {
  try {
    await db().insert(savedPlaylists).values(playlist)
  } catch (err) {
    const constraint = uniqueViolation(err)
    if (constraint === null) throw err
    throw new DuplicateError(constraint === 'saved_playlists_url_key' ? 'url' : 'name')
  }
  const found = await findSavedPlaylist(playlist.id)
  if (!found) throw new Error('playlist salva não encontrada')
  return found
}

export async function listSavedPlaylists(): Promise<SavedPlaylist[]> {
  const rows = await selectPlaylists().orderBy(asc(savedPlaylists.createdAt), asc(savedPlaylists.name))
  return rows.map(toPlaylist)
}

export async function findSavedPlaylist(id: string): Promise<SavedPlaylist | undefined> {
  if (!isUuid(id)) return undefined
  const [row] = await selectPlaylists().where(eq(savedPlaylists.id, id)).limit(1)
  return row && toPlaylist(row)
}

export async function findSavedPlaylistByUrl(url: string): Promise<SavedPlaylist | undefined> {
  const [row] = await selectPlaylists().where(eq(savedPlaylists.url, url)).limit(1)
  return row && toPlaylist(row)
}

export async function deleteSavedPlaylist(id: string): Promise<boolean> {
  if (!isUuid(id)) return false
  const rows = await db().delete(savedPlaylists).where(eq(savedPlaylists.id, id)).returning({ id: savedPlaylists.id })
  return rows.length > 0
}

export async function countSavedPlaylists(): Promise<number> {
  const [row] = await db().select({ n: count() }).from(savedPlaylists)
  return Number(row?.n ?? 0)
}
