import React, { useEffect, useState } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { supabase } from '../supabaseClient.js'

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export default function LinksView({ userId }) {
  const [links, setLinks] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')

  useEffect(() => { load() }, [userId])

  async function load() {
    const { data } = await supabase
      .from('links')
      .select('*')
      .eq('user_id', userId)
      .order('category', { ascending: true })
      .order('sort_order', { ascending: true })
    setLinks(data || [])
  }

  const categories = [...new Set(links.map(l => l.category))]

  async function addLink(e) {
    e.preventDefault()
    if (!title.trim() || !url.trim() || !category.trim()) return
    const { error } = await supabase.from('links').insert({
      user_id: userId,
      title: title.trim(),
      url: url.trim(),
      description: description.trim() || null,
      category: category.trim(),
    })
    if (!error) {
      setTitle(''); setUrl(''); setDescription(''); setCategory('')
      setShowForm(false)
      load()
    }
  }

  async function removeLink(id) {
    if (!window.confirm('Diesen Link wirklich löschen?')) return
    await supabase.from('links').delete().eq('id', id)
    load()
  }

  const grouped = {}
  for (const link of links) {
    if (!grouped[link.category]) grouped[link.category] = []
    grouped[link.category].push(link)
  }

  return (
    <section className="card card-links">
      <div className="card-head">
        <h2>Links</h2>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Abbrechen' : '+ Link hinzufügen'}
        </button>
      </div>

      {showForm && (
        <form className="inline-form links-form" onSubmit={addLink}>
          <input
            type="text" placeholder="Titel" value={title}
            onChange={e => setTitle(e.target.value)} required
          />
          <input
            type="url" placeholder="https://…" value={url}
            onChange={e => setUrl(e.target.value)} required
          />
          <input
            type="text" placeholder="Kategorie" list="link-categories" value={category}
            onChange={e => setCategory(e.target.value)} required
          />
          <datalist id="link-categories">
            {categories.map(c => <option key={c} value={c} />)}
          </datalist>
          <input
            type="text" placeholder="Beschreibung (optional)" value={description}
            onChange={e => setDescription(e.target.value)}
          />
          <button className="btn btn-sm btn-primary" type="submit">Speichern</button>
        </form>
      )}

      {Object.entries(grouped).map(([cat, catLinks]) => (
        <div key={cat} className="links-category">
          <h3 className="links-category-heading">{cat}</h3>
          <div className="links-grid">
            {catLinks.map(link => (
              <div key={link.id} className="link-card">
                <div className="link-card-head">
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="link-card-title">
                    {link.title}
                  </a>
                  <div className="link-card-actions">
                    <a
                      href={link.url} target="_blank" rel="noopener noreferrer"
                      className="link-card-open" title="In neuem Tab öffnen"
                    >
                      <ExternalLink size={14} strokeWidth={2} />
                    </a>
                    <button
                      type="button" className="link-card-del"
                      onClick={() => removeLink(link.id)} title="Löschen" aria-label="Link löschen"
                    >
                      <X size={14} strokeWidth={2} />
                    </button>
                  </div>
                </div>

                <span className="link-card-url">{hostnameOf(link.url)}</span>
                {link.description && <p className="link-card-desc">{link.description}</p>}
                <span className="link-card-badge">{link.category}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {links.length === 0 && !showForm && (
        <p className="timeline-empty">Noch keine Links. Sammle hier Lernressourcen, Skripte und Übungsseiten.</p>
      )}
    </section>
  )
}
