"use client";

import { BookmarkPlus, Check, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type PortalFilterState = Record<string, string>;

type SavedPortalView = {
  id: string;
  name: string;
  filters: PortalFilterState;
  createdAt: string;
};

type SavedViewLabels = {
  savedViews: string;
  saveCurrent: string;
  reset: string;
  deleteView: string;
  namePlaceholder: string;
  confirm: string;
  cancel: string;
};

export function usePortalFilters<T extends PortalFilterState>(defaults: T) {
  const defaultsRef = useRef(defaults);
  const [filters, setFilters] = useState<T>(defaults);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = { ...defaultsRef.current } as T;
    for (const key of Object.keys(defaultsRef.current)) {
      const value = params.get(key);
      if (value !== null) next[key as keyof T] = value as T[keyof T];
    }
    setFilters(next);
  }, []);

  function replace(next: T) {
    setFilters(next);
    const params = new URLSearchParams(window.location.search);
    for (const [key, defaultValue] of Object.entries(defaultsRef.current)) {
      const value = next[key];
      if (!value || value === defaultValue) params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }

  function update(key: keyof T, value: string) {
    replace({ ...filters, [key]: value });
  }

  function reset() {
    replace({ ...defaultsRef.current } as T);
  }

  return { filters, replace, reset, update };
}

export function SavedViewControls({
  scope,
  filters,
  labels,
  onApply,
  onReset
}: {
  scope: string;
  filters: PortalFilterState;
  labels: SavedViewLabels;
  onApply: (filters: PortalFilterState) => void;
  onReset: () => void;
}) {
  const storageKey = `security-portal-saved-views:v1:${scope}`;
  const [views, setViews] = useState<SavedPortalView[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]") as SavedPortalView[];
      setViews(
        parsed.filter(
          (view) =>
            typeof view.id === "string" &&
            typeof view.name === "string" &&
            view.filters !== null &&
            typeof view.filters === "object"
        )
      );
    } catch {
      setViews([]);
    }
  }, [storageKey]);

  function persist(next: SavedPortalView[]) {
    setViews(next);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  }

  function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const view: SavedPortalView = {
      id: crypto.randomUUID(),
      name: trimmed.slice(0, 50),
      filters: { ...filters },
      createdAt: new Date().toISOString()
    };
    persist([view, ...views].slice(0, 12));
    setSelectedId(view.id);
    setName("");
    setEditing(false);
  }

  function apply(id: string) {
    setSelectedId(id);
    const selected = views.find((view) => view.id === id);
    if (selected) onApply(selected.filters);
  }

  function remove() {
    if (!selectedId) return;
    persist(views.filter((view) => view.id !== selectedId));
    setSelectedId("");
  }

  return (
    <div className="savedViewControls">
      <select aria-label={labels.savedViews} onChange={(event) => apply(event.target.value)} value={selectedId}>
        <option value="">{labels.savedViews}</option>
        {views.map((view) => (
          <option key={view.id} value={view.id}>
            {view.name}
          </option>
        ))}
      </select>
      {editing ? (
        <div className="savedViewName">
          <input
            aria-label={labels.namePlaceholder}
            autoFocus
            maxLength={50}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") save();
              if (event.key === "Escape") setEditing(false);
            }}
            placeholder={labels.namePlaceholder}
            value={name}
          />
          <button aria-label={labels.confirm} className="iconButton" disabled={!name.trim()} onClick={save} title={labels.confirm} type="button">
            <Check aria-hidden="true" size={16} />
          </button>
          <button aria-label={labels.cancel} className="iconButton" onClick={() => setEditing(false)} title={labels.cancel} type="button">
            <X aria-hidden="true" size={16} />
          </button>
        </div>
      ) : (
        <button aria-label={labels.saveCurrent} className="iconButton" onClick={() => setEditing(true)} title={labels.saveCurrent} type="button">
          <BookmarkPlus aria-hidden="true" size={17} />
        </button>
      )}
      <button aria-label={labels.deleteView} className="iconButton" disabled={!selectedId} onClick={remove} title={labels.deleteView} type="button">
        <Trash2 aria-hidden="true" size={16} />
      </button>
      <button aria-label={labels.reset} className="iconButton" onClick={onReset} title={labels.reset} type="button">
        <RotateCcw aria-hidden="true" size={16} />
      </button>
    </div>
  );
}
