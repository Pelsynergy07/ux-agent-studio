// Notion-grade Library: files and notes shared across projects.
// Organized into clean folders and multi-select tags so projects draw on what they need.
import {
  AlignLeft,
  ChevronDown,
  ChevronRight,
  Clock,
  Edit2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Image as ImageIcon,
  Layers,
  MoreVertical,
  Paperclip,
  Plus,
  Search,
  StickyNote,
  Tag as TagIcon,
  Trash2,
  X,
} from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { LibraryItem } from '../../../shared/types'
import { api } from '../api'
import { PageHead } from '../components/PageHead'
import { ALL_SUPPORTED_FILES, readUploadedFiles } from '../components/Sources'
import { Button, IconButton } from '../kit/Button'
import { Banner } from '../kit/Feedback'
import { Input, Select, TagInput } from '../kit/Field'
import { ago, cleanError, Modal } from '../ui'

export const TAG_PALETTES = [
  { name: 'teal', color: '#3dd3c4', dot: '#00857e', bg: 'rgba(61, 211, 196, 0.12)', border: 'rgba(61, 211, 196, 0.28)' },
  { name: 'amber', color: '#f59e0b', dot: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.28)' },
  { name: 'blue', color: '#60a5fa', dot: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.28)' },
  { name: 'crimson', color: '#f87171', dot: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.28)' },
  { name: 'emerald', color: '#34d399', dot: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.28)' },
  { name: 'cyan', color: '#22d3ee', dot: '#06b6d4', bg: 'rgba(6, 182, 212, 0.12)', border: 'rgba(6, 182, 212, 0.28)' },
  { name: 'coral', color: '#fb7185', dot: '#f43f5e', bg: 'rgba(244, 63, 94, 0.12)', border: 'rgba(244, 63, 94, 0.28)' },
]

export function getTagPalette(tag: string) {
  let hash = 0
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0
  return TAG_PALETTES[hash % TAG_PALETTES.length]
}

function FolderGraphic({ label, accent }: { label?: string; accent?: boolean }) {
  return (
    <div className="folder-graphic-wrapper">
      <svg viewBox="0 0 100 78" className="folder-graphic-svg" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Back folder tab and body */}
        <path
          d="M10 20C10 16.6863 12.6863 14 16 14H38L45 20H84C87.3137 20 90 22.6863 90 26V64C90 67.3137 87.3137 70 84 70H16C12.6863 70 10 67.3137 10 64V20Z"
          fill="rgba(255,255,255,0.06)"
        />
        {/* Paper sheet peeking out */}
        <rect x="22" y="8" width="56" height="36" rx="4" fill="#ffffff" fillOpacity="0.88" />
        <path d="M66 8L78 20H66V8Z" fill="#cbd5e1" />
        <rect x="28" y="16" width="30" height="3" rx="1.5" fill="#94a3b8" />
        <rect x="28" y="23" width="44" height="2.5" rx="1.25" fill="#cbd5e1" />
        <rect x="28" y="29" width="38" height="2.5" rx="1.25" fill="#cbd5e1" />
        {/* Front folder flap */}
        <path
          d="M8 32C8 28.6863 10.6863 26 14 26H86C89.3137 26 92 28.6863 92 32V65C92 68.866 88.866 72 85 72H15C11.134 72 8 68.866 8 65V32Z"
          fill="url(#folderGradientDark)"
          stroke={accent ? "var(--accent)" : "rgba(255,255,255,0.12)"}
          strokeWidth="1.2"
        />
        <defs>
          <linearGradient id="folderGradientDark" x1="50" y1="26" x2="50" y2="72" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2e3036" />
            <stop offset="1" stopColor="#1a1b1f" />
          </linearGradient>
        </defs>
        {label && (
          <text
            x="50"
            y="54"
            textAnchor="middle"
            fill="rgba(255,255,255,0.32)"
            fontSize="8"
            fontWeight="600"
            letterSpacing="0.08em"
          >
            {label.toUpperCase().slice(0, 11)}
          </text>
        )}
      </svg>
    </div>
  )
}

export function Library() {
  const [lib, setLib] = useState<{ items: LibraryItem[]; tags: string[]; folders: string[] } | null>(null)
  const [q, setQ] = useState('')
  const [viewFilter, setViewFilter] = useState<'all' | 'images' | 'unassigned'>('all')
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null) // null = all, '' = unassigned, or folder name
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [preview, setPreview] = useState('')
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [folder, setFolder] = useState<string>('')
  const [tags, setTags] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [lightbox, setLightbox] = useState<{ title: string; url: string } | null>(null)

  // Folder management
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [renameTarget, setRenameTarget] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [folderMenu, setFolderMenu] = useState<string | null>(null)
  const [moveMenu, setMoveMenu] = useState<string | null>(null)
  const [tagPickerItem, setTagPickerItem] = useState<string | null>(null)
  const [newTagValue, setNewTagValue] = useState('')

  const files = useRef<HTMLInputElement>(null)

  const load = () => api.listLibrary().then(setLib)
  useEffect(() => void load(), [])

  // Close menus on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.notion-popover-wrap')) {
        setFolderMenu(null)
        setMoveMenu(null)
        setTagPickerItem(null)
      }
    }
    window.addEventListener('click', handleOutside)
    return () => window.removeEventListener('click', handleOutside)
  }, [])

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await load()
    } catch (e) {
      setError(cleanError(e))
    } finally {
      setBusy(false)
    }
  }

  const addFiles = (list: FileList | File[]) =>
    act(async () => {
      const { textFiles, imageFiles, rejected } = await readUploadedFiles(list)
      const targetFolder = folder || (selectedFolder && selectedFolder !== '' ? selectedFolder : undefined)
      for (const f of textFiles) {
        await api.addLibraryItem({ title: f.name, text: f.text, kind: 'file', tags, folder: targetFolder })
      }
      for (const f of imageFiles) {
        await api.addLibraryItem({ title: f.name, dataUrl: f.dataUrl, mimeType: f.mimeType, kind: 'image', tags, folder: targetFolder })
      }
      if (rejected.length) {
        throw new Error(`${rejected.join(', ')}: unsupported file format.`)
      }
    })

  const handleCreateFolder = () => {
    const name = newFolderName.trim()
    if (!name) return
    act(async () => {
      await api.addFolder(name)
      setNewFolderName('')
      setFolderDialogOpen(false)
      setSelectedFolder(name)
    })
  }

  const handleRenameFolder = (from: string) => {
    const to = renameValue.trim()
    if (!to || to === from) {
      setRenameTarget(null)
      return
    }
    act(async () => {
      await api.renameFolder(from, to)
      if (selectedFolder === from) setSelectedFolder(to)
      setRenameTarget(null)
    })
  }

  const handleDeleteFolder = (name: string) => {
    if (!confirm(`Delete folder “${name}”? Items inside will become unassigned and won’t be deleted.`)) return
    act(async () => {
      await api.deleteFolder(name)
      if (selectedFolder === name) setSelectedFolder(null)
    })
  }

  const handleMoveItem = (itemId: string, targetFolder: string) => {
    act(async () => {
      await api.updateLibraryItem(itemId, { folder: targetFolder })
      setMoveMenu(null)
    })
  }

  const handleToggleTagOnItem = (item: LibraryItem, tagToToggle: string) => {
    const clean = tagToToggle.trim().toLowerCase()
    if (!clean) return
    const has = item.tags.includes(clean)
    const nextTags = has ? item.tags.filter((t) => t !== clean) : [...item.tags, clean]
    act(async () => {
      await api.updateLibraryItem(item.id, { tags: nextTags })
    })
  }

  const handleAddTagToItem = (item: LibraryItem, tagToAdd: string) => {
    const clean = tagToAdd.trim().toLowerCase()
    if (!clean || item.tags.includes(clean)) return
    act(async () => {
      await api.updateLibraryItem(item.id, { tags: [...item.tags, clean] })
      setNewTagValue('')
    })
  }

  const handleRemoveTagFromItem = (item: LibraryItem, tagToRemove: string) => {
    act(async () => {
      await api.updateLibraryItem(item.id, { tags: item.tags.filter((t) => t !== tagToRemove) })
    })
  }

  // Counts
  const counts = useMemo(() => {
    const items = lib?.items ?? []
    const folderCounts: Record<string, number> = {}
    let unassigned = 0
    let images = 0
    for (const item of items) {
      if (item.kind === 'image') images++
      if (item.folder) {
        folderCounts[item.folder] = (folderCounts[item.folder] ?? 0) + 1
      } else {
        unassigned++
      }
    }
    const tagCounts: Record<string, number> = {}
    for (const item of items) {
      for (const t of item.tags) {
        tagCounts[t] = (tagCounts[t] ?? 0) + 1
      }
    }
    return { folderCounts, unassigned, images, tagCounts }
  }, [lib])

  // Filtered items
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    return (lib?.items ?? []).filter((i) => {
      if (viewFilter === 'images' && i.kind !== 'image') return false
      if (viewFilter === 'unassigned' && i.folder) return false
      if (selectedFolder !== null) {
        if (selectedFolder === '' && i.folder) return false
        if (selectedFolder !== '' && i.folder !== selectedFolder) return false
      }
      if (selectedTag && !i.tags.includes(selectedTag)) return false
      if (words.length) {
        const textToSearch = `${i.title} ${i.folder ?? ''} ${i.tags.join(' ')}`.toLowerCase()
        return words.every((w) => textToSearch.includes(w))
      }
      return true
    })
  }, [lib, q, viewFilter, selectedFolder, selectedTag])

  const foldersList = lib?.folders ?? []
  const tagsList = lib?.tags ?? []

  return (
    <div className="page library notion-library">
      <PageHead
        title="Library"
        sub="Knowledge base and documents shared across projects. Organize with Notion-style folders and tags."
        actions={
          <div className="row">
            <Button
              variant="secondary"
              size="sm"
              icon={FolderPlus}
              onClick={() => {
                setNewFolderName('')
                setFolderDialogOpen(true)
              }}
            >
              New folder
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => {
                setComposerOpen((prev) => !prev)
                if (!folder && selectedFolder && selectedFolder !== '') {
                  setFolder(selectedFolder)
                }
              }}
            >
              Add
            </Button>
          </div>
        }
      />

      {error && (
        <Banner tone="danger" onClose={() => setError(null)}>
          {error}
        </Banner>
      )}

      {/* New Folder Modal */}
      {folderDialogOpen && (
        <Modal title="Create folder" onClose={() => setFolderDialogOpen(false)} className="narrow">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (newFolderName.trim()) handleCreateFolder()
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <p className="muted small" style={{ margin: 0 }}>
              Organize your documents and notes into a shared folder.
            </p>
            <input
              className="input"
              autoFocus
              placeholder="Folder name, e.g. Research, Compliance"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setFolderDialogOpen(false)
              }}
            />
            <div className="row end" style={{ gap: 8, marginTop: 4 }}>
              <Button type="button" variant="ghost" size="sm" onClick={() => setFolderDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={!newFolderName.trim()}>
                Create folder
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* New Item Modal */}
      {composerOpen && (
        <Modal title="Add to Library" onClose={() => setComposerOpen(false)} wide>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!text.trim()) return
              void act(async () => {
                await api.addLibraryItem({ title: title.trim(), text: text.trim(), kind: 'note', tags, folder: folder || undefined })
                setText('')
                setTitle('')
                setTags([])
                setComposerOpen(false)
              })
            }}
            className="library-composer-form"
          >
            <div className="grid2">
              <Input
                label="Document title"
                placeholder="e.g. Navigation guidelines, User personas (optional)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Select
                label="Folder"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                options={[
                  { value: '', label: 'No folder (Unassigned)' },
                  ...foldersList.map((f) => ({ value: f, label: f })),
                ]}
              />
            </div>

            <div
              className={`composer-drop-area ${drag ? 'drag' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setDrag(true)
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDrag(false)
                if (e.dataTransfer.files.length) {
                  void addFiles(e.dataTransfer.files).then(() => setComposerOpen(false))
                }
              }}
            >
              <div className="field">
                <label className="field-label">Notes or document text</label>
                <textarea
                  className="input textarea composer-modal-input"
                  rows={8}
                  placeholder="Paste research, guidelines, user personas, or drag and drop text files and UI reference images here..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label className="field-label">Tags</label>
              <TagInput
                value={tags}
                onChange={setTags}
                suggestions={lib?.tags}
                placeholder="Add tags, e.g. compliance, mobile, alarms (press Enter)..."
              />
            </div>

            <div className="modal-actions-row">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={Paperclip}
                onClick={() => files.current?.click()}
              >
                Attach files or UI references
              </Button>
              <input
                ref={files}
                type="file"
                multiple
                accept={ALL_SUPPORTED_FILES}
                hidden
                onChange={(e) => {
                  if (e.target.files) {
                    void addFiles(e.target.files)
                      .then(() => setComposerOpen(false))
                      .finally(() => (e.target.value = ''))
                  }
                }}
              />
              <div className="row end" style={{ gap: 8, marginLeft: 'auto' }}>
                <Button type="button" variant="ghost" size="sm" onClick={() => setComposerOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  icon={Plus}
                  disabled={!text.trim()}
                  loading={busy && !!text.trim()}
                >
                  Save to Library
                </Button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* Notion-style 2-column layout */}
      <div className="notion-lib-layout">
        {/* Left Explorer Sidebar */}
        <aside className="notion-lib-sidebar">
          <div className="notion-side-section">
            <div className="notion-side-header">
              <span className="notion-side-label">Views</span>
            </div>
            <div className="notion-tree-list">
              <button
                type="button"
                className={`notion-tree-item ${viewFilter === 'all' && selectedFolder === null && !selectedTag ? 'active' : ''}`}
                onClick={() => {
                  setViewFilter('all')
                  setSelectedFolder(null)
                  setSelectedTag(null)
                }}
              >
                <span className="notion-icon-slot">
                  <FileText aria-hidden="true" className="notion-icon" />
                </span>
                <span className="notion-tree-name">All items</span>
                <span className="notion-count">{lib?.items.length ?? 0}</span>
              </button>

              <button
                type="button"
                className={`notion-tree-item ${viewFilter === 'images' && selectedFolder === null && !selectedTag ? 'active' : ''}`}
                onClick={() => {
                  setViewFilter('images')
                  setSelectedFolder(null)
                  setSelectedTag(null)
                }}
              >
                <span className="notion-icon-slot">
                  <ImageIcon aria-hidden="true" className="notion-icon folder-accent" />
                </span>
                <span className="notion-tree-name">UI References</span>
                <span className="notion-count">{counts.images}</span>
              </button>

              {counts.unassigned > 0 && (
                <button
                  type="button"
                  className={`notion-tree-item ${viewFilter === 'unassigned' && selectedFolder === null && !selectedTag ? 'active' : ''}`}
                  onClick={() => {
                    setViewFilter('unassigned')
                    setSelectedFolder(null)
                    setSelectedTag(null)
                  }}
                >
                  <span className="notion-icon-slot">
                    <StickyNote aria-hidden="true" className="notion-icon" />
                  </span>
                  <span className="notion-tree-name">Unassigned</span>
                  <span className="notion-count">{counts.unassigned}</span>
                </button>
              )}
            </div>
          </div>

          <div className="notion-side-section">
            <div className="notion-side-header">
              <span className="notion-side-label">Folders</span>
              <button
                type="button"
                className="notion-mini-action"
                title="Create folder"
                onClick={() => {
                  setNewFolderName('')
                  setFolderDialogOpen(true)
                }}
              >
                <Plus aria-hidden="true" />
              </button>
            </div>

            <div className="notion-tree-list">
              {foldersList.map((f) => (
                <div key={f} className={`notion-tree-row ${selectedFolder === f ? 'active' : ''}`}>
                  {renameTarget === f ? (
                    <div className="notion-rename-row">
                      <span className="notion-icon-slot">
                        <Folder aria-hidden="true" className="notion-icon folder-accent" />
                      </span>
                      <input
                        autoFocus
                        className="notion-rename-input"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameFolder(f)
                          if (e.key === 'Escape') setRenameTarget(null)
                        }}
                        onBlur={() => {
                          if (!renameValue.trim() || renameValue === f) {
                            setRenameTarget(null)
                          } else {
                            handleRenameFolder(f)
                          }
                        }}
                      />
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="notion-tree-click"
                        onClick={() => {
                          setSelectedFolder(selectedFolder === f ? null : f)
                          setSelectedTag(null)
                        }}
                      >
                        <span className="notion-icon-slot">
                          {selectedFolder === f ? (
                            <FolderOpen aria-hidden="true" className="notion-icon folder-accent" />
                          ) : (
                            <Folder aria-hidden="true" className="notion-icon folder-accent" />
                          )}
                        </span>
                        <span className="notion-tree-name">{f}</span>
                        <span className="notion-count">{counts.folderCounts[f] ?? 0}</span>
                      </button>
                      <div className="notion-popover-wrap">
                        <button
                          type="button"
                          className={`notion-row-more ${folderMenu === f ? 'open' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setFolderMenu(folderMenu === f ? null : f)
                          }}
                        >
                          <MoreVertical aria-hidden="true" />
                        </button>
                        {folderMenu === f && (
                          <div className="notion-popover">
                            <button
                              type="button"
                              onClick={() => {
                                setRenameTarget(f)
                                setRenameValue(f)
                                setFolderMenu(null)
                              }}
                            >
                              <Edit2 aria-hidden="true" /> Rename
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => {
                                setFolderMenu(null)
                                handleDeleteFolder(f)
                              }}
                            >
                              <Trash2 aria-hidden="true" /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}

              {foldersList.length === 0 && (
                <span className="notion-empty-note">No folders yet</span>
              )}

              <button
                type="button"
                className="notion-tree-item notion-add-row"
                onClick={() => {
                  setNewFolderName('')
                  setFolderDialogOpen(true)
                }}
              >
                <span className="notion-icon-slot">
                  <Plus aria-hidden="true" className="notion-icon" />
                </span>
                <span className="notion-tree-name">New folder</span>
              </button>
            </div>
          </div>

          {tagsList.length > 0 && (
            <div className="notion-side-section">
              <div className="notion-side-header">
                <span className="notion-side-label">Tags</span>
              </div>
              <div className="notion-tree-list">
                {tagsList.map((t) => {
                  const pal = getTagPalette(t)
                  return (
                    <button
                      key={t}
                      type="button"
                      className={`notion-tree-item ${selectedTag === t ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedTag(selectedTag === t ? null : t)
                        setSelectedFolder(null)
                      }}
                    >
                      <span className="notion-icon-slot">
                        <span className="notion-tag-dot" style={{ backgroundColor: pal.dot }} />
                      </span>
                      <span className="notion-tree-name">#{t}</span>
                      <span className="notion-count">{counts.tagCounts[t] ?? 0}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </aside>

        {/* Right Main Content */}
        <main className="notion-lib-main">
          {/* Folder Panels Grid (matching the reference UI) */}
          <div className="folder-panels-section">
            <div className="folder-panels-head">
              <span className="folder-panels-label">Folders</span>
              {selectedFolder !== null && (
                <button type="button" className="folder-panels-reset" onClick={() => setSelectedFolder(null)}>
                  Show all
                </button>
              )}
            </div>
            <div className="folder-panels-grid">
              {/* All Items Panel */}
              <div
                className={`folder-panel ${selectedFolder === null && !selectedTag ? 'active' : ''}`}
                onClick={() => {
                  setSelectedFolder(null)
                  setSelectedTag(null)
                }}
              >
                <FolderGraphic label="ALL" accent={selectedFolder === null && !selectedTag} />
                <div className="folder-panel-info">
                  <span className="folder-panel-title">All items</span>
                  <span className="folder-panel-count">{lib?.items.length ?? 0} {lib?.items.length === 1 ? 'file' : 'files'}</span>
                </div>
              </div>

              {/* User Folder Panels */}
              {foldersList.map((f) => {
                const isSelected = selectedFolder === f
                const count = counts.folderCounts[f] ?? 0
                return (
                  <div
                    key={f}
                    className={`folder-panel ${isSelected ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedFolder(isSelected ? null : f)
                      setSelectedTag(null)
                    }}
                  >
                    <FolderGraphic label={f} accent={isSelected} />
                    <div className="folder-panel-info">
                      <span className="folder-panel-title">{f}</span>
                      <span className="folder-panel-count">{count} {count === 1 ? 'file' : 'files'}</span>
                    </div>
                  </div>
                )
              })}

              {/* New Folder Panel Button */}
              <button
                type="button"
                className="folder-panel folder-panel-add"
                onClick={() => {
                  setNewFolderName('')
                  setFolderDialogOpen(true)
                }}
              >
                <div className="folder-panel-art-add">
                  <Plus aria-hidden="true" />
                </div>
                <div className="folder-panel-info">
                  <span className="folder-panel-title">New folder</span>
                  <span className="folder-panel-count">Create category</span>
                </div>
              </button>
            </div>
          </div>

          {/* Breadcrumb Bar + Notion-style Search */}
          <div className="notion-bar">
            <div className="notion-crumbs">
              <button
                type="button"
                className="notion-crumb-root"
                onClick={() => {
                  setSelectedFolder(null)
                  setSelectedTag(null)
                }}
              >
                Library
              </button>
              {selectedFolder !== null && (
                <>
                  <ChevronRight className="notion-crumb-sep" aria-hidden="true" />
                  <span className="notion-crumb-cur">
                    {selectedFolder === '' ? 'Unassigned' : selectedFolder}
                  </span>
                  <button
                    type="button"
                    className="notion-crumb-clear"
                    onClick={() => setSelectedFolder(null)}
                    title="Clear filter"
                  >
                    <X aria-hidden="true" />
                  </button>
                </>
              )}
              {selectedTag && (
                <>
                  <ChevronRight className="notion-crumb-sep" aria-hidden="true" />
                  <span className="notion-crumb-cur">#{selectedTag}</span>
                  <button
                    type="button"
                    className="notion-crumb-clear"
                    onClick={() => setSelectedTag(null)}
                    title="Clear tag filter"
                  >
                    <X aria-hidden="true" />
                  </button>
                </>
              )}
              <span className="notion-counter">
                {shown.length} {shown.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            <div className="notion-search-wrap">
              <Search aria-hidden="true" className="notion-search-icon" />
              <input
                className="notion-search-input"
                placeholder="Search documents, tags & text..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              {q && (
                <button type="button" className="notion-search-clear" onClick={() => setQ('')}>
                  <X aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {/* Notion Database Table */}
          {lib && lib.items.length > 0 && (
            <div className="notion-table-wrap">
              <table className="notion-table">
                <thead>
                  <tr>
                    <th style={{ width: '38%' }}>
                      <div className="notion-th-content">
                        <FileText aria-hidden="true" />
                        <span>Title</span>
                      </div>
                    </th>
                    <th style={{ width: 150 }}>
                      <div className="notion-th-content">
                        <Folder aria-hidden="true" />
                        <span>Folder</span>
                      </div>
                    </th>
                    <th style={{ width: '25%' }}>
                      <div className="notion-th-content">
                        <TagIcon aria-hidden="true" />
                        <span>Tags</span>
                      </div>
                    </th>
                    <th style={{ width: 95 }}>
                      <div className="notion-th-content">
                        <AlignLeft aria-hidden="true" />
                        <span>Words</span>
                      </div>
                    </th>
                    <th style={{ width: 90 }}>
                      <div className="notion-th-content">
                        <Layers aria-hidden="true" />
                        <span>Projects</span>
                      </div>
                    </th>
                    <th style={{ width: 100 }}>
                      <div className="notion-th-content">
                        <Clock aria-hidden="true" />
                        <span>Added</span>
                      </div>
                    </th>
                    <th style={{ width: 44 }} aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((i) => (
                    <Fragment key={i.id}>
                      <tr
                        className={`notion-tr ${open === i.id ? 'expanded' : ''} ${
                          moveMenu === i.id || tagPickerItem === i.id ? 'has-open-popover' : ''
                        }`}
                      >
                        {/* Title Column */}
                        <td className="notion-td-title">
                          <div
                            className="notion-title-row"
                            onClick={async () => {
                              if (open === i.id) return setOpen(null)
                              setOpen(i.id)
                              if (i.kind !== 'image') {
                                setPreview(await api.getLibraryText(i.id))
                              }
                            }}
                          >
                            <ChevronRight
                              className={`notion-chev ${open === i.id ? 'expanded' : ''}`}
                              aria-hidden="true"
                            />
                            {i.kind === 'image' ? (
                              <div
                                className="notion-thumb-wrap"
                                title="Click to zoom UI reference"
                                onClick={(e) => {
                                  if (i.imageUrl) {
                                    e.stopPropagation()
                                    setLightbox({ title: i.title, url: i.imageUrl })
                                  }
                                }}
                              >
                                {i.imageUrl ? (
                                  <img src={i.imageUrl} className="notion-thumb" alt={i.title} />
                                ) : (
                                  <ImageIcon className="notion-row-icon" aria-hidden="true" />
                                )}
                              </div>
                            ) : i.kind === 'file' ? (
                              <FileText className="notion-row-icon" aria-hidden="true" />
                            ) : (
                              <StickyNote className="notion-row-icon" aria-hidden="true" />
                            )}
                            <span className="notion-doc-title">{i.title}</span>
                          </div>
                        </td>

                        {/* Folder Select Column */}
                        <td className="notion-td-folder">
                          <div className="notion-popover-wrap">
                            <button
                              type="button"
                              className={`notion-folder-pill ${i.folder ? 'assigned' : 'is-empty'}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                setMoveMenu(moveMenu === i.id ? null : i.id)
                              }}
                            >
                              <Folder aria-hidden="true" />
                              <span>{i.folder || 'None'}</span>
                              <ChevronDown aria-hidden="true" className="pill-chev" />
                            </button>
                            {moveMenu === i.id && (
                              <div className="notion-popover notion-select-popover">
                                <span className="notion-popover-head">Select folder</span>
                                <button
                                  type="button"
                                  className={!i.folder ? 'selected' : ''}
                                  onClick={() => handleMoveItem(i.id, '')}
                                >
                                  None (Unassigned)
                                </button>
                                {foldersList.map((f) => (
                                  <button
                                    key={f}
                                    type="button"
                                    className={i.folder === f ? 'selected' : ''}
                                    onClick={() => handleMoveItem(i.id, f)}
                                  >
                                    <Folder aria-hidden="true" />
                                    <span>{f}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Tags Multi-select Column */}
                        <td className="notion-td-tags">
                          <div className="notion-tag-list">
                            {i.tags.map((t) => {
                              const pal = getTagPalette(t)
                              return (
                                <span
                                  key={t}
                                  className="notion-tag-chip"
                                  style={{
                                    color: pal.color,
                                    background: pal.bg,
                                    borderColor: pal.border,
                                  }}
                                >
                                  <span className="notion-tag-dot" style={{ backgroundColor: pal.dot }} />
                                  <span>{t}</span>
                                  <button
                                    type="button"
                                    className="notion-tag-x"
                                    title={`Remove tag ${t}`}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleRemoveTagFromItem(i, t)
                                    }}
                                  >
                                    ×
                                  </button>
                                </span>
                              )
                            })}
                            <div className="notion-popover-wrap">
                              <button
                                type="button"
                                className="notion-add-tag-btn"
                                title="Add or toggle tags"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setTagPickerItem(tagPickerItem === i.id ? null : i.id)
                                  setNewTagValue('')
                                }}
                              >
                                + tag
                              </button>
                              {tagPickerItem === i.id && (
                                <div className="notion-popover notion-tag-popover" onClick={(e) => e.stopPropagation()}>
                                  <span className="notion-popover-head">Assign tags</span>
                                  <div className="notion-tag-input-row">
                                    <input
                                      autoFocus
                                      className="notion-tag-input"
                                      placeholder="Type new tag..."
                                      value={newTagValue}
                                      onChange={(e) => setNewTagValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && newTagValue.trim()) {
                                          handleToggleTagOnItem(i, newTagValue.trim())
                                          setNewTagValue('')
                                        }
                                      }}
                                    />
                                    {newTagValue.trim() && (
                                      <button
                                        type="button"
                                        className="btn-icon-tiny"
                                        onClick={() => {
                                          handleToggleTagOnItem(i, newTagValue.trim())
                                          setNewTagValue('')
                                        }}
                                      >
                                        Add
                                      </button>
                                    )}
                                  </div>
                                  <div className="notion-tag-picker-list">
                                    {tagsList.map((t) => {
                                      const pal = getTagPalette(t)
                                      const isAssigned = i.tags.includes(t)
                                      return (
                                        <button
                                          key={t}
                                          type="button"
                                          className={`notion-tag-toggle-btn ${isAssigned ? 'assigned' : ''}`}
                                          style={{
                                            color: isAssigned ? pal.color : 'var(--ink-2)',
                                            background: isAssigned ? pal.bg : 'transparent',
                                          }}
                                          onClick={() => handleToggleTagOnItem(i, t)}
                                        >
                                          <span className="notion-tag-dot" style={{ backgroundColor: pal.dot }} />
                                          <span className="notion-tag-name">{t}</span>
                                          {isAssigned && <span className="notion-tag-check">✓</span>}
                                        </button>
                                      )
                                    })}
                                    {tagsList.length === 0 && (
                                      <span className="notion-empty-note">No tags yet. Type above to create one.</span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Words Column */}
                        <td className="notion-td-mono">
                          {i.kind === 'image' ? (
                            <span className="badge-ui-ref">UI Ref</span>
                          ) : (
                            i.words.toLocaleString()
                          )}
                        </td>

                        {/* Projects Column */}
                        <td className="notion-td-mono">{i.usedBy ?? 0}</td>

                        {/* Added Time Column */}
                        <td className="notion-td-muted">{ago(i.addedAt)}</td>

                        {/* Actions Column */}
                        <td className="notion-td-action">
                          <IconButton
                            icon={Trash2}
                            label="Delete"
                            size="sm"
                            onClick={() =>
                              confirm(`Delete “${i.title}” from the Library? Projects using it will stop reading it.`) &&
                              act(() => api.deleteLibraryItem(i.id))
                            }
                          />
                        </td>
                      </tr>

                      {/* Expandable Preview Row */}
                      {open === i.id && (
                        <tr className="notion-preview-tr">
                          <td colSpan={7}>
                            <div className="notion-preview-box">
                              {i.kind === 'image' && i.imageUrl ? (
                                <div
                                  className="notion-preview-img-wrap"
                                  onClick={() => setLightbox({ title: i.title, url: i.imageUrl! })}
                                >
                                  <img src={i.imageUrl} alt={i.title} className="notion-preview-img" />
                                </div>
                              ) : (
                                <pre className="source-text">
                                  {preview.length > 8000 ? `${preview.slice(0, 8000)}\n\n…` : preview}
                                </pre>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!shown.length && lib && lib.items.length > 0 && (
            <div className="notion-empty-state">
              <p className="muted small">No items match the current folder, tag or search query.</p>
            </div>
          )}

          {lib && !lib.items.length && (
            <div className="notion-empty-state">
              <p className="muted">
                Your Library is empty. Add your product’s design guidelines, meeting summaries, compliance rules,
                and stakeholder notes here to share across all projects.
              </p>
            </div>
          )}
        </main>
      </div>

      {lightbox && (
        <Modal title={lightbox.title} onClose={() => setLightbox(null)} wide>
          <div className="lightbox-content">
            <img src={lightbox.url} alt={lightbox.title} className="lightbox-img" />
          </div>
        </Modal>
      )}
    </div>
  )
}
