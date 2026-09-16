import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCollections, useUI } from '../store'
import { api } from '../lib/api'
import { cn } from '../lib/utils'
import PosterCard from '../components/PosterCard'
import type { CatalogItem, Collection } from '@shared/types'

export default function ListsView() {
  const collections = useCollections(s => s.collections)
  const loadCollections = useCollections(s => s.loadCollections)
  const createCollection = useCollections(s => s.createCollection)
  const deleteCollection = useCollections(s => s.deleteCollection)
  const setCommandOpen = useUI(s => s.setCommandOpen)

  const [activeId, setActiveId] = useState<number | null>(null)
  const [items, setItems] = useState<CatalogItem[]>([])
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')

  useEffect(() => {
    loadCollections()
  }, [loadCollections])

  useEffect(() => {
    if (collections.length && activeId === null) setActiveId(collections[0]!.id)
  }, [collections, activeId])

  useEffect(() => {
    if (activeId === null) {
      setItems([])
      return
    }
    api.collections.items(activeId).then(setItems).catch(() => setItems([]))
  }, [activeId])

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    await createCollection(name, newDesc.trim() || null)
    setNewName('')
    setNewDesc('')
    setCreating(false)
  }

  const active = collections.find(c => c.id === activeId)

  return (
    <div className="min-h-full px-8 py-7">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mb-6 flex items-end justify-between"
      >
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">Your lists</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            {collections.length} {collections.length === 1 ? 'shelf' : 'shelves'} for
            recommendations, moods, and marathons
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-sm font-semibold text-gold transition hover:bg-gold/20"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
          New list
        </button>
      </motion.div>

      <AnimatePresence>
        {creating && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 rounded-2xl border border-gold/30 bg-gold/[0.04] p-4">
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="List name (e.g. Best of 2026)"
                className="no-drag w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-dim focus:border-gold focus:outline-none"
              />
              <input
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="Description (optional)"
                className="no-drag w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-dim focus:border-gold focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setCreating(false)}
                  className="rounded-lg border border-line bg-surface px-3.5 py-2 text-xs font-medium text-ink-soft transition hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  className="rounded-lg border border-gold bg-gold px-3.5 py-2 text-xs font-semibold text-canvas transition hover:bg-gold-soft"
                >
                  Create list
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {collections.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-line bg-surface/40 px-8 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface-2">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="text-ink-dim">
              <path
                d="M4 4h6l2 2h8v12a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <h3 className="font-display text-lg font-bold text-ink">No lists yet</h3>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-soft">
              Shelves group titles however you like — “Comfort movies”, “To show a friend”,
              “Best endings”. Create one, then add titles from any poster.
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="rounded-xl border border-gold bg-gold/15 px-4 py-2 text-sm font-semibold text-gold transition hover:bg-gold/25"
          >
            Create your first list
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          {collections.map(c => (
            <CollectionChip
              key={c.id}
              collection={c}
              active={c.id === activeId}
              onClick={() => setActiveId(c.id)}
              onDelete={async () => {
                await deleteCollection(c.id)
                if (activeId === c.id) setActiveId(null)
              }}
            />
          ))}
        </div>
      )}

      {active && (
        <div className="mt-7">
          {items.length > 0 ? (
            <>
              {active.description && (
                <p className="mb-4 text-sm text-ink-soft">{active.description}</p>
              )}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {items.map((item, i) => (
                  <PosterCard
                    key={item.id}
                    item={item}
                    index={i}
                    className="w-full"
                    showStatus={false}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-3xl border border-dashed border-line bg-surface/40 px-8 py-14 text-center">
              <p className="text-sm text-ink-soft">
                This shelf is empty. Hover any poster and use{' '}
                <span className="font-medium text-gold">Add to list</span>, or search for a title.
              </p>
              <button
                onClick={() => setCommandOpen(true)}
                className="mt-4 rounded-xl border border-gold bg-gold/15 px-4 py-2 text-sm font-semibold text-gold transition hover:bg-gold/25"
              >
                Find titles
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CollectionChip({
  collection,
  active,
  onClick,
  onDelete
}: {
  collection: Collection
  active: boolean
  onClick: () => void
  onDelete: () => void
}) {
  return (
    <div
      className={cn(
        'group relative flex items-center gap-2 rounded-full border px-4 py-2 transition',
        active
          ? 'border-gold bg-gold/15 text-gold'
          : 'border-line bg-surface/60 text-ink-soft hover:border-gold/40 hover:text-ink'
      )}
    >
      <button onClick={onClick} className="flex items-center gap-2 text-sm font-medium">
        {collection.name}
        <span
          className={cn(
            'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
            active ? 'bg-gold/20 text-gold' : 'bg-surface-3 text-ink-dim'
          )}
        >
          {collection.itemCount}
        </span>
      </button>
      <button
        onClick={onDelete}
        title="Delete list"
        className="opacity-0 transition group-hover:opacity-100"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-ink-dim hover:text-crimson-soft">
          <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}
