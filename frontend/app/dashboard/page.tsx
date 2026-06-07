"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import { 
  Compass, Plus, Folder, FileText, MessageSquare, 
  Settings, Trash2, LogOut, Loader2, X, Sparkles, BookOpen 
} from "lucide-react";
import GridStatusPanel from "@/app/components/GridStatusPanel";

interface Project {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string | null;
  llm_model: string;
  retrieval_top_k: number;
  created_at: string;
}

interface Stats {
  document_count: number;
  chunk_count: number;
  conversation_count: number;
}

export default function Dashboard() {
  const router = useRouter();
  const { user, token, initAuth, logout, apiFetch, setCurrentProjectId, authInitialized } = useAppStore();

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectStats, setProjectStats] = useState<Record<string, Stats>>({});
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createPrompt, setCreatePrompt] = useState("");
  const [createModel, setCreateModel] = useState("gemini-1.5-flash");
  const [createTopK, setCreateTopK] = useState(6);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  useEffect(() => {
    // If auth is checked and we don't have a token, redirect to login
    if (authInitialized && !token) {
      router.push("/login");
    }
  }, [authInitialized, token, router]);

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const data = await apiFetch("/projects");
      setProjects(data);
      
      // Fetch stats for all projects asynchronously
      data.forEach(async (proj: Project) => {
        try {
          const stats = await apiFetch(`/projects/${proj.id}/stats`);
          setProjectStats(prev => ({ ...prev, [proj.id]: stats }));
        } catch (err) {
          console.error(`Failed to load stats for project ${proj.id}:`, err);
        }
      });
    } catch (err) {
      console.error("Failed to fetch projects:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authInitialized && token) {
      fetchProjects();
    }
  }, [authInitialized, token]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) return;

    setCreateLoading(true);
    setCreateError("");

    try {
      const data = await apiFetch("/projects", {
        method: "POST",
        body: JSON.stringify({
          name: createName,
          description: createDesc,
          system_prompt: createPrompt || null,
          llm_model: createModel,
          retrieval_top_k: createTopK
        }),
      });

      // Clear fields and close
      setCreateName("");
      setCreateDesc("");
      setCreatePrompt("");
      setCreateModel("gemini-1.5-flash");
      setCreateTopK(6);
      setShowCreateModal(false);
      
      // Refresh list
      fetchProjects();
    } catch (err: any) {
      setCreateError(err.message || "Failed to create project");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid triggering route
    if (!confirm("Are you sure you want to delete this project? All documents and conversation logs will be permanently deleted.")) {
      return;
    }

    try {
      await apiFetch(`/projects/${projectId}`, {
        method: "DELETE",
      });
      setProjects(projects.filter(p => p.id !== projectId));
    } catch (err) {
      console.error("Failed to delete project:", err);
      alert("Failed to delete project");
    }
  };

  const handleSelectProject = (projectId: string) => {
    setCurrentProjectId(projectId);
    router.push(`/projects/${projectId}`);
  };

  if (!authInitialized || (loading && projects.length === 0)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-10 w-10 text-purple-500 animate-spin" />
          <span className="text-slate-400 text-sm font-semibold">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col selection:bg-purple-500 selection:text-white">
      {/* Navbar */}
      <header className="px-6 lg:px-12 h-16 flex items-center justify-between border-b border-slate-800/60 backdrop-blur-md sticky top-0 z-40 bg-slate-950/40">
        <div className="flex items-center space-x-2">
          <Compass className="h-6 w-6 text-purple-500" />
          <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white to-purple-400 bg-clip-text text-transparent">
            OmniBase
          </span>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2.5 px-3 py-1.5 rounded-lg bg-slate-900/50 border border-slate-800">
            <div className="h-6 w-6 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-xs font-bold text-white uppercase">
              {user?.name ? user.name[0] : user?.email[0]}
            </div>
            <span className="text-sm font-semibold text-slate-300 hidden sm:inline">
              {user?.name || user?.email}
            </span>
          </div>

          <button 
            onClick={logout}
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
            title="Log Out"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-10 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-100">Projects</h1>
            <p className="text-slate-400 text-sm mt-1">Create isolated spaces to build your groundings</p>
          </div>
          
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center justify-center space-x-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-2.5 px-5 rounded-lg shadow-lg shadow-purple-500/15 hover:scale-105 active:scale-95 transition-all text-sm w-full sm:w-auto"
          >
            <Plus className="h-4.5 w-4.5" />
            <span>New Project</span>
          </button>
        </div>

        <GridStatusPanel />

        {projects.length === 0 ? (
          /* Empty state */
          <div className="glass-panel p-16 rounded-2xl flex flex-col items-center justify-center text-center space-y-6 max-w-xl mx-auto border border-dashed border-slate-800">
            <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-full">
              <Folder className="h-10 w-10 text-purple-500" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-slate-200">No projects yet</h3>
              <p className="text-slate-400 text-sm max-w-sm leading-relaxed">
                Get started by creating your first RAG project space. You can upload files and start asking questions instantly.
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 px-6 rounded-lg transition-colors text-sm"
            >
              Create First Project
            </button>
          </div>
        ) : (
          /* Projects grid */
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((proj) => {
              const stats = projectStats[proj.id] || { document_count: 0, chunk_count: 0, conversation_count: 0 };
              return (
                <div
                  key={proj.id}
                  onClick={() => handleSelectProject(proj.id)}
                  className="glass-panel p-6 rounded-xl cursor-pointer hover:border-purple-500/30 hover:bg-slate-900/60 shadow-md transition-all duration-300 hover:-translate-y-1 relative group flex flex-col justify-between"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="p-2.5 bg-purple-500/10 border border-purple-500/20 rounded-lg group-hover:bg-purple-500/20 transition-colors">
                        <Folder className="h-6 w-6 text-purple-500" />
                      </div>
                      <button
                        onClick={(e) => handleDeleteProject(proj.id, e)}
                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                        title="Delete Project"
                      >
                        <Trash2 className="h-4.5 w-4.5" />
                      </button>
                    </div>

                    <div>
                      <h3 className="text-lg font-bold text-slate-100 group-hover:text-purple-400 transition-colors line-clamp-1">
                        {proj.name}
                      </h3>
                      <p className="text-slate-400 text-xs mt-1.5 leading-relaxed line-clamp-2 min-h-[2.5rem]">
                        {proj.description || "No description provided."}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-6 mt-6 border-t border-slate-800/60 text-slate-400 text-xs font-semibold">
                    <div className="flex items-center space-x-1.5">
                      <FileText className="h-4 w-4 text-blue-500" />
                      <span>{stats.document_count} docs</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <Sparkles className="h-4 w-4 text-purple-500" />
                      <span>{stats.chunk_count} chunks</span>
                    </div>
                    <div className="flex items-center space-x-1.5">
                      <MessageSquare className="h-4 w-4 text-green-500" />
                      <span>{stats.conversation_count} chats</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg glass-panel p-6 sm:p-8 rounded-2xl relative">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <h3 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
              <Plus className="h-5 w-5 text-purple-500" />
              <span>Create New Project</span>
            </h3>
            
            <form className="mt-6 space-y-5" onSubmit={handleCreateProject}>
              {createError && (
                <div className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  {createError}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1.5">
                    Project Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Legal Documents Q2"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-950/50 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-purple-500 text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1.5">
                    Description (optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Brief summary of project domain..."
                    value={createDesc}
                    onChange={(e) => setCreateDesc(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-950/50 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-purple-500 text-sm resize-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1.5">
                    Custom System Prompt Override (optional)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Instructions for LLM behavior (e.g. 'Be brief', 'Focus on clause numbers')..."
                    value={createPrompt}
                    onChange={(e) => setCreatePrompt(e.target.value)}
                    className="w-full px-4 py-2 bg-slate-950/50 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-purple-500 text-sm resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-400 block mb-1.5">
                      Model Selection
                    </label>
                    <select
                      value={createModel}
                      onChange={(e) => setCreateModel(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950/50 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-purple-500 text-sm"
                    >
                      <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                      <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                      <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                      <option value="claude-3-sonnet-20240229">Claude 3 Sonnet</option>
                      <option value="gpt-4o">GPT-4o</option>
                      <option value="ollama/llama3">Local: Llama 3 (Ollama)</option>
                      <option value="ollama/phi3">Local: Phi-3 (Ollama)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-400 block mb-1.5">
                      Retrieval Top-K
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={createTopK}
                      onChange={(e) => setCreateTopK(parseInt(e.target.value) || 6)}
                      className="w-full px-4 py-2 bg-slate-950/50 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-purple-500 text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800/60">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-5 py-2 border border-slate-700 hover:border-slate-500 rounded-lg text-slate-300 hover:bg-slate-900/50 text-sm font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="flex items-center bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-5 rounded-lg shadow-lg shadow-purple-500/10 hover:scale-[1.02] active:scale-[0.98] transition-all text-sm disabled:opacity-50 disabled:hover:scale-100"
                >
                  {createLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Project"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
