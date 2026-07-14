"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StructureNode } from "../components/AdsStructure";
import type { TimelineEntry } from "../components/Timeline";

export interface SavedList {
  id: string;
  name: string;
  adIds: string[];
  createdAt: number;
}

export interface Project {
  id: string;
  name: string;
  token: string;
  adIds: string[];
  savedLists?: SavedList[];
  structure?: StructureNode[];
  timeline?: TimelineEntry[];
  createdAt: number;
  updatedAt: number;
}

// Owns the list of Projects, which one is active, and persisting changes to Redis
// (debounced token/adIds edits, and immediate patches for savedLists/structure/timeline).
// Deliberately does NOT own ad-loading state (`token`, `adIdsInput`, `ads`, ...) — switching
// the active project needs to reset that state too, but that's a real coupling between
// "which project is active" and "what's loaded in the ad preview," not an accidental one.
// `Home()` reacts to `currentId` changing via its own effect instead of this hook reaching
// into ad-loading state directly.
export function useProjectPersistence(authStatus: string) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [saveState, setSaveState] = useState<"" | "saving" | "saved">("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentProject = projects.find(p => p.id === currentId) ?? null;

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    setProjectsLoading(true);
    fetch("/api/projects")
      .then(r => {
        if (r.status === 503) { setStorageError(true); return []; }
        return r.json();
      })
      .then((data: Project[]) => {
        if (Array.isArray(data)) {
          setProjects(data);
          if (data[0]) setCurrentId(data[0].id);
        }
      })
      .finally(() => setProjectsLoading(false));
  }, [authStatus]);

  async function newProject(name: string) {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() || "Untitled" }),
    });
    if (!res.ok) { setStorageError(true); return null; }
    const project: Project = await res.json();
    setProjects(prev => [project, ...prev]);
    setCurrentId(project.id);
    return project;
  }

  async function deleteProject(id: string) {
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    setProjects(prev => prev.filter(p => p.id !== id));
    if (currentId === id) setCurrentId(null);
  }

  async function renameProject(id: string, name: string) {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name } : p));
    await fetch(`/api/projects/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  }

  // Immediately patches one or more fields on the active project — used for
  // savedLists/structure/timeline edits, which persist as soon as they happen
  // (unlike token/adIds, which debounce via persistTokenAndAdIds below).
  const patchProject = useCallback(async (patch: Partial<Project>) => {
    if (!currentId) return;
    setProjects(prev => prev.map(p => p.id === currentId ? { ...p, ...patch } : p));
    await fetch(`/api/projects/${currentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }, [currentId]);

  // Debounced save for the token/adIds textarea edits (the two fields the user
  // types into directly, so every keystroke shouldn't trigger a network call).
  const persistTokenAndAdIds = useCallback((tok: string, idsText: string) => {
    if (!currentId) return;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const adIds = idsText.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
      await fetch(`/api/projects/${currentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tok, adIds }),
      });
      setProjects(prev => prev.map(p => p.id === currentId ? { ...p, token: tok, adIds } : p));
      setSaveState("saved");
      setTimeout(() => setSaveState(""), 1500);
    }, 800);
  }, [currentId]);

  return {
    projects,
    currentId, setCurrentId,
    currentProject,
    projectsLoading,
    storageError,
    saveState,
    newProject,
    deleteProject,
    renameProject,
    patchProject,
    persistTokenAndAdIds,
  };
}
